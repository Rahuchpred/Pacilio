// What we ask Droid to do on each run. Droid works in its own folder on the
// Factory computer, keeps the ledger as JSON, renders it to HTML, and replies
// with a JSON list of decisions that our module checks and applies.

import { RENDER_PATH } from './renderScript';

export const WORKDIR = '/home/factory-user/settle';
const RENDER_CMD = `python3 /home/factory-user/${RENDER_PATH} ${WORKDIR}`;
export const LEDGER_HTML = 'settle/ledger.html';
export const LEDGER_XLSX = 'settle/ledger.xlsx';

export const CATEGORIES = [
  'Revenue · Tickets',
  'Revenue · Sponsorship',
  'Production · Audio & lighting',
  'Security',
  'Catering',
  'Labor & payroll',
  'Marketing & printing',
  'Permits & fees',
  'Processor fees & refunds',
  'Cash & transfers',
  'Other',
];

export interface PromptEvent {
  id: string;
  source: string;
  kind: string;
  date: string;
  amount_cents: string;
  currency: string;
  counterparty: string;
  description: string;
  reference: string | null;
}

export interface PromptDecision {
  event_id: string;
  action: string;
  note: string;
}

export function buildPrompt(events: PromptEvent[], decisions: PromptDecision[], resetLedger: boolean): string {
  return `You are Settle's main bookkeeping agent for a concert promoter (the Oct 24 show).
You keep the master ledger: one spreadsheet of every money movement, checked and explained.

Work quickly: go straight to the files below. Don't look for AGENTS.md, skills or other context,
and don't re-verify your output beyond running the render tool once.

## Workspace
Work only in ${WORKDIR}. Create it if missing.
- ${WORKDIR}/ledger.json: the ledger data (source of truth). Create it as {"rows": []} if missing.
- The render tool is provided at /home/factory-user/${RENDER_PATH}. Never write, edit or replace it,
  and don't write a renderer of your own. Run it with: ${RENDER_CMD}
  It turns ledger.json into ledger.html (the Excel-style sheet) and ledger.xlsx (the workbook).
${resetLedger ? `\nThis run starts over: overwrite ledger.json with {"rows": []} first (don't delete files), then continue.\n` : ''}
## Ledger rows
Each row in ledger.json "rows":
{"row": n, "event_id": "...", "date": "YYYY-MM-DD", "source": "nessie|stripe|ledger|cord",
 "counterparty": "...", "description": "...", "category": "...", "amount_cents": signed integer,
 "currency": "USD", "status": "ok|void|review|refunded", "note": "...", "duplicate_of": event_id or null,
 "recommendation": "void|refund|chase|keep" (review rows only, else null)}
Categories (use exactly one): ${CATEGORIES.join('; ')}.
Amounts: positive = money in, negative = money out.

## Sources
- nessie: the bank account (purchases, deposits, withdrawals, transfers, bill pay)
- stripe: card payments for tickets (charges, refunds, chargebacks)
- ledger: the accounting system (vendor bills, sponsor invoices, recorded payments). Typed by hand, so it has typos and double entries.
- cord: scanned receipts for small purchases

## For each new event
1. Add a row (keep row numbers increasing). Classify it.
2. Compare it with every existing row. Look for:
   - Data-entry duplicate: the same document recorded twice with small differences (typo, casing, a date off by a day or two, an amount off by 1–5% or rounded). Money did not move twice.
   - Double charge: money actually moved twice for one thing (e.g. two bank purchases from the same vendor for the same item and amount).
   - Mismatch: a payment or charge that disagrees with its bill, invoice or receipt.
3. Decide:
   - status "ok": nothing wrong (you may note a match, e.g. "Pays bill AV-0423").
   - status "void": a data-entry duplicate you are at least 85% sure of. Set duplicate_of.
   - status "review": anything you are less sure of, any double charge, any mismatch. A person decides.
     Recommend one action: "void" (it's a duplicate entry), "refund" (only for a Stripe charge that should be returned),
     "chase" (ask the vendor or customer about it), or "keep" (looks fine on balance).

## Human decisions to apply first
${decisions.length ? decisions.map(d => `- event ${d.event_id}: ${d.action}${d.note ? ` (${d.note})` : ''}`).join('\n') : '- none'}
Apply them to the matching rows: void → status "void"; refund → status "refunded"; keep → status "ok"; note who decided in "note" as "Decided by a person".

## New events (JSON)
${events.length ? JSON.stringify(events) : '[] (no new events this run; just apply the decisions and re-render)'}

## Finish
Write ledger.json, then run ${RENDER_CMD} once. Don't change the sheet design; the tool owns it.

## Reply
When the files are written, reply with ONLY this JSON and nothing else:
{"summary": "one sentence, past tense, with counts",
 "decisions": [{"event_id": "...", "status": "ok|void|review", "category": "...", "note": "...",
   "duplicate_of": "event_id or null", "recommendation": "void|refund|chase|keep or null",
   "confidence": 0.0-1.0, "question": "for review only: a direct yes/no question with the amount",
   "reason": "for review/void: the evidence, naming the rows or events"}]}
Include every new event exactly once.`;
}
