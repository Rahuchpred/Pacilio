import { table, t } from 'spacetimedb/server';

// One unit of work for a Droid agent on a Factory cloud computer.
// status: pending → starting → running → done | failed | cancelled
// A follow-up (steer) on a done task puts it back to running.
export const agentTask = table(
  { name: 'agent_task', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // Free-form label the pipeline uses to route results, e.g. 'report'
    kind: t.string(),
    prompt: t.string(),
    autonomy: t.string(),
    status: t.string(),
    sessionId: t.string().optional(),
    // The agent's latest reply, set when a turn finishes
    result: t.string().optional(),
    error: t.string().optional(),
    // Highest Factory message seq already copied into agent_step
    lastSeq: t.u64(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Live progress feed: the agent's text and tool calls, in order.
export const agentStep = table(
  { name: 'agent_step', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.u64().index('btree'),
    seq: t.u64(),
    role: t.string(),
    kind: t.string(),
    summary: t.string(),
    at: t.timestamp(),
  }
);

// Messages waiting to be sent to a running agent (private).
export const agentOutbox = table(
  { name: 'agent_outbox' },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.u64(),
    // Empty text with interrupt=true just stops the agent
    text: t.string(),
    interrupt: t.bool(),
  }
);

// Drives the agentTick procedure while any task needs attention (private).
export const agentTickSchedule = table(
  { name: 'agent_tick_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

export const droidTables = { agentTask, agentStep, agentOutbox, agentTickSchedule };

// Set at publish time from the shell (see backend/package.json).
export const droidEnv = {
  FACTORY_API_KEY: t.string(),
  FACTORY_COMPUTER_ID: t.string(),
};
