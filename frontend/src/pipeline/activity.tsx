import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Row, RowState } from './live';
import { useLive } from './store';
import { sentence } from './text';

// What is moving on the canvas, line by line. Each new event travels its
// source's lane from the inbox to the Bookkeeper; when the agent picks an
// event up, a dot drops to its transaction card; when it decides, the result
// rides the line it goes out on: posted or voided to the ledger, a question
// up to Needs you. Every line keeps its own queue, spaced so tags never
// overlap. An event's transaction card shows only once its packet has arrived.

export const LANE_SOURCES = ['nessie', 'stripe', 'ledger', 'cord'] as const;
export const laneId = (source: string) => `e-in-${source}`;

// How long a trip takes and how far apart tags start, per kind of line.
// Tags move at a constant speed, so spacing in time is spacing on the line.
const LINES = {
  lane: { travel: 2800, gap: 1500, budget: 6 },
  decide: { travel: 2400, gap: 1400, budget: 5 },
  drop: { travel: 700, gap: 90, budget: 15 },
} as const;
// A huge burst (a reconnect, a replay) isn't activity to animate
const MAX_BURST = 60;

export interface Packet {
  key: string;
  // Milliseconds after it was queued that it sets off
  delay: number;
  travel: number;
  // Color class: a source (src-stripe) or an outcome (out-posted)
  tone: string;
  // Text on its tag; none for a plain dot
  label?: string;
}

interface Activity {
  // Packets per edge id
  flows: Record<string, Packet[]>;
  // The transactions around the Bookkeeper (see TXN_SLOTS)
  transactions: Row[];
  removePacket(edge: string, key: string): void;
}

const ActivityContext = createContext<Activity>({
  flows: {},
  transactions: [],
  removePacket: () => {},
});

// What the Bookkeeper is checking now, then what waits for its next run,
// then what it just finished. Events still travelling don't show yet.
// Up to 15 at once: a batch is about 20 events, so this shows most of one
export const TXN_SLOTS = 15;

function pickTransactions(rows: Row[], inFlight: Set<string>): Row[] {
  const out: Row[] = [];
  const landed = (r: Row) => !inFlight.has(r.event.id.toString());
  for (const r of rows) if (r.state === 'checking' && landed(r) && out.length < TXN_SLOTS) out.push(r);
  for (const r of rows) if (r.state === 'waiting' && landed(r) && out.length < TXN_SLOTS) out.push(r);
  for (let i = rows.length - 1; i >= 0 && out.length < TXN_SLOTS; i--) {
    const r = rows[i];
    if (r.state !== 'checking' && r.state !== 'waiting' && landed(r)) out.push(r);
  }
  return out;
}

export const usePipelineActivity = () => useContext(ActivityContext);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const short = (raw: string, max = 22) => {
  const text = sentence(raw);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
const money = (minor: bigint) => {
  const v = Number(minor) / 100;
  return `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
};

// Where a decision travels, and how it reads on the way
function decision(r: Row): { edge: string; tone: string; label: string } | null {
  const who = short(r.event.counterparty, 18);
  const category = r.review?.category;
  const to: Partial<Record<RowState, { edge: string; tone: string; label: string }>> = {
    posted: { edge: 'e-main-ledger', tone: 'out-posted', label: `Posted · ${category ?? who}` },
    refunded: { edge: 'e-main-ledger', tone: 'out-posted', label: `Refunded · ${who}` },
    voided: { edge: 'e-main-ledger', tone: 'out-voided', label: `Voided · ${who}` },
    review: { edge: 'e-main-flagged', tone: 'out-asked', label: `Asks you · ${who}` },
  };
  return to[r.state] ?? null;
}

export function PipelineActivityProvider({ children }: { children: ReactNode }) {
  const { events, eventsReady: ready, rows } = useLive();
  const seen = useRef<Set<string> | null>(null);
  const states = useRef<Map<string, RowState> | null>(null);
  // When each line is next free for a labelled tag
  const nextFree = useRef(new Map<string, number>());
  const [flows, setFlows] = useState<Record<string, Packet[]>>({});
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const transactions = useMemo(() => pickTransactions(rows, inFlight), [rows, inFlight]);
  const slots = useRef(transactions);
  slots.current = transactions;

  // Queue one packet on a line; returns how long until it arrives
  const send = useCallback((edge: string, kind: keyof typeof LINES, p: Omit<Packet, 'delay' | 'travel'>, labelled: boolean) => {
    const line = LINES[kind];
    const now = performance.now();
    const free = nextFree.current.get(edge) ?? now;
    // Plain dots may share a start; labelled tags wait their turn
    const delay = labelled ? Math.max(0, free - now) : 0;
    if (labelled) nextFree.current.set(edge, now + delay + line.gap);
    const packet: Packet = { ...p, delay, travel: line.travel, label: labelled ? p.label : undefined };
    setFlows(prev => ({ ...prev, [edge]: [...(prev[edge] ?? []), packet] }));
    return delay + line.travel;
  }, []);

  // New events: each rides its source's lane, in the source's color
  useEffect(() => {
    if (!ready) return;
    const ids = new Set(events.map(e => e.id.toString()));

    // Everything present on first load is history, not activity. The table
    // can report ready a moment before its rows arrive, so an empty first
    // look doesn't count.
    if (!seen.current || seen.current.size === 0) {
      seen.current = ids;
      return;
    }

    const fresh = events
      .filter(e => !seen.current!.has(e.id.toString()))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    seen.current = ids; // also forgets rows a Restart deleted
    if (!fresh.length || fresh.length > MAX_BURST || prefersReducedMotion()) return;

    const used = new Map<string, number>();
    for (const event of fresh) {
      const id = event.id.toString();
      const edge = laneId(event.source);
      const n = used.get(edge) ?? 0;
      used.set(edge, n + 1);
      // Past the budget an event lands straight away instead of queueing forever
      if (n >= LINES.lane.budget) continue;
      const arrives = send(
        edge,
        'lane',
        { key: id, tone: `src-${event.source}`, label: `${short(event.counterparty, 16)}  ${money(event.amountMinor)}` },
        true
      );
      setInFlight(prev => new Set(prev).add(id));
      window.setTimeout(() => {
        setInFlight(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, arrives);
    }
    // Timers outlive re-renders on purpose; packets must finish their trip
  }, [events, ready, send]);

  // Changes of state: picked up drops to its card, decided rides out
  useEffect(() => {
    const now = new Map(rows.map(r => [r.event.id.toString(), r.state]));
    const before = states.current;
    states.current = now;
    if (!before || before.size === 0 || prefersReducedMotion()) return;
    const changed = rows.filter(r => {
      const was = before.get(r.event.id.toString());
      return was !== undefined && was !== r.state;
    });
    if (!changed.length || changed.length > MAX_BURST) return;

    const used = new Map<string, number>();
    for (const r of changed) {
      const id = r.event.id.toString();
      if (r.state === 'checking') {
        const slot = slots.current.findIndex(t => t.event.id === r.event.id);
        if (slot >= 0) send(`e-main-txn-${slot}`, 'drop', { key: `${id}:in`, tone: `src-${r.event.source}` }, false);
        continue;
      }
      const out = decision(r);
      if (!out) continue;
      const n = used.get(out.edge) ?? 0;
      used.set(out.edge, n + 1);
      send(out.edge, 'decide', { key: `${id}:out`, tone: out.tone, label: out.label }, n < LINES.decide.budget);
    }
  }, [rows, send]);

  const removePacket = useCallback(
    (edge: string, key: string) => setFlows(prev => ({ ...prev, [edge]: (prev[edge] ?? []).filter(p => p.key !== key) })),
    []
  );
  // Same value until something here changes, so cards don't re-render for nothing
  const value = useMemo(() => ({ flows, transactions, removePacket }), [flows, transactions, removePacket]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
