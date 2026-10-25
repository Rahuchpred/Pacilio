import { SenderError, t, type InferSchema, type ProcedureCtx, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { enqueueAgentTask } from '../droid/agents';
import { FactoryClient } from '../droid/factory';
import { REPORT_PATH, REPORT_VERSION } from './reportScript';

// The reports agent: every REPORT_EVERY_MICROS while the pipeline runs (and
// only if the ledger changed), or when someone presses Refresh, Droid runs the
// fixed report tool over the settled ledger rows and writes the takeaways.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type PCtx = ProcedureCtx<InferSchema<Schema>>;
type State = NonNullable<ReturnType<Ctx['db']['reportState']['id']['find']>>;

const REPORT_EVERY_MICROS = 10n * 60_000_000n;
const WORKDIR = '/home/factory-user/settle';
const REPORT_CMD = `python3 /home/factory-user/${REPORT_PATH} ${WORKDIR}`;
const MAX_HTML_CHARS = 2_000_000;

function state(ctx: Ctx): State {
  return (
    ctx.db.reportState.id.find(0) ??
    ctx.db.reportState.insert({
      id: 0,
      status: 'idle',
      taskId: undefined,
      requested: false,
      ledgerRunId: 0n,
      lastStartedAt: undefined,
      lastError: undefined,
    })
  );
}

function update(ctx: Ctx, patch: Partial<State>) {
  ctx.db.reportState.id.update({ ...state(ctx), ...patch });
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function buildReportPrompt(): string {
  return `You are Settle's reports agent for a concert promoter's Oct 24 show.
Work quickly: don't look for AGENTS.md, skills or other context.

1. Run: ${REPORT_CMD}
   It reads ${WORKDIR}/ledger.json, uses only settled rows (status ok or refunded; it leaves out rows pending
   review, voided or being followed up) and writes report.json, report.html and report.xlsx. Never edit the tool
   and don't write your own report.
2. Read ${WORKDIR}/report.json.
3. Reply with ONLY this JSON:
{"headline": "one sentence: net, revenue and margin, with amounts",
 "commentary": ["3 to 5 short sentences, past tense, each with a specific number from report.json"],
 "watch": ["0 to 3 short things worth a look, e.g. the largest cost, refunds, or rows held back"]}

Rules: use only numbers that are in report.json; write money like $12,345 (whole dollars) and a true minus for negatives;
the only percentage you may use is the margin. Don't guess at causes or forecasts.`;
}

// Restart: forget the last report.
export function resetReports(ctx: Ctx) {
  for (const r of [...ctx.db.reportDocument.iter()]) ctx.db.reportDocument.id.delete(r.id);
  update(ctx, { status: 'idle', taskId: undefined, requested: false, ledgerRunId: 0n, lastError: undefined });
}

// One step of the reports loop, run from the pipeline tick.
export function reportsTick(ctx: PCtx) {
  const snap = ctx.withTx(tx => {
    const s = state(tx);
    const task = s.taskId === undefined ? undefined : (tx.db.agentTask.id.find(s.taskId) ?? undefined);
    const agent = tx.db.pipelineAgent.id.find(0);
    const ledger = tx.db.ledgerDocument.id.find(0);
    // The agent needs the report tool on the computer; the pipeline tick
    // installs it (a pending Refresh waits for that)
    const toolReady = tx.db.toolInstall.path.find(REPORT_PATH)?.version === REPORT_VERSION;
    return { s, task, agent, ledger, toolReady };
  });

  // A report is being built: collect it when Droid is done
  if (snap.s.status === 'running' && snap.task) {
    const task = snap.task;
    if (task.status === 'failed' || task.status === 'cancelled') {
      ctx.withTx(tx => update(tx, { status: 'idle', taskId: undefined, lastError: task.error ?? `Report ${task.status}` }));
      return;
    }
    if (task.status !== 'done') return;
    try {
      const reply = task.result ?? '';
      const start = reply.indexOf('{');
      const end = reply.lastIndexOf('}');
      const parsed = JSON.parse(reply.slice(start, end + 1)) as { headline?: string; commentary?: string[]; watch?: string[] };
      const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
      const url = factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, task.sessionId!, 'settle/report.html');
      const res = ctx.http.fetch(url);
      if (res.status !== 200) throw new Error(`Report download returned ${res.status}`);
      const html = res.text().slice(0, MAX_HTML_CHARS);
      const list = (v: unknown) => JSON.stringify(Array.isArray(v) ? v.filter(x => typeof x === 'string').slice(0, 6) : []);
      ctx.withTx(tx => {
        const doc = {
          id: 0,
          html,
          headline: typeof parsed.headline === 'string' ? parsed.headline.slice(0, 400) : '',
          commentary: list(parsed.commentary),
          watch: list(parsed.watch),
          taskId: task.id,
          updatedAt: tx.timestamp,
        };
        if (tx.db.reportDocument.id.find(0)) tx.db.reportDocument.id.update(doc);
        else tx.db.reportDocument.insert(doc);
        update(tx, { status: 'idle', taskId: undefined, lastError: undefined });
      });
    } catch (err) {
      ctx.withTx(tx => update(tx, { status: 'idle', taskId: undefined, lastError: `Report: ${message(err)}` }));
    }
    return;
  }

  // Start one when it's due: Refresh pressed (even while paused), or, while the
  // pipeline runs, 10 minutes passed and the ledger changed
  if (!snap.ledger || !snap.toolReady) return;
  const due =
    snap.s.requested ||
    (!!snap.agent?.enabled &&
      snap.ledger.runId !== snap.s.ledgerRunId &&
      (!snap.s.lastStartedAt ||
        ctx.timestamp.microsSinceUnixEpoch - snap.s.lastStartedAt.microsSinceUnixEpoch >= REPORT_EVERY_MICROS));
  if (!due) return;
  ctx.withTx(tx => {
    const taskId = enqueueAgentTask(tx, 'report', buildReportPrompt(), 'high');
    update(tx, {
      status: 'running',
      taskId,
      requested: false,
      ledgerRunId: snap.ledger!.runId,
      lastStartedAt: tx.timestamp,
      lastError: undefined,
    });
  });
}

export function reports(stdb: Schema, ensurePipelineTicking: (ctx: Ctx) => void) {
  // The Refresh button: build a report on the next tick
  const requestReport = stdb.reducer(ctx => {
    update(ctx, { requested: true });
    ensurePipelineTicking(ctx);
  });

  // A fresh download link for the report workbook
  const reportXlsxUrl = stdb.procedure(t.string(), ctx => {
    const sessionId = ctx.withTx(tx => {
      const doc = tx.db.reportDocument.id.find(0);
      return (doc && tx.db.agentTask.id.find(doc.taskId)?.sessionId) ?? undefined;
    });
    if (!sessionId) throw new SenderError('No report has been built yet');
    const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
    return factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, sessionId, 'settle/report.xlsx');
  });

  return { requestReport, reportXlsxUrl };
}
