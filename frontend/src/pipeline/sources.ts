import type { Edge, Node } from '@xyflow/react';

// The four inbound sources shown on the board, matching the backend's InboundHub.
export const SOURCES = [
  { name: 'nessie', title: 'Nessie', provides: 'Bank: purchases, deposits, transfers, bills' },
  { name: 'stripe', title: 'Stripe', provides: 'Payments: charges, refunds, chargebacks' },
  { name: 'ledger', title: 'Ledger', provides: 'Accounting: bills, invoices, payments' },
  { name: 'cord', title: 'CORD receipts', provides: 'Documents: scanned receipts' },
] as const;

export const FEED_NODE_ID = 'pipeline:feed';
export const sourceNodeId = (name: string) => `pipeline:${name}`;
export const isPipelineId = (id: string) => id.startsWith('pipeline:');

// Default layout: separate cards with clear space, wired into one feed.
// Positions people drag to are shared through the pipeline_layout table.
const SOURCE_X = 0;
const SOURCE_GAP_Y = 200;
const FEED_X = 620;
const FEED_Y = 40;

const fixed = { deletable: false, connectable: false, selectable: false };

export const PIPELINE_NODES: Node[] = [
  ...SOURCES.map((source, i) => ({
    id: sourceNodeId(source.name),
    type: 'source',
    position: { x: SOURCE_X, y: i * SOURCE_GAP_Y },
    data: { source: source.name },
    ...fixed,
  })),
  { id: FEED_NODE_ID, type: 'feed', position: { x: FEED_X, y: FEED_Y }, data: {}, ...fixed },
];

// One wire per source into the feed; events travel along it as packets.
export function pipelineEdges(running: Set<string>): Edge[] {
  return SOURCES.map(source => ({
    id: `pipeline:edge:${source.name}`,
    type: 'packet',
    source: sourceNodeId(source.name),
    target: FEED_NODE_ID,
    data: { source: source.name },
    deletable: false,
    selectable: false,
    className: running.has(source.name) ? 'pipeline-edge is-running' : 'pipeline-edge',
  }));
}
