import type { EdgeProps } from '@xyflow/react';
import { FlowEdge, type FlowEdgeData } from '../../ui/FlowEdge';

// Main agent and each check talk both ways. Instead of a solid line down and a
// dashed line back up, draw one line with an arrow at each end; the return
// edge is not drawn, and its chips ride this line back to the main agent.
export function TrimmedEdge(props: EdgeProps) {
  if (/^e-sub-.+-main$/.test(props.id)) return null;
  const m = props.id.match(/^e-main-(sub-.+)$/);
  if (m) {
    const data: FlowEdgeData = { ...(props.data as FlowEdgeData), returnEdge: `e-${m[1]}-main`, stepPosition: 0.5 };
    return <FlowEdge {...props} data={data} />;
  }
  return <FlowEdge {...props} />;
}

export const edgeTypes = { flow: TrimmedEdge };
