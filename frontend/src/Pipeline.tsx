import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type Node,
  type NodeChange,
} from '@xyflow/react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import { Cursors } from './Cursors';
import { logError, throttle } from './throttle';
import { nodeTypes } from './pipeline/nodes';
import { subagents } from './pipeline/data';
import '../../design-system/src/tokens/tokens.css';
import './pipeline/pipeline.css';

const SYNC_INTERVAL_MS = 40;

// Left to right: email in, agents in the middle, ledger and follow-ups out, summary at the end.
const initialNodes: Node[] = [
  { id: 'inbox', type: 'inbox', position: { x: 0, y: 40 }, data: {} },
  { id: 'main', type: 'main', position: { x: 420, y: 0 }, data: {} },
  { id: 'flagged', type: 'flagged', position: { x: 430, y: -360 }, data: {} },
  ...subagents.map((s, i) => ({
    id: s.id,
    type: 'subagent',
    position: { x: 186 + i * 304, y: 520 },
    data: { subId: s.id },
  })),
  { id: 'ledger', type: 'ledger', position: { x: 960, y: 0 }, data: {} },
  { id: 'followups', type: 'followup', position: { x: 1520, y: 0 }, data: {} },
  { id: 'summary', type: 'summary', position: { x: 2000, y: -40 }, data: {} },
];

const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16 };

const initialEdges: Edge[] = [
  { id: 'e-inbox-main', source: 'inbox', target: 'main', targetHandle: 'in', label: '4 invoices' },
  ...subagents.flatMap((s, i) => [
    {
      id: `e-main-${s.id}`,
      source: 'main',
      sourceHandle: 'delegate',
      target: s.id,
      targetHandle: 'delegate',
      type: 'smoothstep',
      // Delegate and report lines turn at different heights so they read as two paths.
      pathOptions: { stepPosition: 0.3 },
      label: i === 0 ? 'Delegates' : undefined,
    },
    {
      id: `e-${s.id}-main`,
      source: s.id,
      sourceHandle: 'report',
      target: 'main',
      targetHandle: 'report',
      type: 'smoothstep',
      pathOptions: { stepPosition: 0.7 },
      className: 'edge-report',
      label: i === subagents.length - 1 ? 'Reports back' : undefined,
    },
  ]),
  {
    id: 'e-main-flagged',
    source: 'main',
    sourceHandle: 'flag',
    target: 'flagged',
    targetHandle: 'in',
    label: 'Unsure',
    className: 'edge-decide',
  },
  {
    id: 'e-flagged-ledger',
    source: 'flagged',
    sourceHandle: 'out',
    target: 'ledger',
    targetHandle: 'answer',
    type: 'smoothstep',
    label: 'After your OK',
    className: 'edge-report',
  },
  { id: 'e-main-ledger', source: 'main', sourceHandle: 'out', target: 'ledger', targetHandle: 'in', label: 'Posts 2' },
  { id: 'e-ledger-follow', source: 'ledger', sourceHandle: 'out', target: 'followups', targetHandle: 'in', label: 'Opens 3' },
  { id: 'e-follow-summary', source: 'followups', sourceHandle: 'out', target: 'summary', targetHandle: 'in' },
].map(e => ({ markerEnd: arrow, ...e }));

export function Pipeline() {
  const moveCursor = useReducer(reducers.moveCursor);
  const { screenToFlowPosition } = useReactFlow();

  // Layout is local for now: dragging a card does not sync to other people.
  const [nodes, setNodes] = useState<Node[]>(initialNodes);

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
    <div className="board pipeline" onPointerMove={onPointerMove}>
      <ReactFlow
        nodes={nodes}
        edges={initialEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        edgesFocusable={false}
        colorMode="system"
        minZoom={0.2}
        fitView
        fitViewOptions={{ padding: 0.08 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
        <Cursors />
      </ReactFlow>

      <div className="toolbar">
        <h1 className="pipeline-title">Invoice run</h1>
        <span className="hint">Oct 23 · 4 invoices · 1 waiting on you</span>
      </div>
    </div>
  );
}
