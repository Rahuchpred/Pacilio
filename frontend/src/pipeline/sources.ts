import type { Edge, Node } from '@xyflow/react';
import type { InboundEvent } from '../module_bindings/types';

// The four inbound sources shown on the board, matching the backend's InboundHub.
export const SOURCES = [
  { name: 'nessie', title: 'Nessie', provides: 'Bank account · purchases, deposits, bills' },
  { name: 'stripe', title: 'Stripe', provides: 'Payments · charges, refunds, disputes' },
  { name: 'ledger', title: 'Ledger', provides: 'Accounting · bills, invoices, payments' },
  { name: 'cord', title: 'Receipts', provides: 'Documents · scanned receipts (CORD)' },
] as const;

export const SOURCE_TITLES: Record<string, string> = Object.fromEntries(SOURCES.map(s => [s.name, s.title]));

export const AGENT_NODE_ID = 'pipeline:agent';
export const agentHandleId = (source: string) => `in:${source}`;
export const sourceNodeId = (name: string) => `pipeline:${name}`;
export const isPipelineId = (id: string) => id.startsWith('pipeline:');
export const isEventId = (id: string) => id.startsWith('event:');

// Default layout: sources in a column on the left, the agent to their right
// with room around it for event chips. Positions people drag to are shared
// through the pipeline_layout table.
const SOURCE_X = 0;
const SOURCE_GAP_Y = 200;
const AGENT_X = 900;
const AGENT_Y = 230;

export const AGENT_WIDTH = 340;
export const AGENT_HEIGHT = 170;

const fixed = { deletable: false, connectable: false, selectable: false };

export const PIPELINE_NODES: Node[] = [
  ...SOURCES.map((source, i) => ({
    id: sourceNodeId(source.name),
    type: 'source',
    position: { x: SOURCE_X, y: i * SOURCE_GAP_Y },
    data: { source: source.name },
    ...fixed,
  })),
  { id: AGENT_NODE_ID, type: 'agent', position: { x: AGENT_X, y: AGENT_Y }, data: {}, ...fixed },
];

// One wire per source into the agent; events travel along it as packets.
export function pipelineEdges(running: Set<string>): Edge[] {
  return SOURCES.map(source => ({
    id: `pipeline:edge:${source.name}`,
    type: 'packet',
    source: sourceNodeId(source.name),
    target: AGENT_NODE_ID,
    targetHandle: agentHandleId(source.name),
    data: { source: source.name },
    deletable: false,
    selectable: false,
    className: running.has(source.name) ? 'pipeline-edge is-running' : 'pipeline-edge',
  }));
}

// ─── Event chips around the agent ───────────────────────────────────────────

export const CHIP_WIDTH = 196;
export const CHIP_HEIGHT = 56;
// Newest events shown as chips; the agent counts the rest
export const MAX_CHIPS = 24;

// Chips sit on a grid of cells in rectangular rings around the agent, so they
// never overlap. Rings fill outward above, right of and below the agent; the
// side the wires come in from stays open.
const CELL_W = CHIP_WIDTH + 12;
const CELL_H = CHIP_HEIGHT + 12;
const MARGIN = 24;

function ringSlots(count: number, agentW: number, agentH: number): { x: number; y: number }[] {
  // Innermost ring: the first cell distance that clears the agent's edges
  const c0 = Math.ceil((agentW / 2 + CHIP_WIDTH / 2 + MARGIN) / CELL_W);
  const r0 = Math.ceil((agentH / 2 + CHIP_HEIGHT / 2 + MARGIN) / CELL_H);
  const slots: { x: number; y: number }[] = [];
  for (let k = 0; slots.length < count; k++) {
    const C = c0 + k;
    const R = r0 + k;
    const ring: [number, number][] = [];
    for (let c = -C + 1; c <= C; c++) ring.push([c, -R]); // top, left to right
    for (let r = -R + 1; r <= R; r++) ring.push([C, r]); // right side, downward
    for (let c = C - 1; c >= -C + 1; c--) ring.push([c, R]); // bottom, right to left
    for (const [c, r] of ring) {
      if (slots.length >= count) break;
      // Keep clear of the incoming wires: nothing left of the agent's left edge
      if (c * CELL_W + CHIP_WIDTH / 2 < -agentW / 2 + CHIP_WIDTH / 4) continue;
      slots.push({ x: c * CELL_W, y: r * CELL_H });
    }
  }
  return slots;
}

export function eventChipNodes(events: InboundEvent[], agent: Node | undefined): Node[] {
  if (!agent) return [];
  const width = agent.measured?.width ?? AGENT_WIDTH;
  const height = agent.measured?.height ?? AGENT_HEIGHT;
  const cx = agent.position.x + width / 2;
  const cy = agent.position.y + height / 2;
  const shown = events.slice(-MAX_CHIPS);
  const slots = ringSlots(shown.length, width, height);

  return shown.map((event, i) => ({
    id: `event:${event.id}`,
    type: 'event',
    position: { x: cx + slots[i].x - CHIP_WIDTH / 2, y: cy + slots[i].y - CHIP_HEIGHT / 2 },
    data: { event },
    // Fixed size so React Flow doesn't re-measure chips that are rebuilt each render
    width: CHIP_WIDTH,
    height: CHIP_HEIGHT,
    measured: { width: CHIP_WIDTH, height: CHIP_HEIGHT },
    draggable: false,
    selectable: false,
    deletable: false,
    connectable: false,
  }));
}
