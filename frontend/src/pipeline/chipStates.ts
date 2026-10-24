import { useEffect, useRef, useState } from 'react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import type { InboundEvent } from '../module_bindings/types';

// Where each event chip is in the agent's hands:
//   waiting    → parked around the agent until its current run ends
//   processing → handed to the agent in the current run (yellow)
//   done       → the agent finished it (green), then the chip fades away
export type ChipState = 'waiting' | 'processing' | 'done';

export interface ChipEvent {
  event: InboundEvent;
  state: ChipState;
}

export const FADE_MS = 2600;

export function useChipEvents(landed: InboundEvent[]): ChipEvent[] {
  const [reviews, ready] = useTable(tables.eventReview);
  // When each event was first seen done; 0 = done before this page loaded
  const doneAt = useRef<Map<string, number> | null>(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const seeding = doneAt.current === null;
    const map = (doneAt.current ??= new Map());
    let fresh = false;
    for (const r of reviews) {
      const id = r.eventId.toString();
      if (r.status === 'done' && !map.has(id)) {
        map.set(id, seeding ? 0 : Date.now());
        fresh = !seeding;
      }
    }
    // Forget events that were cleared by a Restart
    const present = new Set(reviews.map(r => r.eventId.toString()));
    for (const id of [...map.keys()]) if (!present.has(id)) map.delete(id);
    if (fresh) {
      const timer = window.setTimeout(() => setTick(t => t + 1), FADE_MS + 50);
      return () => window.clearTimeout(timer);
    }
  }, [reviews, ready]);

  const byId = new Map(reviews.map(r => [r.eventId.toString(), r]));
  const now = Date.now();
  const out: ChipEvent[] = [];
  for (const event of landed) {
    const review = byId.get(event.id.toString());
    if (!review) out.push({ event, state: 'waiting' });
    else if (review.status !== 'done') out.push({ event, state: 'processing' });
    else {
      const seenAt = doneAt.current?.get(event.id.toString()) ?? 0;
      if (seenAt && now - seenAt < FADE_MS) out.push({ event, state: 'done' });
    }
  }
  return out;
}
