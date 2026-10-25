import { Position } from '@xyflow/react';
import { TXN_SLOTS } from '../pipeline/live';

// Where every card sits. Positions are fixed and the same for everyone, spaced
// for the cards at their middle size so opening one never moves the others.
//
//                 Needs you ─────────────── Emails
//                     │   └──────┐
//   Inbox ──── Main agent ──── Ledger ──── Reports agent ──── Show report
//                  │
//      transactions the agent is checking

export const txnId = (i: number) => `txn-${i}`;

const TXN_W = 220;
const TXN_GAP = 16;
const MAIN_X = 440;
const MAIN_W = 440;
const TXN_ROW_W = TXN_SLOTS * TXN_W + (TXN_SLOTS - 1) * TXN_GAP;
const TXN_X = MAIN_X + MAIN_W / 2 - TXN_ROW_W / 2;

export const LAYOUT: Record<string, { type: string; x: number; y: number }> = {
  inbox: { type: 'inbox', x: 0, y: 20 },
  main: { type: 'main', x: MAIN_X, y: 0 },
  flagged: { type: 'flagged', x: MAIN_X, y: -700 },
  ledger: { type: 'ledger', x: 1000, y: 0 },
  emails: { type: 'emails', x: 1580, y: -700 },
  reportAgent: { type: 'reportAgent', x: 1580, y: 20 },
  report: { type: 'report', x: 1980, y: 0 },
  ...Object.fromEntries(
    Array.from({ length: TXN_SLOTS }, (_, i) => [txnId(i), { type: 'txn', x: TXN_X + i * (TXN_W + TXN_GAP), y: 470 }])
  ),
};

export const NODE_IDS = Object.keys(LAYOUT);

export type HandleSpec = { type: 'source' | 'target'; position: Position; id?: string; left?: string };

// Connection points per card type, the same at every level.
export const HANDLES: Record<string, HandleSpec[]> = {
  inbox: [{ type: 'source', position: Position.Right }],
  main: [
    { type: 'target', position: Position.Left, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out' },
    { type: 'source', position: Position.Top, id: 'flag' },
    { type: 'source', position: Position.Bottom, id: 'txn' },
  ],
  txn: [{ type: 'target', position: Position.Top, id: 'in' }],
  flagged: [
    { type: 'target', position: Position.Bottom, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out' },
  ],
  ledger: [
    { type: 'target', position: Position.Left, id: 'in' },
    { type: 'target', position: Position.Top, id: 'answer' },
    { type: 'source', position: Position.Right, id: 'out' },
  ],
  emails: [{ type: 'target', position: Position.Left, id: 'in' }],
  reportAgent: [
    { type: 'target', position: Position.Left, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out' },
  ],
  report: [{ type: 'target', position: Position.Left, id: 'in' }],
};
