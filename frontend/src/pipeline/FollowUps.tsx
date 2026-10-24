import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { useProcedure, useTable } from 'spacetimedb/react';
import { procedures, tables } from '../module_bindings';
import type { InboundEvent, ReviewDetail, ReviewItem } from '../module_bindings/types';
import { Money } from './Money';
import { SOURCE_TITLES } from './sources';

// "Follow-ups": what the agent wants a person to decide, written up as what's
// wrong, the proof, and the exact fix. Decisions go back to the agent on its
// next run, which updates the master ledger.

const ACTION_LABEL: Record<string, string> = {
  void: 'Void the entry',
  refund: 'Refund on Stripe',
  follow_up: 'Follow up',
  keep: 'Keep as is',
};

function evidenceLines(detail: ReviewDetail | undefined): string[] {
  try {
    const lines = JSON.parse(detail?.evidence ?? '[]');
    return Array.isArray(lines) ? lines.filter((l): l is string => typeof l === 'string') : [];
  } catch {
    return [];
  }
}

function FollowUpCard({
  item,
  detail,
  event,
}: {
  item: ReviewItem;
  detail: ReviewDetail | undefined;
  event: InboundEvent | undefined;
}) {
  const resolve = useProcedure(procedures.resolveReviewItem);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRefund = event?.source === 'stripe' && !!event.reference?.startsWith('ch_');
  const actions = ['void', ...(canRefund ? ['refund'] : []), 'follow_up', 'keep'];
  const suggested = actions.includes(item.recommendation) ? item.recommendation : 'keep';
  const evidence = evidenceLines(detail);

  const decide = (action: string) => {
    setBusy(action);
    setError(null);
    resolve({ itemId: item.id, action })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(null));
  };

  return (
    <li className="followup-card">
      <div className="followup-head">
        <h4>{detail?.title ?? item.question}</h4>
        <span className="status is-held">! Needs you</span>
      </div>

      <p className="followup-what">{detail?.whatHappened || item.reason}</p>

      {event && (
        <p className="followup-event">
          <span>
            {event.counterparty} · {SOURCE_TITLES[event.source] ?? event.source}
          </span>
          <Money amountMinor={event.amountMinor} currency={event.currency} />
        </p>
      )}

      {evidence.length > 0 && (
        <ul className="followup-evidence">
          {evidence.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {detail?.fix && (
        <div className="followup-fix">
          <span className="followup-label">Proposed fix · {ACTION_LABEL[suggested]}</span>
          <p>{detail.fix}</p>
        </div>
      )}

      {detail?.followUpMessage && (
        <details className="followup-email">
          <summary>
            Draft email{detail.followUpTo ? ` to ${detail.followUpTo}` : ''}
          </summary>
          {detail.followUpSubject && <p className="followup-subject">{detail.followUpSubject}</p>}
          <p className="followup-body">{detail.followUpMessage}</p>
          <p className="followup-note">Sending emails comes next; for now, Follow up marks the row in the ledger.</p>
        </details>
      )}

      <p className="followup-question">{item.question}</p>
      <div className="followup-actions">
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
      {error && <p className="followup-error">{error}</p>}
    </li>
  );
}

export function FollowUpsNode() {
  const [items] = useTable(tables.reviewItem);
  const [details] = useTable(tables.reviewDetail);
  const [events] = useTable(tables.inboundEvent);
  const open = items.filter(i => i.status === 'open').sort((a, b) => (a.id < b.id ? -1 : 1));
  const applying = items.filter(i => i.status === 'decided').length;
  const detailById = new Map(details.map(d => [d.itemId.toString(), d]));
  const eventById = new Map(events.map(e => [e.id.toString(), e]));

  return (
    <div className="pipeline-node followups-node">
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="node-head">
        <h3>Follow-ups</h3>
        <span className={open.length ? 'status is-held' : 'status'}>
          {open.length ? `${open.length} need you` : 'Nothing waiting'}
        </span>
      </div>
      {applying > 0 && (
        <p className="followup-applying">
          {applying} {applying === 1 ? 'decision' : 'decisions'} going to the agent on its next run
        </p>
      )}
      <div className="followups-scroll nowheel nodrag">
        {open.length === 0 ? (
          <p className="node-meta">Nothing is waiting on you.</p>
        ) : (
          <ul className="followup-list">
            {open.map(item => (
              <FollowUpCard
                key={item.id.toString()}
                item={item}
                detail={detailById.get(item.id.toString())}
                event={eventById.get(item.eventId.toString())}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
