import type { Edge, Node } from '@xyflow/react';
import type { ChipEvent } from './chipStates';

// The four inbound sources shown on the board, matching the backend's InboundHub.
export const SOURCES = [
  { name: 'nessie', title: 'Nessie', provides: 'Bank account · purchases, deposits, bills' },
  { name: 'stripe', title: 'Stripe', provides: 'Payments · charges, refunds, disputes' },
  { name: 'ledger', title: 'Ledger', provides: 'Accounting · bills, invoices, payments' },
  { name: 'cord', title: 'Receipts', provides: 'Documents · scanned receipts (CORD)' },
] as const;

export const SOURCE_TITLES: Record<string, string> = Object.fromEntries(SOURCES.map(s => [s.name, s.title]));

export const AGENT_NODE_ID = 'pipeline:agent';
export const LEDGER_NODE_ID = 'pipeline:master-ledger';
export const FOLLOWUPS_NODE_ID = 'pipeline:followups';
export const EMAILS_NODE_ID = 'pipeline:emails';
export const REPORTS_NODE_ID = 'pipeline:reports';
export const REPORT_AGENT_NODE_ID = 'pipeline:report-agent';
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
// Below the inputs: Follow-ups, with the Master ledger lined up beside it
export const FOLLOWUPS_X = SOURCE_X;
export const FOLLOWUPS_Y = SOURCE_GAP_Y * 4 + 60;
export const FOLLOWUPS_WIDTH = 560;
// Email follow-ups sit between Follow-ups and the ledger, all top-aligned
export const EMAILS_X = FOLLOWUPS_X + FOLLOWUPS_WIDTH + 60;
export const EMAILS_WIDTH = 520;
export const LEDGER_X = EMAILS_X + EMAILS_WIDTH + 60;
export const LEDGER_Y = FOLLOWUPS_Y;
export const LEDGER_WIDTH = 1400;
export const LEDGER_HEIGHT = 820;
// Ledger → Reports agent → Show report, left to right
const REPORT_AGENT_X = LEDGER_X + LEDGER_WIDTH + 60;
const REPORT_AGENT_WIDTH = 320;
const REPORTS_X = REPORT_AGENT_X + REPORT_AGENT_WIDTH + 60;
export const REPORTS_WIDTH = 1240;
export const REPORTS_HEIGHT = 1200;

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
  { id: FOLLOWUPS_NODE_ID, type: 'followups', position: { x: FOLLOWUPS_X, y: FOLLOWUPS_Y }, data: {}, ...fixed },
  { id: EMAILS_NODE_ID, type: 'emails', position: { x: EMAILS_X, y: FOLLOWUPS_Y }, data: {}, ...fixed },
  {
    id: LEDGER_NODE_ID,
    type: 'ledger',
    position: { x: LEDGER_X, y: LEDGER_Y },
    data: {},
    // Default size; people resize it with the handles (shared via pipeline_node_size)
    width: LEDGER_WIDTH,
    height: LEDGER_HEIGHT,
    ...fixed,
  },
  { id: REPORT_AGENT_NODE_ID, type: 'reportAgent', position: { x: REPORT_AGENT_X, y: LEDGER_Y }, data: {}, ...fixed },
  {
    id: REPORTS_NODE_ID,
    type: 'reports',
    position: { x: REPORTS_X, y: LEDGER_Y },
    data: {},
    width: REPORTS_WIDTH,
    height: REPORTS_HEIGHT,
    ...fixed,
  },
];

// One wire per source into the agent (events travel along it as packets),
// and one from the agent to the ledger it writes.
export function pipelineEdges(running: Set<string>, agentWorking: boolean, reportBuilding = false): Edge[] {
  const outEdge = (id: string, target: string): Edge => ({
    id,
    source: AGENT_NODE_ID,
    sourceHandle: 'out',
    target,
    deletable: false,
    selectable: false,
    animated: agentWorking,
    className: agentWorking ? 'pipeline-edge is-running' : 'pipeline-edge',
  });
  return [
    outEdge('pipeline:edge:master-ledger', LEDGER_NODE_ID),
    outEdge('pipeline:edge:followups', FOLLOWUPS_NODE_ID),
    {
      id: 'pipeline:edge:report-agent',
      source: LEDGER_NODE_ID,
      target: REPORT_AGENT_NODE_ID,
      deletable: false,
      selectable: false,
      className: reportBuilding ? 'pipeline-edge is-running' : 'pipeline-edge',
    },
    {
      id: 'pipeline:edge:reports',
      source: REPORT_AGENT_NODE_ID,
      target: REPORTS_NODE_ID,
      deletable: false,
      selectable: false,
      animated: reportBuilding,
      className: reportBuilding ? 'pipeline-edge is-running' : 'pipeline-edge',
    },
    {
      id: 'pipeline:edge:emails',
      source: FOLLOWUPS_NODE_ID,
      target: EMAILS_NODE_ID,
      deletable: false,
      selectable: false,
      className: 'pipeline-edge',
    },
    ...SOURCES.map(source => ({
    id: `pipeline:edge:${source.name}`,
    type: 'packet',
    source: sourceNodeId(source.name),
    target: AGENT_NODE_ID,
    targetHandle: agentHandleId(source.name),
    data: { source: source.name },
    deletable: false,
    selectable: false,
    className: running.has(source.name) ? 'pipeline-edge is-running' : 'pipeline-edge',
  }))];
}

// ─── Event chips around the agent ───────────────────────────────────────────

export const CHIP_WIDTH = 176;
export const CHIP_HEIGHT = 32;
// Events not yet finished by the agent, shown as chips (newest kept)
export const MAX_CHIPS = 32;

// Chips sit on a grid of cells in rectangular rings around the agent, so they
// never overlap. Rings fill outward above, right of and below the agent; the
// side the wires come in from stays open.
const CELL_W = CHIP_WIDTH + 10;
const CELL_H = CHIP_HEIGHT + 10;
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

export type ChipSide = 'top' | 'right' | 'bottom' | 'left';
export const chipHandleId = (side: ChipSide) => `chip-${side}`;
export const agentChipHandleId = (side: ChipSide) => `agent-${side}`;
type Point = { x: number; y: number };

// Which side of the agent a chip faces, so its thread takes the short way in.
function chipSide(chip: Point, agent: Node, width: number, height: number): ChipSide {
  const centerY = chip.y + CHIP_HEIGHT / 2;
  const centerX = chip.x + CHIP_WIDTH / 2;
  if (centerY < agent.position.y) return 'bottom'; // chip above → its bottom edge
  if (centerY > agent.position.y + height) return 'top'; // chip below
  return centerX < agent.position.x + width / 2 ? 'right' : 'left';
}

const OPPOSITE: Record<ChipSide, ChipSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };

// Chips sit in rings around the agent unless someone dragged one (`moved`).
export function eventChipNodes(chips: ChipEvent[], agent: Node | undefined, moved: Map<string, Point>): Node[] {
  if (!agent) return [];
  const width = agent.measured?.width ?? AGENT_WIDTH;
  const height = agent.measured?.height ?? AGENT_HEIGHT;
  const cx = agent.position.x + width / 2;
  const cy = agent.position.y + height / 2;
  // The batch in the agent's hands sits on the inner ring; the newest
  // waiting (and just-finished) events fill the rings outside it
  const inRun = chips.filter(c => c.state === 'processing');
  const rest = chips.filter(c => c.state !== 'processing');
  const shown = [...inRun, ...rest.slice(-Math.max(0, MAX_CHIPS - inRun.length))];
  const slots = ringSlots(shown.length, width, height);

  return shown.map(({ event, state }, i) => {
    const id = `event:${event.id}`;
    const position = moved.get(id) ?? { x: cx + slots[i].x - CHIP_WIDTH / 2, y: cy + slots[i].y - CHIP_HEIGHT / 2 };
    return {
      id,
      type: 'event',
      position,
      data: { event, state, side: chipSide(position, agent, width, height) },
      // Fixed size so React Flow doesn't re-measure chips that are rebuilt each render
      width: CHIP_WIDTH,
      height: CHIP_HEIGHT,
      measured: { width: CHIP_WIDTH, height: CHIP_HEIGHT },
      selectable: false,
      deletable: false,
      connectable: false,
    };
  });
}

// A thread into the agent for the chips it's working on (and just finished);
// waiting chips sit quietly in the ring without one.
export function chipThreads(chipNodes: Node[]): Edge[] {
  return chipNodes.filter(n => (n.data as { state: string }).state !== 'waiting').map(n => {
    const { side, state } = n.data as { side: ChipSide; state: string };
    return {
      id: `thread:${n.id}`,
      source: n.id,
      sourceHandle: chipHandleId(side),
      target: AGENT_NODE_ID,
      targetHandle: agentChipHandleId(OPPOSITE[side]),
      deletable: false,
      selectable: false,
      className: `thread is-${state}`,
    };
  });
}
