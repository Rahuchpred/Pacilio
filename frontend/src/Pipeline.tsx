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
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import { Cursors } from './Cursors';
import { logError, throttle } from './throttle';
import { edgeTypes } from './canvas/FlowEdge';
import { LAYOUT, txnId } from './canvas/layout';
import { DetailFilter, leveled } from './canvas/levels';
import { useView } from './canvas/view';
import { Dock } from './ui/Dock';
import { mainAgent } from './pipeline/Agent';
import { emails } from './pipeline/Emails';
import { inbox } from './pipeline/Inbox';
import { ItemPanel } from './pipeline/ItemPanel';
import { ledger } from './pipeline/Ledger';
import { needsYou } from './pipeline/NeedsYou';
import { report, reportAgent } from './pipeline/Reports';
import { transaction } from './pipeline/Transactions';
import { TXN_SLOTS, useOpenItems, useTransactions } from './pipeline/live';
import '../../design-system/src/tokens/tokens.css';
import '../../design-system/src/buttons.css';
import './ui/ds.css';
import './ui/canvas.css';
import './pipeline/pipeline.css';
import './canvas/levels.css';
import './pipeline/cards.css';

const SYNC_INTERVAL_MS = 40;
// Fit the canvas between the presence bar (top right) and the dock (bottom).
const FIT: FitViewOptions = { padding: { top: '72px', bottom: '88px', left: '32px', right: '32px' } };

const nodeTypes = {
  inbox: leveled(inbox),
  main: leveled(mainAgent),
  txn: leveled(transaction),
  flagged: leveled(needsYou),
  ledger: leveled(ledger),
  emails: leveled(emails),
  reportAgent: leveled(reportAgent),
  report: leveled(report),
};

// With every card in full, the same layout spread out so none overlap.
const SPREAD = { x: 1.75, y: 1.5 };
const TXN_FULL_Y = 1250;

function initialNodes(spread = false): Node[] {
  const k = spread ? SPREAD : { x: 1, y: 1 };
  return Object.entries(LAYOUT).map(([id, n]) => ({
    id,
    type: n.type,
    // Full cards are tall: the transactions drop well below them
    position: { x: n.x * k.x, y: spread && n.type === 'txn' ? TXN_FULL_Y : n.y * k.y },
    data: {},
  }));
}

// React Flow writes the arrow color inline, so it is set here, not in CSS.
const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--color-border-strong)' };
const decideArrow = { ...arrow, color: 'var(--color-action-decide)' };
const moneyArrow = { ...arrow, color: 'var(--color-action-accept)' };

// Lines by meaning: the question is orange while something waits on you,
// money into the ledger is green, the rest is ink. Live state lights them.
function useEdges(): Edge[] {
  const open = useOpenItems().length;
  const txns = useTransactions();
  const [reportStates] = useTable(tables.reportState);
  const building = reportStates[0]?.status === 'running' || !!reportStates[0]?.requested;
  const checking = txns.map(r => r.state === 'checking');

  return useMemo(() => {
    const e = (edge: Edge): Edge => ({ type: 'flow', markerEnd: arrow, ...edge });
    return [
      e({ id: 'e-inbox-main', source: 'inbox', target: 'main', targetHandle: 'in', data: { packets: true } }),
      ...Array.from({ length: TXN_SLOTS }, (_, i) =>
        e({
          id: `e-main-${txnId(i)}`,
          source: 'main',
          sourceHandle: 'txn',
          target: txnId(i),
          targetHandle: 'in',
          markerEnd: undefined,
          animated: checking[i],
          className: checking[i] ? 'edge-working' : 'edge-quiet',
          data: { path: 'smoothstep' },
        })
      ),
      e({
        id: 'e-main-flagged',
        source: 'main',
        sourceHandle: 'flag',
        target: 'flagged',
        targetHandle: 'in',
        label: 'Unsure',
        className: 'edge-decide',
        markerEnd: open ? decideArrow : arrow,
        data: { calm: !open },
      }),
      e({
        id: 'e-flagged-ledger',
        source: 'flagged',
        sourceHandle: 'out',
        target: 'ledger',
        targetHandle: 'answer',
        label: 'After your OK',
        className: 'edge-report edge-money',
        markerEnd: moneyArrow,
        data: { path: 'smoothstep' },
      }),
      e({
        id: 'e-flagged-emails',
        source: 'flagged',
        sourceHandle: 'out',
        target: 'emails',
        targetHandle: 'in',
        label: 'Emails them',
        data: { path: 'smoothstep' },
      }),
      e({ id: 'e-main-ledger', source: 'main', sourceHandle: 'out', target: 'ledger', targetHandle: 'in', label: 'Posts', className: 'edge-money', markerEnd: moneyArrow }),
      e({ id: 'e-ledger-ragent', source: 'ledger', sourceHandle: 'out', target: 'reportAgent', targetHandle: 'in', animated: building }),
      e({ id: 'e-ragent-report', source: 'reportAgent', sourceHandle: 'out', target: 'report', targetHandle: 'in', animated: building }),
    ];
    // checking is rebuilt each render; compare its contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, building, checking.join()]);
}

export function Pipeline() {
  const moveCursor = useReducer(reducers.moveCursor);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { open, lock } = useView();

  // Layout is local and fixed: dragging a card does not move it for others.
  const [nodes, setNodes] = useState<Node[]>(() => initialNodes());
  const spread = lock === 'near';
  useEffect(() => setNodes(initialNodes(spread)), [spread]);
  const edges = useEdges();
  // The opened card sits above its neighbours
  const shown = useMemo(() => nodes.map(n => (n.id === open ? { ...n, zIndex: 10 } : n.zIndex ? { ...n, zIndex: 0 } : n)), [nodes, open]);

  useEffect(() => {
    // Wait for the nodes to be measured before fitting them in view.
    const t = setTimeout(() => fitView(FIT), 80);
    return () => clearTimeout(t);
  }, [fitView]);

  const onNodesChange = useCallback((changes: NodeChange[]) => setNodes(prev => applyNodeChanges(changes, prev)), []);

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
        nodes={shown}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        nodesConnectable={false}
        edgesFocusable={false}
        colorMode="light"
        minZoom={0.15}
        fitView
        fitViewOptions={FIT}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
        <DetailFilter />
        <Cursors />
      </ReactFlow>
      <Dock />
      <ItemPanel />
    </div>
  );
}
