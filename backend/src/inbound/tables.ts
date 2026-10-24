import { table, t } from 'spacetimedb/server';

// The live feed: one row per thing that happened in any source system,
// normalized to a single shape. UIs and agents subscribe to this table.
export const inboundEvent = table(
  { name: 'inbound_event', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    // `${source}:${sourceId}`; stops re-polls from inserting twice
    dedupeKey: t.string().unique(),
    source: t.string().index('btree'),
    sourceId: t.string(),
    kind: t.string(),
    occurredAt: t.timestamp(),
    // Signed minor units: positive = money in, negative = money out
    amountMinor: t.i64(),
    currency: t.string(),
    counterparty: t.string(),
    description: t.string(),
    reference: t.string().optional(),
    documentUrl: t.string().optional(),
    // Source payload as JSON (truncated)
    raw: t.string(),
    receivedAt: t.timestamp(),
  }
);

// Ground truth for what we changed on purpose (private, so agents and UIs
// can't peek). Used later to score whether the agent caught it.
export const inboundLabel = table(
  { name: 'inbound_label' },
  {
    eventId: t.u64().primaryKey(),
    // JSON: [{ field, op, before, after }]
    corruptions: t.string(),
    duplicateOf: t.u64().optional(),
  }
);

// Per-source settings and saved cursor/tokens (private: state can hold OAuth tokens).
export const inboundSource = table(
  { name: 'inbound_source' },
  {
    name: t.string().primaryKey(),
    enabled: t.bool(),
    state: t.string(),
    typoRate: t.f64(),
    duplicateRate: t.f64(),
    maxPerTick: t.u32(),
  }
);

// Public health view of each source for the UI.
export const inboundSourceStatus = table(
  { name: 'inbound_source_status', public: true },
  {
    name: t.string().primaryKey(),
    enabled: t.bool(),
    configured: t.bool(),
    emitted: t.u64(),
    lastPolledAt: t.timestamp().optional(),
    lastError: t.string().optional(),
  }
);

// Drives inboundTick while any source is enabled (private).
export const inboundTickSchedule = table(
  { name: 'inbound_tick_schedule' },
  {
    scheduledId: t.u64().primaryKey().autoInc(),
    scheduledAt: t.scheduleAt(),
  }
);

// Where each pipeline node sits on the shared board; absent = default layout.
export const pipelineLayout = table(
  { name: 'pipeline_layout', public: true },
  {
    nodeId: t.string().primaryKey(),
    x: t.f64(),
    y: t.f64(),
  }
);

export const inboundTables = {
  pipelineLayout,
  inboundEvent,
  inboundLabel,
  inboundSource,
  inboundSourceStatus,
  inboundTickSchedule,
};

// Credentials, set at publish time from the shell. Unset = source stays idle.
export const inboundEnv = {
  NESSIE_API_KEY: t.string().optional(),
  STRIPE_SECRET_KEY: t.string().optional(),
};
