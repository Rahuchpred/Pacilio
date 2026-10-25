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
  FactoryError,
  finalReply,
  toEvents,
  type AutonomyLevel,
} from './factory';
import { agentTickSchedule } from './tables';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Task = NonNullable<ReturnType<Ctx['db']['agentTask']['id']['find']>>;

const TICK_INTERVAL_MICROS = 2_000_000n;
// Tasks per session before a kind starts a fresh one (keeps the context short)
const LANE_TURNS = 8;
// Put in front of a prompt that goes to a session that already ran other tasks
const NEXT_TASK = 'New task. Earlier messages in this conversation were other tasks: leave them aside and use only what is below.\n\n';
const AUTONOMY_LEVELS: AutonomyLevel[] = ['off', 'low', 'medium', 'high'];

// Task kinds that should think less and finish faster
const REASONING_BY_KIND: Record<string, 'low' | 'medium' | 'high'> = { pipeline: 'low', report: 'low', ask: 'low', learn: 'low', render: 'low' };

// ─── Extension point ────────────────────────────────────────────────────────

// Called in the same transaction that marks a task done or failed. Other
// modules register for their task kind (Ask Pacioli routes its messages here).
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

const laneKey = (task: Task) => `${task.kind}:${task.autonomy}`;
const FINISHED = ['done', 'failed', 'cancelled'];

function updateTask(ctx: Ctx, id: bigint, patch: Partial<Task>): Task | undefined {
  const task = ctx.db.agentTask.id.find(id);
  if (!task) return undefined;
  const next = { ...task, ...patch, updatedAt: ctx.timestamp };
  ctx.db.agentTask.id.update(next);
  // A finished task frees its kind's session for the next one
  if (FINISHED.includes(next.status)) {
    const lane = ctx.db.agentLane.key.find(laneKey(next));
    if (lane?.busyTaskId === id) ctx.db.agentLane.key.update({ ...lane, busyTaskId: undefined });
  }
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

// Queue a Factory session to be stopped and deleted on the next tick.
export function closeSession(ctx: Ctx, sessionId: string | undefined) {
  if (!sessionId || ctx.db.sessionCleanup.sessionId.find(sessionId)) return;
  ctx.db.sessionCleanup.insert({ sessionId });
  ensureTicking(ctx);
}

// A session that's still open, for downloads: any session can fetch any file
// on the computer, and the one that wrote a file may have been closed since.
export function liveSession(ctx: Ctx, wrote?: string): string | undefined {
  const lanes = [...ctx.db.agentLane.iter()];
  if (wrote && lanes.some(l => l.sessionId === wrote)) return wrote;
  return lanes[0]?.sessionId ?? ctx.db.ledgerFiles.id.find(0)?.uploadSessionId ?? wrote;
}

// Stop every agent this database runs, close all of its sessions and reboot
// the computer (Restart and scenario swaps), so the next tasks start on a
// clean machine with no context. Unfinished tasks are cancelled; finished
// ones lose their session, so old download links stop working.
export function shutDownAgents(ctx: Ctx) {
  for (const lane of [...ctx.db.agentLane.iter()]) {
    closeSession(ctx, lane.sessionId);
    ctx.db.agentLane.key.delete(lane.key);
  }
  if (!ctx.db.computerReboot.id.find(0)) ctx.db.computerReboot.insert({ id: 0 });
  ensureTicking(ctx);
  for (const o of [...ctx.db.agentOutbox.iter()]) ctx.db.agentOutbox.id.delete(o.id);
  for (const task of [...ctx.db.agentTask.iter()]) {
    const open = !['done', 'failed', 'cancelled'].includes(task.status);
    if (!open && !task.sessionId) continue;
    closeSession(ctx, task.sessionId);
    updateTask(ctx, task.id, { sessionId: undefined, ...(open ? { status: 'cancelled' } : {}) });
  }
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
      const sessionId = ctx.withTx(tx => {
        const task = tx.db.agentTask.id.find(taskId);
        return task?.sessionId && liveSession(tx, task.sessionId);
      });
      if (!sessionId) throw new SenderError('Task has no session yet');
      const factory = new FactoryClient(ctx.http, ctx.env.FACTORY_API_KEY);
      return factory.downloadUrl(ctx.env.FACTORY_COMPUTER_ID, sessionId, filePath);
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
      // Claim pending tasks atomically so an overlapping tick can't start them
      // twice: one per kind, and only when that kind's session is free. Nothing
      // starts while the computer waits for a reboot.
      const work = ctx.withTx(tx => {
        const tasks = [...tx.db.agentTask.iter()].sort((a, b) => (a.id < b.id ? -1 : 1));
        const rebooting = !!tx.db.computerReboot.id.find(0);
        const busy = new Set(tasks.filter(task => task.status === 'starting' || task.status === 'running').map(laneKey));
        const pending: Task[] = [];
        for (const task of tasks) {
          if (task.status !== 'pending' || rebooting || busy.has(laneKey(task))) continue;
          busy.add(laneKey(task));
          pending.push(task);
          updateTask(tx, task.id, { status: 'starting' });
        }
        return {
          pending,
          waiting: tasks.some(task => task.status === 'pending'),
          running: tasks.filter(task => task.status === 'running' && task.sessionId),
          outbox: [...tx.db.agentOutbox.iter()],
          cleanup: [...tx.db.sessionCleanup.iter()].map(r => r.sessionId),
          rebooting,
          lanes: [...tx.db.agentLane.iter()],
        };
      });

      if (!work.waiting && !work.running.length && !work.outbox.length && !work.cleanup.length && !work.rebooting) {
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

      // 0. Stop and delete sessions that are no longer wanted, then reboot if asked
      for (const sessionId of work.cleanup.slice(0, 20)) {
        try {
          try {
            factory.interrupt(sessionId);
          } catch {
            // already idle or gone
          }
          factory.deleteSession(sessionId);
        } catch (err) {
          if (!(err instanceof FactoryError && err.status === 404)) {
            console.warn(`delete session ${sessionId} failed: ${message(err)}`);
            continue;
          }
        }
        ctx.withTx(tx => tx.db.sessionCleanup.sessionId.delete(sessionId));
      }
      if (work.rebooting && work.cleanup.length <= 20) {
        try {
          factory.rebootComputer(computerId);
        } catch (err) {
          // Booting anyway or unreachable: carry on rather than hold every task
          console.warn(`reboot failed: ${message(err)}`);
        }
        ctx.withTx(tx => tx.db.computerReboot.id.delete(0));
        return {};
      }

      // 1. Start pending tasks
      if (work.pending.length) {
        try {
          factory.wakeComputer(computerId);
        } catch (err) {
          console.warn(`wakeComputer failed: ${message(err)}`);
        }
      }
      for (const task of work.pending) {
        const lane = work.lanes.find(l => l.key === laneKey(task));
        try {
          // Reuse the kind's session while it's young; its reply will come
          // after the newest message there now
          let reused: { sessionId: string; startSeq: bigint } | undefined;
          if (lane && lane.turns < LANE_TURNS) {
            try {
              const [newest] = factory.recentMessages(lane.sessionId, 1);
              reused = { sessionId: lane.sessionId, startSeq: BigInt(newest?.seq ?? 0) };
            } catch {
              // gone (deleted or rebooted away): start a fresh one
            }
          }
          const sessionId =
            reused?.sessionId ??
            factory.createSession(computerId, {
              autonomyLevel: task.autonomy as AutonomyLevel,
              reasoningEffort: REASONING_BY_KIND[task.kind],
            });
          const startSeq = reused?.startSeq ?? 0n;
          ctx.withTx(tx => {
            const current = tx.db.agentLane.key.find(laneKey(task));
            // Cancelled while we were starting it
            if (tx.db.agentTask.id.find(task.id)?.status !== 'starting') {
              if (!reused) closeSession(tx, sessionId);
              return;
            }
            if (!reused && current) closeSession(tx, current.sessionId);
            const row = { key: laneKey(task), sessionId, turns: reused && current ? current.turns + 1 : 1, busyTaskId: task.id, startSeq };
            if (current) tx.db.agentLane.key.update(row);
            else tx.db.agentLane.insert(row);
            updateTask(tx, task.id, { status: 'running', sessionId, lastSeq: startSeq });
            // A new session briefly 404s on messages, so the prompt goes out on
            // the next tick through the outbox, which retries until it lands.
            tx.db.agentOutbox.insert({
              id: 0n,
              taskId: task.id,
              text: reused ? NEXT_TASK + task.prompt : task.prompt,
              interrupt: false,
            });
          });
        } catch (err) {
          // The computer is at its session limit: wait for a slot and try again
          const full = err instanceof FactoryError && err.status === 429;
          if (full) console.warn(`task ${task.id} waits for a session slot`);
          ctx.withTx(tx => {
            if (tx.db.agentTask.id.find(task.id)?.status !== 'starting') return;
            updateTask(tx, task.id, full ? { status: 'pending' } : { status: 'failed', error: message(err) });
          });
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
          // In a reused session, only what came after this task started
          const since = work.lanes.find(l => l.busyTaskId === task.id)?.startSeq ?? 0n;
          const messages = factory.recentMessages(task.sessionId!).filter(m => BigInt(m.seq) > since);
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
          // Its session is gone (deleted, or lost in a reboot): give up on it so
          // whatever waits for it can move on. A brand-new one can 404 briefly.
          const stale = ctx.timestamp.microsSinceUnixEpoch - task.updatedAt.microsSinceUnixEpoch > 60_000_000n;
          if (err instanceof FactoryError && err.status === 404 && stale) {
            ctx.withTx(tx => {
              if (tx.db.agentTask.id.find(task.id)?.status === 'running') {
                updateTask(tx, task.id, { status: 'failed', error: 'Its Factory session no longer exists' });
              }
            });
          }
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
