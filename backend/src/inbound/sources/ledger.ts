import { Timestamp } from 'spacetimedb';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../../index';
import { SHOW, SPONSORS, VENDORS, addDays, amountBetween, pick } from '../simulation';
import { parseState, type InboundEventDraft, type Source, type SourceContext } from '../types';

// Our mock accounting system (backend/src/accounting): bills, invoices and the
// payments booked against them. Read straight from this database, no HTTP.
type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

interface LedgerState {
  // Highest row id already emitted per table (ids only grow)
  bill: string;
  invoice: string;
  payment: string;
}

type Line = { description: string; amountMinor: bigint };

function describe(lines: Line[], memo: string): string {
  return lines.map(l => l.description).join('; ') || memo;
}

// ─── Simulation ─────────────────────────────────────────────────────────────

const initials = (name: string) => name.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3);

function simulateLedger(ctx: SourceContext): void {
  const now = ctx.now();
  const roll = ctx.random();
  ctx.withTx(raw => {
    const tx = raw as Ctx;
    const openBills = [...tx.db.accountingBill.iter()].filter(b => b.balanceMinor > 0n);
    const openInvoices = [...tx.db.accountingInvoice.iter()].filter(i => i.balanceMinor > 0n);
    const open = [
      ...openBills.map(doc => ({ docType: 'bill' as const, doc })),
      ...openInvoices.map(doc => ({ docType: 'invoice' as const, doc })),
    ];

    // Settle something that's open: usually in full, sometimes half now
    if (roll < 0.35 && open.length) {
      const { docType, doc } = pick(ctx.random, open);
      const full = ctx.random() < 0.8;
      const amount = full ? doc.balanceMinor : doc.balanceMinor / 2n;
      const balanceMinor = doc.balanceMinor - amount;
      const status = balanceMinor === 0n ? 'paid' : 'open';
      if (docType === 'bill') tx.db.accountingBill.id.update({ ...doc, balanceMinor, status } as typeof openBills[number]);
      else tx.db.accountingInvoice.id.update({ ...doc, balanceMinor, status } as typeof openInvoices[number]);
      tx.db.accountingPayment.insert({
        id: 0n,
        docType,
        docId: doc.id,
        amountMinor: amount,
        paidAt: tx.timestamp,
        method: docType === 'bill' ? pick(ctx.random, ['ach', 'card', 'check']) : 'ach',
        reference: full ? '' : 'Partial payment',
      });
      return;
    }

    const docNumber = (prefix: string) => `${prefix}-${ctx.random.integerInRange(1000, 9999)}`;
    const base = {
      id: 0n,
      txnDate: Timestamp.fromDate(now),
      currency: 'USD',
      status: 'open',
      createdAt: tx.timestamp,
    };

    // A sponsor invoice now and then; otherwise a vendor bill for the show
    if (roll < 0.55) {
      const sponsor = pick(ctx.random, SPONSORS);
      const total = BigInt(amountBetween(ctx.random, sponsor.min, sponsor.max));
      tx.db.accountingInvoice.insert({
        ...base,
        customer: sponsor.name,
        docNumber: docNumber('INV'),
        dueDate: Timestamp.fromDate(addDays(now, 30)),
        lines: [{ description: `${sponsor.item} - ${SHOW}`, amountMinor: total }],
        totalMinor: total,
        balanceMinor: total,
        memo: 'Net 30',
      });
      return;
    }

    const vendor = pick(ctx.random, VENDORS);
    const main = BigInt(amountBetween(ctx.random, vendor.min, vendor.max));
    const lines = [{ description: `${vendor.item} - ${SHOW}`, amountMinor: main }];
    if (ctx.random() < 0.3) lines.push({ description: 'Delivery and setup', amountMinor: BigInt(amountBetween(ctx.random, 5_000, 20_000)) });
    const total = lines.reduce((sum, l) => sum + l.amountMinor, 0n);
    tx.db.accountingBill.insert({
      ...base,
      vendor: vendor.name,
      docNumber: docNumber(initials(vendor.name)),
      dueDate: Timestamp.fromDate(addDays(now, ctx.random() < 0.5 ? 15 : 30)),
      lines,
      totalMinor: total,
      balanceMinor: total,
      memo: 'Net 15/30',
    });
  });
}

export const ledger: Source = {
  name: 'ledger',
  requiredEnv: [],
  defaultMaxPerTick: 10,
  // Typed in by people: typos and double-entered documents
  defaultProfile: {
    typoRate: 0.2,
    typoFields: ['counterparty', 'description', 'reference'],
    duplicateRate: 0.1,
  },
  simulateChance: 0.65,

  // Move every cursor past the rows that already exist
  baseline(ctx, state) {
    return this.poll(ctx, state, Number.MAX_SAFE_INTEGER).state;
  },

  // Bills arrive from vendors, invoices go to sponsors, open ones get paid
  simulate(ctx, state) {
    simulateLedger(ctx);
    return state;
  },

  poll(ctx, rawState, limit) {
    const state = parseState<LedgerState>(rawState, { bill: '0', invoice: '0', payment: '0' });
    const after = { bill: BigInt(state.bill), invoice: BigInt(state.invoice), payment: BigInt(state.payment) };

    const events = ctx.withTx(raw => {
      const tx = raw as Ctx;
      const out: { table: keyof LedgerState; id: bigint; draft: InboundEventDraft }[] = [];

      for (const b of tx.db.accountingBill.iter()) {
        if (b.id <= after.bill) continue;
        out.push({
          table: 'bill',
          id: b.id,
          draft: {
            sourceId: `bill:${b.id}`,
            kind: 'bill',
            occurredAt: b.txnDate.toDate(),
            amountMinor: -b.totalMinor,
            currency: b.currency,
            counterparty: b.vendor,
            description: describe(b.lines, b.memo),
            reference: b.docNumber,
            raw: { ...b, dueDate: b.dueDate.toDate().toISOString() },
          },
        });
      }

      for (const inv of tx.db.accountingInvoice.iter()) {
        if (inv.id <= after.invoice) continue;
        out.push({
          table: 'invoice',
          id: inv.id,
          draft: {
            sourceId: `invoice:${inv.id}`,
            kind: 'invoice',
            occurredAt: inv.txnDate.toDate(),
            amountMinor: inv.totalMinor,
            currency: inv.currency,
            counterparty: inv.customer,
            description: describe(inv.lines, inv.memo),
            reference: inv.docNumber,
            raw: { ...inv, dueDate: inv.dueDate.toDate().toISOString() },
          },
        });
      }

      for (const p of tx.db.accountingPayment.iter()) {
        if (p.id <= after.payment) continue;
        const isBill = p.docType === 'bill';
        const doc = isBill ? tx.db.accountingBill.id.find(p.docId) : tx.db.accountingInvoice.id.find(p.docId);
        const party = doc && ('vendor' in doc ? doc.vendor : doc.customer);
        out.push({
          table: 'payment',
          id: p.id,
          draft: {
            sourceId: `payment:${p.id}`,
            kind: 'payment_recorded',
            occurredAt: p.paidAt.toDate(),
            // Paying a bill is money out; collecting on an invoice is money in
            amountMinor: isBill ? -p.amountMinor : p.amountMinor,
            currency: doc?.currency ?? 'USD',
            counterparty: party ?? '',
            description: `Payment for ${p.docType} ${doc?.docNumber ?? p.docId} via ${p.method}`,
            reference: p.reference || doc?.docNumber,
            raw: p,
          },
        });
      }
      return out;
    });

    const batch = events
      .sort((a, b) => a.draft.occurredAt.getTime() - b.draft.occurredAt.getTime())
      .slice(0, limit);

    // Advance each cursor only past what we actually emitted, so the rest
    // trickles out on later ticks. Rows are emitted by date, so a cursor can
    // only move to an id once every lower id of that table has gone out.
    const emitted = new Set(batch.map(e => `${e.table}:${e.id}`));
    for (const table of ['bill', 'invoice', 'payment'] as const) {
      const pending = events
        .filter(e => e.table === table)
        .map(e => e.id)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
      for (const id of pending) {
        if (!emitted.has(`${table}:${id}`)) break;
        after[table] = id;
      }
    }

    return {
      events: batch.map(e => e.draft),
      state: JSON.stringify({
        bill: String(after.bill),
        invoice: String(after.invoice),
        payment: String(after.payment),
      }),
    };
  },
};
