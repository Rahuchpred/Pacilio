import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type spacetimedb from '../index';
import { onTaskSettledOfKind } from '../droid/agents';
import { ensureTicking } from '../pipeline/ticking';
import { logAction } from '../learn/audit';

// Ask Settle as a dispatcher. A person asks in plain words; Settle answers,
// and when the ask is really for an agent ("put these under Catering", "make
// me a vendor report") it sends that agent a one-off message. The message is
// queued at once (no confirm step) and rides along with that agent's next run,
// which replies to it in a sentence.

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Task = NonNullable<ReturnType<Ctx['db']['agentTask']['id']['find']>>;
export type Message = NonNullable<ReturnType<Ctx['db']['agentMessage']['id']['find']>>;
export type Target = 'main' | 'reports';

const TARGETS: Target[] = ['main', 'reports'];
// Ask Settle puts the person's words after this marker in its prompt
const QUESTION_MARK = '\nQuestion: ';
const MAX_PER_ASK = 3;
const MAX_TEXT = 800;
const MAX_REPLY = 600;

export type AskReply = { answer: string; send: { to: Target; message: string }[] };

// Settle's reply is JSON; tolerate a code fence or a stray sentence around it,
// and fall back to treating plain text as the answer.
export function parseAsk(text: string | undefined): AskReply {
  const raw = (text ?? '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { answer?: unknown; send?: unknown };
      const send = Array.isArray(parsed.send)
        ? parsed.send
            .map(s => s as { to?: unknown; message?: unknown })
            .filter(s => TARGETS.includes(s.to as Target) && typeof s.message === 'string' && s.message.trim())
            .slice(0, MAX_PER_ASK)
            .map(s => ({ to: s.to as Target, message: (s.message as string).trim().slice(0, MAX_TEXT) }))
        : [];
      return { answer: typeof parsed.answer === 'string' ? parsed.answer : '', send };
    } catch {
      // not JSON after all
    }
  }
  return { answer: raw, send: [] };
}

// Give the agent a reason to run: the pipeline tick picks up main-agent
// messages; a reports message also asks for a report build.
function wake(ctx: Ctx, target: Target) {
  if (target === 'reports') {
    const state = ctx.db.reportState.id.find(0);
    if (state) ctx.db.reportState.id.update({ ...state, requested: true });
    else
      ctx.db.reportState.insert({
        id: 0,
        status: 'idle',
        taskId: undefined,
        requested: true,
        ledgerRunId: 0n,
        lastStartedAt: undefined,
        lastError: undefined,
      });
  }
  ensureTicking(ctx);
}

// When an Ask Settle task finishes, queue whatever it decided to send.
onTaskSettledOfKind('ask', (ctx, task: Task) => {
  if (task.status !== 'done') return;
  const { send } = parseAsk(task.result);
  for (const s of send) {
    ctx.db.agentMessage.insert({
      id: 0n,
      askTaskId: task.id,
      target: s.to,
      text: s.message,
      status: 'queued',
      runRef: undefined,
      reply: undefined,
      createdBy: task.createdBy,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
  for (const target of new Set(send.map(s => s.to))) wake(ctx, target);
  // The audit log: what was asked, and what Settle passed on
  const at = task.prompt.lastIndexOf(QUESTION_MARK);
  const question = at < 0 ? '' : task.prompt.slice(at + QUESTION_MARK.length).trim();
  if (!send.length) {
    logAction(ctx, task.createdBy, 'ask', `Asked Settle: "${question.slice(0, 200)}"`);
  }
  for (const s of send) {
    const to = s.to === 'main' ? 'the Bookkeeper' : 'the reports agent';
    logAction(ctx, task.createdBy, 'settle', `Told ${to} (through Settle): "${s.message}"`, {
      // Corrections to the Bookkeeper are something to learn from
      learnable: s.to === 'main',
      details: { asked: question.slice(0, 300) },
    });
  }
});

// ─── For the agents' runs ───────────────────────────────────────────────────

export function queuedFor(ctx: Ctx, target: Target): Message[] {
  return [...ctx.db.agentMessage.iter()]
    .filter(m => m.target === target && m.status === 'queued')
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export const promptId = (m: Message) => `m${m.id}`;

// Messages written into a run's prompt
export function markSent(ctx: Ctx, messages: Message[], runRef: bigint) {
  for (const m of messages) {
    ctx.db.agentMessage.id.update({ ...m, status: 'sent', runRef, updatedAt: ctx.timestamp });
  }
}

// The run finished: record what the agent said it did with each message.
export function finishMessages(ctx: Ctx, runRef: bigint, replies: unknown) {
  const byId = new Map<string, string>();
  if (Array.isArray(replies)) {
    for (const r of replies as { id?: unknown; reply?: unknown }[]) {
      if (typeof r.id === 'string' && typeof r.reply === 'string') byId.set(r.id, r.reply.trim().slice(0, MAX_REPLY));
    }
  }
  for (const m of [...ctx.db.agentMessage.iter()]) {
    if (m.runRef !== runRef || m.status !== 'sent') continue;
    ctx.db.agentMessage.id.update({
      ...m,
      status: 'done',
      reply: byId.get(promptId(m)) ?? m.reply,
      updatedAt: ctx.timestamp,
    });
  }
}

// The run failed: its messages go back in the queue for the next one.
export function requeueMessages(ctx: Ctx, runRef: bigint) {
  for (const m of [...ctx.db.agentMessage.iter()]) {
    if (m.runRef !== runRef || m.status !== 'sent') continue;
    ctx.db.agentMessage.id.update({ ...m, status: 'queued', runRef: undefined, updatedAt: ctx.timestamp });
  }
}

// ─── Reducers ───────────────────────────────────────────────────────────────

export function settle(stdb: Schema) {
  // Take back a message no run has picked up yet.
  const cancelAgentMessage = stdb.reducer({ messageId: t.u64() }, (ctx, { messageId }) => {
    const m = ctx.db.agentMessage.id.find(messageId);
    if (!m) throw new SenderError('Message not found');
    if (m.status !== 'queued') throw new SenderError('The agent already has this message');
    ctx.db.agentMessage.id.update({ ...m, status: 'cancelled', updatedAt: ctx.timestamp });
    logAction(ctx, ctx.sender, 'settle', `Cancelled a message to ${m.target === 'main' ? 'the Bookkeeper' : 'the reports agent'}: "${m.text}"`);
  });

  return { cancelAgentMessage };
}
