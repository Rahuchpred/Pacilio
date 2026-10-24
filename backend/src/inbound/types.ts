import type { Http } from '../droid/factory';

// Normalized shape every source emits, whatever API it came from.
export type EventKind =
  | 'bank_transaction' // Nessie deposits, withdrawals, transfers
  | 'processor_transaction' // Stripe
  | 'card_transaction' // Nessie purchases
  | 'bill' // Ledger (and Nessie bill pay): we owe a vendor
  | 'invoice' // Ledger: a customer owes us
  | 'payment_recorded' // Ledger: a payment booked against a bill or invoice
  | 'receipt'; // CORD: proof of a purchase

export interface InboundEventDraft {
  // Stable id in the source system; with `source` it de-duplicates re-polls
  sourceId: string;
  kind: EventKind;
  occurredAt: Date;
  // Signed, in the currency's minor unit: positive = money in, negative = money out
  amountMinor: bigint;
  currency: string;
  counterparty: string;
  description: string;
  reference?: string;
  documentUrl?: string;
  raw: unknown;
}

// One change made to an event on purpose, kept as ground truth for scoring.
export interface Corruption {
  field: string;
  op: string;
  before: string;
  after: string;
}

// How messy a source's data should be. Rates are probabilities per event.
export interface CorruptionProfile {
  // mistaker-style data-entry errors on text fields
  typoRate: number;
  typoFields: ('counterparty' | 'description' | 'reference')[];
  // gecko-style near-duplicates of whole events
  duplicateRate: number;
}

export interface SourceContext {
  http: Http;
  env(key: string): string;
  // Current time from SpacetimeDB (use instead of Date.now())
  now(): Date;
  // Read this database, for sources backed by our own tables. The callback
  // gets the transaction context; sources cast it to the schema's ctx type.
  withTx<T>(fn: (tx: unknown) => T): T;
}

export interface PollResult {
  events: InboundEventDraft[];
  // Opaque per-source state (cursor, tokens) saved for the next poll
  state: string;
}

// Shared contract for every input. A source only knows how to fetch and
// normalize; corruption, de-duplication and storage happen in the hub.
export interface Source {
  readonly name: string;
  readonly defaultProfile: CorruptionProfile;
  // Max events emitted per tick, so backfills trickle in like live data
  readonly defaultMaxPerTick: number;
  // Env keys that must be set for this source to run
  readonly requiredEnv: string[];
  poll(ctx: SourceContext, state: string, limit: number): PollResult;
}

// ─── Shared helpers for sources ─────────────────────────────────────────────

export class SourceError extends Error {}

export function getJson<T>(
  ctx: SourceContext,
  url: string,
  headers: Record<string, string>
): T {
  return requestJson<T>(ctx, 'GET', url, headers);
}

export function requestJson<T>(
  ctx: SourceContext,
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: string
): T {
  const res = ctx.http.fetch(url, { method, headers, body });
  const text = res.text();
  if (res.status < 200 || res.status >= 300) {
    throw new SourceError(`${method} ${url.split('?')[0]} → ${res.status}: ${text.slice(0, 300)}`);
  }
  return JSON.parse(text) as T;
}

export function parseState<T extends object>(state: string, fallback: T): T {
  if (!state) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(state) as Partial<T>) };
  } catch {
    return fallback;
  }
}

// "12.34" or 12.34 → 1234n
export function toMinor(amount: number | string, decimals = 2): bigint {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  return BigInt(Math.round(n * 10 ** decimals));
}

// Array#at isn't available at the module's ES2021 target.
export function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

// URLSearchParams isn't available in the module runtime.
export function queryString(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}
