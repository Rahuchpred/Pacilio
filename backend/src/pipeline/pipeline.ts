import { SenderError, t, type InferSchema, type ProcedureCtx, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { enqueueAgentTask } from '../droid/agents';
import { FactoryClient, FactoryError } from '../droid/factory';
import { LEDGER_HTML, LEDGER_XLSX, MAX_AUTO_EMAILS, buildPrompt, buildRenderPrompt, type PromptDecision, type PromptEvent } from './prompt';
import { finishMessages, markSent, promptId, queuedFor, requeueMessages } from '../settle/messages';
import { currentClassifying } from '../classify/classify';
import { latestFiles, ledgerRows, relative, setRenderDir, uploadSnapshot } from './snapshot';
import {
  MAX_AUTO_REMINDERS,
  billInMemo,
  checkNoBill,
  checkPayment,
  createReminder,
  invoiceInMemo,
  documentsForMatching,
  isNoBillPayment,
  linkLateBill,
  openBillFor,
  overdueInvoices,
  recordExpense,
  recordPayment,
} from '../books/books';
import { docsFor, findRelated, vendorBillCounts, type MatchRow } from './related';
import { learnTick, patternsForPrompt, recordPatternUses } from '../learn/learn';
import { logAction } from '../learn/audit';
import { RENDER_PATH, RENDER_SCRIPT, RENDER_VERSION } from './renderScript';
import { REPORT_PATH, REPORT_SCRIPT, REPORT_VERSION } from './reportScript';
import { reports, reportsTick, resetReports } from './reports';

// Fixed tools the agents run on the Factory computer; installed (or upgraded)
// before the agent's next run whenever a version changes
const TOOLS = [
  { path: RENDER_PATH, version: RENDER_VERSION, script: RENDER_SCRIPT },
  { path: REPORT_PATH, version: REPORT_VERSION, script: REPORT_SCRIPT },
];
import { pipelineTickSchedule } from './tables';
import { ensureTicking } from './ticking';
import { startFollowUp } from '../email/email';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type PCtx = ProcedureCtx<InferSchema<Schema>>;
type Run = NonNullable<ReturnType<Ctx['db']['agentRun']['id']['find']>>;
type Task = NonNullable<ReturnType<Ctx['db']['agentTask']['id']['find']>>;
type AgentState = NonNullable<ReturnType<Ctx['db']['pipelineAgent']['id']['find']>>;

// Each run has a fixed startup cost, so moderate batches keep up with the sources
const BATCH_SIZE = 30;
// Don't spend a run's startup cost on one or two events: wait for a batch,
// unless the oldest waiting event has waited long enough
const MIN_BATCH = 8;
const MAX_WAIT_MICROS = 10_000_000n;
const MAX_HTML_CHARS = 2_000_000;

const OUTCOMES = ['ok', 'void', 'review'] as const;
const ACTIONS = ['void', 'refund', 'follow_up', 'keep'] as const;
// What a person can choose in the queue (follow-up emails are sent later; for
// now choosing it marks the row as being followed up)
const HUMAN_ACTIONS = ACTIONS;
const DECISION_LABEL: Record<string, string> = { void: 'Void', refund: 'Refund', follow_up: 'Email them', keep: 'Keep as is' };

function normalizeAction(value: string | null | undefined): string {
  const v = (value ?? '').toLowerCase().replace(/[\s-]+/g, '_');
  if (v === 'chase' || v === 'email' || v === 'followup') return 'follow_up';
  return (ACTIONS as readonly string[]).includes(v) ? v : 'keep';
}

const clip = (s: unknown, max: number) => (typeof s === 'string' ? s.trim().slice(0, max) : '');
const STOPPED_TASK = ['failed', 'cancelled'];

// ─── State helpers ──────────────────────────────────────────────────────────

function agentState(ctx: Ctx): AgentState {
  const existing = ctx.db.pipelineAgent.id.find(0);
  if (existing) return existing;
  return ctx.db.pipelineAgent.insert({
    id: 0,
    enabled: false,
    status: 'idle',
    currentRunId: undefined,
    lastError: undefined,
    resetLedger: false,
    updatedAt: ctx.timestamp,
  });
}

function updateAgent(ctx: Ctx, patch: Partial<AgentState>) {
  ctx.db.pipelineAgent.id.update({ ...agentState(ctx), ...patch, updatedAt: ctx.timestamp });
}

export { ensureTicking };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Hooks for the inbound Run / Pause / Restart buttons ────────────────────

export function setPipelineEnabled(ctx: Ctx, enabled: boolean) {
  agentState(ctx);
  updateAgent(ctx, { enabled });
  if (enabled) ensureTicking(ctx);
}

// Forget everything the agent did and start the ledger over on the next run.
export function resetPipeline(ctx: Ctx) {
  const agent = agentState(ctx);
  const run = agent.currentRunId === undefined ? undefined : ctx.db.agentRun.id.find(agent.currentRunId);
  const task = run && ctx.db.agentTask.id.find(run.taskId);
  if (task && !['done', ...STOPPED_TASK].includes(task.status)) {
    if (task.sessionId) ctx.db.agentOutbox.insert({ id: 0n, taskId: task.id, text: '', interrupt: true });
    ctx.db.agentTask.id.update({ ...task, status: 'cancelled', updatedAt: ctx.timestamp });
  }
  for (const r of [...ctx.db.agentRun.iter()]) ctx.db.agentRun.id.delete(r.id);
  for (const r of [...ctx.db.eventReview.iter()]) ctx.db.eventReview.eventId.delete(r.eventId);
  for (const r of [...ctx.db.reviewItem.iter()]) ctx.db.reviewItem.id.delete(r.id);
  for (const r of [...ctx.db.reviewDetail.iter()]) ctx.db.reviewDetail.itemId.delete(r.itemId);
  for (const r of [...ctx.db.ledgerDocument.iter()]) ctx.db.ledgerDocument.id.delete(r.id);
  updateRender(ctx, { status: 'idle', taskId: undefined, requested: false, pendingRunId: 0n, renderedRunId: 0n, renderedAt: undefined, sessionId: undefined, lastError: undefined });
  updateAgent(ctx, { status: 'idle', currentRunId: undefined, lastError: undefined, resetLedger: true });
  resetReports(ctx);
}

// ─── Runs ───────────────────────────────────────────────────────────────────

// Hand the waiting events (and any human decisions) to Droid, if there are any.
// Start a Bookkeeper run if one is due. With `dryRun` it only says whether it
// would (the tick uploads a fresh ledger snapshot first, then starts it).
function startRun(ctx: Ctx, ledgerDir?: string, dryRun = false): boolean {
  const agent = agentState(ctx);
  if (agent.currentRunId !== undefined) return false;
  // Messages from the team go out even while paused (just without new events)
  const messages = queuedFor(ctx, 'main');
  if (!agent.enabled && !messages.length) return false;

  const waiting = (agent.enabled ? [...ctx.db.inboundEvent.iter()] : [])
    .filter(e => !ctx.db.eventReview.eventId.find(e.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(0, BATCH_SIZE);
  const decided = [...ctx.db.reviewItem.iter()].filter(r => r.status === 'decided');
  // A pending reset rides along with the first real batch rather than holding
  // the agent in an empty run while new events pile up
  if (!waiting.length && !decided.length && !messages.length) return false;
  const oldestWaitedMicros = waiting.length
    ? ctx.timestamp.microsSinceUnixEpoch - waiting[0].receivedAt.microsSinceUnixEpoch
    : 0n;
  if (!decided.length && !messages.length && waiting.length < MIN_BATCH && oldestWaitedMicros < MAX_WAIT_MICROS) return false;
  if (dryRun || !ledgerDir) return true;

  // Pacioli numbers rows in arrival order; these come right after the rows so far
  const ledger = ledgerRows(ctx);
  const rowsSoFar = ledger.length;
  const events: PromptEvent[] = waiting.map((e, i) => ({
    row: rowsSoFar + i + 1,
    id: e.id.toString(),
    source: e.source,
    kind: e.kind,
    date: e.occurredAt.toDate().toISOString().slice(0, 10),
    amount_cents: e.amountMinor.toString(),
    currency: e.currency,
    counterparty: e.counterparty,
    description: e.description,
    reference: e.reference ?? null,
  }));
  // The rows and QuickBooks documents each new event should be compared with
  const fresh: MatchRow[] = events.map(e => ({ ...e, event_id: e.id, amount_cents: Number(e.amount_cents) }));
  const related = findRelated(fresh, ledger);
  const rowById = new Map([...ledger, ...fresh].map(r => [r.event_id, r.row]));
  const documents = documentsForMatching(ctx, id => rowById.get(id.toString()));
  const named = docsFor(fresh, documents);
  const vendorBills = vendorBillCounts(fresh, documents);
  for (const e of events) {
    e.related_rows = related.get(e.id) ?? [];
    e.documents = named.get(e.id) ?? [];
    e.vendor_bills = vendorBills.get(e.id) ?? 0;
  }
  const relatedRows = new Set(events.flatMap(e => e.related_rows ?? []));
  const namedDocs = new Set(events.flatMap(e => e.documents ?? []));
  const context = {
    rows: ledger.filter(r => relatedRows.has(r.row)),
    documents: documents.filter(d => namedDocs.has(d.doc.toUpperCase())),
  };
  const decisions: PromptDecision[] = decided.map(r => ({
    event_id: r.eventId.toString(),
    action: r.decision ?? 'keep',
    note: r.resultNote ?? '',
  }));

  // 'high': below that, Droid pauses for a person to approve risky steps (e.g. any
  // file delete), and over the REST API nobody can, so the run hangs. It works
  // alone on its own sandboxed computer, in /home/factory-user/settle.
  const taskId = enqueueAgentTask(
    ctx,
    'pipeline',
    buildPrompt(
      events,
      decisions,
      ledgerDir,
      messages.map(m => ({ id: promptId(m), text: m.text })),
      currentClassifying(ctx),
      patternsForPrompt(ctx),
      overdueInvoices(ctx),
      context
    ),
    'high'
  );
  const run = ctx.db.agentRun.insert({
    id: 0n,
    taskId,
    eventIds: waiting.map(e => e.id),
    reviewItemIds: decided.map(r => r.id),
    status: 'running',
    summary: undefined,
    error: undefined,
    startedAt: ctx.timestamp,
    finishedAt: undefined,
  });
  markSent(ctx, messages, run.id);
  for (const e of waiting) {
    ctx.db.eventReview.insert({
      eventId: e.id,
      runId: run.id,
      status: 'processing',
      outcome: undefined,
      category: undefined,
      note: undefined,
      updatedAt: ctx.timestamp,
    });
  }
  // resetLedger stays set until a run succeeds, so a failed reset run is retried
  updateAgent(ctx, { status: 'running', currentRunId: run.id, lastError: undefined });
  return true;
}

interface ReviewWriteUp {
  title?: string;
  what_happened?: string;
  evidence?: string[];
  action?: string;
  fix?: string;
  question?: string;
  follow_up_to?: string | null;
  follow_up_subject?: string | null;
  follow_up_message?: string | null;
}

interface Decision {
  event_id: string;
  // 'ok' | 'void' | 'review' | 'follow_up' (email them now; only when a pattern allows it)
  status: string;
  // The pattern that allowed a follow_up, like "p3"
  pattern?: string | null;
  // The QuickBooks bill or invoice number this bank or Stripe row pays
  pays?: string | null;
  category?: string;
  note?: string;
  duplicate_of?: string | null;
  review?: ReviewWriteUp | null;
  // Older reply shape, still accepted
  recommendation?: string | null;
  question?: string;
  reason?: string;
}

// The reply should be pure JSON; tolerate a code fence or a stray sentence around it.
// An existing row a team message asked the agent to change
interface Change {
  event_id: string;
  status?: string;
  category?: string;
  note?: string;
}

type Reminder = { invoice?: unknown; pattern?: unknown; message?: unknown };
type Reply = {
  summary: string;
  decisions: Decision[];
  changes: Change[];
  messages: unknown;
  patterns_used?: unknown;
  reminders?: Reminder[];
};

function parseReply(text: string | undefined): Reply {
  if (!text) throw new Error('Agent finished without a reply');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`Agent reply was not JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as Partial<Reply>;
  if (!Array.isArray(parsed.decisions)) throw new Error('Agent reply had no decisions list');
  return {
    summary: parsed.summary ?? '',
    decisions: parsed.decisions,
    changes: Array.isArray(parsed.changes) ? parsed.changes : [],
    messages: parsed.messages,
    patterns_used: parsed.patterns_used,
    reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
  };
}

function toId(value: string | null | undefined): bigint | undefined {
  if (value === null || value === undefined || !/^\d+$/.test(String(value))) return undefined;
  return BigInt(value);
}

// Check and apply Droid's decisions: our tables only take valid values.
// Rows a team message changed. Only the review's outcome, category and note
// move; a row that becomes "review" this way keeps any question it had.
const CHANGE_OUTCOME: Record<string, string> = { ok: 'ok', void: 'void', review: 'review', refunded: 'ok', following_up: 'review' };

function applyChanges(ctx: Ctx, changes: Change[]) {
  for (const c of changes) {
    const id = toId(String(c.event_id));
    const review = id === undefined ? undefined : ctx.db.eventReview.eventId.find(id);
    if (!review || review.status !== 'done') continue;
    ctx.db.eventReview.eventId.update({
      ...review,
      outcome: (c.status && CHANGE_OUTCOME[c.status]) ?? review.outcome,
      category: typeof c.category === 'string' && c.category ? clip(c.category, 120) : review.category,
      note: typeof c.note === 'string' ? clip(c.note, 300) : review.note,
      updatedAt: ctx.timestamp,
    });
  }
}

// The Bookkeeper may email a vendor itself, but only when an active pattern
// says to, for an outside party, not for money that left twice, and a few per
// run. Anything else goes to a person instead.
function emailAllowed(ctx: Ctx, d: Decision): string | null {
  const r = d.review ?? {};
  const m = typeof d.pattern === 'string' ? /^p(\d+)$/.exec(d.pattern) : null;
  const pattern = m ? ctx.db.pattern.id.find(BigInt(m[1])) : undefined;
  if (!pattern || pattern.status !== 'active') return null;
  if (!clip(r.follow_up_to, 120) || !clip(r.follow_up_message, 2000)) return null;
  if (toId(d.duplicate_of) !== undefined) return null;
  return pattern.text;
}

// An event's ledger row number while its run is applied: rows are numbered in
// event order, counting this run's events as if already done
function rowOf(ctx: Ctx, run: Run, eventId: bigint): number {
  let row = 1;
  for (const r of ctx.db.eventReview.iter()) {
    if (r.eventId < eventId && (r.status === 'done' || r.runId === run.id)) row++;
  }
  return row;
}

// Returns the review items the Bookkeeper decided to email about (problems
// and invoice reminders), to send after this transaction.
function applyDecisions(ctx: Ctx, run: Run, reply: Reply): bigint[] {
  const { summary, decisions } = reply;
  const autoEmails: bigint[] = [];
  applyChanges(ctx, reply.changes);
  finishMessages(ctx, run.id, reply.messages);
  recordPatternUses(ctx, reply.patterns_used);
  const inRun = new Set(run.eventIds.map(String));
  const seen = new Set<string>();

  for (const d of decisions) {
    const id = String(d.event_id);
    if (!inRun.has(id) || seen.has(id)) continue;
    seen.add(id);
    // An email the Bookkeeper wants to send itself, if a pattern allows it
    const emailBecause = d.status === 'follow_up' && autoEmails.length < MAX_AUTO_EMAILS ? emailAllowed(ctx, d) : null;
    // Either way the write-up is an email (sent now, or drafted for a person to send)
    if (d.status === 'follow_up') d.review = { ...(d.review ?? {}), action: 'follow_up' };
    let outcome = (OUTCOMES as readonly string[]).includes(d.status) ? d.status : 'review';
    // The bill or invoice this row pays: as the Bookkeeper said, as the bank memo quotes it,
    // or the open bill from that vendor for exactly that amount
    const event = ctx.db.inboundEvent.id.find(BigInt(id));
    const pays = clip(d.pays, 40) || (event && (billInMemo(ctx, event) || invoiceInMemo(ctx, event) || openBillFor(ctx, event))) || undefined;
    const row = (eventId: bigint) => rowOf(ctx, run, eventId);
    // Pacioli's own checks: an overpaid bill, a bill paid twice, or a large or
    // unknown payment with no bill goes to a person, even when the Bookkeeper let it through
    const caught = event && outcome === 'ok' ? (checkPayment(ctx, event, pays, row) ?? checkNoBill(ctx, event, pays, row)) : undefined;
    if (caught) {
      outcome = 'review';
      d.review = caught.review;
      d.note = caught.review.title;
      d.duplicate_of = 'duplicateOf' in caught ? (caught.duplicateOf?.toString() ?? null) : null;
    }
    if (event && outcome !== 'void') {
      // A bill for money we already paid with no bill: linked, not paid again
      const paidBy = linkLateBill(ctx, event);
      if (paidBy !== undefined) d.note = `${d.note ? `${d.note} · ` : ''}Already paid by row ${row(paidBy)}, which had no bill`;
      // Money that left with no bill: an expense in QuickBooks, no bill on file
      if (isNoBillPayment(ctx, event, pays)) recordExpense(ctx, event, d.category);
    }
    const review = ctx.db.eventReview.eventId.find(BigInt(id));
    if (review) {
      ctx.db.eventReview.eventId.update({
        ...review,
        status: 'done',
        outcome,
        category: d.category,
        note: d.note,
        updatedAt: ctx.timestamp,
      });
    }
    // A bank or Stripe row that pays a bill (or a sponsor paying an invoice): record it in QuickBooks
    if (outcome !== 'void') recordPayment(ctx, BigInt(id), pays);
    if (outcome === 'review') {
      const r = d.review ?? {};
      const action = normalizeAction(r.action ?? d.recommendation);
      const whatHappened = clip(r.what_happened ?? d.reason ?? d.note, 600);
      const item = ctx.db.reviewItem.insert({
        id: 0n,
        eventId: BigInt(id),
        runId: run.id,
        question: clip(r.question ?? d.question, 300) || 'Does this look right?',
        reason: whatHappened,
        recommendation: action,
        // Not shown to people; kept for the table shape
        confidence: 0,
        duplicateOf: toId(d.duplicate_of),
        // Emailed by the Bookkeeper: already decided (it wrote the row as following up)
        status: emailBecause ? 'applied' : 'open',
        decision: emailBecause ? 'follow_up' : undefined,
        decidedBy: undefined,
        decidedAt: emailBecause ? ctx.timestamp : undefined,
        resultNote: emailBecause ? `Emailed by the Bookkeeper, following the pattern "${clip(emailBecause, 200)}"` : undefined,
        createdAt: ctx.timestamp,
      });
      if (emailBecause) autoEmails.push(item.id);
      const evidence = Array.isArray(r.evidence) ? r.evidence.map(e => clip(e, 200)).filter(Boolean).slice(0, 6) : [];
      const isFollowUp = action === 'follow_up';
      ctx.db.reviewDetail.insert({
        itemId: item.id,
        title: clip(r.title, 120) || clip(d.note, 120) || 'Needs a look',
        whatHappened,
        evidence: JSON.stringify(evidence),
        fix: clip(r.fix, 400),
        followUpTo: isFollowUp ? clip(r.follow_up_to, 120) || undefined : undefined,
        followUpSubject: isFollowUp ? clip(r.follow_up_subject, 160) || undefined : undefined,
        followUpMessage: isFollowUp ? clip(r.follow_up_message, 2000) || undefined : undefined,
      });
    }
  }

  // Anything Droid skipped goes to a person rather than silently passing
  for (const eventId of run.eventIds) {
    if (seen.has(eventId.toString())) continue;
    const review = ctx.db.eventReview.eventId.find(eventId);
    if (review) {
      ctx.db.eventReview.eventId.update({ ...review, status: 'done', outcome: 'review', updatedAt: ctx.timestamp });
    }
    ctx.db.reviewItem.insert({
      id: 0n,
      eventId,
      runId: run.id,
      question: 'The agent returned no decision for this event. Does it look right?',
      reason: 'Missing from the agent reply',
      recommendation: 'keep',
      confidence: 0,
      duplicateOf: undefined,
      status: 'open',  // the agent's reply skipped this event
      decision: undefined,
      decidedBy: undefined,
      decidedAt: undefined,
      resultNote: undefined,
      createdAt: ctx.timestamp,
    });
  }

  for (const itemId of run.reviewItemIds) {
    const item = ctx.db.reviewItem.id.find(itemId);
    if (item) ctx.db.reviewItem.id.update({ ...item, status: 'applied' });
  }

  // Overdue invoices it decided to remind, each allowed by a pattern
  let reminders = 0;
  for (const r of reply.reminders ?? []) {
    if (reminders >= MAX_AUTO_REMINDERS || typeof r.invoice !== 'string') continue;
    const m = typeof r.pattern === 'string' ? /^p(\d+)$/.exec(r.pattern) : null;
    const pattern = m ? ctx.db.pattern.id.find(BigInt(m[1])) : undefined;
    if (!pattern || pattern.status !== 'active') continue;
    try {
      const made = createReminder(
        ctx,
        r.invoice,
        typeof r.message === 'string' ? clip(r.message, 2000) : undefined,
        `Reminded by the Bookkeeper, following the pattern "${clip(pattern.text, 200)}"`
      );
      autoEmails.push(made.itemId);
      reminders++;
    } catch {
      // already paid, already being reminded, or not an invoice: skip it
    }
  }

  ctx.db.agentRun.id.update({ ...run, status: 'done', summary, finishedAt: ctx.timestamp });
  updateAgent(ctx, { status: 'idle', currentRunId: undefined, resetLedger: false });
  return autoEmails;
}

// While a run works, its "CLASSIFY <id> | <category> | <status>" lines show up
// as Droid's steps. Copy each category onto the event's review so people see
// it live; the final reply still decides.
const CLASSIFY_LINE = /CLASSIFY\s+(\d+)\s*\|\s*([^|\n]+?)\s*\|\s*(ok|void|review)/gi;

function showLiveClassifications(ctx: Ctx, run: Run) {
  const inRun = new Set(run.eventIds.map(String));
  for (const step of ctx.db.agentStep.taskId.filter(run.taskId)) {
    if (step.kind !== 'text' || !step.text.includes('CLASSIFY')) continue;
    for (const m of step.text.matchAll(CLASSIFY_LINE)) {
      if (!inRun.has(m[1])) continue;
      const review = ctx.db.eventReview.eventId.find(BigInt(m[1]));
      const category = clip(m[2], 120);
      if (!review || review.status !== 'processing' || review.category === category) continue;
      ctx.db.eventReview.eventId.update({ ...review, category, updatedAt: ctx.timestamp });
    }
  }
}

// ─── The ledger workbook ────────────────────────────────────────────────────

type Render = NonNullable<ReturnType<Ctx['db']['ledgerRender']['id']['find']>>;
const RENDER_EVERY_MICROS = 10n * 60_000_000n;

function renderState(ctx: Ctx): Render {
  return (
    ctx.db.ledgerRender.id.find(0) ??
    ctx.db.ledgerRender.insert({
      id: 0,
      status: 'idle',
      taskId: undefined,
      requested: false,
      pendingRunId: 0n,
      renderedRunId: 0n,
      renderedAt: undefined,
      sessionId: undefined,
      lastError: undefined,
    })
  );
}

function updateRender(ctx: Ctx, patch: Partial<Render>) {
  ctx.db.ledgerRender.id.update({ ...renderState(ctx), ...patch });
}

// One step of the workbook build, between Bookkeeper runs. Returns true while
// a build is running (the next Bookkeeper run waits for it, so the render
// never reads ledger.json while the Bookkeeper is writing it).
function renderTick(ctx: PCtx): boolean {
  const snap = ctx.withTx(tx => {
    const r = renderState(tx);
    const task = r.taskId === undefined ? undefined : (tx.db.agentTask.id.find(r.taskId) ?? undefined);
    const doc = tx.db.ledgerDocument.id.find(0);
    const toolReady = tx.db.toolInstall.path.find(RENDER_PATH)?.version === RENDER_VERSION;
    return { r, task, doc, toolReady };
  });
  const { r, task, doc } = snap;

  if (r.status === 'running') {
    if (!task || STOPPED_TASK.includes(task.status)) {
      ctx.withTx(tx => updateRender(tx, { status: 'idle', taskId: undefined, lastError: task?.error ?? 'Build stopped' }));
      return false;
    }
    if (task.status !== 'done') return true;
    // Keep the rendered page too (for the record); the board doesn't need it
    let html: string | undefined;
    try {
      const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
      const dir = ctx.withTx(tx => latestFiles(tx)?.renderDir);
      const res = ctx.http.fetch(factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, task.sessionId!, dir ? relative(dir, 'ledger.html') : LEDGER_HTML));
      if (res.status === 200) html = res.text().slice(0, MAX_HTML_CHARS);
    } catch {
      // the .xlsx is what matters
    }
    ctx.withTx(tx => {
      const d = tx.db.ledgerDocument.id.find(0);
      if (d && html !== undefined) tx.db.ledgerDocument.id.update({ ...d, html });
      updateRender(tx, {
        status: 'idle',
        taskId: undefined,
        renderedRunId: r.pendingRunId,
        renderedAt: tx.timestamp,
        sessionId: task.sessionId,
        lastError: undefined,
      });
    });
    return false;
  }

  if (!doc || !snap.toolReady || doc.runId === r.renderedRunId) {
    if (r.requested && doc && doc.runId === r.renderedRunId) ctx.withTx(tx => updateRender(tx, { requested: false }));
    return false;
  }
  const stale =
    !r.renderedAt || ctx.timestamp.microsSinceUnixEpoch - r.renderedAt.microsSinceUnixEpoch >= RENDER_EVERY_MICROS;
  if (!r.requested && !stale) return false;
  const dir = uploadSnapshot(ctx);
  ctx.withTx(tx => {
    const taskId = enqueueAgentTask(tx, 'render', buildRenderPrompt(dir), 'high');
    setRenderDir(tx, dir);
    updateRender(tx, { status: 'running', taskId, requested: false, pendingRunId: doc.runId, lastError: undefined });
  });
  return true;
}

// The run didn't produce usable results: put its events back in the queue.
function failRun(ctx: Ctx, run: Run, error: string) {
  for (const eventId of run.eventIds) ctx.db.eventReview.eventId.delete(eventId);
  requeueMessages(ctx, run.id);
  ctx.db.agentRun.id.update({ ...run, status: 'failed', error, finishedAt: ctx.timestamp });
  updateAgent(ctx, { status: 'idle', currentRunId: undefined, lastError: error });
}

// ─── Exports ────────────────────────────────────────────────────────────────

export function pipeline(stdb: Schema) {
  const pipelineTick = stdb.procedure(
    { onSchedule: pipelineTickSchedule },
    { arg: pipelineTickSchedule.rowType },
    t.unit(),
    ctx => {
      // The reports agent runs alongside the Bookkeeper
      try {
        reportsTick(ctx);
      } catch (err) {
        console.warn(`reports: ${message(err)}`);
      }
      // So does the pattern learner
      let learning = false;
      try {
        learning = learnTick(ctx);
      } catch (err) {
        console.warn(`learn: ${message(err)}`);
      }

      const snap = ctx.withTx(tx => {
        const agent = agentState(tx);
        const run = agent.currentRunId === undefined ? undefined : tx.db.agentRun.id.find(agent.currentRunId);
        if (agent.currentRunId !== undefined && !run) updateAgent(tx, { status: 'idle', currentRunId: undefined });
        const task: Task | undefined = (run && tx.db.agentTask.id.find(run.taskId)) ?? undefined;
        return { agent, run, task };
      });

      // A run is in flight: finish it once Droid is done, otherwise wait
      if (snap.run && snap.task) {
        const { run, task } = snap;
        if (task.status !== 'done' && !STOPPED_TASK.includes(task.status)) {
          ctx.withTx(tx => showLiveClassifications(tx, run));
        }
        if (STOPPED_TASK.includes(task.status)) {
          ctx.withTx(tx => failRun(tx, run, task.error ?? `Droid task ${task.status}`));
        } else if (task.status === 'done') {
          let parsed: ReturnType<typeof parseReply>;
          try {
            parsed = parseReply(task.result);
          } catch (err) {
            ctx.withTx(tx => failRun(tx, run, message(err)));
            return {};
          }
          const autoEmails = ctx.withTx(tx => applyDecisions(tx, run, parsed));
          // Send the emails the Bookkeeper decided on (allowed by a pattern), and log them
          for (const itemId of autoEmails) {
            try {
              startFollowUp(ctx, itemId);
              ctx.withTx(tx => {
                const item = tx.db.reviewItem.id.find(itemId);
                const detail = tx.db.reviewDetail.itemId.find(itemId);
                if (!item) return;
                logAction(
                  tx,
                  ctx.sender,
                  'email',
                  `Emailed ${detail?.followUpTo ?? 'the vendor'} about "${detail?.title ?? item.question}" (${item.resultNote ?? 'a pattern allowed it'})`,
                  { eventId: item.eventId, whoName: 'Bookkeeper' }
                );
              });
            } catch (err) {
              console.warn(`auto email ${itemId}: ${message(err)}`);
            }
          }

          // The ledger changed. No render here: the board draws it live, and the
          // workbook is built when someone needs it (renderTick)
          ctx.withTx(tx => {
            const prev = tx.db.ledgerDocument.id.find(0);
            const doc = { id: 0, html: prev?.html ?? '', runId: run.id, updatedAt: tx.timestamp };
            if (prev) tx.db.ledgerDocument.id.update(doc);
            else tx.db.ledgerDocument.insert(doc);
          });
        }
        return {};
      }

      // Make sure the agent's tools are on the computer before handing it work
      const missing = ctx.withTx(tx =>
        agentState(tx).enabled ||
        tx.db.reportState.id.find(0)?.requested ||
        queuedFor(tx, 'main').length ||
        tx.db.ledgerRender.id.find(0)?.requested
          ? TOOLS.filter(tool => tx.db.toolInstall.path.find(tool.path)?.version !== tool.version)
          : []
      );
      if (missing.length) {
        try {
          const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
          const computerId = ctx.env.FACTORY_COMPUTER_ID;
          factory.wakeComputer(computerId);
          const sessionId = factory.createSession(computerId, { autonomyLevel: 'off' });
          for (const tool of missing) {
            try {
              factory.uploadTextFile(computerId, sessionId, tool.path, tool.script);
            } catch (err) {
              // The name carries the version, so an existing file is this version
              if (!(err instanceof FactoryError && err.status === 409)) throw err;
            }
            ctx.withTx(tx => {
              const row = { path: tool.path, version: tool.version, installedAt: tx.timestamp };
              if (tx.db.toolInstall.path.find(tool.path)) tx.db.toolInstall.path.update(row);
              else tx.db.toolInstall.insert(row);
            });
          }
          ctx.withTx(tx => updateAgent(tx, { lastError: undefined }));
        } catch (err) {
          // Retried on the next tick; a fresh session can briefly 404
          ctx.withTx(tx => updateAgent(tx, { lastError: `Installing tools: ${message(err)}` }));
        }
        return {};
      }

      // Build the workbook if it's asked for (or stale), before the next run
      let rendering = false;
      try {
        rendering = renderTick(ctx);
      } catch (err) {
        console.warn(`render: ${message(err)}`);
      }
      if (rendering) return {};

      // A run is due: write a fresh ledger snapshot for it, then start it
      let started = false;
      if (ctx.withTx(tx => startRun(tx, undefined, true))) {
        try {
          const dir = uploadSnapshot(ctx);
          started = ctx.withTx(tx => startRun(tx, dir));
        } catch (err) {
          ctx.withTx(tx => updateAgent(tx, { lastError: `Ledger snapshot: ${message(err)}` }));
        }
      }
      const reportRunning = ctx.withTx(tx => {
        const report = tx.db.reportState.id.find(0);
        return report?.status === 'running' || !!report?.requested;
      });
      const renderWanted = ctx.withTx(tx => !!tx.db.ledgerRender.id.find(0)?.requested);
      if (!started && !snap.agent.enabled && !reportRunning && !learning && !renderWanted) {
        ctx.withTx(tx => {
          for (const row of [...tx.db.pipelineTickSchedule.iter()]) {
            tx.db.pipelineTickSchedule.scheduledId.delete(row.scheduledId);
          }
        });
      }
      return {};
    }
  );

  // A person's call on a flagged item. Refund issues a real Stripe (test) refund
  // now; the agent folds every decision into the ledger on its next run.
  const resolveReviewItem = stdb.procedure(
    { itemId: t.u64(), action: t.string() },
    t.string(),
    (ctx, { itemId, action }) => {
      if (!(HUMAN_ACTIONS as readonly string[]).includes(action)) {
        throw new SenderError(`Action must be one of ${HUMAN_ACTIONS.join(', ')}`);
      }
      const { item, event } = ctx.withTx(tx => {
        const item = tx.db.reviewItem.id.find(itemId);
        return { item, event: item && tx.db.inboundEvent.id.find(item.eventId) };
      });
      if (!item) throw new SenderError('Item not found');
      if (item.status !== 'open') throw new SenderError('This item has already been decided');

      let resultNote = '';
      if (action === 'refund') {
        const charge = event?.reference;
        if (event?.source !== 'stripe' || !charge?.startsWith('ch_')) {
          throw new SenderError('Only Stripe charges can be refunded');
        }
        const res = ctx.http.fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${ctx.env.STRIPE_SECRET_KEY ?? ''}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `charge=${encodeURIComponent(charge)}&reason=requested_by_customer`,
        });
        const body = JSON.parse(res.text()) as { id?: string; amount?: number; error?: { message: string } };
        if (res.status !== 200 || !body.id) throw new SenderError(`Stripe: ${body.error?.message ?? res.status}`);
        resultNote = `Refunded ${((body.amount ?? 0) / 100).toFixed(2)} USD on Stripe (${body.id})`;
      }

      ctx.withTx(tx => {
        const current = tx.db.reviewItem.id.find(itemId);
        if (!current || current.status !== 'open') throw new SenderError('This item has already been decided');
        tx.db.reviewItem.id.update({
          ...current,
          status: 'decided',
          decision: action,
          decidedBy: ctx.sender,
          decidedAt: tx.timestamp,
          resultNote: resultNote || undefined,
        });
        // The audit log: what was chosen against what the Bookkeeper suggested
        const detail = tx.db.reviewDetail.itemId.find(itemId);
        const review = tx.db.eventReview.eventId.find(current.eventId);
        const title = detail?.title ?? current.question;
        const agreed = action === current.recommendation;
        logAction(
          tx,
          ctx.sender,
          'decision',
          `Chose ${DECISION_LABEL[action] ?? action} on "${title}"${agreed ? ' (as the Bookkeeper suggested)' : ` (the Bookkeeper suggested ${DECISION_LABEL[current.recommendation] ?? current.recommendation})`}`,
          {
            eventId: current.eventId,
            learnable: true,
            details: {
              chosen: action,
              suggested: current.recommendation,
              counterparty: event?.counterparty,
              amount: event ? Number(event.amountMinor) / 100 : undefined,
              source: event?.source,
              category: review?.category,
            },
          }
        );
        ensureTicking(tx);
      });

      // Follow up: email the counterparty now; AgentMail keeps nudging until they reply
      if (action === 'follow_up') {
        const sent = startFollowUp(ctx, itemId);
        ctx.withTx(tx => {
          const current = tx.db.reviewItem.id.find(itemId);
          if (current) tx.db.reviewItem.id.update({ ...current, resultNote: sent });
        });
        return sent;
      }
      return resultNote || `Marked ${action}`;
    }
  );

  // A fresh download link for the .xlsx workbook the agent last wrote.
  // A fresh link to the last built workbook
  const ledgerXlsxUrl = stdb.procedure(t.string(), ctx => {
    const { sessionId, dir } = ctx.withTx(tx => ({
      sessionId: tx.db.ledgerRender.id.find(0)?.sessionId,
      dir: latestFiles(tx)?.renderDir,
    }));
    if (!sessionId) throw new SenderError('The workbook has not been built yet');
    const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
    return factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, sessionId, dir ? relative(dir, 'ledger.xlsx') : LEDGER_XLSX);
  });

  // Build the workbook from the latest ledger (between Bookkeeper runs)
  const requestLedgerRender = stdb.reducer(ctx => {
    updateRender(ctx, { requested: true });
    ensureTicking(ctx);
  });

  return { pipelineTick, resolveReviewItem, ledgerXlsxUrl, requestLedgerRender, ...reports(stdb, ensureTicking) };
}
