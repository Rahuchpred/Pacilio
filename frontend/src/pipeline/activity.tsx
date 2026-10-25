import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Row } from './live';
import { useLive } from './store';

// Watches the inbound events and turns each new one into a packet travelling
// along the inbox line to the main agent. An event's transaction card shows
// only once its packet has arrived, so the two agree.

export const TRAVEL_MS = 1100;
const STAGGER_MS = 220;
const MAX_STAGGER_STEPS = 8;
const MAX_PACKETS = 12;
const MAX_BURST = 40;

export interface Packet {
  key: string;
  delay: number;
}

interface Activity {
  packets: Record<string, Packet[]>;
  // The transactions around the main agent (see TXN_SLOTS)
  transactions: Row[];
  removePacket(source: string, key: string): void;
}

const ActivityContext = createContext<Activity>({
  packets: {},
  transactions: [],
  removePacket: () => {},
});

// What the main agent is checking now, then what waits for its next run,
// then what it just finished. Events still travelling don't show yet.
export const TXN_SLOTS = 6;

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

export function PipelineActivityProvider({ children }: { children: ReactNode }) {
  const { events, eventsReady: ready, rows } = useLive();
  const seen = useRef<Set<string> | null>(null);
  const [packets, setPackets] = useState<Record<string, Packet[]>>({});
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());

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
    // A huge burst (a reconnect, a replay) isn't activity to animate
    if (!fresh.length || fresh.length > MAX_BURST) return;

    const reduced = prefersReducedMotion();
    const steps: Record<string, number> = {};
    let animated = 0;
    const timers: number[] = [];

    for (const event of fresh) {
      const id = event.id.toString();
      const step = Math.min(steps[event.source] ?? 0, MAX_STAGGER_STEPS);
      steps[event.source] = (steps[event.source] ?? 0) + 1;
      const delay = reduced ? 0 : step * STAGGER_MS;
      const animate = !reduced && animated < MAX_PACKETS;
      const landsIn = animate ? delay + TRAVEL_MS : 0;

      // A few dots at a time; the rest of a batch lands straight away
      if (animate) {
        animated++;
        setPackets(prev => ({
          ...prev,
          [event.source]: [...(prev[event.source] ?? []), { key: id, delay }],
        }));
        setInFlight(prev => new Set(prev).add(id));
      }

      timers.push(
        window.setTimeout(() => {
          setInFlight(prev => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        }, landsIn)
      );
    }
    // Timers outlive re-renders on purpose; packets must finish their trip
  }, [events, ready]);

  const removePacket = useCallback(
    (source: string, key: string) =>
      setPackets(prev => ({ ...prev, [source]: (prev[source] ?? []).filter(p => p.key !== key) })),
    []
  );
  const transactions = useMemo(() => pickTransactions(rows, inFlight), [rows, inFlight]);
  // Same value until something here changes, so cards don't re-render for nothing
  const value = useMemo(() => ({ packets, transactions, removePacket }), [packets, transactions, removePacket]);

  return (
    <ActivityContext.Provider value={value}>
      {children}
    </ActivityContext.Provider>
  );
}
