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

const SYNC_INTERVAL_MS = 40;

export function Board() {
  const [nodeRows] = useTable(tables.node);
  const [edgeRows] = useTable(tables.edge);

  const addNode = useReducer(reducers.addNode);
  const moveNode = useReducer(reducers.moveNode);
  const renameNode = useReducer(reducers.renameNode);
  const deleteNode = useReducer(reducers.deleteNode);
  const addEdge = useReducer(reducers.addEdge);
  const deleteEdge = useReducer(reducers.deleteEdge);
  const moveCursor = useReducer(reducers.moveCursor);

  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

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
    setEdges(prev => applyEdgeChanges(changes, prev));
  }, []);

  // Send exact final positions so the throttle can't drop the drop point.
  const onNodeDragStop: OnNodeDrag = useCallback(
    (_event, _node, dragged) => {
      for (const n of dragged) {
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
      const label = window.prompt('Rename node', String(node.data.label ?? ''));
      if (label !== null) {
        renameNode({ id: BigInt(node.id), label }).catch(logError);
      }
    },
    [renameNode]
  );

  const addNodeAt = useCallback(
    (clientX: number, clientY: number) => {
      const { x, y } = screenToFlowPosition({ x: clientX, y: clientY });
      // Center the default 150x40 node on the point
      addNode({ x: x - 75, y: y - 20 }).catch(logError);
    },
    [addNode, screenToFlowPosition]
  );

  const onDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('react-flow__pane')) {
      addNodeAt(e.clientX, e.clientY);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    sendCursor(x, y);
  };

  return (
    <div
      className="board"
      onPointerMove={onPointerMove}
      onDoubleClick={onDoubleClick}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeDoubleClick={onNodeDoubleClick}
        zoomOnDoubleClick={false}
        fitView
      >
        <Background />
        <Controls />
        <Cursors />
      </ReactFlow>

      <div className="toolbar">
        <button
          onClick={() => addNodeAt(window.innerWidth / 2, window.innerHeight / 2)}
        >
          + Node
        </button>
        <span className="hint">
          Double-click canvas to add · drag handles to connect · double-click
          node to rename · Backspace to delete
        </span>
      </div>
    </div>
  );
}
