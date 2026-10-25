import { useReactFlow, useStore, useStoreApi } from '@xyflow/react';
import { NODE_IDS } from './layout';
// Honour the system setting: no camera animation when motion is reduced.
export const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Three levels of detail, picked from the zoom (first built for the zoom canvas). The default fit on a laptop
// lands around 0.5, so the whole story opens at the far level.
export type Level = 'far' | 'mid' | 'near';
export const FAR_BELOW = 0.75;
export const NEAR_FROM = 1.1;
export const levelOf = (z: number): Level => (z < FAR_BELOW ? 'far' : z < NEAR_FROM ? 'mid' : 'near');

export function useLevel() {
  return useStore(s => levelOf(s.transform[2]));
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Text inside a level is scaled against the zoom so it holds a steady size on
// screen. Below the clamp (about the laptop fit) it shrinks with the canvas, so
// it always fits its card.
export const farK = (z: number) => 1 / clamp(z, 0.58, FAR_BELOW);
export const midK = (z: number) => 1 / clamp(z, FAR_BELOW, NEAR_FROM);
export const chipK = (z: number) => 1 / clamp(z, 0.42, 1);

export const ALL: string[] = NODE_IDS;

const duration = () => (reducedMotion() ? 0 : 320);

// Camera moves for the level control and for clicking a card to read it.
export function useCamera() {
  const rf = useReactFlow();
  const store = useStoreApi();

  const zoomTo = (id: string) => {
    const n = rf.getInternalNode(id);
    if (!n) return;
    const w = n.measured.width ?? 0;
    const h = n.measured.height ?? 0;
    const { width, height } = store.getState();
    const fit = Math.min((width - 160) / Math.max(w, 1), (height - 160) / Math.max(h, 1));
    const zoom = Math.max(NEAR_FROM + 0.02, Math.min(1.3, fit));
    const p = n.internals.positionAbsolute;
    rf.setCenter(p.x + w / 2, p.y + h / 2, { zoom, duration: duration() });
  };

  const outline = () => rf.fitView({ padding: 0.08, duration: duration() });

  // Zoom in on whichever card sits nearest the middle of the screen.
  const detail = () => {
    const { transform, width, height } = store.getState();
    const [tx, ty, z] = transform;
    const cx = (width / 2 - tx) / z;
    const cy = (height / 2 - ty) / z;
    let best: string | null = null;
    let bestD = Infinity;
    for (const id of ALL) {
      const n = rf.getInternalNode(id);
      if (!n) continue;
      const p = n.internals.positionAbsolute;
      const dx = p.x + (n.measured.width ?? 0) / 2 - cx;
      const dy = p.y + (n.measured.height ?? 0) / 2 - cy;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = id;
      }
    }
    if (best) zoomTo(best);
  };

  return { zoomTo, outline, detail };
}
