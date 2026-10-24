import { useSyncExternalStore } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';
import { reducedMotion, useLevel, type Level } from './level';

// What the canvas shows. "auto" follows the zoom like version 5; the other
// values lock every card to one level at any zoom, for people who want all the
// detail from far away. `open` is one card shown in full after a click.
export type Lock = 'auto' | Level;
type View = { lock: Lock; open: string | null };

let view: View = { lock: 'auto', open: null };
const listeners = new Set<() => void>();
const set = (next: Partial<View>) => {
  view = { ...view, ...next };
  listeners.forEach(l => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const setLock = (lock: Lock) => set({ lock, open: null });
export const setOpen = (open: string | null) => set({ open });
export const useView = () => useSyncExternalStore(subscribe, () => view);
export const getView = () => view;

// The level one card should draw at right now.
export function useShown(id: string): Level {
  const zoomed = useLevel();
  const { lock, open } = useView();
  if (open === id) return 'near';
  return lock === 'auto' ? zoomed : lock;
}

// Room the camera leaves for the presence bar (top) and the dock (bottom).
const TOP = 72;
const BOTTOM = 104;
const SIDE = 40;
// Camera moves answer the click at once (strong ease-out, quartic) and take a
// straight path, so the card you clicked never drifts off screen mid-move.
const duration = () => (reducedMotion() ? 0 : 420);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 4);
const camera = () => ({ duration: duration(), ease: easeOut, interpolate: 'linear' as const });

export function useFocus() {
  const rf = useReactFlow();
  const store = useStoreApi();

  // Centre one card in the free space between the top bar and the dock, at a
  // zoom where the whole card fits. Called after the card has grown to full
  // size, so it measures what will actually be on screen.
  const focus = (id: string) => {
    const n = rf.getInternalNode(id);
    if (!n) return;
    const w = n.measured.width ?? 0;
    const h = n.measured.height ?? 0;
    const { width, height } = store.getState();
    const zoom = Math.min(1.3, (width - SIDE * 2) / Math.max(w, 1), (height - TOP - BOTTOM) / Math.max(h, 1));
    const p = n.internals.positionAbsolute;
    // setCenter puts a point at the middle of the screen; shift it so the card
    // sits in the middle of the free band instead.
    const band = (TOP + height - BOTTOM) / 2;
    const dy = (height / 2 - band) / zoom;
    rf.setCenter(p.x + w / 2, p.y + h / 2 + dy, { zoom, ...camera() });
  };

  // Open a card in full, wait until React Flow has measured its new size
  // (it changes from the small card to the full one), then centre it.
  const size = (id: string) => {
    const m = rf.getInternalNode(id)?.measured;
    return `${m?.width ?? 0}x${m?.height ?? 0}`;
  };
  const openCard = (id: string) => {
    const before = size(id);
    setOpen(id);
    let frames = 0;
    const wait = () => {
      if (size(id) !== before || frames++ > 30) focus(id);
      else requestAnimationFrame(wait);
    };
    requestAnimationFrame(wait);
  };

  const fitAll = () =>
    window.setTimeout(
      () =>
        rf.fitView({
          padding: { top: `${TOP}px`, bottom: `${BOTTOM}px`, left: `${SIDE}px`, right: `${SIDE}px` },
          ...camera(),
        }),
      60
    );

  return { focus, openCard, fitAll };
}
