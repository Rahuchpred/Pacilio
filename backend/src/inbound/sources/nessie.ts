import {
  getJson,
  queryString,
  parseState,
  toMinor,
  type InboundEventDraft,
  type Source,
  type SourceContext,
} from '../types';

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

export const nessie: Source = {
  name: 'nessie',
  requiredEnv: ['NESSIE_API_KEY'],
  defaultMaxPerTick: 20,
  // Emitted as Nessie reports it, no injected errors
  defaultProfile: { typoRate: 0, typoFields: [], duplicateRate: 0 },

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
