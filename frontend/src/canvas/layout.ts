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

// Gaps leave room for each card at its tallest middle size (the question,
// the ledger's last rows) plus the line labels between them.
const COL_GAP = 120;
const TXN_W = 220;
const TXN_GAP = 40;
const INBOX_W = 340;
const MAIN_X = INBOX_W + COL_GAP;
const MAIN_W = 440;
const LEDGER_X = MAIN_X + MAIN_W + COL_GAP;
const LEDGER_W = 480;
const RAGENT_X = LEDGER_X + LEDGER_W + COL_GAP;
const RAGENT_W = 320;
const REPORT_X = RAGENT_X + RAGENT_W + COL_GAP;
// Above the row: the question card is up to ~560 tall in the middle level
const TOP_Y = -780;
// Below the row: clear of the ledger's six rows and total
const TXN_Y = 660;
const TXN_ROW_W = TXN_SLOTS * TXN_W + (TXN_SLOTS - 1) * TXN_GAP;
const TXN_X = MAIN_X + MAIN_W / 2 - TXN_ROW_W / 2;

export const LAYOUT: Record<string, { type: string; x: number; y: number }> = {
  inbox: { type: 'inbox', x: 0, y: 20 },
  main: { type: 'main', x: MAIN_X, y: 0 },
  flagged: { type: 'flagged', x: MAIN_X, y: TOP_Y },
  ledger: { type: 'ledger', x: LEDGER_X, y: 0 },
  emails: { type: 'emails', x: RAGENT_X, y: TOP_Y },
  reportAgent: { type: 'reportAgent', x: RAGENT_X, y: 20 },
  report: { type: 'report', x: REPORT_X, y: 0 },
  ...Object.fromEntries(
    Array.from({ length: TXN_SLOTS }, (_, i) => [txnId(i), { type: 'txn', x: TXN_X + i * (TXN_W + TXN_GAP), y: TXN_Y }])
  ),
};

export const NODE_IDS = Object.keys(LAYOUT);

// Each card type's overview size (see pipeline/cards.css), used to judge which
// way neighbours move and until a card has been measured.
export const OVERVIEW: Record<string, { width: number; height: number }> = {
  inbox: { width: INBOX_W, height: 190 },
  main: { width: MAIN_W, height: 190 },
  txn: { width: TXN_W, height: 130 },
  flagged: { width: 480, height: 210 },
  ledger: { width: LEDGER_W, height: 190 },
  emails: { width: 360, height: 190 },
  reportAgent: { width: RAGENT_W, height: 190 },
  report: { width: 420, height: 190 },
};

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
