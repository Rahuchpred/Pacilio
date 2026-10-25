import {
  SourceError,
  getJson,
  queryString,
  parseState,
  requestJson,
  toMinor,
  type InboundEventDraft,
  type Source,
  type SourceContext,
} from '../types';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../../index';
import { SHOW, VENDORS, addDays, amountBetween, isoDate, pick } from '../simulation';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// Capital One's hackathon bank (https://api.nessieisreal.com, HTTPS only).
// Covers every account under the API key: purchases, deposits, withdrawals,
// transfers and bills. Data is per key, so it only holds what we've created.
//
// Differences from the old Nessie SDK, found against the live API:
// - transfers use `id` (others `_id`) and carry no payer/payee
// - a record created without a field the list endpoint expects (e.g. a
//   purchase without `status`) makes that whole list return 400
const BASE_URL = 'https://api.nessieisreal.com';

interface Account { _id: string; nickname: string; type: string }
interface Txn {
  _id?: string;
  id?: string;
  amount: number;
  description?: string;
  status?: string;
  medium?: string;
  transaction_date?: string;
  purchase_date?: string;
  merchant_id?: string;
}
interface Bill {
  _id: string;
  payee: string;
  nickname?: string;
  status: string;
  payment_amount: number;
  payment_date?: string;
  creation_date?: string;
}

interface NessieState {
  // Nessie has no "changed since" filter, so remember what we've emitted
  seen: string[];
  merchants: Record<string, string>;
}

// A broken list (see above) is skipped so the account's other lists still flow.
function list<T>(ctx: SourceContext, path: string): T[] {
  const qs = queryString({ key: ctx.env('NESSIE_API_KEY') });
  try {
    return getJson<T[]>(ctx, `${BASE_URL}${path}?${qs}`, {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Nessie answers an empty list with 404 ("No transfers found for this account")
    if (!msg.includes('→ 404')) console.warn(`nessie ${path}: ${msg}`);
    return [];
  }
}

const idOf = (t: Txn) => t._id ?? t.id ?? '';

function merchantName(ctx: SourceContext, state: NessieState, id: string | undefined): string {
  if (!id) return 'Unknown merchant';
  if (!(id in state.merchants)) {
    const qs = queryString({ key: ctx.env('NESSIE_API_KEY') });
    try {
      state.merchants[id] = getJson<{ name: string }>(ctx, `${BASE_URL}/merchants/${id}?${qs}`, {}).name;
    } catch {
      state.merchants[id] = id;
    }
  }
  return state.merchants[id];
}

function date(...candidates: (string | undefined)[]): Date {
  return new Date(candidates.find(Boolean) ?? 0);
}

function memo(t: Txn): string {
  return [t.description, t.medium, t.status].filter(Boolean).join(' · ');
}

// ─── Simulation ─────────────────────────────────────────────────────────────

interface NessieSim {
  operatingId?: string;
  payrollId?: string;
  // Vendor name → Nessie merchant id, created on first use
  merchantIds: Record<string, string>;
  // Ledger bill ids this account has already paid, so each is paid once
  // (except the deliberate double payments)
  paidBills: string[];
  // Invoice ids a sponsor has already paid into this account
  paidInvoices?: string[];
}

// Nessie accepts records missing fields its own list endpoints require, which
// then breaks those lists for good. Every body below sends the full set.
function nessiePost(ctx: SourceContext, path: string, body: object): string {
  const qs = queryString({ key: ctx.env('NESSIE_API_KEY') });
  const res = requestJson<{ objectCreated?: { _id?: string; id?: string } }>(
    ctx,
    'POST',
    `${BASE_URL}${path}?${qs}`,
    { 'Content-Type': 'application/json' },
    JSON.stringify(body)
  );
  return res.objectCreated?._id ?? res.objectCreated?.id ?? '';
}

function merchantId(ctx: SourceContext, sim: NessieSim, vendor: (typeof VENDORS)[number]): string {
  if (!sim.merchantIds[vendor.name]) {
    sim.merchantIds[vendor.name] = nessiePost(ctx, '/merchants', {
      name: vendor.name,
      category: vendor.category,
      address: { street_number: '1', street_name: 'Market St', city: 'San Francisco', state: 'CA', zip: '94103' },
      geocode: { lat: 37.77, lng: -122.41 },
    });
  }
  return sim.merchantIds[vendor.name];
}

const dollars = (cents: number) => cents / 100;

export const nessie: Source = {
  name: 'nessie',
  requiredEnv: ['NESSIE_API_KEY'],
  defaultMaxPerTick: 20,
  // Emitted as Nessie reports it, no injected errors
  defaultProfile: { typoRate: 0, typoFields: [], duplicateRate: 0 },
  simulateChance: 1,

  // Mark every record already in the account as seen
  baseline(ctx, state) {
    return this.poll(ctx, state, Number.MAX_SAFE_INTEGER).state;
  },

  // The promoter's operating account: paying vendors, banking payouts,
  // pulling a cash float, running payroll and scheduling bills
  simulate(ctx, rawState) {
    const full = parseState<{ sim?: NessieSim }>(rawState, {});
    const sim: NessieSim = { merchantIds: {}, paidBills: [], ...full.sim };

    if (!sim.operatingId) {
      const accounts = list<Account>(ctx, '/accounts');
      const operating = accounts.find(a => a.nickname === 'Operating') ?? accounts[0];
      if (!operating) throw new SourceError('No Nessie account to simulate on; create one first');
      sim.operatingId = operating._id;
      sim.payrollId = accounts.find(a => a.nickname === 'Payroll')?._id;
    }

    const base = `/accounts/${sim.operatingId}`;
    const today = isoDate(ctx.now());
    // A busy operating account: several bank movements per tick
    const actions = ctx.random.integerInRange(1, 3);
    for (let action = 0; action < actions; action++) {
      const roll = ctx.random();
      const vendor = pick(ctx.random, VENDORS);

      if (roll < 0.5) {
        // Pay a vendor bill from the Ledger: usually exactly, sometimes not
        // Only bills the agent has been shown (sent into the feed since the last
        // Restart); paying an older one would look like a payment with no bill
        const bills = ctx.withTx(raw => {
          const tx = raw as Ctx;
          return [...tx.db.accountingBill.iter()].filter(b => tx.db.inboundEvent.dedupeKey.find(`ledger:bill:${b.id}`));
        });
        const paidByBank = new Set(sim.paidBills);
        const unpaid = bills.filter(b => !paidByBank.has(b.id.toString()));
        const alreadyPaid = bills.filter(b => paidByBank.has(b.id.toString()));
        const kind = ctx.random();
        let payee = vendor;
        let cents = amountBetween(ctx.random, vendor.min, vendor.max);
        let memo = `${vendor.item} - ${SHOW}`;
        // Almost always a bill not yet paid from this account. Rarely a planted
        // problem: an overpayment (3%), a bill paid twice (3%), or no bill (4%)
        const bill =
          kind < 0.9 && unpaid.length
            ? pick(ctx.random, unpaid)
            : kind < 0.93 && alreadyPaid.length
              ? pick(ctx.random, alreadyPaid)
              : kind >= 0.96 || !unpaid.length
                ? undefined
                : pick(ctx.random, unpaid);
        if (bill) {
          if (!paidByBank.has(bill.id.toString())) sim.paidBills.push(bill.id.toString());
          payee = VENDORS.find(v => v.name === bill.vendor) ?? vendor;
          cents = Number(bill.totalMinor);
          memo = `${payee.item} - ${bill.docNumber}`;
          // Now and then the bank pays more than the bill says
          if (kind > 0.87 && kind < 0.9) cents = Math.round(cents * (1 + ctx.random.integerInRange(2, 8) / 100));
        }
        // No bill picked (planted, or none sent yet): a charge with no bill behind it
        nessiePost(ctx, `${base}/purchases`, {
          merchant_id: merchantId(ctx, sim, payee),
          medium: 'balance',
          status: 'completed',
          purchase_date: today,
          amount: dollars(cents),
          description: memo,
        });
      } else if (roll < 0.58) {
        // A sponsor pays one of our invoices into the bank, quoting its number:
        // usually in full, sometimes short. Only invoices already in the feed,
        // and some never get paid, so the books always have something overdue.
        const paid = new Set(sim.paidInvoices ?? []);
        const invoices = ctx.withTx(raw => {
          const tx = raw as Ctx;
          return [...tx.db.accountingInvoice.iter()].filter(
            i => !paid.has(i.id.toString()) && tx.db.inboundEvent.dedupeKey.find(`ledger:invoice:${i.id}`)
          );
        });
        if (!invoices.length || ctx.random() < 0.4) continue;
        const invoice = pick(ctx.random, invoices);
        sim.paidInvoices = [...(sim.paidInvoices ?? []), invoice.id.toString()];
        const total = Number(invoice.totalMinor);
        const cents = ctx.random() < 0.85 ? total : Math.round(total * ctx.random.integerInRange(50, 90) / 100);
        nessiePost(ctx, `${base}/deposits`, {
          medium: 'balance',
          status: 'completed',
          transaction_date: today,
          amount: dollars(cents),
          description: `${invoice.customer} - payment for ${invoice.docNumber}`,
        });
      } else if (roll < 0.65) {
        const fromStripe = ctx.random() < 0.7;
        nessiePost(ctx, `${base}/deposits`, {
          medium: 'balance',
          status: 'completed',
          transaction_date: today,
          amount: dollars(amountBetween(ctx.random, fromStripe ? 100_000 : 30_000, fromStripe ? 800_000 : 150_000)),
          description: fromStripe ? 'STRIPE PAYOUT' : 'BOX OFFICE CASH DEPOSIT',
        });
      } else if (roll < 0.75) {
        nessiePost(ctx, `${base}/withdrawals`, {
          medium: 'balance',
          status: 'completed',
          transaction_date: today,
          amount: dollars(amountBetween(ctx.random, 20_000, 60_000)),
          description: 'Cash for box office float',
        });
      } else if (roll < 0.87) {
        nessiePost(ctx, `${base}/transfers`, {
          status: 'completed',
          transaction_date: today,
          amount: dollars(amountBetween(ctx.random, 150_000, 400_000)),
          description: `Crew payroll - ${SHOW}`,
        });
      } else {
        nessiePost(ctx, `${base}/bills`, {
          status: 'pending',
          payee: vendor.name,
          nickname: `${vendor.item} invoice`,
          payment_date: isoDate(addDays(ctx.now(), ctx.random.integerInRange(7, 21))),
          recurring_date: 1,
          payment_amount: dollars(amountBetween(ctx.random, vendor.min, vendor.max)),
        });
      }
    }

    return JSON.stringify({ ...full, sim });
  },

  poll(ctx, rawState, limit) {
    const state = parseState<NessieState>(rawState, { seen: [], merchants: {} });
    const seen = new Set(state.seen);
    const drafts: InboundEventDraft[] = [];
    const add = (draft: InboundEventDraft) => {
      if (!seen.has(draft.sourceId)) drafts.push(draft);
    };

    for (const account of list<Account>(ctx, '/accounts')) {
      const acct = `${account.nickname} (${account.type})`;
      const base = `/accounts/${account._id}`;

      for (const p of list<Txn>(ctx, `${base}/purchases`)) {
        add({
          sourceId: `purchase:${idOf(p)}`,
          kind: 'card_transaction',
          occurredAt: date(p.purchase_date),
          amountMinor: -toMinor(p.amount),
          currency: 'USD',
          counterparty: merchantName(ctx, state, p.merchant_id),
          description: memo(p),
          reference: acct,
          raw: p,
        });
      }
      for (const d of list<Txn>(ctx, `${base}/deposits`)) {
        add({
          sourceId: `deposit:${idOf(d)}`,
          kind: 'bank_transaction',
          occurredAt: date(d.transaction_date),
          amountMinor: toMinor(d.amount),
          currency: 'USD',
          // "Bayline Energy Drinks - payment for INV-2497": the sponsor is the counterparty
          counterparty: (d.description || 'Deposit').split(' - payment for ')[0],
          description: memo(d),
          reference: acct,
          raw: d,
        });
      }
      for (const w of list<Txn>(ctx, `${base}/withdrawals`)) {
        add({
          sourceId: `withdrawal:${idOf(w)}`,
          kind: 'bank_transaction',
          occurredAt: date(w.transaction_date),
          amountMinor: -toMinor(w.amount),
          currency: 'USD',
          counterparty: w.description || 'Withdrawal',
          description: memo(w),
          reference: acct,
          raw: w,
        });
      }
      // Transfers are listed on the sending account
      for (const t of list<Txn>(ctx, `${base}/transfers`)) {
        add({
          sourceId: `transfer:${idOf(t)}`,
          kind: 'bank_transaction',
          occurredAt: date(t.transaction_date),
          amountMinor: -toMinor(t.amount),
          currency: 'USD',
          counterparty: t.description || 'Transfer',
          description: memo(t),
          reference: acct,
          raw: t,
        });
      }
      for (const b of list<Bill>(ctx, `${base}/bills`)) {
        add({
          sourceId: `bill:${b._id}`,
          kind: 'bill',
          occurredAt: date(b.payment_date, b.creation_date),
          amountMinor: -toMinor(b.payment_amount),
          currency: 'USD',
          counterparty: b.payee,
          description: [b.nickname, b.status].filter(Boolean).join(' · '),
          reference: acct,
          raw: b,
        });
      }
    }

    const batch = drafts
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
      .slice(0, limit);
    for (const d of batch) seen.add(d.sourceId);

    return {
      events: batch,
      state: JSON.stringify({ seen: [...seen], merchants: state.merchants }),
    };
  },
};
