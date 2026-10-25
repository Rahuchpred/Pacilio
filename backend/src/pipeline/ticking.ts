import { ScheduleAt, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

const TICK_INTERVAL_MICROS = 3_000_000n;

// Start the pipeline tick (Bookkeeper + reports agent) if it isn't running.
export function ensureTicking(ctx: Ctx) {
  for (const _ of ctx.db.pipelineTickSchedule.iter()) return;
  ctx.db.pipelineTickSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_INTERVAL_MICROS) });
}
