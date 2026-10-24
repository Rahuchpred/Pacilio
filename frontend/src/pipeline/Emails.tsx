import { useEffect, useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useProcedure, useReducer, useTable } from 'spacetimedb/react';
import { procedures, reducers, tables } from '../module_bindings';
import type { EmailMessage, EmailThread } from '../module_bindings/types';
import { logError } from '../throttle';

// Email follow-ups (AgentMail): one thread per item a person chose to follow
// up on. Without a reply, Settle nudges on a schedule; a reply puts the thread
// on top with a blue dot.

const FOLLOW_UPS_TOTAL = 4;
const SIGNATURE = /\n\n— Settle, bookkeeping for the Oct 24 show$/;

function duration(ms: number): string {
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 1) return 'under a minute';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h` : `${Math.round(hours / 24)} d`;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function statusLine(thread: EmailThread, now: number): string {
  switch (thread.status) {
    case 'waiting': {
      const next = thread.nextFollowUpAt?.toDate().getTime();
      return next
        ? `Waiting for a reply · follow-up ${thread.followUps + 1} of ${FOLLOW_UPS_TOTAL} in ${duration(next - now)}`
        : 'Sending…';
    }
    case 'replied':
      return `Replied ${duration(now - thread.lastActivityAt.toDate().getTime())} ago`;
    case 'gave_up':
      return `No reply after ${FOLLOW_UPS_TOTAL} follow-ups`;
    case 'closed':
      return 'Closed';
    case 'failed':
      return `Couldn't send: ${thread.error ?? 'unknown error'}`;
    default:
      return thread.status;
  }
}

const KIND_LABEL: Record<string, string> = {
  initial: 'First email',
  follow_up: 'Follow-up',
  reply: 'Your reply',
  received: 'Reply',
};

function Conversation({ thread, messages }: { thread: EmailThread; messages: EmailMessage[] }) {
  const send = useProcedure(procedures.sendEmailReply);
  const close = useReducer(reducers.closeEmailThread);
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
      <ol className="email-messages">
        {messages.map(m => (
          <li key={m.id.toString()} className={`email-message is-${m.direction}`}>
            <div className="email-meta">
              {m.direction === 'in' ? m.fromAddress : 'Settle'} · {KIND_LABEL[m.kind] ?? m.kind} ·{' '}
              {clock(m.sentAt.toDate().getTime())}
            </div>
            <p className="email-body">{m.body.replace(SIGNATURE, '')}</p>
          </li>
        ))}
      </ol>
      {canReply && (
        <form className="email-compose" onSubmit={submit}>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={`Write to ${thread.counterparty}…`}
            rows={3}
          />
          <div className="email-compose-actions">
            <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
              {busy ? 'Sending…' : 'Send'}
            </button>
            {thread.status !== 'closed' && (
              <button
                type="button"
                className="btn btn-quiet"
                onClick={() => close({ threadId: thread.id }).catch(logError)}
              >
                Close thread
              </button>
            )}
          </div>
        </form>
      )}
      {error && <p className="followup-error">{error}</p>}
    </div>
  );
}

export function EmailsNode() {
  const [threads] = useTable(tables.emailThread);
  const [messages] = useTable(tables.emailMessage);
  const markRead = useReducer(reducers.markEmailThreadRead);
  const [openId, setOpenId] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  // Keep the "next follow-up in …" countdowns current
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const sorted = [...threads].sort((a, b) => {
    if (a.unread !== b.unread) return a.unread ? -1 : 1;
    return b.lastActivityAt.microsSinceUnixEpoch > a.lastActivityAt.microsSinceUnixEpoch ? 1 : -1;
  });
  const unread = threads.filter(t => t.unread).length;
  const waiting = threads.filter(t => t.status === 'waiting').length;

  const toggle = (thread: EmailThread) => {
    const id = thread.id.toString();
    setOpenId(current => (current === id ? null : id));
    if (thread.unread) markRead({ threadId: thread.id }).catch(logError);
  };

  return (
    <div className="pipeline-node emails-node">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="node-head">
        <h3>Email follow-ups</h3>
        <span className="status">
          {unread > 0 && <span className="email-dot" aria-label="new replies" />}
          {unread > 0 ? `${unread} new ${unread === 1 ? 'reply' : 'replies'}` : `${waiting} waiting`}
        </span>
      </div>
      <div className="emails-scroll nowheel nodrag">
        {sorted.length === 0 ? (
          <p className="node-meta">Choose Follow up on an item and Settle emails them here, nudging until they reply.</p>
        ) : (
          <ul className="email-threads">
            {sorted.map(thread => {
              const open = openId === thread.id.toString();
              const threadMessages = messages
                .filter(m => m.threadId === thread.id)
                .sort((a, b) => (a.sentAt.microsSinceUnixEpoch < b.sentAt.microsSinceUnixEpoch ? -1 : 1));
              return (
                <li key={thread.id.toString()} className={`email-thread${open ? ' is-open' : ''}`}>
                  <button className="email-thread-head" onClick={() => toggle(thread)} aria-expanded={open}>
                    <span className="email-dot-slot">{thread.unread && <span className="email-dot" />}</span>
                    <span className="email-thread-text">
                      <span className="email-party">{thread.counterparty}</span>
                      <span className="email-subject">{thread.subject}</span>
                      <span className={`email-status is-${thread.status}`}>{statusLine(thread, now)}</span>
                    </span>
                  </button>
                  {open && <Conversation thread={thread} messages={threadMessages} />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
