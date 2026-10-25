import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';
import { useRun } from '../run/RunContext';

export type FlowEdgeData = {
  path?: 'smoothstep' | 'bezier' | 'straight';
  stepPosition?: number;
  // Hide the moving chips (a variant may draw its own)
  quiet?: boolean;
  // One line for a round trip: arrows at both ends, and it also carries the
  // chips of the return edge (drawn travelling back along this line).
  returnEdge?: string;
};

const measure = typeof document !== 'undefined' ? document.createElementNS('http://www.w3.org/2000/svg', 'path') : null;

function pointAt(d: string, t: number) {
  if (!measure) return { x: 0, y: 0 };
  measure.setAttribute('d', d);
  const len = measure.getTotalLength();
  const p = measure.getPointAtLength(len * t);
  return { x: p.x, y: p.y };
}

// An edge that also carries whatever is crossing it right now: an invoice
// on its way to a check, an email on its way out.
export function FlowEdge(props: EdgeProps) {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    markerEnd,
    style,
    label,
    labelStyle,
    labelShowBg,
    labelBgPadding,
    labelBgBorderRadius,
  } = props;
  const data = (props.data ?? {}) as FlowEdgeData;
  const geo = { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition };
  const [path, labelX, labelY] =
    data.path === 'smoothstep'
      ? getSmoothStepPath({ ...geo, stepPosition: data.stepPosition })
      : data.path === 'straight'
        ? getStraightPath(geo)
        : getBezierPath(geo);

  const { state } = useRun();
  const moving = data.quiet
    ? []
    : state.transfers
        .filter(t => t.edge === id || (data.returnEdge && t.edge === data.returnEdge))
        .map(t => (t.edge === id ? t : { ...t, progress: 1 - t.progress }));
  // The escalation edge is orange only while something waits on a person.
  const calm = id === 'e-main-flagged' && !(state.approval && state.approval.decision === null);
  const calmLine = calm ? { ...style, stroke: 'var(--color-border-control)' } : style;
  const calmText = calm ? { ...labelStyle, fill: 'var(--color-text-secondary)' } : labelStyle;
  const calmBg = calm ? { fill: 'var(--color-bg-surface)', stroke: 'var(--color-border-default)' } : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        markerStart={data.returnEdge ? markerEnd : undefined}
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
      {moving.length > 0 && (
        <EdgeLabelRenderer>
          {moving.map(m => {
            const p = pointAt(path, m.progress);
            return (
              <div
                key={`${m.inv}-${m.label}`}
                className={`travel${id === 'e-main-flagged' ? ' is-decide' : ''}`}
                style={{ transform: `translate(-50%, -50%) translate(${p.x}px, ${p.y}px)` }}
              >
                {m.label}
              </div>
            );
          })}
        </EdgeLabelRenderer>
      )}
    </>
  );
}
