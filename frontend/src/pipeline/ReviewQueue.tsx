import { useState } from 'react';
import { useProcedure, useTable } from 'spacetimedb/react';
import { procedures, tables } from '../module_bindings';
import type { InboundEvent, ReviewItem } from '../module_bindings/types';
import { Money } from './Money';
import { SOURCE_TITLES } from './sources';

// "Needs your OK": what the agent wasn't sure about, why, what it suggests,
// and the person's call. Decisions go back to the agent on its next run.

const ACTION_LABEL: Record<string, string> = {
  void: 'Void it',
  refund: 'Refund on Stripe',
  keep: 'Keep it',
  chase: 'Chase',
};

function sureness(confidence: number): string {
  return `${Math.round(confidence * 100)}% sure`;
}

function ReviewCard({ item, event }: { item: ReviewItem; event: InboundEvent | undefined }) {
  const resolve = useProcedure(procedures.resolveReviewItem);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRefund = event?.source === 'stripe' && !!event.reference?.startsWith('ch_');
  const actions = ['void', ...(canRefund ? ['refund'] : []), 'keep'];
  // The agent's suggestion leads; chase waits for email follow-ups
  const suggested = actions.includes(item.recommendation) ? item.recommendation : 'keep';

  const decide = (action: string) => {
    setBusy(action);
    setError(null);
    resolve({ itemId: item.id, action })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(null));
  };

  return (
    <li className="review-card">
      <p className="review-question">{item.question}</p>
      {event && (
        <p className="review-event">
          <span>
            {event.counterparty} · {SOURCE_TITLES[event.source] ?? event.source}
          </span>
          <Money amountMinor={event.amountMinor} currency={event.currency} />
        </p>
      )}
      {item.reason && <p className="review-reason">{item.reason}</p>}
      <p className="review-suggestion">
        Agent suggests <strong>{ACTION_LABEL[item.recommendation] ?? item.recommendation}</strong> ·{' '}
        {sureness(item.confidence)}
        {item.recommendation === 'chase' && ' (email follow-ups come later)'}
      </p>
      <div className="review-actions">
        {actions.map(action => (
          <button
            key={action}
            className={`btn ${action === suggested ? 'btn-primary' : 'btn-secondary'}`}
            disabled={busy !== null}
            onClick={() => decide(action)}
          >
            {busy === action ? 'Working…' : ACTION_LABEL[action]}
          </button>
        ))}
      </div>
      {error && <p className="review-error">{error}</p>}
    </li>
  );
}

export function ReviewQueue() {
  const [items] = useTable(tables.reviewItem);
  const [events] = useTable(tables.inboundEvent);
  const [open, setOpen] = useState(true);
  const pending = items.filter(i => i.status === 'open').sort((a, b) => (a.id < b.id ? -1 : 1));
  const applying = items.filter(i => i.status === 'decided').length;
  const byId = new Map(events.map(e => [e.id.toString(), e]));

  return (
    <aside className={`review-queue${open ? '' : ' is-collapsed'}`}>
      <button className="review-head" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>Needs your OK</span>
        <span className="review-count">{pending.length}</span>
      </button>
      {open && (
        <div className="review-body">
          {applying > 0 && (
            <p className="review-applying">
              {applying} {applying === 1 ? 'decision' : 'decisions'} waiting for the agent's next run
            </p>
          )}
          {pending.length === 0 ? (
            <p className="review-empty">Nothing is waiting on you.</p>
          ) : (
            <ul className="review-list">
              {pending.map(item => (
                <ReviewCard key={item.id.toString()} item={item} event={byId.get(item.eventId.toString())} />
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
