import { Position } from '@xyflow/react';
import { TXN_SLOTS } from '../pipeline/live';
import { LANE_SOURCES as LANES } from '../pipeline/activity';

// Where every card sits. Positions are fixed and the same for everyone, spaced
// for the cards at their middle size so opening one never moves the others.
//
//                 Needs you ─────────────── Emails
//                     │   └──────┐
// Sources ──── Bookkeeper ──── Ledger ──── Reports agent ──── Show report
//                  │
//      transactions the agent is checking, rows of five

export const txnId = (i: number) => `txn-${i}`;

// Gaps leave room for each card at its tallest middle size (the question,
// the ledger's last rows) plus the line labels between them.
const COL_GAP = 120;
const TXN_W = 220;
const TXN_GAP = 40;
// The transactions sit in rows of five under the Bookkeeper
const TXN_PER_ROW = 5;
const TXN_ROW_H = 170;
// A long run from the inbox to the Bookkeeper, so what travels it can be read
const INBOX_GAP = 360;
const INBOX_W = 340;
const MAIN_X = INBOX_W + COL_GAP;
const MAIN_W = 440;
// A long run from the agent to the ledger: decisions ride it fast and often
const LEDGER_GAP = 340;
const LEDGER_X = MAIN_X + MAIN_W + LEDGER_GAP;
const LEDGER_W = 480;
const RAGENT_X = LEDGER_X + LEDGER_W + COL_GAP;
const RAGENT_W = 320;
const REPORT_X = RAGENT_X + RAGENT_W + COL_GAP;
// Above the row: the question card is up to ~560 tall in the middle level
const TOP_Y = -780;
// Below the row: clear of the ledger's six rows and total
const TXN_Y = 660;
const TXN_ROW_W = TXN_PER_ROW * TXN_W + (TXN_PER_ROW - 1) * TXN_GAP;
const TXN_X = MAIN_X + MAIN_W / 2 - TXN_ROW_W / 2;

export const LAYOUT: Record<string, { type: string; x: number; y: number }> = {
  inbox: { type: 'inbox', x: MAIN_X - INBOX_GAP - INBOX_W, y: 20 },
  main: { type: 'main', x: MAIN_X, y: 0 },
  flagged: { type: 'flagged', x: MAIN_X, y: TOP_Y },
  ledger: { type: 'ledger', x: LEDGER_X, y: 0 },
  emails: { type: 'emails', x: RAGENT_X, y: TOP_Y },
  reportAgent: { type: 'reportAgent', x: RAGENT_X, y: 20 },
  report: { type: 'report', x: REPORT_X, y: 0 },
  ...Object.fromEntries(
    Array.from({ length: TXN_SLOTS }, (_, i) => [
      txnId(i),
      { type: 'txn', x: TXN_X + (i % TXN_PER_ROW) * (TXN_W + TXN_GAP), y: TXN_Y + Math.floor(i / TXN_PER_ROW) * TXN_ROW_H },
    ])
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

export type HandleSpec = { type: 'source' | 'target'; position: Position; id?: string; left?: string; top?: string };

// Connection points per card type, the same at every level.
export const HANDLES: Record<string, HandleSpec[]> = {
  // One lane per source, in the order the inbox lists them
  inbox: LANES.map((source, i) => ({ type: 'source' as const, position: Position.Right, id: `out-${source}`, top: `${30 + i * 14}%` })),
  main: [
    ...LANES.map((source, i) => ({ type: 'target' as const, position: Position.Left, id: `in-${source}`, top: `${28 + i * 15}%` })),
    { type: 'source', position: Position.Right, id: 'out' },
    { type: 'source', position: Position.Top, id: 'flag' },
    { type: 'source', position: Position.Bottom, id: 'txn' },
  ],
  txn: [{ type: 'target', position: Position.Top, id: 'in' }],
  // Two lines leave the question on their own dots, so they never share a
  // stretch: emails from the upper right, the answered ledger row from the lower right.
  flagged: [
    { type: 'target', position: Position.Bottom, id: 'in' },
    { type: 'source', position: Position.Right, id: 'out', top: '30%' },
    { type: 'source', position: Position.Right, id: 'ok', top: '75%' },
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
