import { getJson, last, parseState, queryString, requestJson, type Source, type SourceContext } from '../types';
import { SHOW, TICKETS, pickWeighted } from '../simulation';

// Payment processor: charges, refunds, fees and payouts in one ledger.
// Uses a test-mode secret key (sk_test_...).
const BASE_URL = 'https://api.stripe.com/v1';

interface BalanceTransaction {
  id: string;
  amount: number;
  fee: number;
  net: number;
  currency: string;
  created: number;
  description: string | null;
  type: string;
  source: string | null;
}

function stripePost<T>(ctx: SourceContext, path: string, form: Record<string, string | number>): T {
  return requestJson<T>(
    ctx,
    'POST',
    `${BASE_URL}${path}`,
    {
      Authorization: `Bearer ${ctx.env('STRIPE_SECRET_KEY')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    queryString(form)
  );
}

// Stripe test cards: bypassPending settles at once, createDispute is charged back
const CARD_OK = 'pm_card_bypassPending';
const CARD_DISPUTED = 'pm_card_createDispute';

export const stripe: Source = {
  name: 'stripe',
  requiredEnv: ['STRIPE_SECRET_KEY'],
  defaultMaxPerTick: 20,
  defaultProfile: { typoRate: 0, typoFields: [], duplicateRate: 0.03 },
  simulateChance: 0.7,

  // Only balance transactions created from now on
  baseline(ctx) {
    return JSON.stringify({ since: Math.floor(ctx.now().getTime() / 1000) });
  },

  // Ticket buyers checking out: mostly sales, now and then a refund or a dispute
  simulate(ctx, state) {
    const roll = ctx.random();
    if (roll < 0.08) {
      const recent = getJson<{ data: { id: string; refunded: boolean; amount: number }[] }>(
        ctx,
        `${BASE_URL}/charges?limit=10`,
        { Authorization: `Bearer ${ctx.env('STRIPE_SECRET_KEY')}` }
      ).data.filter(c => !c.refunded);
      if (recent.length) {
        const charge = recent[ctx.random.integerInRange(0, recent.length - 1)];
        stripePost(ctx, '/refunds', { charge: charge.id, reason: 'requested_by_customer' });
        return state;
      }
    }
    const ticket = pickWeighted(ctx.random, TICKETS);
    const quantity = ticket.cents >= 10_000 ? 1 : ctx.random.integerInRange(1, 4);
    stripePost(ctx, '/payment_intents', {
      amount: ticket.cents * quantity,
      currency: 'usd',
      payment_method: roll > 0.97 ? CARD_DISPUTED : CARD_OK,
      'payment_method_types[]': 'card',
      confirm: 'true',
      description: `${quantity}x ${ticket.name} - ${SHOW}`,
    });
    return state;
  },

  poll(ctx, rawState, limit) {
    const state = parseState(rawState, { since: 0 });
    const headers = { Authorization: `Bearer ${ctx.env('STRIPE_SECRET_KEY')}` };

    // Stripe lists newest first; page back to `since`, then emit oldest first
    const all: BalanceTransaction[] = [];
    let startingAfter: string | undefined;
    for (let page = 0; page < 5; page++) {
      const params = queryString({
        limit: 100,
        'created[gte]': state.since,
        starting_after: startingAfter,
      });
      const res = getJson<{ data: BalanceTransaction[]; has_more: boolean }>(
        ctx,
        `${BASE_URL}/balance_transactions?${params}`,
        headers
      );
      all.push(...res.data);
      if (!res.has_more || !res.data.length) break;
      startingAfter = res.data[res.data.length - 1].id;
    }

    const batch = all.sort((a, b) => a.created - b.created).slice(0, limit);

    return {
      events: batch.map(bt => ({
        sourceId: bt.id,
        kind: 'processor_transaction' as const,
        occurredAt: new Date(bt.created * 1000),
        amountMinor: BigInt(bt.amount),
        currency: bt.currency.toUpperCase(),
        counterparty: bt.description ?? bt.type,
        description: `${bt.type} (fee ${bt.fee}, net ${bt.net})`,
        reference: bt.source ?? undefined,
        raw: bt,
      })),
      state: JSON.stringify({ since: last(batch)?.created ?? state.since }),
    };
  },
};
