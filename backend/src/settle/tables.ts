import { table, t } from 'spacetimedb/server';

// Messages Ask Settle sends to the agents on a person's behalf: one-off
// instructions for the main agent's next run, or a request for the reports
// agent's next report.
export const agentMessage = table(
  { name: 'agent_message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // The Ask Settle task that sent it
    askTaskId: t.u64().index('btree'),
    // 'main' | 'reports'
    target: t.string(),
    text: t.string(),
    // 'queued' → 'sent' (in a run) → 'done'; or 'cancelled'
    status: t.string(),
    // The main agent's run, or the reports agent's task, that took it
    runRef: t.u64().optional(),
    // What the agent said it did
    reply: t.string().optional(),
    createdBy: t.identity(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

export const settleTables = { agentMessage };
