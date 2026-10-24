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
  simulateChance: 0.25,

  // Mark every record already in the account as seen
  baseline(ctx, state) {
    return this.poll(ctx, state, Number.MAX_SAFE_INTEGER).state;
  },

  // The promoter's operating account: paying vendors, banking payouts,
  // pulling a cash float, running payroll and scheduling bills
  simulate(ctx, rawState) {
    const full = parseState<{ sim?: NessieSim }>(rawState, {});
    const sim: NessieSim = { merchantIds: {}, ...full.sim };

    if (!sim.operatingId) {
      const accounts = list<Account>(ctx, '/accounts');
      const operating = accounts.find(a => a.nickname === 'Operating') ?? accounts[0];
      if (!operating) throw new SourceError('No Nessie account to simulate on; create one first');
      sim.operatingId = operating._id;
      sim.payrollId = accounts.find(a => a.nickname === 'Payroll')?._id;
    }

    const base = `/accounts/${sim.operatingId}`;
    const today = isoDate(ctx.now());
    const roll = ctx.random();
    const vendor = pick(ctx.random, VENDORS);

    if (roll < 0.5) {
      // Pay a vendor bill from the Ledger: usually exactly, sometimes not
      const bills = ctx.withTx(raw => [...(raw as Ctx).db.accountingBill.iter()]);
      const open = bills.filter(b => b.balanceMinor > 0n);
      const paid = bills.filter(b => b.balanceMinor === 0n);
      const kind = ctx.random();
      let payee = vendor;
      let cents = amountBetween(ctx.random, vendor.min, vendor.max);
      let memo = `${vendor.item} - ${SHOW}`;
      const bill =
        kind < 0.8 && open.length ? pick(ctx.random, open) : kind < 0.9 && paid.length ? pick(ctx.random, paid) : undefined;
      if (bill) {
        payee = VENDORS.find(v => v.name === bill.vendor) ?? vendor;
        cents = Number(bill.balanceMinor || bill.totalMinor);
        memo = `${payee.item} - ${bill.docNumber}`;
        // Now and then the bank pays more than the bill says
        if (kind > 0.72 && kind < 0.8) cents = Math.round(cents * (1 + ctx.random.integerInRange(2, 8) / 100));
      }
      // kind ≥ 0.9 (or no bills yet): a charge with no bill behind it
      nessiePost(ctx, `${base}/purchases`, {
        merchant_id: merchantId(ctx, sim, payee),
        medium: 'balance',
        status: 'completed',
        purchase_date: today,
        amount: dollars(cents),
        description: memo,
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
          counterparty: d.description || 'Deposit',
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
