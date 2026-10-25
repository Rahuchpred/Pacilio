import { useEffect } from 'react';
import { useReactFlow, useStoreApi } from '@xyflow/react';

// Lists inside open cards are marked nowheel so a plain scroll scrolls them,
// but React Flow then ignores every wheel event there, pinch included, so you
// could not zoom with the pointer over a card. A pinch (ctrlKey on a
// trackpad) or Cmd/Ctrl + wheel over such a list zooms the canvas here,
// around the pointer, like anywhere else on the canvas.

const MIN = 0.15;
const MAX = 2;

export function PinchZoomThroughLists() {
  const store = useStoreApi();
  const { getViewport, setViewport } = useReactFlow();

  useEffect(() => {
    const dom = store.getState().domNode;
    if (!dom) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if (!(e.target as Element | null)?.closest?.('.nowheel')) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y, zoom } = getViewport();
      const rect = dom.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      // The same step React Flow (d3-zoom) uses everywhere else on the canvas
      const unit = e.deltaMode === 1 ? 0.05 : e.deltaMode ? 1 : 0.002;
      const step = -e.deltaY * unit * (e.ctrlKey ? 10 : 1);
      const next = Math.min(MAX, Math.max(MIN, zoom * Math.pow(2, step)));
      const k = next / zoom;
      setViewport({ x: px - (px - x) * k, y: py - (py - y) * k, zoom: next });
    };
    // Capture, so it runs before the list (or React Flow) sees the event
    dom.addEventListener('wheel', onWheel, { passive: false, capture: true });
    return () => dom.removeEventListener('wheel', onWheel, { capture: true });
  }, [store, getViewport, setViewport]);

  return null;
}
