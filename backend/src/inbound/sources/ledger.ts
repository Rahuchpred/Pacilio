import { Timestamp } from 'spacetimedb';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../../index';
import { addDays, amountBetween, pick } from '../simulation';
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
  const { scenario } = ctx;
  const now = ctx.now();
  const roll = ctx.random();
  ctx.withTx(raw => {
    const tx = raw as Ctx;
    const docNumber = (prefix: string) => `${prefix}-${ctx.random.integerInRange(1000, 9999)}`;
    // Documents dated over the past few weeks, so some are already due or
    // overdue when they reach the books
    const dated = (maxDaysAgo: number) => addDays(now, -ctx.random.integerInRange(0, maxDaysAgo));
    const base = {
      id: 0n,
      currency: 'USD',
      status: 'open',
      createdAt: tx.timestamp,
    };

    // A customer invoice now and then (a sponsor, a client); otherwise a
    // vendor bill. Payments aren't made up here: the bank pays bills and
    // customers pay invoices into the bank, and Pacioli records them when it
    // matches them.
    if (roll < 0.3) {
      const customer = pick(ctx.random, scenario.customers);
      const total = BigInt(amountBetween(ctx.random, customer.min, customer.max));
      const issued = dated(45);
      tx.db.accountingInvoice.insert({
        ...base,
        txnDate: Timestamp.fromDate(issued),
        customer: customer.name,
        docNumber: docNumber('INV'),
        dueDate: Timestamp.fromDate(addDays(issued, 30)),
        lines: [{ description: `${customer.item} - ${scenario.period}`, amountMinor: total }],
        totalMinor: total,
        balanceMinor: total,
        memo: 'Net 30',
      });
      return;
    }

    // Now and then a vendor we paid with no bill sends it late (after we asked).
    // Pacioli links it to that payment instead of paying it again.
    const missing = [...tx.db.accountingExpense.iter()].filter(
      e => e.status === 'no_bill' && ![...tx.db.accountingBill.iter()].some(b => b.vendor === e.vendor && b.totalMinor === e.amountMinor)
    );
    if (missing.length && ctx.random() < 0.3) {
      const e = pick(ctx.random, missing);
      tx.db.accountingBill.insert({
        ...base,
        txnDate: Timestamp.fromDate(now),
        vendor: e.vendor,
        docNumber: docNumber(initials(e.vendor)),
        dueDate: Timestamp.fromDate(addDays(now, 15)),
        lines: [{ description: e.memo, amountMinor: e.amountMinor }],
        totalMinor: e.amountMinor,
        balanceMinor: e.amountMinor,
        memo: 'Sent late, for a payment already made',
      });
      return;
    }

    const vendor = pick(ctx.random, scenario.vendors);
    const main = BigInt(amountBetween(ctx.random, vendor.min, vendor.max));
    const lines = [{ description: `${vendor.item} - ${scenario.period}`, amountMinor: main }];
    if (ctx.random() < 0.3) lines.push({ description: 'Delivery and setup', amountMinor: BigInt(amountBetween(ctx.random, 5_000, 20_000)) });
    const total = lines.reduce((sum, l) => sum + l.amountMinor, 0n);
    const received = dated(20);
    tx.db.accountingBill.insert({
      ...base,
      txnDate: Timestamp.fromDate(received),
      vendor: vendor.name,
      docNumber: docNumber(initials(vendor.name)),
      dueDate: Timestamp.fromDate(addDays(received, ctx.random() < 0.5 ? 15 : 30)),
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

  // Bills arrive from vendors, invoices go to customers
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

      // Payments aren't events of their own: each one is recorded by Pacioli when
      // the Bookkeeper matches a bank row to its bill or invoice, so sending it
      // back into the feed would count the same money twice.
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
