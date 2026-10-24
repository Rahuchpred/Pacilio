import { ScheduleAt, SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { enqueueAgentTask } from '../droid/agents';
import { FactoryClient, FactoryError } from '../droid/factory';
import { LEDGER_HTML, LEDGER_XLSX, buildPrompt, type PromptDecision, type PromptEvent } from './prompt';
import { RENDER_PATH, RENDER_SCRIPT, RENDER_VERSION } from './renderScript';
import { pipelineTickSchedule } from './tables';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Run = NonNullable<ReturnType<Ctx['db']['agentRun']['id']['find']>>;
type Task = NonNullable<ReturnType<Ctx['db']['agentTask']['id']['find']>>;
type AgentState = NonNullable<ReturnType<Ctx['db']['pipelineAgent']['id']['find']>>;

const TICK_INTERVAL_MICROS = 3_000_000n;
// Each run has a fixed startup cost, so moderate batches keep up with the sources
const BATCH_SIZE = 15;
// Don't spend a run's startup cost on one or two events: wait for a batch,
// unless the oldest waiting event has waited long enough
const MIN_BATCH = 8;
const MAX_WAIT_MICROS = 20_000_000n;
const MAX_HTML_CHARS = 2_000_000;

const OUTCOMES = ['ok', 'void', 'review'] as const;
const RECOMMENDATIONS = ['void', 'refund', 'chase', 'keep'] as const;
// What a person can choose in the queue (chase arrives with email follow-ups)
const HUMAN_ACTIONS = ['void', 'refund', 'keep'] as const;
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

function ensureTicking(ctx: Ctx) {
  for (const _ of ctx.db.pipelineTickSchedule.iter()) return;
  ctx.db.pipelineTickSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_INTERVAL_MICROS) });
}

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
  for (const r of [...ctx.db.ledgerDocument.iter()]) ctx.db.ledgerDocument.id.delete(r.id);
  updateAgent(ctx, { status: 'idle', currentRunId: undefined, lastError: undefined, resetLedger: true });
}

// ─── Runs ───────────────────────────────────────────────────────────────────

// Hand the waiting events (and any human decisions) to Droid, if there are any.
function startRun(ctx: Ctx): boolean {
  const agent = agentState(ctx);
  if (!agent.enabled || agent.currentRunId !== undefined) return false;

  const waiting = [...ctx.db.inboundEvent.iter()]
    .filter(e => !ctx.db.eventReview.eventId.find(e.id))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(0, BATCH_SIZE);
  const decided = [...ctx.db.reviewItem.iter()].filter(r => r.status === 'decided');
  // A pending reset rides along with the first real batch rather than holding
  // the agent in an empty run while new events pile up
  if (!waiting.length && !decided.length) return false;
  const oldestWaitedMicros = waiting.length
    ? ctx.timestamp.microsSinceUnixEpoch - waiting[0].receivedAt.microsSinceUnixEpoch
    : 0n;
  if (!decided.length && waiting.length < MIN_BATCH && oldestWaitedMicros < MAX_WAIT_MICROS) return false;

  const events: PromptEvent[] = waiting.map(e => ({
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
  const decisions: PromptDecision[] = decided.map(r => ({
    event_id: r.eventId.toString(),
    action: r.decision ?? 'keep',
    note: r.resultNote ?? '',
  }));

  // 'high': below that, Droid pauses for a person to approve risky steps (e.g. any
  // file delete), and over the REST API nobody can, so the run hangs. It works
  // alone on its own sandboxed computer, in /home/factory-user/settle.
  const taskId = enqueueAgentTask(ctx, 'pipeline', buildPrompt(events, decisions, agent.resetLedger), 'high');
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

interface Decision {
  event_id: string;
  status: string;
  category?: string;
  note?: string;
  duplicate_of?: string | null;
  recommendation?: string | null;
  confidence?: number;
  question?: string;
  reason?: string;
}

// The reply should be pure JSON; tolerate a code fence or a stray sentence around it.
function parseReply(text: string | undefined): { summary: string; decisions: Decision[] } {
  if (!text) throw new Error('Agent finished without a reply');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error(`Agent reply was not JSON: ${text.slice(0, 200)}`);
  const parsed = JSON.parse(text.slice(start, end + 1)) as { summary?: string; decisions?: Decision[] };
  if (!Array.isArray(parsed.decisions)) throw new Error('Agent reply had no decisions list');
  return { summary: parsed.summary ?? '', decisions: parsed.decisions };
}

function toId(value: string | null | undefined): bigint | undefined {
  if (value === null || value === undefined || !/^\d+$/.test(String(value))) return undefined;
  return BigInt(value);
}

// Check and apply Droid's decisions: our tables only take valid values.
function applyDecisions(ctx: Ctx, run: Run, summary: string, decisions: Decision[]) {
  const inRun = new Set(run.eventIds.map(String));
  const seen = new Set<string>();

  for (const d of decisions) {
    const id = String(d.event_id);
    if (!inRun.has(id) || seen.has(id)) continue;
    seen.add(id);
    const outcome = (OUTCOMES as readonly string[]).includes(d.status) ? d.status : 'review';
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
    if (outcome === 'review') {
      const recommendation = (RECOMMENDATIONS as readonly string[]).includes(d.recommendation ?? '')
        ? (d.recommendation as string)
        : 'keep';
      ctx.db.reviewItem.insert({
        id: 0n,
        eventId: BigInt(id),
        runId: run.id,
        question: d.question || d.note || 'Does this look right?',
        reason: d.reason || d.note || '',
        recommendation,
        confidence: Math.min(1, Math.max(0, Number(d.confidence) || 0)),
        duplicateOf: toId(d.duplicate_of),
        status: 'open',
        decision: undefined,
        decidedBy: undefined,
        decidedAt: undefined,
        resultNote: undefined,
        createdAt: ctx.timestamp,
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
      status: 'open',
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

  ctx.db.agentRun.id.update({ ...run, status: 'done', summary, finishedAt: ctx.timestamp });
  updateAgent(ctx, { status: 'idle', currentRunId: undefined, resetLedger: false });
}

// The run didn't produce usable results: put its events back in the queue.
function failRun(ctx: Ctx, run: Run, error: string) {
  for (const eventId of run.eventIds) ctx.db.eventReview.eventId.delete(eventId);
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
          ctx.withTx(tx => applyDecisions(tx, run, parsed.summary, parsed.decisions));

          // Bring the spreadsheet Droid rendered back for every browser to show
          try {
            const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
            const url = factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, task.sessionId!, LEDGER_HTML);
            const res = ctx.http.fetch(url);
            if (res.status !== 200) throw new Error(`Ledger download returned ${res.status}`);
            const html = res.text().slice(0, MAX_HTML_CHARS);
            ctx.withTx(tx => {
              const doc = { id: 0, html, runId: run.id, updatedAt: tx.timestamp };
              if (tx.db.ledgerDocument.id.find(0)) tx.db.ledgerDocument.id.update(doc);
              else tx.db.ledgerDocument.insert(doc);
            });
          } catch (err) {
            ctx.withTx(tx => updateAgent(tx, { lastError: `Ledger: ${message(err)}` }));
          }
        }
        return {};
      }

      // Make sure the agent's tools are on the computer before handing it work
      const needsInstall = ctx.withTx(
        tx => agentState(tx).enabled && tx.db.toolInstall.path.find(RENDER_PATH)?.version !== RENDER_VERSION
      );
      if (needsInstall) {
        try {
          const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
          const computerId = ctx.env.FACTORY_COMPUTER_ID;
          factory.wakeComputer(computerId);
          const sessionId = factory.createSession(computerId, { autonomyLevel: 'off' });
          try {
            factory.uploadTextFile(computerId, sessionId, RENDER_PATH, RENDER_SCRIPT);
          } catch (err) {
            // The name carries the version, so an existing file is this version
            if (!(err instanceof FactoryError && err.status === 409)) throw err;
          }
          ctx.withTx(tx => {
            const row = { path: RENDER_PATH, version: RENDER_VERSION, installedAt: tx.timestamp };
            if (tx.db.toolInstall.path.find(RENDER_PATH)) tx.db.toolInstall.path.update(row);
            else tx.db.toolInstall.insert(row);
            updateAgent(tx, { lastError: undefined });
          });
        } catch (err) {
          // Retried on the next tick; a fresh session can briefly 404
          ctx.withTx(tx => updateAgent(tx, { lastError: `Installing ${RENDER_PATH}: ${message(err)}` }));
        }
        return {};
      }

      const started = ctx.withTx(tx => startRun(tx));
      if (!started && !snap.agent.enabled) {
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
        ensureTicking(tx);
      });
      return resultNote || `Marked ${action}`;
    }
  );

  // A fresh download link for the .xlsx workbook the agent last wrote.
  const ledgerXlsxUrl = stdb.procedure(t.string(), ctx => {
    const sessionId = ctx.withTx(tx => {
      const doc = tx.db.ledgerDocument.id.find(0);
      const run = doc && tx.db.agentRun.id.find(doc.runId);
      return (run && tx.db.agentTask.id.find(run.taskId)?.sessionId) ?? undefined;
    });
    if (!sessionId) throw new SenderError('The agent has not written the workbook yet');
    const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
    return factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, sessionId, LEDGER_XLSX);
  });

  return { pipelineTick, resolveReviewItem, ledgerXlsxUrl };
}
