import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Motion for live lists (the inbox, the agent's runs). When a row arrives the
// rest glide to their new places, the new row dissolves in, and a row pushed
// off the end dissolves out instead of vanishing. Positions come from
// offsetTop, which ignores the canvas zoom, so the glide is right at any scale.

const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
const MOVE_MS = 280;
const ENTER_MS = 320;
export const LEAVE_MS = 220;

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Items currently shown plus the ones on their way out, in display order.
export type Shown<T> = { item: T; key: string; leaving: boolean };

export function useLiveList<T>(items: T[], keyOf: (item: T) => string) {
  const list = useRef<HTMLUListElement | HTMLOListElement | null>(null);
  const tops = useRef(new Map<string, number>());
  const first = useRef(true);
  const [, rerender] = useState(0);
  // Rows on their way out, with when they left; kept in a ref so render stays pure
  const leaving = useRef(new Map<string, { item: T; index: number; at: number }>());
  const prev = useRef<T[]>(items);

  // Rows that just dropped out stay for one dissolve, at their old place
  const keys = new Set(items.map(keyOf));
  if (prev.current !== items) {
    prev.current.forEach((item, index) => {
      const key = keyOf(item);
      if (!keys.has(key) && !leaving.current.has(key)) leaving.current.set(key, { item, index, at: Date.now() });
    });
    prev.current = items;
  }

  useEffect(() => {
    if (!leaving.current.size) return;
    // Wait only for the oldest leaver, so steady live updates never stall the cleanup
    const oldest = Math.min(...[...leaving.current.values()].map(l => l.at));
    const t = window.setTimeout(() => {
      const now = Date.now();
      for (const [key, l] of leaving.current) if (now - l.at >= LEAVE_MS) leaving.current.delete(key);
      rerender(n => n + 1);
    }, Math.max(0, LEAVE_MS - (Date.now() - oldest)));
    return () => window.clearTimeout(t);
  });

  const shown: Shown<T>[] = items.map(item => ({ item, key: keyOf(item), leaving: false }));
  for (const [key, { item, index }] of leaving.current) {
    if (keys.has(key)) continue;
    shown.splice(Math.min(index, shown.length), 0, { item, key, leaving: true });
  }

  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const quiet = reduced();
    const children = Array.from(el.children) as HTMLElement[];
    // Leavers step out of the flow at their old place, so the rest glide now
    for (const child of children) {
      if (child.dataset.leaving !== 'true' || child.style.position === 'absolute') continue;
      const was = tops.current.get(child.dataset.key ?? '');
      Object.assign(child.style, { position: 'absolute', left: '0', right: '0', top: `${was ?? child.offsetTop}px`, pointerEvents: 'none' });
    }
    const next = new Map<string, number>();
    for (const child of children) {
      const key = child.dataset.key;
      if (!key) continue;
      if (child.dataset.leaving === 'true') continue;
      const top = child.offsetTop;
      next.set(key, top);
      if (first.current) continue;
      const before = tops.current.get(key);
      if (before === undefined) {
        // Arrived: dissolve in from just above
        child.animate(
          quiet
            ? [{ opacity: 0 }, { opacity: 1 }]
            : [
                { opacity: 0, filter: 'blur(4px)', transform: 'translateY(-6px) scale(0.98)' },
                { opacity: 1, filter: 'blur(0)', transform: 'none' },
              ],
          { duration: ENTER_MS, easing: EASE_OUT }
        );
      } else if (before !== top && !quiet) {
        // Moved: glide from where it was
        child.animate([{ transform: `translateY(${before - top}px)` }, { transform: 'none' }], {
          duration: MOVE_MS,
          easing: EASE_OUT,
        });
      }
    }
    tops.current = next;
    first.current = false;
  });

  return { list, shown };
}
