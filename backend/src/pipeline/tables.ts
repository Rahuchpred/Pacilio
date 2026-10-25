import { table, t } from 'spacetimedb/server';

// The Bookkeeper: takes waiting inbound events in batches, has Droid (on the
// Factory cloud computer) classify and reconcile them into the master ledger,
// and sends anything it isn't sure about to the human action queue.

// Singleton (id 0): is the agent on, and what is it doing.
export const pipelineAgent = table(
  { name: 'pipeline_agent', public: true },
  {
    id: t.u32().primaryKey(),
    enabled: t.bool(),
    // 'idle' | 'running'
    status: t.string(),
    currentRunId: t.u64().optional(),
    lastError: t.string().optional(),
    // Next run starts the ledger from scratch (after a Restart)
    resetLedger: t.bool(),
    updatedAt: t.timestamp(),
  }
);

// One batch handed to Droid.
export const agentRun = table(
  { name: 'agent_run', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.u64(),
    eventIds: t.array(t.u64()),
    // Human decisions this run was asked to apply
    reviewItemIds: t.array(t.u64()),
    // 'running' | 'done' | 'failed'
    status: t.string(),
    summary: t.string().optional(),
    error: t.string().optional(),
    startedAt: t.timestamp(),
    finishedAt: t.timestamp().optional(),
  }
);

// Where each inbound event is in the agent's hands. No row = still waiting.
export const eventReview = table(
  { name: 'event_review', public: true },
  {
    eventId: t.u64().primaryKey(),
    runId: t.u64(),
    // 'processing' | 'done'
    status: t.string(),
    // 'ok' | 'void' | 'review'
    outcome: t.string().optional(),
    category: t.string().optional(),
    note: t.string().optional(),
    updatedAt: t.timestamp(),
  }
);

// The human action queue: items the agent wasn't sure about.
export const reviewItem = table(
  { name: 'review_item', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    eventId: t.u64().index('btree'),
    runId: t.u64(),
    // One-sentence question for the person, with the amount in it
    question: t.string(),
    // Why the agent flagged it (evidence)
    reason: t.string(),
    // 'void' | 'refund' | 'follow_up' | 'keep'
    recommendation: t.string(),
    confidence: t.f64(),
    duplicateOf: t.u64().optional(),
    // 'open' → 'decided' (waiting for the agent to apply it) → 'applied'
    status: t.string(),
    decision: t.string().optional(),
    decidedBy: t.identity().optional(),
    decidedAt: t.timestamp().optional(),
    // What happened when the decision ran, e.g. the Stripe refund id
    resultNote: t.string().optional(),
    createdAt: t.timestamp(),
  }
);

// The agent's full write-up for a flagged item: what's wrong, the proof, the
// fix, and (for follow-ups) who to contact and a draft message.
export const reviewDetail = table(
  { name: 'review_detail', public: true },
  {
    itemId: t.u64().primaryKey(),
    // Short headline, e.g. "ACME charged twice for bill AV-0423"
    title: t.string(),
    // Plain explanation with amounts, dates and ledger rows
    whatHappened: t.string(),
    // JSON array of short evidence lines, each naming a row/event and source
    evidence: t.string(),
    // Exactly what the recommended action changes
    fix: t.string(),
    followUpTo: t.string().optional(),
    followUpSubject: t.string().optional(),
    followUpMessage: t.string().optional(),
  }
);

// The master ledger as Droid last rendered it (singleton, id 0).
export const ledgerDocument = table(
  { name: 'ledger_document', public: true },
  {
    id: t.u32().primaryKey(),
    html: t.string(),
    runId: t.u64(),
    updatedAt: t.timestamp(),
  }
);

// Tools we install on the Factory computer for the agent to run (e.g. render.py).
export const toolInstall = table(
  { name: 'tool_install', public: true },
  {
    path: t.string().primaryKey(),
    version: t.string(),
    installedAt: t.timestamp(),
  }
);

// The latest show report (singleton, id 0): the dashboard the reports agent
// rendered, plus its written takeaways.
export const reportDocument = table(
  { name: 'report_document', public: true },
  {
    id: t.u32().primaryKey(),
    html: t.string(),
    headline: t.string(),
    // JSON array of short sentences
    commentary: t.string(),
    // JSON array of things to keep an eye on
    watch: t.string(),
    taskId: t.u64(),
    updatedAt: t.timestamp(),
  }
);

// Charts the team asked the reports agent for (through Ask Settle). They stay
// in the show report, and every report build refreshes their numbers, until
// someone asks to remove one.
export const reportChart = table(
  { name: 'report_chart', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    title: t.string(),
    // 'bar' | 'line' | 'table'
    kind: t.string(),
    // 'usd' | 'count'
    unit: t.string(),
    // JSON [{label, value}]
    rows: t.string(),
    // What was asked for, so later builds know what to keep it showing
    request: t.string(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Reports agent bookkeeping (singleton, id 0).
export const reportState = table(
  { name: 'report_state', public: true },
  {
    id: t.u32().primaryKey(),
    // 'idle' | 'running'
    status: t.string(),
    taskId: t.u64().optional(),
    // Someone pressed Refresh
    requested: t.bool(),
    // Ledger version (its run id) the last report was built from
    ledgerRunId: t.u64(),
    lastStartedAt: t.timestamp().optional(),
    lastError: t.string().optional(),
  }
);

export const pipelineTickSchedule = table(
  { name: 'pipeline_tick_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const pipelineTables = {
  pipelineAgent,
  agentRun,
  eventReview,
  reviewItem,
  reviewDetail,
  ledgerDocument,
  toolInstall,
  reportDocument,
  reportChart,
  reportState,
  pipelineTickSchedule,
};
