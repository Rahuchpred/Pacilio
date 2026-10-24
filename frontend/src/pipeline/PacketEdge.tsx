import { useEffect, useRef } from 'react';
import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';
import { TRAVEL_MS, usePipelineActivity } from './activity';

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// One event moving along the wire. Positions come from the path itself, so it
// follows the curve at any zoom.
function Packet({ path, delay, onDone }: { path: string; delay: number; onDone: () => void }) {
  const track = useRef<SVGPathElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    let frame = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const path = track.current;
      const circle = dot.current;
      if (!path || !circle) return;
      const t = Math.min(1, Math.max(0, (now - start) / TRAVEL_MS));
      const point = path.getPointAtLength(path.getTotalLength() * ease(t));
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

export function PacketEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const source = (data as { source: string }).source;
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const { packets, removePacket } = usePipelineActivity();

  return (
    <>
      <BaseEdge id={id} path={path} />
      {(packets[source] ?? []).map(p => (
        <Packet key={p.key} path={path} delay={p.delay} onDone={() => removePacket(source, p.key)} />
      ))}
    </>
  );
}

export const pipelineEdgeTypes = { packet: PacketEdge };
