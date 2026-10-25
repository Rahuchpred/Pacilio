import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { startFollowUp } from '../email/email';
import { logAction } from '../learn/audit';
import { docNumbersIn, type MatchDoc } from '../pipeline/related';
import { checkBillPayment, paymentWriteUp, type PaymentWriteUp } from './paymentCheck';

// QuickBooks as the record of who owes whom: bills are what we owe vendors,
// invoices what sponsors owe us. Payments are recorded here when the
// Bookkeeper matches a bank row to its bill or invoice. Overdue invoices can
// be reminded by a person (Remind them), or by the Bookkeeper when a pattern
// says to; reminders use the email follow-up threads.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Bill = NonNullable<ReturnType<Ctx['db']['accountingBill']['id']['find']>>;
type Invoice = NonNullable<ReturnType<Ctx['db']['accountingInvoice']['id']['find']>>;

const DAY_MICROS = 86_400_000_000n;
export const MAX_AUTO_REMINDERS = 3;

function money(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '−' : ''}$${whole}.${(abs % 100n).toString().padStart(2, '0')}`;
}

function findDoc(ctx: Ctx, docNumber: string): { kind: 'bill'; doc: Bill } | { kind: 'invoice'; doc: Invoice } | undefined {
  const want = docNumber.trim().toUpperCase();
  for (const b of ctx.db.accountingBill.iter()) if (b.docNumber.toUpperCase() === want) return { kind: 'bill', doc: b };
  for (const i of ctx.db.accountingInvoice.iter()) if (i.docNumber.toUpperCase() === want) return { kind: 'invoice', doc: i };
  return undefined;
}

// A bank row the Bookkeeper matched to a bill (we paid) or an invoice (a
// sponsor paid us): record the payment and bring the balance down.
export function recordPayment(ctx: Ctx, eventId: bigint, docNumber: unknown) {
  if (typeof docNumber !== 'string' || !docNumber.trim()) return;
  const event = ctx.db.inboundEvent.id.find(eventId);
  const found = findDoc(ctx, docNumber);
  if (!event || !found || found.doc.balanceMinor <= 0n) return;
  // Each bank row pays once
  for (const p of ctx.db.accountingPayment.iter()) if (p.reference === `event:${eventId}`) return;
  const amount = event.amountMinor < 0n ? -event.amountMinor : event.amountMinor;
  const paid = amount < found.doc.balanceMinor ? amount : found.doc.balanceMinor;
  const balanceMinor = found.doc.balanceMinor - paid;
  const status = balanceMinor === 0n ? 'paid' : 'open';
  if (found.kind === 'bill') ctx.db.accountingBill.id.update({ ...found.doc, balanceMinor, status });
  else ctx.db.accountingInvoice.id.update({ ...found.doc, balanceMinor, status });
  ctx.db.accountingPayment.insert({
    id: 0n,
    docType: found.kind,
    docId: found.doc.id,
    amountMinor: paid,
    paidAt: ctx.timestamp,
    method: event.source === 'stripe' ? 'card' : 'bank',
    reference: `event:${eventId}`,
  });
}

type Event = NonNullable<ReturnType<Ctx['db']['inboundEvent']['id']['find']>>;
const SOURCE_LABEL: Record<string, string> = { nessie: 'Nessie', stripe: 'Stripe', ledger: 'QuickBooks', cord: 'CORD' };

// The bill a bank payment's memo quotes ("PA system rental - AAV-1042"), so a
// payment is checked even when the Bookkeeper didn't say what it pays
export function billInMemo(ctx: Ctx, event: Event): string | undefined {
  if (event.source !== 'nessie' || event.amountMinor >= 0n) return undefined;
  return docNumbersIn(event.description).find(d => findDoc(ctx, d)?.kind === 'bill');
}

// Run before recordPayment: a payment of more than the bill has open, or of a
// bill already paid, comes back as a write-up for a person
export function checkPayment(
  ctx: Ctx,
  event: Event,
  docNumber: string | undefined,
  rowOf: (eventId: bigint) => number
): { review: PaymentWriteUp; duplicateOf?: bigint } | undefined {
  const found = docNumber ? findDoc(ctx, docNumber) : undefined;
  if (!found || found.kind !== 'bill') return undefined;
  const earlier = [...ctx.db.accountingPayment.iter()].filter(p => p.docType === 'bill' && p.docId === found.doc.id);
  // Already recorded (the same row seen again): nothing new to check
  if (earlier.some(p => p.reference === `event:${event.id}`)) return undefined;
  const problem = checkBillPayment(event.amountMinor, found.doc.balanceMinor);
  if (!problem) return undefined;
  const earlierIds = earlier.flatMap(p => (p.reference.startsWith('event:') ? [BigInt(p.reference.slice(6))] : []));
  const review = paymentWriteUp(problem, {
    vendor: found.doc.vendor,
    source: SOURCE_LABEL[event.source] ?? event.source,
    amountMinor: event.amountMinor,
    date: event.occurredAt.toDate(),
    row: rowOf(event.id),
    doc: found.doc.docNumber,
    totalMinor: found.doc.totalMinor,
    balanceMinor: found.doc.balanceMinor,
    earlierRows: earlierIds.map(rowOf),
  });
  return { review, duplicateOf: problem.kind === 'paid_twice' ? earlierIds[0] : undefined };
}

// Every bill and invoice, with what is open and which rows paid it (for the Bookkeeper's prompt)
export function documentsForMatching(ctx: Ctx, rowOf: (eventId: bigint) => number | undefined): MatchDoc[] {
  const paidBy = new Map<string, number[]>();
  for (const p of ctx.db.accountingPayment.iter()) {
    const row = p.reference.startsWith('event:') ? rowOf(BigInt(p.reference.slice(6))) : undefined;
    if (row === undefined) continue;
    const key = `${p.docType}:${p.docId}`;
    paidBy.set(key, [...(paidBy.get(key) ?? []), row]);
  }
  const doc = (kind: 'bill' | 'invoice', d: Bill | Invoice, party: string): MatchDoc => ({
    doc: d.docNumber,
    kind,
    party,
    total_cents: Number(d.totalMinor),
    open_cents: Number(d.balanceMinor),
    status: d.status,
    paid_by_rows: paidBy.get(`${kind}:${d.id}`) ?? [],
  });
  return [
    ...[...ctx.db.accountingBill.iter()].map(b => doc('bill', b, b.vendor)),
    ...[...ctx.db.accountingInvoice.iter()].map(i => doc('invoice', i, i.customer)),
  ];
}

function invoiceEventId(ctx: Ctx, invoice: Invoice): bigint | undefined {
  return ctx.db.inboundEvent.dedupeKey.find(`ledger:invoice:${invoice.id}`)?.id;
}

// An email thread about this invoice is already going
function reminding(ctx: Ctx, eventId: bigint): boolean {
  for (const t of ctx.db.emailThread.iter()) {
    if (t.eventId === eventId && (t.status === 'waiting' || t.status === 'replied')) return true;
  }
  return false;
}

export function daysOverdue(ctx: Ctx, invoice: Invoice): number {
  const late = ctx.timestamp.microsSinceUnixEpoch - invoice.dueDate.microsSinceUnixEpoch;
  return late > 0n ? Number(late / DAY_MICROS) + (late % DAY_MICROS > 0n ? 1 : 0) : 0;
}

// Open invoices past their due date that nobody is reminding yet (for the Bookkeeper's prompt)
export function overdueInvoices(ctx: Ctx): { docNumber: string; customer: string; balance: string; daysOverdue: number }[] {
  const out = [];
  for (const i of ctx.db.accountingInvoice.iter()) {
    if (i.balanceMinor <= 0n || daysOverdue(ctx, i) <= 0) continue;
    const eventId = invoiceEventId(ctx, i);
    if (eventId === undefined || reminding(ctx, eventId)) continue;
    out.push({ docNumber: i.docNumber, customer: i.customer, balance: money(i.balanceMinor), daysOverdue: daysOverdue(ctx, i) });
  }
  return out.sort((a, b) => b.daysOverdue - a.daysOverdue).slice(0, 20);
}

function defaultReminder(invoice: Invoice, days: number): string {
  return `Hello ${invoice.customer},\n\nInvoice ${invoice.docNumber} for ${money(invoice.totalMinor)} was due ${days} ${
    days === 1 ? 'day' : 'days'
  } ago, and ${money(invoice.balanceMinor)} is still open. Could you let us know when it will be paid?\n\nThank you.`;
}

// The question-and-email record a reminder thread hangs on (already decided:
// the reminder is the decision). Returns its id for startFollowUp.
export function createReminder(
  ctx: Ctx,
  docNumber: string,
  message: string | undefined,
  note: string
): { itemId: bigint; eventId: bigint; invoice: Invoice } {
  const found = findDoc(ctx, docNumber);
  if (!found || found.kind !== 'invoice') throw new SenderError(`No invoice ${docNumber}`);
  const invoice = found.doc;
  if (invoice.balanceMinor <= 0n) throw new SenderError(`${docNumber} is already paid`);
  const eventId = invoiceEventId(ctx, invoice);
  if (eventId === undefined) throw new SenderError(`${docNumber} hasn't reached the books yet`);
  if (reminding(ctx, eventId)) throw new SenderError(`${invoice.customer} is already being reminded about ${docNumber}`);
  const days = daysOverdue(ctx, invoice);
  const title = `${invoice.customer}: ${docNumber} ${days ? `${days} ${days === 1 ? 'day' : 'days'} overdue` : 'not yet paid'}`;
  const item = ctx.db.reviewItem.insert({
    id: 0n,
    eventId,
    runId: 0n,
    question: `Remind ${invoice.customer} about ${docNumber}?`,
    reason: `${money(invoice.balanceMinor)} of ${money(invoice.totalMinor)} is still open${days ? `, ${days} days past due` : ''}.`,
    recommendation: 'follow_up',
    confidence: 0,
    duplicateOf: undefined,
    status: 'applied',
    decision: 'follow_up',
    decidedBy: undefined,
    decidedAt: ctx.timestamp,
    resultNote: note,
    createdAt: ctx.timestamp,
  });
  ctx.db.reviewDetail.insert({
    itemId: item.id,
    title,
    whatHappened: `${money(invoice.balanceMinor)} is still open on ${docNumber}.`,
    evidence: '[]',
    fix: `Remind ${invoice.customer} to pay ${docNumber}.`,
    followUpTo: invoice.customer,
    followUpSubject: `Reminder: ${docNumber}, ${money(invoice.balanceMinor)} open`,
    followUpMessage: (message && message.trim()) || defaultReminder(invoice, days),
  });
  return { itemId: item.id, eventId, invoice };
}

export function books(stdb: Schema) {
  // Remind them: email the sponsor about an open invoice. Logged so the
  // pattern learner can learn when people remind (and let the Bookkeeper do it).
  const remindInvoice = stdb.procedure({ docNumber: t.string() }, t.string(), (ctx, { docNumber }) => {
    const made = ctx.withTx(tx => {
      const r = createReminder(tx, docNumber, undefined, 'Reminder sent by a person');
      const days = daysOverdue(tx, r.invoice);
      logAction(
        tx,
        ctx.sender,
        'reminder',
        `Reminded ${r.invoice.customer} about ${docNumber} (${money(r.invoice.balanceMinor)} open${days ? `, ${days} days overdue` : ''})`,
        {
          eventId: r.eventId,
          learnable: true,
          details: { customer: r.invoice.customer, docNumber, open: Number(r.invoice.balanceMinor) / 100, daysOverdue: days },
        }
      );
      return r;
    });
    return startFollowUp(ctx, made.itemId);
  });

  return { remindInvoice };
}
