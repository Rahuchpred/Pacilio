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
import { resetPipeline, setPipelineEnabled } from '../pipeline/pipeline';
import { shutDownAgents } from '../droid/agents';
import type { InboundEventDraft, Source, SourceContext } from './types';
import { logAction } from '../learn/audit';
import { activeScenario } from './simulation';
import { SCENARIOS } from '../scenarios';
import { resetClassificationsTo } from '../classify/classify';
import { resetPatterns } from '../learn/learn';
import { resetFollowUps } from '../email/email';

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

const BASELINE_FLAG = '__baseline';

function hasBaselineFlag(state: string): boolean {
  try {
    return !!(JSON.parse(state || '{}') as Record<string, unknown>)[BASELINE_FLAG];
  } catch {
    return false;
  }
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

  // Someone resized a pipeline node (the ledger sheet); everyone sees the new size.
  const resizePipelineNode = stdb.reducer(
    { nodeId: t.string(), width: t.f64(), height: t.f64() },
    (ctx, { nodeId, width, height }) => {
      if (!nodeId.startsWith('pipeline:')) throw new SenderError('Not a pipeline node');
      if (!(width >= 200 && width <= 10_000 && height >= 150 && height <= 10_000)) {
        throw new SenderError('Size out of range');
      }
      const row = { nodeId, width, height };
      if (ctx.db.pipelineNodeSize.nodeId.find(nodeId)) ctx.db.pipelineNodeSize.nodeId.update(row);
      else ctx.db.pipelineNodeSize.insert(row);
    }
  );

  // Someone opened or closed a card's full detail; it opens or closes for everyone.
  const setPipelineCardExpanded = stdb.reducer(
    { nodeId: t.string(), expanded: t.bool() },
    (ctx, { nodeId, expanded }) => {
      if (!nodeId.startsWith('pipeline:')) throw new SenderError('Not a pipeline node');
      const row = ctx.db.pipelineCard.nodeId.find(nodeId);
      if (!expanded) {
        if (row) ctx.db.pipelineCard.nodeId.delete(nodeId);
      } else if (row) ctx.db.pipelineCard.nodeId.update({ nodeId, expanded });
      else ctx.db.pipelineCard.insert({ nodeId, expanded });
    }
  );

  // Snap every pipeline node back to the default layout, size and overview, for everyone.
  const tidyPipelineLayout = stdb.reducer(ctx => {
    logAction(ctx, ctx.sender, 'pipeline', 'Tidied the board');
    for (const row of [...ctx.db.pipelineLayout.iter()]) ctx.db.pipelineLayout.nodeId.delete(row.nodeId);
    for (const row of [...ctx.db.pipelineNodeSize.iter()]) ctx.db.pipelineNodeSize.nodeId.delete(row.nodeId);
    for (const row of [...ctx.db.pipelineCard.iter()]) ctx.db.pipelineCard.nodeId.delete(row.nodeId);
  });

  // ─── Whole-pipeline controls (the UI's Run / Pause / Restart) ─────────────

  function setAll(ctx: Ctx, enabled: boolean) {
    // Forget sources that were removed from the hub (e.g. CORD), so a stale
    // "running" row can't keep the board looking like it never paused
    const known = new Set(InboundHub.sources.map(s => s.name));
    for (const row of [...ctx.db.inboundSourceStatus.iter()]) {
      if (!known.has(row.name)) ctx.db.inboundSourceStatus.name.delete(row.name);
    }
    for (const row of [...ctx.db.inboundSource.iter()]) {
      if (!known.has(row.name)) ctx.db.inboundSource.name.delete(row.name);
    }
    for (const source of InboundHub.sources) {
      const row = sourceRow(ctx, source);
      ctx.db.inboundSource.name.update({ ...row, enabled });
      updateStatus(ctx, source.name, { enabled });
    }
    if (enabled) {
      // Reschedule so a changed tick interval takes effect on Run
      for (const row of [...ctx.db.inboundTickSchedule.iter()]) {
        ctx.db.inboundTickSchedule.scheduledId.delete(row.scheduledId);
      }
      ensureTicking(ctx);
    }
    // The Bookkeeper runs and pauses with its sources
    setPipelineEnabled(ctx, enabled);
  }

  const runInbound = stdb.reducer(ctx => {
    setAll(ctx, true);
    logAction(ctx, ctx.sender, 'pipeline', 'Pressed Run');
  });

  const pauseInbound = stdb.reducer(ctx => {
    setAll(ctx, false);
    logAction(ctx, ctx.sender, 'pipeline', 'Pressed Pause');
  });

  // Start over: drop every stored event and label, rewind every source to its
  // beginning, then run. Sources replay with fresh corruption.
  // A full reset: the books, everything that refers to them, everything learned
  // and every setting (patterns, categories, follow-ups, charts, the canvas),
  // then replay. Only the business being played and the plumbing stay.
  function restart(ctx: Ctx) {
    // Stop every agent and close its Factory session before the rows go
    shutDownAgents(ctx);
    for (const r of [...ctx.db.accountingPayment.iter()]) ctx.db.accountingPayment.id.delete(r.id);
    for (const r of [...ctx.db.accountingExpense.iter()]) ctx.db.accountingExpense.id.delete(r.id);
    for (const r of [...ctx.db.accountingBill.iter()]) ctx.db.accountingBill.id.delete(r.id);
    for (const r of [...ctx.db.accountingInvoice.iter()]) ctx.db.accountingInvoice.id.delete(r.id);
    // Threads about rows that no longer exist would keep nudging vendors
    for (const r of [...ctx.db.emailMessage.iter()]) ctx.db.emailMessage.id.delete(r.id);
    for (const r of [...ctx.db.emailThread.iter()]) ctx.db.emailThread.id.delete(r.id);
    // Every agent's work: Ask Pacioli's chat, its messages, all tasks and steps
    for (const r of [...ctx.db.agentMessage.iter()]) ctx.db.agentMessage.id.delete(r.id);
    for (const r of [...ctx.db.agentStep.iter()]) ctx.db.agentStep.id.delete(r.id);
    for (const r of [...ctx.db.agentOutbox.iter()]) ctx.db.agentOutbox.id.delete(r.id);
    for (const r of [...ctx.db.agentTask.iter()]) ctx.db.agentTask.id.delete(r.id);
    // Everything learned and set up
    for (const r of [...ctx.db.auditLog.iter()]) ctx.db.auditLog.id.delete(r.id);
    resetPatterns(ctx);
    for (const r of [...ctx.db.reportChart.iter()]) ctx.db.reportChart.id.delete(r.id);
    resetClassificationsTo(ctx, activeScenario(ctx).categories);
    resetFollowUps(ctx);
    // The canvas back to its default layout, every card closed
    for (const r of [...ctx.db.pipelineLayout.iter()]) ctx.db.pipelineLayout.nodeId.delete(r.nodeId);
    for (const r of [...ctx.db.pipelineNodeSize.iter()]) ctx.db.pipelineNodeSize.nodeId.delete(r.nodeId);
    for (const r of [...ctx.db.pipelineCard.iter()]) ctx.db.pipelineCard.nodeId.delete(r.nodeId);
    for (const event of [...ctx.db.inboundEvent.iter()]) ctx.db.inboundEvent.id.delete(event.id);
    for (const label of [...ctx.db.inboundLabel.iter()]) ctx.db.inboundLabel.eventId.delete(label.eventId);
    for (const source of InboundHub.sources) {
      const row = sourceRow(ctx, source);
      // Sources that can baseline skip their history on the next tick
      const state = source.baseline ? mergeState(row.state, JSON.stringify({ [BASELINE_FLAG]: true })) : '';
      ctx.db.inboundSource.name.update({ ...row, state });
      updateStatus(ctx, source.name, { emitted: 0n, lastError: undefined, lastPolledAt: undefined });
    }
    resetPipeline(ctx);
    // Status rows for sources that no longer exist (e.g. removed integrations)
    for (const status of [...ctx.db.inboundSourceStatus.iter()]) {
      if (!InboundHub.get(status.name)) ctx.db.inboundSourceStatus.name.delete(status.name);
    }
    setAll(ctx, true);
  }

  const restartInbound = stdb.reducer(ctx => {
    restart(ctx);
    logAction(ctx, ctx.sender, 'pipeline', 'Pressed Restart (cleared the books and replayed)');
  });

  // Play a different business (the sidebar). Its vendors and customers are
  // new, so the books start empty: QuickBooks, the email threads about the
  // old vendors and the categories go too, then everything restarts.
  const setScenario = stdb.reducer({ key: t.string() }, (ctx, { key }) => {
    const scenario = SCENARIOS.find(s => s.key === key);
    if (!scenario) throw new SenderError(`Unknown scenario "${key}". Expected one of: ${SCENARIOS.map(s => s.key).join(', ')}`);
    if (ctx.db.scenario.id.find(0)) ctx.db.scenario.id.update({ id: 0, key });
    else ctx.db.scenario.insert({ id: 0, key });
    restart(ctx);
    logAction(ctx, ctx.sender, 'pipeline', `Switched to the ${scenario.name} scenario (cleared the books and replayed)`);
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
        scenario: ctx.withTx(tx => activeScenario(tx)),
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

        // After a Restart: record where the source is now and emit nothing yet
        if (source.baseline && hasBaselineFlag(row.state)) {
          try {
            const { [BASELINE_FLAG]: _, ...rest } = JSON.parse(row.state) as Record<string, unknown>;
            const prior = JSON.stringify(rest);
            const state = mergeState(prior, source.baseline(sourceCtx, prior));
            ctx.withTx(tx => {
              const current = tx.db.inboundSource.name.find(row.name);
              if (!current || current.state !== row.state) return;
              tx.db.inboundSource.name.update({ ...current, state });
              updateStatus(tx, row.name, { configured: true, lastPolledAt: tx.timestamp, lastError: undefined });
            });
          } catch (err) {
            ctx.withTx(tx => updateStatus(tx, row.name, { lastPolledAt: tx.timestamp, lastError: `Baseline: ${message(err)}` }));
          }
          continue;
        }

        if (source.pollChance !== undefined && ctx.random() > source.pollChance) continue;

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
            if (!current || current.state !== row.state) return;
            tx.db.inboundSource.name.update({ ...current, state: simulated });
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
            // A Restart (or another tick) changed this source mid-poll: drop this result
            const before = tx.db.inboundSource.name.find(row.name);
            if (!before || before.state !== row.state) return;
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

            tx.db.inboundSource.name.update({ ...before, state });
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
    resizePipelineNode,
    setPipelineCardExpanded,
    tidyPipelineLayout,
    runInbound,
    pauseInbound,
    restartInbound,
    setScenario,
    inboundTick,
  };
}
