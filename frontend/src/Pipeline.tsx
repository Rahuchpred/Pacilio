import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type FitViewOptions,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import { Cursors } from './Cursors';
import { logError, throttle } from './throttle';
import { RunProvider } from './run/RunContext';
import type { NodeId } from './run/timeline';
import { FlowEdge } from './ui/FlowEdge';
import { Dock } from './ui/Dock';
import { variants } from './variants';
import type { Variant } from './variants/types';
import '../../design-system/src/tokens/tokens.css';
import '../../design-system/src/buttons.css';
import './ui/ds.css';
import './ui/canvas.css';

const SYNC_INTERVAL_MS = 40;
// Fit the canvas between the presence bar (top right) and the dock (bottom).
const FIT: FitViewOptions = { padding: { top: '72px', bottom: '88px', left: '32px', right: '32px' } };
const CHECKS = ['sub-duplicate', 'sub-coding', 'sub-amount'] as const;

const NODE_TYPE: Record<NodeId, string> = {
  inbox: 'inbox',
  main: 'main',
  flagged: 'flagged',
  'sub-duplicate': 'subagent',
  'sub-coding': 'subagent',
  'sub-amount': 'subagent',
  ledger: 'ledger',
  followups: 'followup',
  summary: 'summary',
};

function nodesFor(v: Variant): Node[] {
  return (Object.keys(NODE_TYPE) as NodeId[]).map(id => ({
    id,
    type: NODE_TYPE[id],
    position: v.layout[id],
    data: id.startsWith('sub-') ? { subId: id } : {},
  }));
}

// React Flow writes the arrow color inline, so it is set here, not in CSS.
const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--color-border-strong)' };

// The same edges in every variant: email in, delegate and report back,
// escalate, post, follow up, summarize.
const EDGES: Edge[] = [
  { id: 'e-inbox-main', source: 'inbox', target: 'main', targetHandle: 'in', label: '4 invoices' },
  ...CHECKS.flatMap((id, i) => [
    {
      id: `e-main-${id}`,
      source: 'main',
      sourceHandle: 'delegate',
      target: id,
      targetHandle: 'delegate',
      // Delegate and report lines turn at different heights so they read as two paths.
      data: { path: 'smoothstep', stepPosition: 0.3 },
      label: i === 0 ? 'Delegates' : undefined,
    },
    {
      id: `e-${id}-main`,
      source: id,
      sourceHandle: 'report',
      target: 'main',
      targetHandle: 'report',
      data: { path: 'smoothstep', stepPosition: 0.7 },
      className: 'edge-report',
      label: i === CHECKS.length - 1 ? 'Reports back' : undefined,
    },
  ]),
  { id: 'e-main-flagged', source: 'main', sourceHandle: 'flag', target: 'flagged', targetHandle: 'in', label: 'Unsure', className: 'edge-decide' },
  { id: 'e-flagged-ledger', source: 'flagged', sourceHandle: 'out', target: 'ledger', targetHandle: 'answer', label: 'After your OK', className: 'edge-report edge-money', data: { path: 'smoothstep' } },
  { id: 'e-main-ledger', source: 'main', sourceHandle: 'out', target: 'ledger', targetHandle: 'in', label: 'Posts', className: 'edge-money' },
  { id: 'e-ledger-follow', source: 'ledger', sourceHandle: 'out', target: 'followups', targetHandle: 'in', label: 'Follows up' },
  { id: 'e-follow-summary', source: 'followups', sourceHandle: 'out', target: 'summary', targetHandle: 'in' },
];

function edgesFor(v: Variant): Edge[] {
  return EDGES.map(e => {
    const label = v.labels && e.id in v.labels ? v.labels[e.id] ?? undefined : e.label;
    return {
      ...e,
      type: 'flow',
      // Color by meaning: the question is orange, money into the ledger is green, the rest is ink.
      // Each arrow takes its line's color.
      markerEnd: e.className?.includes('edge-decide')
        ? { ...arrow, color: 'var(--color-action-decide)' }
        : e.className?.includes('edge-money')
          ? { ...arrow, color: 'var(--color-action-accept)' }
          : arrow,
      label,
      data: { ...(e.data ?? {}), ...(v.edge ?? {}) },
    };
  });
}

const edgeTypes = { flow: FlowEdge };

export function Pipeline() {
  return (
    <RunProvider>
      <Canvas />
    </RunProvider>
  );
}

function Canvas() {
  const moveCursor = useReducer(reducers.moveCursor);
  const { screenToFlowPosition, fitView } = useReactFlow();

  // One canvas now: "Detailed cards, less text". The Variant shape stays so
  // the canvas can be swapped again later without touching this file.
  const variant = variants[0];
  const Overlay = variant.overlay;

  // Layout is local: dragging a card does not sync to other people.
  const [nodes, setNodes] = useState<Node[]>(() => nodesFor(variant));
  const edges = useMemo(() => edgesFor(variant), [variant]);

  useEffect(() => {
    // Old links (#v=...) pointed at versions that no longer exist.
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
    // Wait for the nodes to be measured before fitting them in view.
    const t = setTimeout(() => fitView(FIT), 80);
    return () => clearTimeout(t);
  }, [fitView]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes(prev => applyNodeChanges(changes, prev)),
    []
  );

  const sendCursor = useMemo(
    () =>
      throttle((x: number, y: number) => {
        moveCursor({ x, y }).catch(logError);
      }, SYNC_INTERVAL_MS),
    [moveCursor]
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    sendCursor(x, y);
  };

  return (
    <div className={`board pipeline ${variant.className ?? ''}`} onPointerMove={onPointerMove}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={variant.nodeTypes}
        edgeTypes={variant.edgeTypes ?? edgeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        edgesFocusable={false}
        colorMode="light"
        minZoom={0.2}
        fitView
        fitViewOptions={FIT}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
        {Overlay && <Overlay />}
        <Cursors />
      </ReactFlow>
      <Dock />
    </div>
  );
}
