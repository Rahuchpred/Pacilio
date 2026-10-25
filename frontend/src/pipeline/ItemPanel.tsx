import { useEffect } from 'react';
import { Button, Icon, Money, Source, Status } from '../../../design-system/src/components';
import { ACTION_LABEL, Decide } from './NeedsYou';
import { ROW_STATUS, SOURCE_TITLES, clock, dollars, jsonList, kindLabel, openItem, useOpenItem } from './live';
import { useLive } from './store';
import { sentence } from './Transactions';

// One event, looked at closely: what came in, what the agent decided and why,
// any question it asked you, and the emails that followed. Opens from any
// row, transaction, question or email on the canvas.

function when(d: Date): string {
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function pretty(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function ItemPanel() {
  const id = useOpenItem();
  const { rowBy, itemsByEvent, detailBy, runs, threads, messagesByThread } = useLive();

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation();
        openItem(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [id]);

  if (!id) return null;
  const row = rowBy.get(id);
  if (!row) return null;
  const { event, review, state } = row;
  const status = ROW_STATUS[state];
  const asked = itemsByEvent.get(id) ?? [];
  const run = review ? runs.find(r => r.id === review.runId) : undefined;
  const mail = threads.filter(t => t.eventId === event.id);
  const twinIds = new Set(asked.flatMap(i => (i.duplicateOf !== undefined ? [i.duplicateOf.toString()] : [])));
  const twins = [...twinIds].flatMap(t => rowBy.get(t) ?? []);

  return (
    <aside className="item-panel" aria-label={`${event.counterparty} details`}>
      <header className="item-head">
        <div className="stack">
          <span className="muted small">
            {SOURCE_TITLES[event.source] ?? event.source} · {kindLabel(event.kind)}
          </span>
          <h2>{sentence(event.counterparty)}</h2>
        </div>
        <Button kind="quiet" size="sm" icon="Close" onClick={() => openItem(null)} />
      </header>

      <div className="item-hero">
        <span className="item-amount">
          <Money value={dollars(event.amountMinor, event.currency)} />
        </span>
        <Status kind={status.kind} busy={status.busy}>{status.label}</Status>
      </div>
      {event.description && <p>{sentence(event.description)}</p>}

      <dl className="facts-list">
        {when(event.occurredAt.toDate()) === when(event.receivedAt.toDate()) ? (
          <div>
            <dt>When</dt>
            <dd>{when(event.occurredAt.toDate())}</dd>
          </div>
        ) : (
          <>
            <div>
              <dt>Happened</dt>
              <dd>{when(event.occurredAt.toDate())}</dd>
            </div>
            <div>
              <dt>Arrived</dt>
              <dd>{when(event.receivedAt.toDate())}</dd>
            </div>
          </>
        )}
        {event.reference && (
          <div>
            <dt>Reference</dt>
            <dd className="id">{event.reference}</dd>
          </div>
        )}
        {event.documentUrl && (
          <div>
            <dt>Document</dt>
            <dd>
              <a href={event.documentUrl} target="_blank" rel="noreferrer">
                Open <Icon name="External" size={12} />
              </a>
            </dd>
          </div>
        )}
      </dl>

      <section className="item-section">
        <h3>
          <Icon name="agent" size={14} /> The agent's call
        </h3>
        {!review ? (
          <p className="muted">Waiting for the agent's next run.</p>
        ) : review.status !== 'done' ? (
          <p className="muted">Being checked in run {review.runId.toString()} right now.</p>
        ) : (
          <dl className="facts-list agent-call">
            <div>
              <dt>Decided</dt>
              <dd>
                <Status kind={review.outcome === 'ok' ? 'cleared' : review.outcome === 'void' ? 'agent' : 'disputed'}>
                  {review.outcome === 'ok' ? 'Posted' : review.outcome === 'void' ? 'Voided' : 'Asked you'}
                </Status>
              </dd>
            </div>
            {review.category && (
              <div>
                <dt>Category</dt>
                <dd>{review.category}</dd>
              </div>
            )}
            {review.note && (
              <div className="is-wide">
                <dt>Why</dt>
                <dd>{review.note}</dd>
              </div>
            )}
            {run && (
              <div>
                <dt>Checked in</dt>
                <dd>
                  Run {run.id.toString()} · {clock(run.startedAt.toDate())}
                </dd>
              </div>
            )}
          </dl>
        )}
      </section>

      {asked.map(item => {
        const d = detailBy.get(item.id.toString());
        const evidence = jsonList(d?.evidence);
        return (
          <section key={item.id.toString()} className="item-section">
            <h3>
              <Icon name="hourglass" size={14} /> {d?.title ?? 'Question for you'}
            </h3>
            <p>{d?.whatHappened || item.reason}</p>
            {evidence.length > 0 && (
              <ol className="sources">
                {evidence.map((line, i) => (
                  <Source key={line} n={i + 1} source={line} detail="" />
                ))}
              </ol>
            )}
            {d?.fix && (
              <p>
                <span className="section-label">Proposed fix · </span>
                {d.fix}
              </p>
            )}
            {item.status === 'open' ? (
              <>
                <p className="strong">{item.question}</p>
                <Decide item={item} event={event} />
              </>
            ) : (
              <p className="item-decided">
                <Icon name="check" size={14} />
                {ACTION_LABEL[item.decision ?? ''] ?? item.decision}
                {item.decidedAt && ` at ${clock(item.decidedAt.toDate())}`}
                {item.resultNote && <span className="muted"> · {item.resultNote}</span>}
              </p>
            )}
          </section>
        );
      })}

      {twins.length > 0 && (
        <section className="item-section">
          <h3>
            <Icon name="Copy" size={14} /> Looks the same as
          </h3>
          <ul className="row-list">
            {twins.map(t => (
              <li key={t.event.id.toString()}>
                <button type="button" className="row-button" onClick={() => openItem(t.event.id)}>
                  <span className="stack">
                    <span className="strong">{t.event.counterparty}</span>
                    <span className="muted small">{when(t.event.occurredAt.toDate())}</span>
                  </span>
                  <Money value={dollars(t.event.amountMinor, t.event.currency)} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mail.map(t => (
        <section key={t.id.toString()} className="item-section">
          <h3>
            <Icon name="mail" size={14} /> Email to {t.counterparty}
          </h3>
          <p className="muted small">
            {t.subject} · {t.toAddress}
          </p>
          <ol className="thread">
            {(messagesByThread.get(t.id.toString()) ?? []).map(m => (
                <li key={m.id.toString()} className={`msg ${m.direction === 'in' ? 'msg-them' : 'msg-agent'}`}>
                  <div className="msg-line">
                    <span className="msg-who">{m.direction === 'in' ? m.fromAddress : 'Settle'}</span>
                    <span className="tertiary small">{clock(m.sentAt.toDate())}</span>
                  </div>
                  <p className="email-body">{m.body}</p>
                </li>
              ))}
          </ol>
        </section>
      ))}

      <details className="item-raw">
        <summary>
          <Icon name="Code" size={14} /> What {SOURCE_TITLES[event.source] ?? event.source} sent
        </summary>
        <p className="muted small">
          Source id <span className="id">{event.sourceId}</span>
        </p>
        <pre>{pretty(event.raw)}</pre>
      </details>
    </aside>
  );
}
