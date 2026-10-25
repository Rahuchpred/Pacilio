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
    // The agent's latest TodoWrite plan as JSON: [{ id, content, status, priority }]
    todos: t.string().optional(),
    // Highest Factory message seq already copied into agent_step
    lastSeq: t.u64(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// Live feed of everything the agent does, in order (seq).
// kind: 'text' (chat from user or assistant), 'thinking' (reasoning summary),
// or 'tool' (a tool call; result/status fill in when it finishes).
export const agentStep = table(
  { name: 'agent_step', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    taskId: t.u64().index('btree'),
    seq: t.u64(),
    role: t.string(),
    kind: t.string(),
    // Message text, reasoning summary, or a one-line tool description
    text: t.string(),
    toolUseId: t.string().optional(),
    toolName: t.string().optional(),
    // Tool arguments as JSON (truncated)
    input: t.string().optional(),
    // Tool output (truncated), set when the result arrives
    result: t.string().optional(),
    // 'running' | 'ok' | 'error' for tools
    status: t.string().optional(),
    riskLevel: t.string().optional(),
    // Groups tools that ran together inside one parallel Script call
    parentToolUseId: t.string().optional(),
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

// Sessions to stop and delete on the Factory computer (private). Restart and
// scenario swaps queue every session this database started; the agent tick
// interrupts each one and deletes it.
export const sessionCleanup = table(
  { name: 'session_cleanup' },
  {
    sessionId: t.string().primaryKey(),
  }
);

export const droidTables = { agentTask, agentStep, agentOutbox, agentTickSchedule, sessionCleanup };

// Set at publish time from the shell (see backend/package.json).
export const droidEnv = {
  FACTORY_API_KEY: t.string(),
  FACTORY_COMPUTER_ID: t.string(),
};
