import { table, t } from 'spacetimedb/server';

// Everything people do, newest last. The learnable entries (decisions on the
// Bookkeeper's questions, corrections sent through Settle, category changes)
// feed the pattern learner.
export const auditLog = table(
  { name: 'audit_log', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    at: t.timestamp(),
    who: t.identity(),
    // The display name at the time, so the log reads the same later
    whoName: t.string(),
    // 'decision' | 'settle' | 'ask' | 'classification' | 'email' | 'pipeline' | 'report' | 'pattern'
    kind: t.string(),
    // One readable line: "Chose Void on 'ACME paid twice' (Bookkeeper suggested Email them)"
    summary: t.string(),
    eventId: t.u64().optional(),
    // JSON with the specifics the learner needs (suggested vs chosen, vendor, category, amount)
    details: t.string(),
    learnable: t.bool(),
  }
);

// What the Bookkeeper has learned from people, injected into every run.
export const pattern = table(
  { name: 'pattern', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // One plain instruction: "Mark Bay Venue Security payments under $500 as Security; don't ask."
    text: t.string(),
    // Why: "You chose Keep on 3 of these"
    because: t.string(),
    // JSON array of audit_log ids that taught it
    evidence: t.string(),
    // 'learned' (the learner may refine it) | 'edited' | 'person' (people own it; the learner leaves it alone)
    source: t.string(),
    // 'active' | 'deleted' (deleted ones are kept so the learner doesn't bring them back)
    status: t.string(),
    // Runs that said they applied it
    uses: t.u32(),
    createdAt: t.timestamp(),
    updatedAt: t.timestamp(),
  }
);

// The learner's bookkeeping (singleton, id 0).
export const patternState = table(
  { name: 'pattern_state', public: true },
  {
    id: t.u32().primaryKey(),
    // Learnable audit entries up to this id have been looked at
    learnedThrough: t.u64(),
    // Set while a learning task runs, with the id it will have covered
    taskId: t.u64().optional(),
    pendingThrough: t.u64(),
    lastRunAt: t.timestamp().optional(),
    lastError: t.string().optional(),
  }
);

export const learnTables = { auditLog, pattern, patternState };
