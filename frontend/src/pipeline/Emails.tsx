import { useEffect, useState } from 'react';
import { useProcedure, useReducer } from 'spacetimedb/react';
import { Button, Icon, Status, type StatusKind } from '../../../design-system/src/components';
import { procedures, reducers } from '../module_bindings';
import type { EmailMessage, EmailThread } from '../module_bindings/types';
import { logError } from '../throttle';
import { FarCard, type CardLevels } from '../canvas/levels';
import { Card } from './Card';
import { FollowUpSettings } from './FollowUpSettings';
import { describeSchedule, useFollowUpSchedule } from './followUps';
import { clock, openItem } from './live';
import { useLive } from './store';

// Emails (AgentMail): one thread per item a person chose to follow up on.
// Without a reply, Pacioli nudges on a schedule; a reply comes to the top with
// a blue dot.

// Matches the current signature and the older one with a leading dash.
// Older emails ended with a signature; new ones are sent exactly as written
const SIGNATURE = /\n\n(?:\u2014 Settle, bookkeeping for the|Settle\nBookkeeping for the|(?:Settle|Pacioli) Bookkeeping\nSettlement for the) Oct 2[45] show$/;

const THREAD_STATUS: Record<string, { kind: StatusKind; label: string }> = {
  waiting: { kind: 'held', label: 'Waiting' },
  replied: { kind: 'cleared', label: 'Replied' },
  gave_up: { kind: 'disputed', label: 'No reply' },
  closed: { kind: 'agent', label: 'Closed' },
  failed: { kind: 'disputed', label: "Couldn't send" },
};

const KIND_LABEL: Record<string, string> = {
  initial: 'First email',
  follow_up: 'Follow-up',
  reply: 'Your reply',
  received: 'Reply',
};

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function statusLine(thread: EmailThread, now: number, total: number): string {
  switch (thread.status) {
    case 'waiting': {
      const next = thread.nextFollowUpAt?.toDate().getTime();
      return next ? `Follow-up ${thread.followUps + 1} of ${total} in ${duration(next - now)}` : 'Sending…';
    }
    case 'replied':
      return `Replied ${duration(now - thread.lastActivityAt.toDate().getTime())} ago`;
    case 'gave_up':
      return thread.followUps ? `No reply after ${thread.followUps} follow-ups` : 'No follow-ups scheduled';
    case 'failed':
      return thread.error ?? 'Unknown error';
    default:
      return 'Closed';
  }
}

function useThreads() {
  const { threadsSorted: sorted, threads } = useLive();
  return {
    threads: sorted,
    unread: threads.filter(t => t.unread).length,
    waiting: threads.filter(t => t.status === 'waiting').length,
  };
}

// Keeps the "next follow-up in …" countdowns current.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function ThreadTag({ thread }: { thread: EmailThread }) {
  const s = THREAD_STATUS[thread.status] ?? { kind: 'agent', label: thread.status };
  return (
    <span className="thread-tag">
      {thread.unread && <span className="thread-new">New reply</span>}
      <Status kind={s.kind}>{s.label}</Status>
    </span>
  );
}

function Far() {
  const { threads, unread, waiting } = useThreads();
  return (
    <FarCard
      type="emails"
      width="w-emails"
      icon="mail"
      word="Emails"
      big={threads.length}
      line={unread ? `${unread} new ${unread === 1 ? 'reply' : 'replies'}` : `${waiting} waiting for a reply`}
      craft={unread ? 'accept' : undefined}
    />
  );
}

function Conversation({ thread, messages }: { thread: EmailThread; messages: EmailMessage[] }) {
  const send = useProcedure(procedures.sendEmailReply);
  const close = useReducer(reducers.closeEmailThread);
  const reopen = useReducer(reducers.reopenEmailThread);
  const canReopen = (thread.status === 'closed' || thread.status === 'gave_up') && !!thread.lastMessageId;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canReply = !!thread.lastMessageId && thread.status !== 'failed';

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError(null);
    send({ threadId: thread.id, text })
      .then(() => setText(''))
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  return (
    <div className="email-conversation">
      <ol className="thread">
        {messages.map(m => (
          <li key={m.id.toString()} className={`msg ${m.direction === 'in' ? 'msg-them' : 'msg-agent'}`}>
            <div className="msg-line">
              <span className="msg-who">{m.direction === 'in' ? m.fromAddress : 'Pacioli'}</span>
              <span className="tertiary small">
                {KIND_LABEL[m.kind] ?? m.kind} · {clock(m.sentAt.toDate())}
              </span>
            </div>
            <p className="email-body">{m.body.replace(SIGNATURE, '')}</p>
          </li>
        ))}
      </ol>
      <div className="email-links">
        <button type="button" className="link-button" onClick={() => openItem(thread.eventId)}>
          Look at the payment
        </button>
        {canReopen && (
          <Button
            kind="secondary"
            size="sm"
            icon="Undo"
            onClick={() => reopen({ threadId: thread.id }).catch((err: Error) => setError(err.message))}
          >
            Reopen thread
          </Button>
        )}
      </div>
      {canReply && (
        <form className="email-compose" onSubmit={submit}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Write to ${thread.counterparty}…`}
            rows={3}
          />
          <div className="email-compose-actions">
            {thread.status !== 'closed' && thread.status !== 'gave_up' && (
              <Button kind="quiet" size="sm" onClick={() => close({ threadId: thread.id }).catch(logError)}>
                Close thread
              </Button>
            )}
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy || !text.trim()}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>
        </form>
      )}
      {error && <p className="card-error">{error}</p>}
    </div>
  );
}

function Full() {
  const { threads } = useThreads();
  const { messagesByThread } = useLive();
  const markRead = useReducer(reducers.markEmailThreadRead);
  const [openId, setOpenId] = useState<string | null>(null);
  const [settings, setSettings] = useState(false);
  const { steps, ready } = useFollowUpSchedule();
  const { items } = useLive();
  // An email nobody chose: the Bookkeeper sent it because a pattern said to
  const byBookkeeper = (itemId: bigint) => {
    const item = items.find(i => i.id === itemId);
    return !!item && item.decision === 'follow_up' && item.decidedBy === undefined;
  };
  const now = useNow();

  const toggle = (thread: EmailThread) => {
    const id = thread.id.toString();
    setOpenId(current => (current === id ? null : id));
    if (thread.unread) markRead({ threadId: thread.id }).catch(logError);
  };

  return (
    <Card
      type="emails"
      icon="mail"
      title="Emails to vendors"
      className="w-emails-full"
      meta={
        <span className="nodrag" title="Edit the follow-ups">
          <Button kind={settings ? 'secondary' : 'quiet'} size="sm" icon="Settings" onClick={() => setSettings(s => !s)}>
            Follow-ups
          </Button>
        </span>
      }
    >
      {settings ? (
        <FollowUpSettings onDone={() => setSettings(false)} />
      ) : (
        ready && <p className="muted small">Without a reply, Pacioli {describeSchedule(steps)}.</p>
      )}
      {threads.length === 0 ? (
        <p className="muted">Choose Email them on a question and Pacioli writes here.</p>
      ) : (
        <ul className="email-threads nodrag nowheel">
          {threads.map(thread => {
            const open = openId === thread.id.toString();
            const mine = messagesByThread.get(thread.id.toString()) ?? [];
            return (
              <li key={thread.id.toString()} className={`email-thread${open ? ' is-open' : ''}`}>
                <button type="button" className="row-button" onClick={() => toggle(thread)} aria-expanded={open}>
                  <span className="stack">
                    <span className="strong">{thread.counterparty}</span>
                    <span className="muted small">{thread.subject}</span>
                    <span className="tertiary small">{statusLine(thread, now, steps.length)}</span>
                    {byBookkeeper(thread.reviewItemId) && (
                      <span className="sent-by-agent small">
                        <Icon name="agent" size={12} /> Sent by the Bookkeeper (a pattern allowed it)
                      </span>
                    )}
                  </span>
                  <ThreadTag thread={thread} />
                </button>
                {open && <Conversation thread={thread} messages={mine} />}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export const emails: CardLevels = { far: Far, full: Full };
