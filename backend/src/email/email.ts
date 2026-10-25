import { ScheduleAt, SenderError, t, type InferSchema, type ProcedureCtx, type ReducerCtx } from 'spacetimedb/server';
import { Timestamp } from 'spacetimedb';
import type spacetimedb from '../index';
import { AgentMail, type AgentMailMessage } from './agentmail';
import { emailTickSchedule } from './tables';
import { logAction } from '../learn/audit';
import { LOGO_ATTACHMENT, SENDER, money, reference, renderEmail, shortDate, type Detail } from './template';
import { activeScenario } from '../inbound/simulation';

type Schema = typeof spacetimedb;
type Ctx = ReducerCtx<InferSchema<Schema>>;
type PCtx = ProcedureCtx<InferSchema<Schema>>;
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
const TICK_INTERVAL_MICROS = 30_000_000n;
const MINUTE_MICROS = 60_000_000n;
const INBOX_NAME = SENDER;
const INBOX_ADDRESS = 'pacioli@agentmail.to';

// No em or en dashes in anything we email: number ranges get a hyphen, any
// other dash becomes a comma.
function noDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, '$1-$2')
    .replace(/\s*[\u2013\u2014]\s*/g, ', ')
    .replace(/,\s*([.,;:!?])/g, '$1');
}

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

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function inMinutes(ctx: { timestamp: Timestamp }, minutes: number): Timestamp {
  return new Timestamp(ctx.timestamp.microsSinceUnixEpoch + BigInt(minutes) * MINUTE_MICROS);
}

function ensureTicking(ctx: Ctx) {
  for (const _ of ctx.db.emailTickSchedule.iter()) return;
  ctx.db.emailTickSchedule.insert({ scheduledId: 0n, scheduledAt: ScheduleAt.interval(TICK_INTERVAL_MICROS) });
}

function updateThread(ctx: Ctx, id: bigint, patch: Partial<Thread>) {
  const thread = ctx.db.emailThread.id.find(id);
  if (thread) ctx.db.emailThread.id.update({ ...thread, ...patch });
}

function client(ctx: PCtx): AgentMail {
  const key = ctx.env.AGENTMAIL_API_KEY;
  if (!key) throw new Error('AgentMail is not set up: add AGENTMAIL_API_KEY to .env and republish');
  return new AgentMail(ctx.http, key);
}

// Our inbox, pacioli@agentmail.to: found in the account, or created. A cached
// row for another inbox (the old ledgr@agentmail.to) is replaced.
function inbox(ctx: PCtx, mail: AgentMail): { inboxId: string; address: string } {
  const existing = ctx.withTx(tx => tx.db.emailInbox.id.find(0));
  if (existing?.address === INBOX_ADDRESS) return existing;
  const found =
    mail.listInboxes().find(i => (i.email ?? i.inbox_id) === INBOX_ADDRESS) ??
    mail.createInbox(INBOX_NAME, INBOX_ADDRESS.split('@')[0]);
  const row = { id: 0, inboxId: found.inbox_id, address: found.email ?? found.inbox_id };
  ctx.withTx(tx => {
    if (tx.db.emailInbox.id.find(0)) tx.db.emailInbox.id.update(row);
    else tx.db.emailInbox.insert(row);
  });
  return row;
}

// Start an email thread for a flagged item a person chose to follow up on.
// Called from the review queue's decision procedure.
export function startFollowUp(ctx: PCtx, reviewItemId: bigint): string {
  const info = ctx.withTx(tx => {
    const item = tx.db.reviewItem.id.find(reviewItemId);
    const detail = tx.db.reviewDetail.itemId.find(reviewItemId);
    const event = item && tx.db.inboundEvent.id.find(item.eventId);
    return { item, detail, event, scenario: activeScenario(tx) };
  });
  if (!info.item) throw new SenderError('Item not found');
  const counterparty = info.detail?.followUpTo || info.event?.counterparty || 'the vendor';
  const subject = info.detail?.followUpSubject || info.detail?.title || info.item.question;
  const text = noDashes(
    info.detail?.followUpMessage ||
      `Hello ${counterparty},\n\n${info.detail?.whatHappened || info.item.reason}\n\n${info.detail?.fix || ''}`
  );
  // Exactly what was written: nothing added after it
  const body = text;
  const subjectClean = noDashes(subject);
  const to = ctx.env.FOLLOWUP_EMAIL_TO ?? '';
  const ref = reference(reviewItemId);
  const event = info.event;
  const amount = event && event.amountMinor !== 0n ? money(event.amountMinor, event.currency) : undefined;
  const details: Detail[] = [
    { label: info.scenario.periodLabel, value: info.scenario.periodValue },
    { label: 'Counterparty', value: counterparty },
    ...(event && amount ? [{ label: 'Amount', value: amount, tone: event.amountMinor > 0n ? ('in' as const) : undefined }] : []),
    ...(event?.reference ? [{ label: 'Their reference', value: event.reference }] : []),
    ...(event ? [{ label: 'Dated', value: shortDate(event.occurredAt.toDate()) }] : []),
    { label: 'Our reference', value: ref },
  ];

  const threadId = ctx.withTx(tx => {
    const thread = tx.db.emailThread.insert({
      id: 0n,
      reviewItemId,
      eventId: info.item!.eventId,
      counterparty,
      toAddress: to,
      subject: subjectClean,
      agentmailThreadId: undefined,
      lastMessageId: undefined,
      status: 'waiting',
      followUps: 0,
      nextFollowUpAt: undefined,
      unread: false,
      error: undefined,
      lastActivityAt: tx.timestamp,
      createdAt: tx.timestamp,
    });
    return thread.id;
  });

  try {
    if (!to) throw new Error('FOLLOWUP_EMAIL_TO is not set in .env');
    const mail = client(ctx);
    const box = inbox(ctx, mail);
    const html = renderEmail({
      preheader: noDashes(info.item.question),
      reference: ref,
      title: subjectClean,
      details,
      amount,
      sentOn: shortDate(ctx.timestamp.toDate()),
      message: text,
      replyTo: box.address,
    });
    const sent = mail.send(box.inboxId, to, subjectClean, body, html, [LOGO_ATTACHMENT]);
    ctx.withTx(tx => {
      tx.db.emailMessage.insert({
        id: 0n,
        threadId,
        direction: 'out',
        kind: 'initial',
        fromAddress: box.address,
        body,
        agentmailMessageId: sent.message_id,
        sentAt: tx.timestamp,
      });
      updateThread(tx, threadId, {
        agentmailThreadId: sent.thread_id,
        lastMessageId: sent.message_id,
        ...nextWait(tx, 0, tx.timestamp),
        lastActivityAt: tx.timestamp,
      });
      ensureTicking(tx);
    });
    return `Emailed ${counterparty} (${to})`;
  } catch (err) {
    ctx.withTx(tx => updateThread(tx, threadId, { status: 'failed', error: message(err) }));
    return `Couldn't email ${counterparty}: ${message(err)}`;
  }
}

// Send something in a thread from us (exactly as written, nothing added) and
// (re)start waiting for an answer.
function sendInThread(ctx: PCtx, thread: Thread, raw: string, kind: 'follow_up' | 'reply', followUps: number) {
  const message = noDashes(raw);
  const text = message;
  const mail = client(ctx);
  const box = inbox(ctx, mail);
  if (!thread.lastMessageId) throw new Error('This thread has no message to reply to');
  const html = renderEmail({
    preheader: message.split('\n')[0],
    reference: reference(thread.reviewItemId),
    sentOn: shortDate(ctx.timestamp.toDate()),
    message,
    replyTo: box.address,
  });
  const sent = mail.reply(box.inboxId, thread.lastMessageId, thread.toAddress, text, html, [LOGO_ATTACHMENT]);
  ctx.withTx(tx => {
    tx.db.emailMessage.insert({
      id: 0n,
      threadId: thread.id,
      direction: 'out',
      kind,
      fromAddress: box.address,
      body: text,
      agentmailMessageId: sent.message_id,
      sentAt: tx.timestamp,
    });
    updateThread(tx, thread.id, {
      lastMessageId: sent.message_id,
      followUps,
      ...nextWait(tx, followUps, tx.timestamp),
      lastActivityAt: tx.timestamp,
      error: undefined,
    });
    ensureTicking(tx);
  });
}

// Store replies we haven't seen yet; a reply stops the follow-up schedule.
function collectReplies(ctx: PCtx, mail: AgentMail, inboxId: string, ourAddress: string, thread: Thread) {
  if (!thread.agentmailThreadId) return;
  const messages = mail.threadMessages(inboxId, thread.agentmailThreadId);
  // By sender, not label: a message we sent to ourselves is labeled both
  // 'sent' and 'received', and must never count as their reply
  const isFromThem = (m: AgentMailMessage) => !m.labels?.includes('sent') && !m.from.includes(ourAddress);
  const replies = messages.filter(isFromThem).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  if (!replies.length) return;
  ctx.withTx(tx => {
    let latest: AgentMailMessage | undefined;
    for (const m of replies) {
      if (tx.db.emailMessage.agentmailMessageId.find(m.message_id)) continue;
      tx.db.emailMessage.insert({
        id: 0n,
        threadId: thread.id,
        direction: 'in',
        kind: 'received',
        fromAddress: m.from,
        body: (m.extracted_text || m.text || '').trim(),
        agentmailMessageId: m.message_id,
        sentAt: Timestamp.fromDate(new Date(m.timestamp)),
      });
      latest = m;
    }
    if (latest) {
      updateThread(tx, thread.id, {
        status: 'replied',
        unread: true,
        nextFollowUpAt: undefined,
        lastMessageId: latest.message_id,
        lastActivityAt: tx.timestamp,
      });
    }
  });
}

export function email(stdb: Schema) {
  // Every 30s while threads are open: pick up replies, send follow-ups that are due.
  const emailTick = stdb.procedure(
    { onSchedule: emailTickSchedule },
    { arg: emailTickSchedule.rowType },
    t.unit(),
    ctx => {
      const threads = ctx.withTx(tx =>
        [...tx.db.emailThread.iter()].filter(th => th.status === 'waiting' || th.status === 'replied')
      );
      if (!threads.length) {
        ctx.withTx(tx => {
          for (const row of [...tx.db.emailTickSchedule.iter()]) tx.db.emailTickSchedule.scheduledId.delete(row.scheduledId);
        });
        return {};
      }
      let mail: AgentMail;
      let box: { inboxId: string; address: string };
      try {
        mail = client(ctx);
        box = inbox(ctx, mail);
      } catch (err) {
        console.warn(`email tick: ${message(err)}`);
        return {};
      }

      for (const thread of threads) {
        try {
          collectReplies(ctx, mail, box.inboxId, box.address, thread);
          const [current, steps] = ctx.withTx(tx => [tx.db.emailThread.id.find(thread.id), followUpSteps(tx)] as const);
          if (
            current?.status === 'waiting' &&
            current.nextFollowUpAt &&
            current.nextFollowUpAt.microsSinceUnixEpoch <= ctx.timestamp.microsSinceUnixEpoch
          ) {
            const step = steps[current.followUps];
            if (step) sendInThread(ctx, current, step.message, 'follow_up', current.followUps + 1);
          }
        } catch (err) {
          ctx.withTx(tx => updateThread(tx, thread.id, { error: message(err) }));
        }
      }
      return {};
    }
  );

  // A person writes back in a thread. Starts waiting (and nudging) again.
  const sendEmailReply = stdb.procedure(
    { threadId: t.u64(), text: t.string() },
    t.string(),
    (ctx, { threadId, text }) => {
      const body = text.trim();
      if (!body) throw new SenderError('Write something to send');
      const thread = ctx.withTx(tx => tx.db.emailThread.id.find(threadId));
      if (!thread) throw new SenderError('Thread not found');
      try {
        sendInThread(ctx, thread, body, 'reply', 0);
      } catch (err) {
        throw new SenderError(message(err));
      }
      ctx.withTx(tx => {
        updateThread(tx, threadId, { unread: false });
        logAction(tx, ctx.sender, 'email', `Replied to ${thread.counterparty}: "${body.slice(0, 160)}"`, { eventId: thread.eventId });
      });
      return `Sent to ${thread.counterparty}`;
    }
  );

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
    ensureTicking(ctx);
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
      ensureTicking(ctx);
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
    ensureTicking(ctx);
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
