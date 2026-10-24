import type { ComponentType } from 'react';
import type { EdgeTypes, NodeTypes } from '@xyflow/react';
import type { NodeId } from '../run/timeline';
import type { FlowEdgeData } from '../ui/FlowEdge';

// One way of drawing the same canvas. Every variant keeps the same nodes and
// the same edges (see EDGES in Pipeline.tsx); it changes how nodes look, where
// they sit and how edges are drawn.
export type Variant = {
  id: string;
  // Position in the dock (the first, detailed canvas is always 1).
  order?: number;
  name: string;
  blurb: string;
  // Must provide: inbox, main, subagent, flagged, ledger, followup, summary.
  // The subagent node receives data.subId ('sub-duplicate' | 'sub-coding' | 'sub-amount').
  nodeTypes: NodeTypes;
  layout: Record<NodeId, { x: number; y: number }>;
  edge?: FlowEdgeData;
  // Optional: per-edge label overrides; null hides the label.
  labels?: Partial<Record<string, string | null>>;
  // Optional: replace the shared FlowEdge entirely.
  edgeTypes?: EdgeTypes;
  // Optional: drawn inside the canvas, above the background. Use React Flow's
  // <ViewportPortal> to draw in canvas coordinates (frames, captions, agent
  // cursors) or <Panel> to pin something to the canvas edge.
  overlay?: ComponentType;
  // Class added to the canvas wrapper, for variant-wide CSS.
  className?: string;
};
