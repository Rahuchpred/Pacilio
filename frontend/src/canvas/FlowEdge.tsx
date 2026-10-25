import { useEffect, useLayoutEffect, useRef } from 'react';
import { BaseEdge, getBezierPath, getSmoothStepPath, getStraightPath, type EdgeProps } from '@xyflow/react';
import { usePipelineActivity, type Packet } from '../pipeline/activity';

export type FlowEdgeData = {
  path?: 'smoothstep' | 'bezier' | 'straight';
  stepPosition?: number;
  // Grey until something waits on this line (the question edge)
  calm?: boolean;
  // New events travel along this line as dots
  packets?: boolean;
  // Put the label on the line's last vertical stretch instead of its corner
  labelOnDrop?: boolean;
  // Turn this many px below the source, so sibling lines share one bend
  turnAfter?: number;
};


const TAG_H = 22;

// One packet moving along the line: a dot centred exactly on it, in its
// source's or outcome's color, with its tag above when it has one. It moves
// at a constant speed (linear, as constant motion should), so the spacing a
// line's queue sets in time stays the spacing on the line. Positions come
// from the path itself, so it follows the curve at any zoom.
function PacketDot({ path, packet, onDone }: { path: string; packet: Packet; onDone: () => void }) {
  const track = useRef<SVGPathElement>(null);
  const dot = useRef<SVGGElement>(null);
  const text = useRef<SVGTextElement>(null);
  const box = useRef<SVGRectElement>(null);
  const dotInPill = useRef<SVGCircleElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  // Size the tag to its text
  useLayoutEffect(() => {
    if (!packet.label) return;
    // The dot leads at the front; the pill trails behind it, so it slides
    // out of the card it leaves instead of starting half inside it
    const w = (text.current?.getComputedTextLength() ?? 80) + 32;
    box.current?.setAttribute('width', String(w));
    box.current?.setAttribute('x', String(-w + 11));
    text.current?.setAttribute('x', String(-w + 21));
    dotInPill.current?.setAttribute('cx', '0');
  }, [packet.label]);

  useEffect(() => {
    let frame = 0;
    let length = -1;
    const start = performance.now() + packet.delay;
    const step = (now: number) => {
      const p = track.current;
      const g = dot.current;
      if (!p || !g) return;
      // Measuring a path is slow; once per dot is enough
      if (length < 0) length = p.getTotalLength();
      const t = Math.min(1, Math.max(0, (now - start) / packet.travel));
      const point = p.getPointAtLength(length * t);
      g.setAttribute('transform', `translate(${point.x} ${point.y})`);
      // Fade in over the first stretch and out over the last
      g.style.opacity = now < start ? '0' : String(Math.min(1, t / 0.08, (1 - t) / 0.12));
      if (t < 1) frame = requestAnimationFrame(step);
      else done.current();
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [packet.delay, packet.travel]);

  return (
    <g>
      <path ref={track} d={path} fill="none" stroke="none" />
      <g ref={dot} className={`packet-tag ${packet.tone}`} style={{ opacity: 0 }}>
        {packet.label ? (
          // A Settle tag (4px corners) riding on the line itself, its colored
          // dot leading at the front, so parallel lanes never cover each other
          <>
            <rect ref={box} y={-TAG_H / 2} height={TAG_H} rx={4} />
            <circle className="packet" cx={0} cy={0} r={4} ref={dotInPill} />
            <text ref={text} x={0} y={0} dominantBaseline="central">
              {packet.label}
            </text>
          </>
        ) : (
          <circle className="packet" cx={0} cy={0} r={5} />
        )}
      </g>
    </g>
  );
}

function Packets({ id, path }: { id: string; path: string }) {
  const { flows, removePacket } = usePipelineActivity();
  return (
    <>
      {(flows[id] ?? []).map(p => (
        <PacketDot key={p.key} path={path} packet={p} onDone={() => removePacket(id, p.key)} />
      ))}
    </>
  );
}

// The middle of the longest vertical stretch of a drawn path, so a label
// sits on the line wherever the route bends.
function longestDrop(path: string): [number, number] | null {
  const nums = path.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let best: [number, number] | null = null;
  let bestLen = 0;
  for (let i = 0; i + 3 < nums.length; i += 2) {
    const [x1, y1, x2, y2] = [nums[i], nums[i + 1], nums[i + 2], nums[i + 3]];
    const len = Math.abs(y2 - y1);
    if (Math.abs(x2 - x1) < 1 && len > bestLen) {
      bestLen = len;
      best = [x1, (y1 + y2) / 2];
    }
  }
  return best;
}

// The canvas's one edge: a line, an optional label, and whatever is crossing it.
export function FlowEdge(props: EdgeProps) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, label } = props;
  const { labelStyle, labelShowBg, labelBgPadding, labelBgBorderRadius } = props;
  const data = (props.data ?? {}) as FlowEdgeData;
  const geo = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, midX, midY] =
    data.path === 'smoothstep'
      ? getSmoothStepPath({
          ...geo,
          stepPosition: data.turnAfter !== undefined ? Math.min(1, data.turnAfter / Math.max(1, targetY - sourceY)) : data.stepPosition,
        })
      : data.path === 'straight'
        ? getStraightPath(geo)
        : getBezierPath(geo);
  const [labelX, labelY] = data.labelOnDrop ? longestDrop(path) ?? [midX, midY] : [midX, midY];

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
      <Packets id={id} path={path} />
    </>
  );
}

export const edgeTypes = { flow: FlowEdge };
