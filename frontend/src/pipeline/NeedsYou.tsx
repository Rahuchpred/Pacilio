import { useState } from 'react';
import { useProcedure } from 'spacetimedb/react';
import { Button, Icon, Money, Source, Status } from '../../../design-system/src/components';
import { procedures } from '../module_bindings';
import type { InboundEvent, ReviewDetail, ReviewItem } from '../module_bindings/types';
import { FarCard, Handles, type CardLevels } from '../canvas/levels';
import { describeSchedule, useFollowUpSchedule } from './followUps';
import { SOURCE_TITLES, dollars, jsonList, kindLabel, openItem } from './live';
import { useLive } from './store';

// Needs you: the calls the agent isn't sure about, one question at a time.
// The question sits on an orange band; the evidence and choices on white
// below. A decision goes back to the agent on its next run.

// The "Also waiting" list shows this many; the arrows reach the rest
const ALSO_WAITING = 25;

export const ACTION_LABEL: Record<string, string> = {
  void: 'Void it',
  refund: 'Refund on Stripe',
  follow_up: 'Email them',
  keep: 'Keep as is',
};

function useQueue() {
  const { openItems: open, detailBy, eventBy, items } = useLive();
  const applying = items.filter(i => i.status === 'decided').length;
  return { open, detailBy, eventBy, applying };
}

// The one place a decision is made: the agent's pick is named above its button.
export function Decide({ item, event }: { item: ReviewItem; event: InboundEvent | undefined }) {
  const resolve = useProcedure(procedures.resolveReviewItem);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRefund = event?.source === 'stripe' && !!event.reference?.startsWith('ch_');
  const actions = ['void', ...(canRefund ? ['refund'] : []), 'follow_up', 'keep'];
  const suggested = actions.includes(item.recommendation) ? item.recommendation : 'keep';
  const others = actions.filter(a => a !== suggested);

  const decide = (action: string) => {
    setBusy(action);
    setError(null);
    resolve({ itemId: item.id, action })
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(null));
  };

  return (
    <div className="ask-foot nodrag">
      <div className="facts-actions">
        {others.map(a => (
          <Button key={a} kind="quiet" size="sm" disabled={busy !== null} pending={busy === a} onClick={() => decide(a)}>
            {ACTION_LABEL[a]}
          </Button>
        ))}
        <span className="ask-suggested">
          <span className="ask-suggest">Suggested</span>
          <Button kind="decide" size="sm" disabled={busy !== null} pending={busy === suggested} onClick={() => decide(suggested)}>
            {ACTION_LABEL[suggested]}
          </Button>
        </span>
      </div>
      {error && <p className="card-error">{error}</p>}
    </div>
  );
}

function Question({
  item,
  detail,
  event,
  eventBy,
  position,
  onStep,
  full,
}: {
  item: ReviewItem;
  detail: ReviewDetail | undefined;
  event: InboundEvent | undefined;
  eventBy: Map<string, InboundEvent>;
  position: { i: number; n: number };
  onStep: (d: number) => void;
  full?: boolean;
}) {
  const evidence = jsonList(detail?.evidence);
  const { steps, ready } = useFollowUpSchedule();
  const twin = item.duplicateOf !== undefined ? eventBy.get(item.duplicateOf.toString()) : undefined;
  return (
    <>
      <div className="ask-top">
        <div className="escalation-head">
          <span className="escalation-who">
            <Icon name="agent" />
            Main agent
          </span>
          <Status kind="needs">Needs you</Status>
        </div>
        <p className="ask-q">{detail?.title ?? item.question}</p>
      </div>
      {event && (
        <div className="ask-compare">
          <button type="button" className="ask-fact lv-click" onClick={() => openItem(event.id)}>
            <span className="muted small">
              {SOURCE_TITLES[event.source] ?? event.source} · {kindLabel(event.kind)}
            </span>
            <span className="ask-big">
              <Money value={dollars(event.amountMinor, event.currency)} />
            </span>
            <span className="small">{event.counterparty}</span>
          </button>
          {twin ? (
            <button type="button" className="ask-fact lv-click" onClick={() => openItem(twin.id)}>
              <span className="muted small">Looks the same as</span>
              <span className="ask-big">
                <Money value={dollars(twin.amountMinor, twin.currency)} />
              </span>
              <span className="small">{twin.counterparty}</span>
            </button>
          ) : (
            <div className="ask-fact">
              <span className="muted small">The agent would</span>
              <span className="ask-big ask-word">{ACTION_LABEL[item.recommendation] ?? 'Keep as is'}</span>
              <span className="small">{item.question}</span>
            </div>
          )}
        </div>
      )}
      <p className="muted small">{detail?.whatHappened || item.reason}</p>
      {full && detail?.fix && (
        <div className="ask-fix">
          <span className="section-label">Proposed fix</span>
          <p>{detail.fix}</p>
        </div>
      )}
      {full && detail?.followUpMessage && (
        <details className="ask-sources nodrag" open>
          <summary>
            <Icon name="ChevronRight" size={12} /> Draft email{detail.followUpTo ? ` to ${detail.followUpTo}` : ''}
          </summary>
          {detail.followUpSubject && <p className="strong small">{detail.followUpSubject}</p>}
          <p className="small email-draft">{detail.followUpMessage}</p>
          <p className="muted small">
            Email them sends this now{ready && steps.length ? `, then ${describeSchedule(steps)} until they reply` : ''}.
          </p>
        </details>
      )}
      <Decide item={item} event={event} />
      {evidence.length > 0 && (
        <details className="ask-sources nodrag" open={full}>
          <summary>
            <Icon name="ChevronRight" size={12} /> Evidence ({evidence.length})
          </summary>
          <ol className="sources">
            {evidence.map((line, i) => (
              <Source key={line} n={i + 1} source={line} detail="" />
            ))}
          </ol>
        </details>
      )}
      {position.n > 1 && (
        <div className="ask-pager nodrag">
          <Button kind="quiet" size="sm" icon="ChevronLeft" disabled={position.i === 0} onClick={() => onStep(-1)} />
          <span className="muted small">
            {position.i + 1} of {position.n}
          </span>
          <Button kind="quiet" size="sm" icon="ChevronRight" disabled={position.i >= position.n - 1} onClick={() => onStep(1)} />
        </div>
      )}
    </>
  );
}

function Far() {
  const { open, detailBy } = useQueue();
  if (!open.length) {
    return <FarCard type="flagged" width="w-flag" icon="check" word="Needs you" big="Nothing" line="Every call is made" />;
  }
  const top = detailBy.get(open[0].id.toString());
  return (
    <FarCard
      type="flagged"
      width="w-flag"
      icon="hourglass"
      word="Needs you"
      big={open.length === 1 ? '1 question' : `${open.length} questions`}
      line={top?.title ?? open[0].question}
      craft="decide"
    />
  );
}

function Calm({ applying, width }: { applying: number; width: string }) {
  return (
    <div className={`pnode escalation ask-banded is-answered ${width}`}>
      <div className="ask-top">
        <div className="escalation-head">
          <span className="escalation-who">
            <Icon name="agent" />
            Main agent
          </span>
          <Status kind="cleared">All answered</Status>
        </div>
        <p className="ask-q">Nothing waits on you.</p>
      </div>
      <p className="muted small">
        {applying
          ? `${applying} ${applying === 1 ? 'decision goes' : 'decisions go'} to the agent on its next run.`
          : 'When the agent is unsure about an event it asks here first.'}
      </p>
      <Handles type="flagged" />
    </div>
  );
}

function makeLevel(full: boolean) {
  return function NeedsYou() {
    const { open, detailBy, eventBy, applying } = useQueue();
    const [index, setIndex] = useState(0);
    const width = full ? 'w-flag-full' : 'w-flag';
    if (!open.length) return <Calm applying={applying} width={width} />;
    const i = Math.min(index, open.length - 1);
    const item = open[i];
    return (
      <div className={`pnode escalation ask-banded ${width}`}>
        <Question
          item={item}
          detail={detailBy.get(item.id.toString())}
          event={eventBy.get(item.eventId.toString())}
          eventBy={eventBy}
          position={{ i, n: open.length }}
          onStep={d => setIndex(Math.max(0, Math.min(open.length - 1, i + d)))}
          full={full}
        />
        {full && open.length > 1 && (
          <div className="stack">
            <span className="section-label">Also waiting ({open.length - 1})</span>
            <ul className="row-list nodrag nowheel">
              {open.slice(0, ALSO_WAITING + 1).map((o, j) =>
                j === i ? null : (
                  <li key={o.id.toString()}>
                    <button type="button" className="row-button" onClick={() => setIndex(j)}>
                      <span className="strong">{detailBy.get(o.id.toString())?.title ?? o.question}</span>
                      {eventBy.get(o.eventId.toString()) && (
                        <Money value={dollars(eventBy.get(o.eventId.toString())!.amountMinor)} />
                      )}
                    </button>
                  </li>
                )
              )}
              {open.length > ALSO_WAITING + 1 && (
                <li className="muted small">+{open.length - ALSO_WAITING - 1} more; use the arrows to step through them</li>
              )}
            </ul>
          </div>
        )}
        {applying > 0 && (
          <p className="muted small">
            {applying} {applying === 1 ? 'decision goes' : 'decisions go'} to the agent on its next run.
          </p>
        )}
        <Handles type="flagged" />
      </div>
    );
  };
}

export const needsYou: CardLevels = { far: Far, full: makeLevel(true) };
