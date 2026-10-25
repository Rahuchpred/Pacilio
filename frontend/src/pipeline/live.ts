import { useSyncExternalStore } from 'react';
import { useLive } from './store';
import type { EventReview, InboundEvent, ReviewItem } from '../module_bindings/types';
import type { StatusKind } from '../../../design-system/src/components';
import { usePipelineActivity } from './activity';

// Live state for the canvas, read straight from SpacetimeDB. Every card and
// the item panel derive what they show from these few hooks.

// The four inbound sources, matching the backend's InboundHub.
export const SOURCES = [
  { name: 'nessie', title: 'Nessie', provides: 'Bank: purchases, deposits, bills' },
  { name: 'stripe', title: 'Stripe', provides: 'Payments: charges, refunds, disputes' },
  { name: 'ledger', title: 'Ledger', provides: 'Accounting: bills, invoices, payments' },
  { name: 'cord', title: 'Receipts', provides: 'Scanned receipts (CORD)' },
] as const;

export const SOURCE_TITLES: Record<string, string> = Object.fromEntries(SOURCES.map(s => [s.name, s.title]));

const MINOR_DIGITS: Record<string, number> = { IDR: 0, JPY: 0, KRW: 0 };

// An amount in minor units as dollars, for <Money>.
export function dollars(amountMinor: bigint, currency = 'USD'): number {
  return Number(amountMinor) / 10 ** (MINOR_DIGITS[currency] ?? 2);
}

export const byIdAsc = <T extends { id: bigint }>(a: T, b: T) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
export const byIdDesc = <T extends { id: bigint }>(a: T, b: T) => byIdAsc(b, a);

// Formatters are slow to create; make each once
const CLOCK = new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit' });
export function clock(d: Date): string {
  return CLOCK.format(d);
}

export function kindLabel(kind: string): string {
  const text = kind.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function jsonList(json: string | undefined): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

// Where one event stands, from arrival to the ledger.
export type RowState = 'waiting' | 'checking' | 'posted' | 'refunded' | 'voided' | 'review' | 'following_up';

export const ROW_STATUS: Record<RowState, { kind: StatusKind; label: string; busy?: boolean }> = {
  waiting: { kind: 'agent', label: 'Waiting' },
  checking: { kind: 'agent', label: 'Checking', busy: true },
  posted: { kind: 'cleared', label: 'Posted' },
  refunded: { kind: 'cleared', label: 'Refunded' },
  voided: { kind: 'agent', label: 'Voided' },
  review: { kind: 'disputed', label: 'Needs you' },
  following_up: { kind: 'held', label: 'Following up' },
};

// Rows that count in the settled totals (the report uses the same rule).
export const SETTLED: RowState[] = ['posted', 'refunded'];

export function rowState(review: EventReview | undefined, item: ReviewItem | undefined): RowState {
  if (!review) return 'waiting';
  if (review.status !== 'done') return 'checking';
  if (review.outcome === 'ok') return 'posted';
  if (review.outcome === 'void') return 'voided';
  if (!item || item.status === 'open') return 'review';
  switch (item.decision) {
    case 'void':
      return 'voided';
    case 'refund':
      return 'refunded';
    case 'follow_up':
      return 'following_up';
    default:
      return 'posted';
  }
}

export type Row = { event: InboundEvent; state: RowState; review?: EventReview; item?: ReviewItem };

// Every event with its state, oldest first (worked out once, in the store).
export function useRows(): Row[] {
  return useLive().rows;
}

export type Totals = { moneyIn: number; moneyOut: number; net: number; settled: number; held: number };

export function totals(rows: Row[]): Totals {
  let moneyIn = 0;
  let moneyOut = 0;
  let settled = 0;
  let held = 0;
  for (const r of rows) {
    if (SETTLED.includes(r.state)) {
      settled++;
      // A refund cancels the charge it refunds
      if (r.state === 'refunded') continue;
      const v = dollars(r.event.amountMinor, r.event.currency);
      if (v >= 0) moneyIn += v;
      else moneyOut -= v;
    } else if (r.state === 'review' || r.state === 'following_up') {
      held++;
    }
  }
  return { moneyIn, moneyOut, net: moneyIn - moneyOut, settled, held };
}

// Open questions for a person, oldest first.
export function useOpenItems(): ReviewItem[] {
  return useLive().openItems;
}

export type AgentLook = { state: 'idle' | 'working' | 'done' | 'issue'; kind: StatusKind; label: string; busy?: boolean };

export function useAgentLook(): AgentLook {
  const agent = useLive().agents[0];
  if (agent?.lastError) return { state: 'issue', kind: 'disputed', label: 'Error' };
  if (agent?.status === 'running') return { state: 'working', kind: 'agent', label: 'Working', busy: true };
  if (agent?.enabled) return { state: 'idle', kind: 'cleared', label: 'Ready' };
  return { state: 'idle', kind: 'agent', label: 'Paused' };
}

// The transactions around the main agent: what it is checking now, then what
// waits for its next run, then what it just finished.
export { TXN_SLOTS } from './activity';

export function useTransactions(): Row[] {
  return usePipelineActivity().transactions;
}

// The item panel: one event, looked at closely.
let selected: string | null = null;
const listeners = new Set<() => void>();
export function openItem(eventId: bigint | null) {
  selected = eventId === null ? null : eventId.toString();
  listeners.forEach(l => l());
}
export function useOpenItem(): string | null {
  return useSyncExternalStore(
    l => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selected
  );
}
