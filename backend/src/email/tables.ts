import { table, t } from 'spacetimedb/server';

// Email follow-up threads. Sending (AgentMail) was removed after the
// hackathon; the tables stay so existing data keeps its shape.

// Our AgentMail inbox (singleton, id 0), created on first use.
export const emailInbox = table(
  { name: 'email_inbox' },
  {
    id: t.u32().primaryKey(),
    inboxId: t.string(),
    address: t.string(),
  }
);

export const emailThread = table(
  { name: 'email_thread', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    reviewItemId: t.u64(),
    eventId: t.u64(),
    // Who the email is about/for (the vendor or customer)
    counterparty: t.string(),
    // Where it was sent
    toAddress: t.string(),
    subject: t.string(),
    agentmailThreadId: t.string().optional(),
    // The latest message in the thread; replies and follow-ups answer it
    lastMessageId: t.string().optional(),
    // 'waiting' (nagging on schedule) | 'replied' | 'gave_up' | 'closed' | 'failed'
    status: t.string(),
    // Follow-ups sent since the last message from us that started a wait
    followUps: t.u32(),
    nextFollowUpAt: t.timestamp().optional(),
    // A reply came in that nobody has opened yet
    unread: t.bool(),
    error: t.string().optional(),
    lastActivityAt: t.timestamp(),
    createdAt: t.timestamp(),
  }
);

export const emailMessage = table(
  { name: 'email_message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    threadId: t.u64().index('btree'),
    // 'out' | 'in'
    direction: t.string(),
    // 'initial' | 'follow_up' | 'reply' (from us) | 'received' (from them)
    kind: t.string(),
    fromAddress: t.string(),
    body: t.string(),
    // AgentMail's message id; stops a polled reply from being stored twice
    agentmailMessageId: t.string().unique(),
    sentAt: t.timestamp(),
  }
);

export const emailTickSchedule = table(
  { name: 'email_tick_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// The follow-up schedule, shared by every thread and editable from the UI:
// step 0 is sent delay_min after our last message, step 1 that long after
// step 0, and so on. After the last step a thread shows "No reply".
export const emailFollowUp = table(
  { name: 'email_follow_up', public: true },
  {
    step: t.u32().primaryKey(),
    delayMin: t.u32(),
    message: t.string(),
  }
);

export const emailTables = { emailInbox, emailThread, emailMessage, emailTickSchedule, emailFollowUp };
