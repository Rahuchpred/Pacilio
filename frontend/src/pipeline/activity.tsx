import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';

// Watches the inbound feed and turns each new event into a packet travelling
// from its source node to the feed. A row appears in the feed (and flashes)
// only once its packet has arrived, so the wiring and the table agree.

export const TRAVEL_MS = 1100;
const STAGGER_MS = 220;
const MAX_STAGGER_STEPS = 8;
const FLASH_MS = 1800;

export interface Packet {
  key: string;
  delay: number;
}

interface Activity {
  packets: Record<string, Packet[]>;
  // Event ids still travelling; the feed hides them until they land
  inFlight: Set<string>;
  // Event ids that just landed; the feed flashes them
  flashing: Set<string>;
  removePacket(source: string, key: string): void;
}

const ActivityContext = createContext<Activity>({
  packets: {},
  inFlight: new Set(),
  flashing: new Set(),
  removePacket: () => {},
});

export const usePipelineActivity = () => useContext(ActivityContext);

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PipelineActivityProvider({ children }: { children: ReactNode }) {
  const [events, ready] = useTable(tables.inboundEvent);
  const seen = useRef<Set<string> | null>(null);
  const [packets, setPackets] = useState<Record<string, Packet[]>>({});
  const [inFlight, setInFlight] = useState<Set<string>>(new Set());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!ready) return;
    const ids = new Set(events.map(e => e.id.toString()));

    // Everything present on first load is history, not activity
    if (!seen.current) {
      seen.current = ids;
      return;
    }

    const fresh = events
      .filter(e => !seen.current!.has(e.id.toString()))
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    seen.current = ids; // also forgets rows a Restart deleted
    if (!fresh.length) return;

    const reduced = prefersReducedMotion();
    const steps: Record<string, number> = {};
    const timers: number[] = [];

    for (const event of fresh) {
      const id = event.id.toString();
      const step = Math.min(steps[event.source] ?? 0, MAX_STAGGER_STEPS);
      steps[event.source] = (steps[event.source] ?? 0) + 1;
      const delay = reduced ? 0 : step * STAGGER_MS;
      const landsIn = reduced ? 0 : delay + TRAVEL_MS;

      if (!reduced) {
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
          setFlashing(prev => new Set(prev).add(id));
          timers.push(
            window.setTimeout(() => {
              setFlashing(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
              });
            }, FLASH_MS)
          );
        }, landsIn)
      );
    }
    // Timers outlive re-renders on purpose; packets must finish their trip
  }, [events, ready]);

  const removePacket = (source: string, key: string) =>
    setPackets(prev => ({ ...prev, [source]: (prev[source] ?? []).filter(p => p.key !== key) }));

  return (
    <ActivityContext.Provider value={{ packets, inFlight, flashing, removePacket }}>
      {children}
    </ActivityContext.Provider>
  );
}
