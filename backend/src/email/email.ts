import { SenderError, t, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import type spacetimedb from '../index';
import { emailTickSchedule } from './tables';
import { logAction } from '../learn/audit';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type Thread = NonNullable<ReturnType<Ctx['db']['emailThread']['id']['find']>>;

// The default follow-up schedule: how long to wait for a reply before each
// follow-up (minutes) and what it says. People can edit it in the UI (the
// email_follow_up table); after the last one a thread shows "No reply".
const DEFAULT_FOLLOW_UPS = [
  { delayMin: 10, message: 'Just following up on my note below. Could you take a look when you have a moment?' },
  { delayMin: 30, message: 'Following up again on the message below. We need this to close out our books.' },
  { delayMin: 120, message: 'Checking in once more on the item below. A quick reply with where things stand would help.' },
  { delayMin: 1440, message: "Last follow-up from us on the item below. Please reply so we can settle it; we'll stop nudging after this." },
];
const MAX_STEPS = 10;
const MAX_DELAY_MIN = 7 * 24 * 60;
const MAX_MESSAGE = 1000;
const MINUTE_MICROS = 60_000_000n;

// Email sending was removed after the hackathon: nothing leaves Pacioli. The
// thread tables stay so existing data keeps its shape.
export const EMAIL_OFF = 'Email sending is off, nothing was sent';

type Step = { delayMin: number; message: string };

function writeSteps(ctx: Ctx, steps: Step[]) {
  for (const row of [...ctx.db.emailFollowUp.iter()]) ctx.db.emailFollowUp.step.delete(row.step);
  steps.forEach((s, step) => ctx.db.emailFollowUp.insert({ step, delayMin: s.delayMin, message: s.message }));
}

// Seed the default schedule once, so the UI has something to show and edit.
export function ensureFollowUpDefaults(ctx: Ctx) {
  if (ctx.db.emailFollowUp.count() === 0n) writeSteps(ctx, DEFAULT_FOLLOW_UPS);
}

// Back to the default schedule (Restart).
export function resetFollowUps(ctx: Ctx) {
  writeSteps(ctx, DEFAULT_FOLLOW_UPS);
}

// The schedule in order (the defaults until it has been seeded).
function followUpSteps(ctx: Ctx): Step[] {
  const rows = [...ctx.db.emailFollowUp.iter()].sort((a, b) => a.step - b.step);
  return rows.length ? rows : DEFAULT_FOLLOW_UPS;
}

// Where a waiting thread stands after `followUps` nudges: the next one's due
// time from `from`, or "No reply" when the schedule has run out.
function nextWait(ctx: Ctx, followUps: number, from: Timestamp): Pick<Thread, 'status' | 'nextFollowUpAt'> {
  const next = followUpSteps(ctx)[followUps];
  return next
    ? { status: 'waiting', nextFollowUpAt: inMinutes({ timestamp: from }, next.delayMin) }
    : { status: 'gave_up', nextFollowUpAt: undefined };
}

function inMinutes(ctx: { timestamp: Timestamp }, minutes: number): Timestamp {
  return new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(minutes) * MINUTE_MICROS);
}

function updateThread(ctx: Ctx, id: bigint, patch: Partial<Thread>) {
  const thread = ctx.db.emailThread.id.find(id);
  if (thread) ctx.db.emailThread.id.update({ ...thread, ...patch });
}

export function email(stdb: Schema) {
  // Leftover from when email was on: stops the old 30s schedule if it still fires.
  const emailTick = stdb.procedure(
    { onSchedule: emailTickSchedule },
    { arg: emailTickSchedule.rowType },
    t.unit(),
    ctx => {
      ctx.withTx(tx => {
        for (const row of [...tx.db.emailTickSchedule.iter()]) tx.db.emailTickSchedule.scheduledId.delete(row.scheduledId);
      });
      return {};
    }
  );

  // Kept so the UI's reply box gets a clear answer.
  const sendEmailReply = stdb.procedure({ threadId: t.u64(), text: t.string() }, t.string(), () => {
    throw new SenderError(EMAIL_OFF);
  });

  // Opened in the UI: clear the blue dot.
  const markEmailThreadRead = stdb.reducer({ threadId: t.u64() }, (ctx, { threadId }) => {
    updateThread(ctx, threadId, { unread: false });
  });

  // Done with it: stop nudging.
  const closeEmailThread = stdb.reducer({ threadId: t.u64() }, (ctx, { threadId }) => {
    updateThread(ctx, threadId, { status: 'closed', nextFollowUpAt: undefined, unread: false });
    const closed = ctx.db.emailThread.id.find(threadId);
    if (closed) logAction(ctx, ctx.sender, 'email', `Closed the email thread with ${closed.counterparty}`, { eventId: closed.eventId });
  });

  // Back to an open thread: waiting on them again (nudging from the first
  // follow-up), or "replied" if their message is the last one.
  const reopenEmailThread = stdb.reducer({ threadId: t.u64() }, (ctx, { threadId }) => {
    const thread = ctx.db.emailThread.id.find(threadId);
    if (!thread) throw new SenderError('Thread not found');
    if (thread.status !== 'closed' && thread.status !== 'gave_up') throw new SenderError('This thread is already open');
    if (!thread.lastMessageId) throw new SenderError("This thread's first email never sent");
    const last = [...ctx.db.emailMessage.threadId.filter(threadId)].sort((a, b) =>
      a.sentAt.microsSinceUnixEpoch < b.sentAt.microsSinceUnixEpoch ? 1 : -1
    )[0];
    const theirs = last?.direction === 'in';
    updateThread(ctx, threadId, {
      ...(theirs ? { status: 'replied', nextFollowUpAt: undefined } : nextWait(ctx, 0, ctx.timestamp)),
      followUps: 0,
      lastActivityAt: ctx.timestamp,
      error: undefined,
    });
    logAction(ctx, ctx.sender, 'email', `Reopened the email thread with ${thread.counterparty}`, { eventId: thread.eventId });
  });

  // Edit the follow-up schedule for every thread, for everyone. Threads that
  // are waiting move to the new timing (from their last message).
  const setEmailFollowUps = stdb.reducer(
    { steps: t.array(t.object('FollowUpStep', { delayMin: t.u32(), message: t.string() })) },
    (ctx, { steps }) => {
      if (steps.length > MAX_STEPS) throw new SenderError(`At most ${MAX_STEPS} follow-ups`);
      const clean = steps.map((s, i) => {
        const message = s.message.trim();
        if (!message) throw new SenderError(`Follow-up ${i + 1} needs a message`);
        if (message.length > MAX_MESSAGE) throw new SenderError(`Follow-up ${i + 1} is too long`);
        if (s.delayMin < 1 || s.delayMin > MAX_DELAY_MIN) throw new SenderError(`Follow-up ${i + 1}: wait between 1 minute and 7 days`);
        return { delayMin: s.delayMin, message };
      });
      writeSteps(ctx, clean);
      logAction(ctx, ctx.sender, 'email', `Set the follow-ups to ${clean.length ? clean.map(s => `${s.delayMin} min`).join(', ') : 'none'}`);
      for (const thread of [...ctx.db.emailThread.iter()]) {
        if (thread.status !== 'waiting' && thread.status !== 'gave_up') continue;
        updateThread(ctx, thread.id, nextWait(ctx, thread.followUps, thread.lastActivityAt));
      }
      }
  );

  // Back to the default schedule.
  const resetEmailFollowUps = stdb.reducer(ctx => {
    writeSteps(ctx, DEFAULT_FOLLOW_UPS);
    logAction(ctx, ctx.sender, 'email', 'Reset the follow-ups to the default schedule');
    for (const thread of [...ctx.db.emailThread.iter()]) {
      if (thread.status !== 'waiting' && thread.status !== 'gave_up') continue;
      updateThread(ctx, thread.id, nextWait(ctx, thread.followUps, thread.lastActivityAt));
    }
  });

  return {
    emailTick,
    sendEmailReply,
    markEmailThreadRead,
    closeEmailThread,
    reopenEmailThread,
    setEmailFollowUps,
    resetEmailFollowUps,
  };
}
