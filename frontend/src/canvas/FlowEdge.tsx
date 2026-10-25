import { useEffect, useRef } from 'react';
import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from '@xyflow/react';
import { TRAVEL_MS, usePipelineActivity } from '../pipeline/activity';

export type FlowEdgeData = {
  path?: 'smoothstep' | 'bezier' | 'straight';
  stepPosition?: number;
  // Grey until something waits on this line (the question edge)
  calm?: boolean;
  // New events travel along this line as dots
  packets?: boolean;
};

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// One event moving along the line. Positions come from the path itself, so it
// follows the curve at any zoom.
function Packet({ path, delay, onDone }: { path: string; delay: number; onDone: () => void }) {
  const track = useRef<SVGPathElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let frame = 0;
    let length = -1;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const path = track.current;
      const circle = dot.current;
      if (!path || !circle) return;
      // Measuring a path is slow; once per dot is enough
      if (length < 0) length = path.getTotalLength();
      const t = Math.min(1, Math.max(0, (now - start) / TRAVEL_MS));
      const point = path.getPointAtLength(length * ease(t));
      circle.setAttribute('cx', String(point.x));
      circle.setAttribute('cy', String(point.y));
      circle.style.opacity = now < start ? '0' : '1';
      if (t < 1) frame = requestAnimationFrame(step);
      else done.current();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [delay]);

  return (
    <g>
      <path ref={track} d={path} fill="none" stroke="none" />
      <circle ref={dot} r={5} className="packet" style={{ opacity: 0 }} />
    </g>
  );
}

function Packets({ path }: { path: string }) {
  const { packets, removePacket } = usePipelineActivity();
  return (
    <>
      {Object.entries(packets).flatMap(([source, list]) =>
        list.map(p => (
          <Packet key={`${source}:${p.key}`} path={path} delay={p.delay} onDone={() => removePacket(source, p.key)} />
        ))
      )}
    </>
  );
}

// The canvas's one edge: a line, an optional label, and whatever is crossing it.
export function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label } = props;
  const { labelStyle, labelShowBg, labelBgPadding, labelBgBorderRadius } = props;
  const data = (props.data ?? {}) as FlowEdgeData;
  const geo = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] =
    data.path === 'smoothstep'
      ? getSmoothStepPath({ ...geo, stepPosition: data.stepPosition })
      : data.path === 'straight'
        ? getStraightPath(geo)
        : getBezierPath(geo);

  const calmLine = data.calm ? { ...style, stroke: 'var(--color-border-control)' } : style;
  const calmText = data.calm ? { ...labelStyle, fill: 'var(--color-text-secondary)' } : labelStyle;
  const calmBg = data.calm ? { fill: 'var(--color-bg-surface)', stroke: 'var(--color-border-default)' } : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={calmLine}
        label={label}
        labelX={labelX}
        labelY={labelY}
        labelStyle={calmText}
        labelBgStyle={calmBg}
        labelShowBg={labelShowBg}
        labelBgPadding={labelBgPadding}
        labelBgBorderRadius={labelBgBorderRadius}
      />
      {data.packets && <Packets path={path} />}
    </>
  );
}

export const edgeTypes = { flow: FlowEdge };
