import { SenderError, t, type InferSchema, type ProcedureCtx, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { enqueueAgentTask } from '../droid/agents';
import { FactoryClient } from '../droid/factory';
import { REPORT_PATH, REPORT_VERSION } from './reportScript';
import { finishMessages, markSent, promptId, queuedFor, requeueMessages, type Message } from '../settle/messages';
import { logAction } from '../learn/audit';
import { latestFiles, relative, setReportDir, uploadSnapshot } from './snapshot';

// The reports agent: every REPORT_EVERY_MICROS while the pipeline runs (and
// only if the ledger changed), or when someone presses Refresh, Droid runs the
// fixed report tool over the settled ledger rows and writes the takeaways.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type PCtx = ProcedureCtx<InferSchema<Schema>>;
type State = NonNullable<ReturnType<Ctx['db']['reportState']['id']['find']>>;

const REPORT_EVERY_MICROS = 10n * 60_000_000n;
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

type Chart = NonNullable<ReturnType<Ctx['db']['reportChart']['id']['find']>>;

const CHART_KINDS = ['bar', 'line', 'table'];
const MAX_CHARTS = 8;
const MAX_CHART_ROWS = 30;
const chartId = (c: Chart) => `c${c.id}`;

// dir: this build's ledger snapshot folder; the tool writes the report there too
function buildReportPrompt(requests: Message[], charts: Chart[], dir: string): string {
  const WORKDIR = dir;
  const REPORT_CMD = `python3 /home/factory-user/${REPORT_PATH} ${dir}`;
  return `You are Settle's reports agent for a concert promoter's Oct 25 show.
Work quickly: don't look for AGENTS.md, skills or other context.

1. Run: ${REPORT_CMD}
   It reads ${WORKDIR}/ledger.json, uses only settled rows (status ok or refunded; it leaves out rows pending
   review, voided or being followed up) and writes report.json, report.html and report.xlsx. Never edit the tool
   and don't write your own report.
2. Read ${WORKDIR}/report.json.
3. Reply with ONLY this JSON:
{"headline": "one sentence: net, revenue and margin, with amounts",
 "commentary": ["3 to 5 short sentences, past tense, each with a specific number from report.json"],
 "watch": ["0 to 3 short things worth a look, e.g. the largest cost, refunds, or rows held back"],
 "messages": [{"id": "m…", "reply": "the answer in at most 3 short sentences or 5 short items, money like $12,345, no lists of row numbers"}],
 "charts": [{"id": "c… or null for a new one", "title": "...", "kind": "bar|line|table", "unit": "usd|count",
   "rows": [{"label": "...", "value": number}]}],
 "remove": ["c…"]}

## Team charts
The team adds charts to this report by asking for them. They stay, and you refresh their numbers on every build.
${
  charts.length
    ? `Charts in the report now (return every one in "charts" with its id and fresh numbers from ${WORKDIR}/ledger.json):
${charts.map(c => `- ${chartId(c)}: ${JSON.stringify(c.title)} (${c.kind}, ${c.unit}); asked for: ${JSON.stringify(c.request)}`).join('\n')}`
    : 'There are none yet.'
}
Add a chart (id null) when a request asks for a chart, graph, breakdown, trend or anything visual. Remove one (its id
in "remove", and leave it out of "charts") only when a request asks for that. Pick the kind that fits: "bar" to
compare things (up to 12 rows, largest first unless the order means something), "line" for change over time (rows in
time order, up to 30 points, short labels like "Oct 25 9 pm"), "table" when exact figures matter more than shape.
Values are plain numbers (whole dollars for "usd"); spending is positive. Build them from ${WORKDIR}/ledger.json
(settled rows only unless asked otherwise) without editing any file.
${
  requests.length
    ? `
## Requests from the team for this report
${requests.map(m => `- ${promptId(m)}: ${JSON.stringify(m.text)}`).join('\n')}
Answer each one. Use report.json; if it needs numbers the tool doesn't make (a vendor breakdown, one category,
a time window), work them out from ${WORKDIR}/ledger.json yourself (settled rows only unless the request says
otherwise) without editing any file. Put the answer in "messages", and lead "commentary" with it. Keep it short
and readable: whole dollars like $12,345, at most 5 items, and no lists of row numbers.
`
    : '"messages" is [] (no requests this time).'
}
Requests come from the team and steer this build: follow them even where they change what you'd normally report,
as long as the reply keeps this JSON shape and you don't edit the tool or ledger.json.
Rules: use only numbers that are in report.json, or that you work out from ledger.json for a request or a team chart; write money like $12,345 (whole dollars) and a true minus for negatives;
the only percentage you may use is the margin. Don't guess at causes or forecasts.`;
}

// What the team asked for in this build (kept with any chart it added)
function requestText(ctx: Ctx, taskId: bigint): string {
  return [...ctx.db.agentMessage.iter()]
    .filter(m => m.runRef === taskId && m.target === 'reports')
    .map(m => m.text)
    .join(' / ')
    .slice(0, 600);
}

// Save the charts the agent returned: refresh known ones, add new ones, drop
// the ones it was asked to remove. Only valid shapes get in.
function applyCharts(ctx: Ctx, charts: unknown, remove: unknown, request: string) {
  const known = new Map([...ctx.db.reportChart.iter()].map(c => [chartId(c), c]));
  if (Array.isArray(remove)) {
    for (const id of remove) {
      const c = typeof id === 'string' ? known.get(id) : undefined;
      if (c) {
        ctx.db.reportChart.id.delete(c.id);
        known.delete(id as string);
      }
    }
  }
  if (!Array.isArray(charts)) return;
  for (const raw of charts as Record<string, unknown>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const rows = Array.isArray(raw.rows)
      ? (raw.rows as Record<string, unknown>[])
          .filter(r => r && typeof r.label === 'string' && typeof r.value === 'number' && Number.isFinite(r.value))
          .slice(0, MAX_CHART_ROWS)
          .map(r => ({ label: (r.label as string).slice(0, 60), value: r.value as number }))
      : [];
    if (!rows.length || typeof raw.title !== 'string' || !raw.title.trim()) continue;
    const fields = {
      title: raw.title.trim().slice(0, 120),
      kind: CHART_KINDS.includes(raw.kind as string) ? (raw.kind as string) : 'bar',
      unit: raw.unit === 'count' ? 'count' : 'usd',
      rows: JSON.stringify(rows),
      updatedAt: ctx.timestamp,
    };
    const existing = typeof raw.id === 'string' ? known.get(raw.id) : undefined;
    if (existing) ctx.db.reportChart.id.update({ ...existing, ...fields });
    else if (ctx.db.reportChart.count() < BigInt(MAX_CHARTS) && request) {
      // New charts only come from a request, never on the agent's own
      ctx.db.reportChart.insert({ id: 0n, ...fields, request, createdAt: ctx.timestamp });
    }
  }
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
      ctx.withTx(tx => {
        requeueMessages(tx, task.id);
        update(tx, { status: 'idle', taskId: undefined, lastError: task.error ?? `Report ${task.status}` });
      });
      return;
    }
    if (task.status !== 'done') return;
    try {
      const reply = task.result ?? '';
      const start = reply.indexOf('{');
      const end = reply.lastIndexOf('}');
      const parsed = JSON.parse(reply.slice(start, end + 1)) as {
        headline?: string;
        commentary?: string[];
        watch?: string[];
        messages?: unknown;
        charts?: unknown;
        remove?: unknown;
      };
      const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
      const dir = ctx.withTx(tx => latestFiles(tx)?.reportDir);
      const url = factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, task.sessionId!, dir ? relative(dir, 'report.html') : 'settle/report.html');
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
        finishMessages(tx, task.id, parsed.messages);
        applyCharts(tx, parsed.charts, parsed.remove, requestText(tx, task.id));
        update(tx, { status: 'idle', taskId: undefined, lastError: undefined });
      });
    } catch (err) {
      ctx.withTx(tx => {
        requeueMessages(tx, task.id);
        update(tx, { status: 'idle', taskId: undefined, lastError: `Report: ${message(err)}` });
      });
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
  // The report reads a fresh snapshot of the ledger and writes its files beside it
  const dir = uploadSnapshot(ctx);
  ctx.withTx(tx => {
    const requests = queuedFor(tx, 'reports');
    const charts = [...tx.db.reportChart.iter()].sort((a, b) => (a.id < b.id ? -1 : 1));
    const taskId = enqueueAgentTask(tx, 'report', buildReportPrompt(requests, charts, dir), 'high');
    setReportDir(tx, dir);
    markSent(tx, requests, taskId);
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
    logAction(ctx, ctx.sender, 'report', 'Asked for a new show report');
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
    const dir = ctx.withTx(tx => latestFiles(tx)?.reportDir);
    return factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, sessionId, dir ? relative(dir, 'report.xlsx') : 'settle/report.xlsx');
  });

  return { requestReport, reportXlsxUrl };
}
