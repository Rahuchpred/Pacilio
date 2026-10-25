import type { Identity } from 'spacetimedb';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { ensureTicking } from '../pipeline/ticking';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

export type AuditKind = 'decision' | 'settle' | 'ask' | 'classification' | 'email' | 'pipeline' | 'report' | 'pattern';

// Record one human action. Learnable ones wake the pipeline tick, which runs
// the pattern learner a few seconds later.
export function logAction(
  ctx: Ctx,
  who: Identity,
  kind: AuditKind,
  summary: string,
  opts: { eventId?: bigint; details?: Record<string, unknown>; learnable?: boolean } = {}
) {
  ctx.db.auditLog.insert({
    id: 0n,
    at: ctx.timestamp,
    who,
    whoName: ctx.db.user.identity.find(who)?.name ?? 'Someone',
    kind,
    summary: summary.slice(0, 500),
    eventId: opts.eventId,
    details: JSON.stringify(opts.details ?? {}),
    learnable: !!opts.learnable,
  });
  if (opts.learnable) ensureTicking(ctx);
}
