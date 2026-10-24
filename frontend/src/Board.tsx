import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnNodeDrag,
} from '@xyflow/react';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from './module_bindings';
import { Cursors } from './Cursors';
import { logError, throttle } from './throttle';
import { pipelineNodeTypes } from './pipeline/nodes';
import { pipelineEdgeTypes } from './pipeline/PacketEdge';
import { usePipelineActivity } from './pipeline/activity';
import {
  AGENT_NODE_ID,
  PIPELINE_NODES,
  eventChipNodes,
  isEventId,
  isPipelineId,
  pipelineEdges,
} from './pipeline/sources';

const SYNC_INTERVAL_MS = 40;

export function Board() {
  const [nodeRows] = useTable(tables.node);
  const [edgeRows] = useTable(tables.edge);
  const [sourceStatuses] = useTable(tables.inboundSourceStatus);
  const [layoutRows] = useTable(tables.pipelineLayout);

  const moveNode = useReducer(reducers.moveNode);
  const renameNode = useReducer(reducers.renameNode);
  const deleteNode = useReducer(reducers.deleteNode);
  const addEdge = useReducer(reducers.addEdge);
  const deleteEdge = useReducer(reducers.deleteEdge);
  const moveCursor = useReducer(reducers.moveCursor);
  const movePipelineNode = useReducer(reducers.movePipelineNode);

  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // Pipeline nodes keep their default layout until someone drags them
  const [pipelineNodes, setPipelineNodes] = useState<Node[]>(PIPELINE_NODES);
  // Received events orbit the agent and follow it when it's dragged
  const { landed } = usePipelineActivity();
  const agent = pipelineNodes.find(n => n.id === AGENT_NODE_ID);
  const chips = useMemo(() => eventChipNodes(landed, agent), [landed, agent]);
  const allNodes = useMemo(() => [...pipelineNodes, ...chips, ...nodes], [pipelineNodes, chips, nodes]);
  const allEdges = useMemo(() => {
    const running = new Set(sourceStatuses.filter(s => s.enabled).map(s => s.name));
    return [...pipelineEdges(running), ...edges];
  }, [sourceStatuses, edges]);

  // Mirror server rows into React Flow state, keeping local UI flags (selection,
  // an in-progress drag) so remote updates don't clobber what this user is doing.
  useEffect(() => {
    setNodes(prev => {
      const local = new Map(prev.map(n => [n.id, n]));
      return nodeRows.map(row => {
        const id = row.id.toString();
        const existing = local.get(id);
        return {
          ...existing,
          id,
          position: existing?.dragging
            ? existing.position
            : { x: row.x, y: row.y },
          data: { label: row.label },
        };
      });
    });
  }, [nodeRows]);

  useEffect(() => {
    setPipelineNodes(prev =>
      prev.map(n => {
        const row = layoutRows.find(r => r.nodeId === n.id);
        return row && !n.dragging ? { ...n, position: { x: row.x, y: row.y } } : n;
      })
    );
  }, [layoutRows]);

  useEffect(() => {
    setEdges(prev => {
      const local = new Map(prev.map(e => [e.id, e]));
      return edgeRows.map(row => {
        const id = row.id.toString();
        return {
          ...local.get(id),
          id,
          source: row.source.toString(),
          target: row.target.toString(),
        };
      });
    });
  }, [edgeRows]);

  const sendNodePosition = useMemo(
    () =>
      throttle((id: string, x: number, y: number) => {
        moveNode({ id: BigInt(id), x, y }).catch(logError);
      }, SYNC_INTERVAL_MS),
    [moveNode]
  );

  const sendPipelinePosition = useMemo(
    () =>
      throttle((nodeId: string, x: number, y: number) => {
        movePipelineNode({ nodeId, x, y }).catch(logError);
      }, SYNC_INTERVAL_MS),
    [movePipelineNode]
  );

  const sendCursor = useMemo(
    () =>
      throttle((x: number, y: number) => {
        moveCursor({ x, y }).catch(logError);
      }, SYNC_INTERVAL_MS),
    [moveCursor]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Chips are derived from events, not stored, so their changes are dropped
      changes = changes.filter(c => !('id' in c && isEventId(c.id)));
      const isPipelineChange = (c: NodeChange) => 'id' in c && isPipelineId(c.id);
      const pipelineChanges = changes.filter(isPipelineChange);
      setPipelineNodes(prev => applyNodeChanges(pipelineChanges, prev));
      for (const change of pipelineChanges) {
        if (change.type === 'position' && change.dragging && change.position) {
          sendPipelinePosition(change.id, change.position.x, change.position.y);
        }
      }
      changes = changes.filter(c => !isPipelineChange(c));
      setNodes(prev => applyNodeChanges(changes, prev));
      for (const change of changes) {
        if (change.type === 'position' && change.dragging && change.position) {
          sendNodePosition(change.id, change.position.x, change.position.y);
        }
      }
    },
    [sendNodePosition, sendPipelinePosition]
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const shared = changes.filter(c => !('id' in c && isPipelineId(c.id)));
    setEdges(prev => applyEdgeChanges(shared, prev));
  }, []);

  // Send exact final positions so the throttle can't drop the drop point.
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, _node, dragged) => {
      for (const n of dragged) {
        const { x, y } = n.position;
        if (isPipelineId(n.id)) movePipelineNode({ nodeId: n.id, x, y }).catch(logError);
        else moveNode({ id: BigInt(n.id), x, y }).catch(logError);
      }
    },
    [moveNode, movePipelineNode]
  );

  const onConnect = useCallback(
    (c: Connection) => {
      addEdge({ source: BigInt(c.source), target: BigInt(c.target) }).catch(
        logError
      );
    },
    [addEdge]
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      for (const n of deleted) deleteNode({ id: BigInt(n.id) }).catch(logError);
    },
    [deleteNode]
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      for (const e of deleted) deleteEdge({ id: BigInt(e.id) }).catch(logError);
    },
    [deleteEdge]
  );

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (isPipelineId(node.id) || isEventId(node.id)) return;
      const label = window.prompt('Rename node', String(node.data.label ?? ''));
      if (label !== null) {
        renameNode({ id: BigInt(node.id), label }).catch(logError);
      }
    },
    [renameNode]
  );

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    sendCursor(x, y);
  };

  return (
    <div className="board" onPointerMove={onPointerMove}>
      <ReactFlow
        nodes={allNodes}
        edges={allEdges}
        nodeTypes={pipelineNodeTypes}
        edgeTypes={pipelineEdgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        fitView
        // Keep the board clear of the control bar and top bar
        fitViewOptions={{ padding: { top: '88px', bottom: '40px', left: '40px', right: '40px' }, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} />
        <Controls />
        <Cursors />
      </ReactFlow>
    </div>
  );
}
