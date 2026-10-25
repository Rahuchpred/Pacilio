import { useEffect } from 'react';
import { Button, Icon, Money, Status, type IconName, type StatusKind } from '../../../design-system/src/components';
import { ACTION_LABEL, Decide } from './NeedsYou';
import { ROW_STATUS, SOURCE_TITLES, clock, dollars, jsonList, openItem, useOpenItem } from './live';
import { Evidence } from './Evidence';
import { useLive } from './store';
import { BooksSection } from './Books';
import { SourceTag, sentence } from './Transactions';

// One event, looked at closely: what came in, what the agent decided and why,
// any question it asked you, and the emails that followed. Opens from any
// row, transaction, question or email on the canvas.

function when(d: Date): string {
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// The agent's outcome as a tag
const OUTCOME: Record<string, { kind: StatusKind; label: string }> = {
  ok: { kind: 'cleared', label: 'Posted' },
  void: { kind: 'agent', label: 'Voided' },
  review: { kind: 'disputed', label: 'Asked you' },
};

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

  const open = asked.filter(i => i.status === 'open');
  const answered = asked.filter(i => i.status !== 'open');
  const outcome = review?.status === 'done' ? OUTCOME[review.outcome ?? ''] ?? OUTCOME.review : null;

  // What happened to this event, oldest first
  const activity: { at: Date; icon: IconName; text: string }[] = [];
  activity.push({ at: event.occurredAt.toDate(), icon: 'Calendar', text: `Happened at ${sentence(event.counterparty)}` });
  if (event.receivedAt.toDate().getTime() !== event.occurredAt.toDate().getTime()) {
    activity.push({ at: event.receivedAt.toDate(), icon: 'ArrowDown', text: `Arrived from ${SOURCE_TITLES[event.source] ?? event.source}` });
  }
  if (run) activity.push({ at: run.startedAt.toDate(), icon: 'agent', text: `Checked in run ${run.id.toString()}${outcome ? `: ${outcome.label.toLowerCase()}` : ''}` });
  for (const item of answered) {
    if (item.decidedAt) activity.push({ at: item.decidedAt.toDate(), icon: 'person', text: `You chose ${ACTION_LABEL[item.decision ?? ''] ?? item.decision}` });
  }
  for (const t of mail) {
    for (const m of messagesByThread.get(t.id.toString()) ?? []) {
      activity.push({ at: m.sentAt.toDate(), icon: 'mail', text: m.direction === 'in' ? `${t.counterparty} replied` : `Emailed ${t.counterparty}` });
    }
  }
  activity.sort((x, y) => x.at.getTime() - y.at.getTime());

  return (
    <aside className="item-panel bill" aria-label={`${event.counterparty} details`}>
      <header className="bill-head">
        <SourceTag source={event.source} kind={event.kind} />
        <Button kind="quiet" size="sm" icon="Close" onClick={() => openItem(null)} />
      </header>
      <div className="bill-hero">
        <h2>{sentence(event.counterparty)}</h2>
        <div className="bill-amount-row">
          <span className="item-amount">
            <Money value={dollars(event.amountMinor, event.currency)} />
          </span>
          <Status kind={status.kind} busy={status.busy}>
            {status.label}
          </Status>
        </div>
        {event.description && <p className="muted">{sentence(event.description)}</p>}
      </div>

      {/* The one thing waiting on a person comes first, in its own box */}
      {open.map(item => {
        const d = detailBy.get(item.id.toString());
        const evidence = jsonList(d?.evidence);
        return (
          <section key={item.id.toString()} className="bill-needs">
            <header className="bill-needs-head">
              <Icon name="hourglass" size={14} /> Needs your call
            </header>
            <div className="bill-needs-body">
              <h3>{d?.title ?? item.question}</h3>
              <p className="muted">{d?.whatHappened || item.reason}</p>
              {evidence.length > 0 && <Evidence lines={evidence} />}
              <p className="bill-suggest">
                <span className="strong">Suggested: {ACTION_LABEL[item.recommendation] ?? 'Keep as is'}.</span> {d?.fix ?? item.question}
              </p>
              <Decide item={item} event={event} />
            </div>
          </section>
        );
      })}

      <section className="bill-card">
        <header className="bill-card-head">Details</header>
        <dl className="bill-rows">
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
          {review?.category && (
            <div>
              <dt>Category</dt>
              <dd>{review.category}</dd>
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
      </section>

      <BooksSection eventId={event.id} />

      <section className="bill-card">
        <header className="bill-card-head">
          <span>
            <Icon name="agent" size={14} /> The agent's call
          </span>
          {outcome ? (
            <Status kind={outcome.kind}>{outcome.label}</Status>
          ) : review ? (
            <Status kind="agent" busy>
              Checking
            </Status>
          ) : (
            <Status kind="agent">Waiting</Status>
          )}
        </header>
        <div className="bill-card-body">
          {!review ? (
            <p className="muted">Waiting for the agent's next run.</p>
          ) : review.status !== 'done' ? (
            <p className="muted">Being checked in run {review.runId.toString()} right now.</p>
          ) : (
            <>
              {review.note && <p className="bill-why">{review.note}</p>}
              <dl className="bill-rows is-flush">
                {run && (
                  <div>
                    <dt>Checked in</dt>
                    <dd>
                      Run {run.id.toString()} · {clock(run.startedAt.toDate())}
                    </dd>
                  </div>
                )}
                {answered.map(item => (
                  <div key={item.id.toString()}>
                    <dt>You chose</dt>
                    <dd>
                      {ACTION_LABEL[item.decision ?? ''] ?? item.decision}
                      {item.decidedAt && ` · ${clock(item.decidedAt.toDate())}`}
                    </dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </div>
      </section>

      {twins.length > 0 && (
        <section className="bill-card">
          <header className="bill-card-head">
            <span>
              <Icon name="Copy" size={14} /> Looks the same as
            </span>
          </header>
          <ul className="row-list bill-list">
            {twins.map(t => (
              <li key={t.event.id.toString()}>
                <button type="button" className="row-button" onClick={() => openItem(t.event.id)}>
                  <span className="stack">
                    <span className="strong">{sentence(t.event.counterparty)}</span>
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
        <section key={t.id.toString()} className="bill-card">
          <header className="bill-card-head">
            <span>
              <Icon name="mail" size={14} /> Email to {t.counterparty}
            </span>
          </header>
          <div className="bill-card-body">
            <p className="muted small">
              {t.subject} · {t.toAddress}
            </p>
            <ol className="thread">
              {(messagesByThread.get(t.id.toString()) ?? []).map(m => (
                <li key={m.id.toString()} className={`msg ${m.direction === 'in' ? 'msg-them' : 'msg-agent'}`}>
                  <div className="msg-line">
                    <span className="msg-who">{m.direction === 'in' ? m.fromAddress : 'Pacioli'}</span>
                    <span className="tertiary small">{clock(m.sentAt.toDate())}</span>
                  </div>
                  <p className="email-body">{m.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      ))}

      <section className="bill-activity">
        <h4 className="section-label">Activity</h4>
        <ol>
          {activity.map((a, i) => (
            <li key={i}>
              <span className="bill-activity-icon">
                <Icon name={a.icon} size={12} />
              </span>
              <span className="bill-activity-text">{a.text}</span>
              <span className="muted small">{when(a.at)}</span>
            </li>
          ))}
        </ol>
      </section>

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
