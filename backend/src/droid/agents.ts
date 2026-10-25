import {
  ScheduleAt,
  SenderError,
  t,
  type InferSchema,
  type ReducerCtx,
} from 'spacetimedb/server';
import type spacetimedb from '../index';
import {
  FactoryClient,
  finalReply,
  toEvents,
  type AutonomyLevel,
} from './factory';
import { agentTickSchedule } from './tables';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Task = NonNullable<ReturnType<Ctx['db']['agentTask']['id']['find']>>;

const TICK_INTERVAL_MICROS = 2_000_000n;
const AUTONOMY_LEVELS: AutonomyLevel[] = ['off', 'low', 'medium', 'high'];

// Task kinds that should think less and finish faster
const REASONING_BY_KIND: Record<string, 'low' | 'medium' | 'high'> = { pipeline: 'low', report: 'low', ask: 'low' };

// ─── Extension point ────────────────────────────────────────────────────────

// Called in the same transaction that marks a task done or failed. Other
// modules register for their task kind (Ask Settle routes its messages here).
type SettledHook = (ctx: Ctx, task: Task) => void;
const settledHooks = new Map<string, SettledHook>();

export function onTaskSettledOfKind(kind: string, hook: SettledHook) {
  settledHooks.set(kind, hook);
}

function onTaskSettled(ctx: Ctx, task: Task): void {
  settledHooks.get(task.kind)?.(ctx, task);
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ensureTicking(ctx: Ctx) {
  for (const _ of ctx.db.agentTickSchedule.iter()) return;
  ctx.db.agentTickSchedule.insert({
    scheduledId: 0n,
    scheduledAt: ScheduleAt.interval(TICK_INTERVAL_MICROS),
  });
}

function updateTask(ctx: Ctx, id: bigint, patch: Partial<Task>): Task | undefined {
  const task = ctx.db.agentTask.id.find(id);
  if (!task) return undefined;
  const next = { ...task, ...patch, updatedAt: ctx.timestamp };
  ctx.db.agentTask.id.update(next);
  if (
    (next.status === 'done' || next.status === 'failed') &&
    next.status !== task.status
  ) {
    onTaskSettled(ctx, next);
  }
  return next;
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Queue a Droid task from any reducer or transaction; returns its id.
export function enqueueAgentTask(ctx: Ctx, kind: string, prompt: string, autonomy: AutonomyLevel): bigint {
  const task = ctx.db.agentTask.insert({
    id: 0n,
    kind,
    prompt,
    autonomy,
    status: 'pending',
    sessionId: undefined,
    result: undefined,
    error: undefined,
    todos: undefined,
    lastSeq: 0n,
    createdBy: ctx.sender,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  ensureTicking(ctx);
  return task.id;
}

// ─── Exports ────────────────────────────────────────────────────────────────

export function droidAgents(stdb: Schema) {
  const requestAgentTask = stdb.reducer(
    { kind: t.string(), prompt: t.string(), autonomy: t.string() },
    (ctx, { kind, prompt, autonomy }) => {
      if (!prompt.trim()) throw new SenderError('Prompt must not be empty');
      if (!AUTONOMY_LEVELS.includes(autonomy as AutonomyLevel)) {
        throw new SenderError(`autonomy must be one of ${AUTONOMY_LEVELS.join(', ')}`);
      }
      enqueueAgentTask(ctx, kind, prompt, autonomy as AutonomyLevel);
    }
  );

  // New information for an agent. interrupt=false queues it after the current
  // turn; interrupt=true stops the turn and redirects now. Steering a done
  // task continues the same session with full context.
  const steerAgentTask = stdb.reducer(
    { taskId: t.u64(), text: t.string(), interrupt: t.bool() },
    (ctx, { taskId, text, interrupt }) => {
      const task = ctx.db.agentTask.id.find(taskId);
      if (!task) throw new SenderError('Task not found');
      if (!['pending', 'starting', 'running', 'done'].includes(task.status)) {
        throw new SenderError(`Cannot steer a ${task.status} task`);
      }
      if (!text.trim()) throw new SenderError('Message must not be empty');
      ctx.db.agentOutbox.insert({ id: 0n, taskId, text, interrupt });
      ensureTicking(ctx);
    }
  );

  const cancelAgentTask = stdb.reducer({ taskId: t.u64() }, (ctx, { taskId }) => {
    const task = ctx.db.agentTask.id.find(taskId);
    if (!task) throw new SenderError('Task not found');
    if (task.sessionId && task.status === 'running') {
      ctx.db.agentOutbox.insert({ id: 0n, taskId, text: '', interrupt: true });
      ensureTicking(ctx);
    }
    if (!['done', 'failed', 'cancelled'].includes(task.status)) {
      updateTask(ctx, taskId, { status: 'cancelled' });
    }
  });

  // Time-limited download link for a file the agent wrote, e.g. 'report.xlsx'.
  const agentFileUrl = stdb.procedure(
    { taskId: t.u64(), filePath: t.string() },
    t.string(),
    (ctx, { taskId, filePath }) => {
      const task = ctx.withTx(tx => tx.db.agentTask.id.find(taskId));
      if (!task?.sessionId) throw new SenderError('Task has no session yet');
      const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
      return factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, task.sessionId, filePath);
    }
  );

  // Runs every 2s while any task needs attention, then unschedules itself.
  // HTTP can't happen inside a transaction, so each step is: read in a tx,
  // call Factory, write the outcome in a new tx.
  const agentTick = stdb.procedure(
    { onSchedule: agentTickSchedule },
    { arg: agentTickSchedule.rowType },
    t.unit(),
    ctx => {
      // Claim pending tasks atomically so an overlapping tick can't start them twice.
      const work = ctx.withTx(tx => {
        const tasks = [...tx.db.agentTask.iter()];
        const pending = tasks.filter(task => task.status === 'pending');
        for (const task of pending) updateTask(tx, task.id, { status: 'starting' });
        return {
          pending,
          running: tasks.filter(task => task.status === 'running' && task.sessionId),
          outbox: [...tx.db.agentOutbox.iter()],
        };
      });

      if (!work.pending.length && !work.running.length && !work.outbox.length) {
        ctx.withTx(tx => {
          for (const row of [...tx.db.agentTickSchedule.iter()]) {
            tx.db.agentTickSchedule.scheduledId.delete(row.scheduledId);
          }
        });
        return {};
      }

      const apiKey = ctx.env.FACTORY_API_KEY;
      const computerId = ctx.env.FACTORY_COMPUTER_ID;
      if (!apiKey || !computerId) {
        ctx.withTx(tx => {
          for (const task of work.pending) {
            updateTask(tx, task.id, {
              status: 'failed',
              error: 'FACTORY_API_KEY / FACTORY_COMPUTER_ID not set on this database',
            });
          }
        });
        return {};
      }
      const factory = new FactoryClient(ctx.http, apiKey);

      // 1. Start pending tasks
      if (work.pending.length) {
        try {
          factory.wakeComputer(computerId);
        } catch (err) {
          console.warn(`wakeComputer failed: ${message(err)}`);
        }
      }
      for (const task of work.pending) {
        try {
          const sessionId = factory.createSession(computerId, {
            autonomyLevel: task.autonomy as AutonomyLevel,
            reasoningEffort: REASONING_BY_KIND[task.kind],
          });
          ctx.withTx(tx => {
            // Cancelled while we were starting it
            if (tx.db.agentTask.id.find(task.id)?.status !== 'starting') {
              updateTask(tx, task.id, { sessionId });
              return;
            }
            updateTask(tx, task.id, { status: 'running', sessionId });
            // A new session briefly 404s on messages, so the prompt goes out on
            // the next tick through the outbox, which retries until it lands.
            tx.db.agentOutbox.insert({
              id: 0n,
              taskId: task.id,
              text: task.prompt,
              interrupt: false,
            });
          });
        } catch (err) {
          ctx.withTx(tx => updateTask(tx, task.id, { status: 'failed', error: message(err) }));
        }
      }

      // 2. Deliver steering messages (wait for tasks that haven't started yet)
      for (const item of work.outbox) {
        const task = ctx.withTx(tx => tx.db.agentTask.id.find(item.taskId));
        if (!task || task.status === 'failed') {
          ctx.withTx(tx => tx.db.agentOutbox.id.delete(item.id));
          continue;
        }
        if (!task.sessionId) continue;
        try {
          if (item.interrupt) factory.interrupt(task.sessionId);
          if (item.text) factory.sendMessage(task.sessionId, item.text);
          ctx.withTx(tx => {
            tx.db.agentOutbox.id.delete(item.id);
            if (item.text && task.status !== 'cancelled') {
              updateTask(tx, task.id, { status: 'running' });
            }
          });
        } catch (err) {
          console.warn(`steer task ${task.id} failed: ${message(err)}`);
        }
      }

      // 3. Poll running tasks: copy new steps, finish when the turn is over
      for (const task of work.running) {
        try {
          const status = factory.getSessionStatus(task.sessionId!);
          const messages = factory.recentMessages(task.sessionId!);
          // While running, the newest message may still be streaming in
          const settled = status === 'idle' ? messages : messages.slice(0, -1);
          const reply = status === 'idle' ? finalReply(messages) : undefined;

          ctx.withTx(tx => {
            const current = tx.db.agentTask.id.find(task.id);
            if (!current || current.status !== 'running') return;

            let lastSeq = current.lastSeq;
            let todos = current.todos;
            for (const event of toEvents(settled)) {
              const seq = BigInt(event.seq);
              if (seq <= current.lastSeq) continue;
              if (seq > lastSeq) lastSeq = seq;

              if (event.type === 'result') {
                const step = [...tx.db.agentStep.taskId.filter(task.id)].find(
                  s => s.toolUseId === event.toolUseId
                );
                if (step) {
                  tx.db.agentStep.id.update({
                    ...step,
                    result: event.result,
                    status: event.isError ? 'error' : 'ok',
                  });
                }
                continue;
              }

              tx.db.agentStep.insert({
                id: 0n,
                taskId: task.id,
                seq,
                role: event.role,
                kind: event.kind,
                text: event.text,
                toolUseId: event.toolUseId,
                toolName: event.toolName,
                input: event.input,
                result: undefined,
                status: event.kind === 'tool' ? 'running' : undefined,
                riskLevel: event.riskLevel,
                parentToolUseId: event.parentToolUseId,
                at: tx.timestamp,
              });
              if (event.todos) todos = JSON.stringify(event.todos);
            }

            const steerQueued = [...tx.db.agentOutbox.iter()].some(o => o.taskId === task.id);
            if (reply !== undefined && !steerQueued) {
              updateTask(tx, task.id, { status: 'done', result: reply, lastSeq, todos });
            } else if (lastSeq !== current.lastSeq) {
              updateTask(tx, task.id, { lastSeq, todos });
            }
          });
        } catch (err) {
          console.warn(`poll task ${task.id} failed: ${message(err)}`);
        }
      }

      return {};
    }
  );

  return {
    requestAgentTask,
    steerAgentTask,
    cancelAgentTask,
    agentFileUrl,
    agentTick,
  };
}
