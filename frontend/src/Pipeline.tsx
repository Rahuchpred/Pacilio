import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  useReactFlow,
  type Edge,
  type FitViewOptions,
  type Node,
  type NodeChange,
  type NodeMouseHandler,
} from '@xyflow/react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from './module_bindings';
import { Cursors } from './Cursors';
import { logError, throttle } from './throttle';
import { arrange, type Point, type Size } from './canvas/arrange';
import { edgeTypes } from './canvas/FlowEdge';
import { PinchZoomThroughLists } from './canvas/PinchZoom';
import { LAYOUT, OVERVIEW, txnId } from './canvas/layout';
import { CanvasCorner, leveled } from './canvas/levels';
import { localId, sharedId, useExpanded, useFocus, useSetExpanded } from './canvas/view';
import { Dock } from './ui/Dock';
import { mainAgent } from './pipeline/Agent';
import { emails } from './pipeline/Emails';
import { inbox } from './pipeline/Inbox';
import { audit } from './pipeline/Audit';
import { quickbooks } from './pipeline/Books';
import { ItemPanel } from './pipeline/ItemPanel';
import { ledger } from './pipeline/Ledger';
import { needsYou } from './pipeline/NeedsYou';
import { report, reportAgent } from './pipeline/Reports';
import { transaction } from './pipeline/Transactions';
import { TXN_SLOTS, useOpenItems, useTransactions } from './pipeline/live';
import { LANE_SOURCES, laneId } from './pipeline/activity';
import '../../design-system/src/tokens/tokens.css';
import '../../design-system/src/buttons.css';
import './ui/ds.css';
import './ui/canvas.css';
import './pipeline/pipeline.css';
import './canvas/levels.css';
import './pipeline/cards.css';
import { useLive } from './pipeline/store';

const SYNC_INTERVAL_MS = 40;
const MOVE_SYNC_MS = 50;
// Fit the canvas between the presence bar (top right) and the dock (bottom).
const FIT: FitViewOptions = { padding: { top: '72px', bottom: '88px', left: '32px', right: '32px' } };
// Clicks on these do their own thing inside an open card
const INTERACTIVE = 'button, a, input, textarea, select, summary, label, iframe, [role="tab"], .nodrag';

const nodeTypes = {
  inbox: leveled(inbox),
  main: leveled(mainAgent),
  txn: leveled(transaction),
  flagged: leveled(needsYou),
  ledger: leveled(ledger),
  emails: leveled(emails),
  reportAgent: leveled(reportAgent),
  report: leveled(report),
  audit: leveled(audit),
  books: leveled(quickbooks),
};

const typeOf = (id: string) => LAYOUT[id].type;

// React Flow writes the arrow color inline, so it is set here, not in CSS.
const arrow = { type: MarkerType.ArrowClosed, width: 16, height: 16, color: 'var(--color-border-strong)' };
const decideArrow = { ...arrow, color: 'var(--color-action-decide)' };
const moneyArrow = { ...arrow, color: 'var(--color-action-accept)' };

// Lines by meaning: the question is orange while something waits on you,
// money into the ledger is green, the rest is ink. Live state lights them.
function useEdges(): Edge[] {
  const open = useOpenItems().length;
  const txns = useTransactions();
  const { reportStates } = useLive();
  const building = reportStates[0]?.status === 'running' || !!reportStates[0]?.requested;
  const checking = txns.map(r => r.state === 'checking');

  return useMemo(() => {
    const e = (edge: Edge): Edge => ({ type: 'flow', markerEnd: arrow, ...edge });
    return [
      // Four lanes, one per source, each in its source's color
      ...LANE_SOURCES.map(source =>
        e({
          id: laneId(source),
          source: 'inbox',
          sourceHandle: `out-${source}`,
          target: 'main',
          targetHandle: `in-${source}`,
          className: `edge-lane src-${source}`,
          markerEnd: undefined,
        })
      ),
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
          // Every line turns at the same height under the agent, then drops
          // straight down its column, so lower rows never cross the cards above
          data: { path: 'smoothstep', turnAfter: 48 },
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
        data: { calm: !open, path: 'smoothstep', labelOnDrop: true },
      }),
      e({
        id: 'e-flagged-ledger',
        source: 'flagged',
        sourceHandle: 'ok',
        target: 'ledger',
        targetHandle: 'answer',
        label: 'After your OK',
        className: 'edge-report edge-money',
        markerEnd: moneyArrow,
        data: { path: 'smoothstep', labelOnDrop: true },
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
      e({ id: 'e-main-books', source: 'main', sourceHandle: 'books', target: 'books', targetHandle: 'in', label: 'Matches payments', data: { path: 'smoothstep' } }),
      e({ id: 'e-books-emails', source: 'books', sourceHandle: 'remind', target: 'emails', targetHandle: 'in', label: 'Reminds', data: { path: 'smoothstep' } }),
      e({ id: 'e-flagged-audit', source: 'flagged', sourceHandle: 'calls', target: 'audit', targetHandle: 'calls', label: 'Your calls' }),
      e({
        id: 'e-audit-main',
        source: 'audit',
        sourceHandle: 'patterns',
        target: 'main',
        targetHandle: 'patterns',
        label: 'Patterns',
        data: { path: 'smoothstep' },
      }),
      e({ id: 'e-ledger-ragent', source: 'ledger', sourceHandle: 'out', target: 'reportAgent', targetHandle: 'in', animated: building }),
      e({ id: 'e-ragent-report', source: 'reportAgent', sourceHandle: 'out', target: 'report', targetHandle: 'in', animated: building }),
    ];
    // checking is rebuilt each render; compare its contents
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, building, checking.join()]);
}

// Where everyone has put each card (shared), falling back to the default layout.
function useSharedBase(): Record<string, Point> {
  const rows = useLive().layout;
  return useMemo(() => {
    const placed = new Map(rows.map(r => [localId(r.nodeId), { x: r.x, y: r.y }]));
    return Object.fromEntries(Object.entries(LAYOUT).map(([id, n]) => [id, placed.get(id) ?? { x: n.x, y: n.y }]));
  }, [rows]);
}

type Drag = { id: string; at: Point; offset: Point };

export function Pipeline() {
  const moveCursor = useReducer(reducers.moveCursor);
  const moveNode = useReducer(reducers.movePipelineNode);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const { focusWhenGrown } = useFocus();
  const expanded = useExpanded();
  const setExpanded = useSetExpanded();
  const shared = useSharedBase();
  const edges = useEdges();

  // Measured card sizes, as React Flow reports them
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  // The card you are dragging follows your pointer. Its offset from its base
  // (how far opened cards pushed it) is kept so the shared base stays right.
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  // Positions you set, shown until the shared row catches up
  const [mine, setMine] = useState<Record<string, Point>>({});
  const justDragged = useRef(0);

  const base = useMemo(() => ({ ...shared, ...mine }), [shared, mine]);
  useEffect(() => {
    // Forget local positions once the shared table agrees
    setMine(m => {
      const left = Object.fromEntries(Object.entries(m).filter(([id, p]) => shared[id].x !== p.x || shared[id].y !== p.y));
      return Object.keys(left).length === Object.keys(m).length ? m : left;
    });
  }, [shared]);

  const open = useMemo(() => [...expanded].filter(id => LAYOUT[id]), [expanded]);
  const arranged = useMemo(
    () =>
      arrange(
        base,
        id => sizes[id] ?? OVERVIEW[typeOf(id)],
        id => OVERVIEW[typeOf(id)],
        open,
        drag?.id
      ),
    [base, sizes, open, drag?.id]
  );

  const nodes: Node[] = useMemo(
    () =>
      Object.keys(LAYOUT).map(id => ({
        id,
        type: typeOf(id),
        position: drag?.id === id ? drag.at : arranged[id],
        data: { expanded: expanded.has(id) },
        // Open cards sit above the lines and their neighbours
        zIndex: expanded.has(id) ? 10 : 0,
        ...(sizes[id] ? { measured: sizes[id] } : {}),
      })),
    [arranged, drag, expanded, sizes]
  );

  useEffect(() => {
    // Wait for the nodes to be measured before fitting them in view.
    const t = setTimeout(() => fitView(FIT), 120);
    return () => clearTimeout(t);
  }, [fitView]);

  const sendMove = useMemo(
    () =>
      throttle((id: string, x: number, y: number) => {
        moveNode({ nodeId: sharedId(id), x, y }).catch(logError);
      }, MOVE_SYNC_MS),
    [moveNode]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === 'dimensions' && c.dimensions) {
          const d = c.dimensions;
          setSizes(s => (s[c.id]?.width === d.width && s[c.id]?.height === d.height ? s : { ...s, [c.id]: d }));
        } else if (c.type === 'position' && c.position) {
          const prev = dragRef.current;
          const offset =
            prev?.id === c.id ? prev.offset : { x: arranged[c.id].x - base[c.id].x, y: arranged[c.id].y - base[c.id].y };
          const next = { x: c.position.x - offset.x, y: c.position.y - offset.y };
          // Everyone sees the card move while you drag it
          sendMove(c.id, next.x, next.y);
          if (c.dragging) {
            dragRef.current = { id: c.id, at: c.position, offset };
          } else {
            dragRef.current = null;
            setMine(m => ({ ...m, [c.id]: next }));
            justDragged.current = Date.now();
          }
          setDrag(dragRef.current);
        }
      }
    },
    [arranged, base, sendMove]
  );

  // A click opens a card for everyone, or closes it again. Clicks on controls
  // inside an open card, text selections and the end of a drag don't count.
  const onNodeClick: NodeMouseHandler = useCallback(
    (e, node) => {
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
      if (Date.now() - justDragged.current < 250) return;
      if (window.getSelection()?.toString()) return;
      const next = !expanded.has(node.id);
      setExpanded(node.id, next);
      if (next) focusWhenGrown(node.id);
    },
    [expanded, setExpanded, focusWhenGrown]
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
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={onNodeClick}
        nodesConnectable={false}
        edgesFocusable={false}
        colorMode="light"
        minZoom={0.15}
        // Trackpad: two fingers pan, pinch zooms (Figma-style). A mouse wheel
        // pans too; hold Cmd/Ctrl to zoom with it. Lists and the spreadsheet
        // inside open cards still scroll themselves (they are marked nowheel).
        panOnScroll
        zoomOnPinch
        zoomActivationKeyCode={['Meta', 'Control']}
        fitView
        fitViewOptions={FIT}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls showInteractive={false} />
        <CanvasCorner />
        <Cursors />
        <PinchZoomThroughLists />
      </ReactFlow>
      <Dock />
      <ItemPanel />
    </div>
  );
}
