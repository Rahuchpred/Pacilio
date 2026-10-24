import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
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
import { PipelineActivityProvider } from './pipeline/activity';
import { PIPELINE_NODES, isPipelineId, pipelineEdges } from './pipeline/sources';

const SYNC_INTERVAL_MS = 40;

export function Board() {
  const [nodeRows] = useTable(tables.node);
  const [edgeRows] = useTable(tables.edge);
  const [sourceStatuses] = useTable(tables.inboundSourceStatus);

  const moveNode = useReducer(reducers.moveNode);
  const renameNode = useReducer(reducers.renameNode);
  const deleteNode = useReducer(reducers.deleteNode);
  const addEdge = useReducer(reducers.addEdge);
  const deleteEdge = useReducer(reducers.deleteEdge);
  const moveCursor = useReducer(reducers.moveCursor);

  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  // The inbound pipeline is a fixed local layout; only shared nodes sync
  const [pipelineNodes, setPipelineNodes] = useState<Node[]>(PIPELINE_NODES);
  const allNodes = useMemo(() => [...pipelineNodes, ...nodes], [pipelineNodes, nodes]);
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

  const sendCursor = useMemo(
    () =>
      throttle((x: number, y: number) => {
        moveCursor({ x, y }).catch(logError);
      }, SYNC_INTERVAL_MS),
    [moveCursor]
  );

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const isPipelineChange = (c: NodeChange) => 'id' in c && isPipelineId(c.id);
      setPipelineNodes(prev => applyNodeChanges(changes.filter(isPipelineChange), prev));
      changes = changes.filter(c => !isPipelineChange(c));
      setNodes(prev => applyNodeChanges(changes, prev));
      for (const change of changes) {
        if (change.type === 'position' && change.dragging && change.position) {
          sendNodePosition(change.id, change.position.x, change.position.y);
        }
      }
    },
    [sendNodePosition]
  );

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    const shared = changes.filter(c => !('id' in c && isPipelineId(c.id)));
    setEdges(prev => applyEdgeChanges(shared, prev));
  }, []);

  // Send exact final positions so the throttle can't drop the drop point.
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, _node, dragged) => {
      for (const n of dragged.filter(n => !isPipelineId(n.id))) {
        moveNode({ id: BigInt(n.id), x: n.position.x, y: n.position.y }).catch(
          logError
        );
      }
    },
    [moveNode]
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
      if (isPipelineId(node.id)) return;
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
      <PipelineActivityProvider>
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
          fitViewOptions={{ padding: { top: '80px', bottom: '24px', left: '24px', right: '24px' } }}
        >
          <Background />
          <Controls />
          <Cursors />
        </ReactFlow>
      </PipelineActivityProvider>
    </div>
  );
}
