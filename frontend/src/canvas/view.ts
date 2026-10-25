import { useReactFlow, useStoreApi } from '@xyflow/react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import { useLive } from '../pipeline/store';
import { logError } from '../throttle';

// Each card is either an overview (one word, one number) or open in full.
// Opening is shared: a card someone opens opens for everyone, and the cards
// around it move aside. Rows in pipeline_card use the shared "pipeline:" ids.

export const sharedId = (id: string) => `pipeline:${id}`;
export const localId = (shared: string) => shared.replace(/^pipeline:/, '');

export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function useExpanded(): Set<string> {
  const rows = useLive().cards;
  return new Set(rows.filter(r => r.expanded).map(r => localId(r.nodeId)));
}

export function useSetExpanded() {
  const set = useReducer(reducers.setPipelineCardExpanded);
  return (id: string, expanded: boolean) => set({ nodeId: sharedId(id), expanded }).catch(logError);
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
  // zoom where the whole card fits.
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

  // Once a card has grown to full size (and its neighbours moved), centre it.
  const focusWhenGrown = (id: string) => {
    const size = () => {
      const m = rf.getInternalNode(id)?.measured;
      return `${m?.width ?? 0}x${m?.height ?? 0}`;
    };
    const before = size();
    let frames = 0;
    const wait = () => {
      if (size() !== before || frames++ > 60) window.setTimeout(() => focus(id), 60);
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

  return { focus, focusWhenGrown, fitAll };
}
