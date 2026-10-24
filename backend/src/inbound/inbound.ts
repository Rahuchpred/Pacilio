import { Timestamp } from 'spacetimedb';
import {
  ScheduleAt,
  SenderError,
  t,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import type spacetimedb from '../index';
import { corrupt } from './corrupt';
import { InboundHub } from './hub';
import { inboundTickSchedule } from './tables';
import type { InboundEventDraft, Source, SourceContext } from './types';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;

const TICK_INTERVAL_MICROS = 5_000_000n;
const MAX_RAW_CHARS = 4000;

function ensureTicking(ctx: Ctx) {
  for (const _ of ctx.db.inboundTickSchedule.iter()) return;
  ctx.db.inboundTickSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(TICK_INTERVAL_MICROS),
  });
}

function requireSource(name: string): Source {
  const source = InboundHub.get(name);
  if (!source) {
    const names = InboundHub.sources.map(s => s.name).join(', ');
    throw new SenderError(`Unknown source "${name}". Expected one of: ${names}`);
  }
  return source;
}

// Settings row for a source, created with its defaults on first use.
function sourceRow(ctx: Ctx, source: Source) {
  const existing = ctx.db.inboundSource.name.find(source.name);
  if (existing) return existing;
  const row = {
    name: source.name,
    enabled: false,
    state: '',
    typoRate: source.defaultProfile.typoRate,
    duplicateRate: source.defaultProfile.duplicateRate,
    maxPerTick: source.defaultMaxPerTick,
  };
  ctx.db.inboundSource.insert(row);
  return row;
}

function updateStatus(
  ctx: Ctx,
  name: string,
  patch: Partial<{ enabled: boolean; configured: boolean; emitted: bigint; lastPolledAt: Timestamp; lastError: string | undefined }>
) {
  const current = ctx.db.inboundSourceStatus.name.find(name) ?? {
    name,
    enabled: false,
    configured: false,
    emitted: 0n,
    lastPolledAt: undefined,
    lastError: undefined,
  };
  const next = { ...current, ...patch };
  if (ctx.db.inboundSourceStatus.name.find(name)) ctx.db.inboundSourceStatus.name.update(next);
  else ctx.db.inboundSourceStatus.insert(next);
}

function toTimestamp(date: Date, fallback: Timestamp): Timestamp {
  return Number.isNaN(date.getTime()) ? fallback : Timestamp.fromDate(date);
}

function rawJson(raw: unknown): string {
  // Rows from our own tables carry bigint amounts, which JSON can't encode
  const json = JSON.stringify(raw, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)) ?? '';
  return json.length > MAX_RAW_CHARS ? `${json.slice(0, MAX_RAW_CHARS)}…` : json;
}

// Simulation and polling each keep their own keys in the same state blob
function mergeState(before: string, after: string): string {
  try {
    return JSON.stringify({ ...JSON.parse(before || '{}'), ...JSON.parse(after || '{}') });
  } catch {
    return after;
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function inbound(stdb: Schema) {
  // Turn a source on or off. Enabling starts the poller.
  const setInboundSource = stdb.reducer(
    { name: t.string(), enabled: t.bool() },
    (ctx, { name, enabled }) => {
      const row = sourceRow(ctx, requireSource(name));
      ctx.db.inboundSource.name.update({ ...row, enabled });
      updateStatus(ctx, name, { enabled });
      if (enabled) ensureTicking(ctx);
    }
  );

  // Tune how messy a source's data is and how fast it trickles in.
  const configureInboundSource = stdb.reducer(
    { name: t.string(), typoRate: t.f64(), duplicateRate: t.f64(), maxPerTick: t.u32() },
    (ctx, { name, typoRate, duplicateRate, maxPerTick }) => {
      const inRange = (r: number) => r >= 0 && r <= 1;
      if (!inRange(typoRate) || !inRange(duplicateRate)) {
        throw new SenderError('Rates must be between 0 and 1');
      }
      if (maxPerTick < 1) throw new SenderError('maxPerTick must be at least 1');
      const row = sourceRow(ctx, requireSource(name));
      ctx.db.inboundSource.name.update({ ...row, typoRate, duplicateRate, maxPerTick });
    }
  );

  // Forget the cursor so the source replays from the start. Events already
  // stored are kept (and skipped on replay); credentials in state are dropped.
  const resetInboundSource = stdb.reducer({ name: t.string() }, (ctx, { name }) => {
    const row = sourceRow(ctx, requireSource(name));
    ctx.db.inboundSource.name.update({ ...row, state: '' });
  });

  // Someone dragged a pipeline node; everyone sees it move.
  const movePipelineNode = stdb.reducer(
    { nodeId: t.string(), x: t.f64(), y: t.f64() },
    (ctx, { nodeId, x, y }) => {
      if (!nodeId.startsWith('pipeline:')) throw new SenderError('Not a pipeline node');
      if (ctx.db.pipelineLayout.nodeId.find(nodeId)) ctx.db.pipelineLayout.nodeId.update({ nodeId, x, y });
      else ctx.db.pipelineLayout.insert({ nodeId, x, y });
    }
  );

  // ─── Whole-pipeline controls (the UI's Run / Pause / Restart) ─────────────

  function setAll(ctx: Ctx, enabled: boolean) {
    for (const source of InboundHub.sources) {
      const row = sourceRow(ctx, source);
      ctx.db.inboundSource.name.update({ ...row, enabled });
      updateStatus(ctx, source.name, { enabled });
    }
    if (enabled) ensureTicking(ctx);
  }

  const runInbound = stdb.reducer(ctx => setAll(ctx, true));

  const pauseInbound = stdb.reducer(ctx => setAll(ctx, false));

  // Start over: drop every stored event and label, rewind every source to its
  // beginning, then run. Sources replay with fresh corruption.
  const restartInbound = stdb.reducer(ctx => {
    for (const event of [...ctx.db.inboundEvent.iter()]) ctx.db.inboundEvent.id.delete(event.id);
    for (const label of [...ctx.db.inboundLabel.iter()]) ctx.db.inboundLabel.eventId.delete(label.eventId);
    for (const source of InboundHub.sources) {
      const row = sourceRow(ctx, source);
      ctx.db.inboundSource.name.update({ ...row, state: '' });
      updateStatus(ctx, source.name, { emitted: 0n, lastError: undefined, lastPolledAt: undefined });
    }
    // Status rows for sources that no longer exist (e.g. removed integrations)
    for (const status of [...ctx.db.inboundSourceStatus.iter()]) {
      if (!InboundHub.get(status.name)) ctx.db.inboundSourceStatus.name.delete(status.name);
    }
    setAll(ctx, true);
  });

  // Polls every enabled source, applies its corruption profile to new events
  // and stores them. HTTP happens outside transactions; each source's results
  // commit in their own transaction so one failing source can't block others.
  const inboundTick = stdb.procedure(
    { onSchedule: inboundTickSchedule },
    { arg: inboundTickSchedule.rowType },
    t.unit(),
    ctx => {
      const rows = ctx.withTx(tx => [...tx.db.inboundSource.iter()].filter(r => r.enabled));
      if (!rows.length) {
        ctx.withTx(tx => {
          for (const row of [...tx.db.inboundTickSchedule.iter()]) {
            tx.db.inboundTickSchedule.scheduledId.delete(row.scheduledId);
          }
        });
        return {};
      }

      const env = (key: string) => ctx.env.get(key) ?? '';
      const sourceCtx: SourceContext = {
        http: ctx.http,
        env,
        now: () => ctx.timestamp.toDate(),
        withTx: fn => ctx.withTx(tx => fn(tx)),
        random: ctx.random,
      };

      for (const row of rows) {
        const source = InboundHub.get(row.name);
        if (!source) continue;

        const missing = source.requiredEnv.filter(key => !env(key));
        if (missing.length) {
          ctx.withTx(tx =>
            updateStatus(tx, row.name, { configured: false, lastError: `Missing env: ${missing.join(', ')}` })
          );
          continue;
        }

        // Create fresh activity in the source system first (a sale, a bill…)
        let simulated = row.state;
        let simError: string | undefined;
        if (source.simulate && ctx.random() < (source.simulateChance ?? 1)) {
          try {
            simulated = source.simulate(sourceCtx, row.state);
          } catch (err) {
            simError = `Simulation: ${message(err)}`;
          }
        }

        let drafts: InboundEventDraft[];
        let state: string;
        try {
          const polled = source.poll(sourceCtx, simulated, row.maxPerTick);
          drafts = polled.events;
          state = mergeState(simulated, polled.state);
        } catch (err) {
          ctx.withTx(tx => {
            const current = tx.db.inboundSource.name.find(row.name);
            if (current) tx.db.inboundSource.name.update({ ...current, state: simulated });
            updateStatus(tx, row.name, {
              configured: true,
              lastPolledAt: tx.timestamp,
              lastError: message(err),
            });
          });
          continue;
        }

        // One source failing (bad data, encoding) must not stop the others
        try {
          const fresh = ctx.withTx(tx =>
            drafts.filter(d => !tx.db.inboundEvent.dedupeKey.find(`${row.name}:${d.sourceId}`))
          );
          const corrupted = corrupt(ctx.random, fresh, {
            ...source.defaultProfile,
            typoRate: row.typoRate,
            duplicateRate: row.duplicateRate,
          });

          ctx.withTx(tx => {
            const ids: bigint[] = [];
            for (const { draft, corruptions, duplicateOfIndex } of corrupted) {
              const event = tx.db.inboundEvent.insert({
                id: 0n,
                dedupeKey: `${row.name}:${draft.sourceId}`,
                source: row.name,
                sourceId: draft.sourceId,
                kind: draft.kind,
                occurredAt: toTimestamp(draft.occurredAt, tx.timestamp),
                amountMinor: draft.amountMinor,
                currency: draft.currency,
                counterparty: draft.counterparty,
                description: draft.description,
                reference: draft.reference,
                documentUrl: draft.documentUrl,
                raw: rawJson(draft.raw),
                receivedAt: tx.timestamp,
              });
              ids.push(event.id);

              const duplicateOf = duplicateOfIndex === undefined ? undefined : ids[duplicateOfIndex];
              if (corruptions.length || duplicateOf !== undefined) {
                tx.db.inboundLabel.insert({
                  eventId: event.id,
                  corruptions: JSON.stringify(corruptions),
                  duplicateOf,
                });
              }
            }

            const current = tx.db.inboundSource.name.find(row.name);
            if (current) tx.db.inboundSource.name.update({ ...current, state });
            const emitted = tx.db.inboundSourceStatus.name.find(row.name)?.emitted ?? 0n;
            updateStatus(tx, row.name, {
              configured: true,
              emitted: emitted + BigInt(ids.length),
              lastPolledAt: tx.timestamp,
              lastError: simError,
            });
          });
        } catch (err) {
          ctx.withTx(tx =>
            updateStatus(tx, row.name, { lastPolledAt: tx.timestamp, lastError: message(err) })
          );
        }
      }
      return {};
    }
  );

  return {
    setInboundSource,
    configureInboundSource,
    resetInboundSource,
    movePipelineNode,
    runInbound,
    pauseInbound,
    restartInbound,
    inboundTick,
  };
}
