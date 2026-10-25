import { useState, type ReactNode } from 'react';
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

// The one place a decision is made: the agent's pick is the orange button,
// the other answers sit beside it as plain buttons.
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
    <div className="ask-decide nodrag">
      <div className="ask-buttons">
        <Button kind="decide" size="sm" disabled={busy !== null} pending={busy === suggested} onClick={() => decide(suggested)}>
          {ACTION_LABEL[suggested]}
        </Button>
        {others.map(a => (
          <Button key={a} kind="secondary" size="sm" disabled={busy !== null} pending={busy === a} onClick={() => decide(a)}>
            {ACTION_LABEL[a]}
          </Button>
        ))}
      </div>
      <p className="muted small">Nothing posts until you answer. Your call goes to the agent on its next run.</p>
      {error && <p className="card-error">{error}</p>}
    </div>
  );
}

// One labelled part of the question card.
function Part({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="ask-part">
      <h4 className="section-label">{label}</h4>
      {children}
    </section>
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
  const Fact = ({ e, label }: { e: InboundEvent; label: string }) => (
    <button type="button" className="ask-fact lv-click" onClick={() => openItem(e.id)}>
      <span className="muted small">{label}</span>
      <span className="ask-big">
        <Money value={dollars(e.amountMinor, e.currency)} />
      </span>
      <span className="small">{e.counterparty}</span>
    </button>
  );
  return (
    <>
      <div className="ask-top">
        <div className="escalation-head">
          <span className="escalation-who">
            <Icon name="agent" />
            Main agent asks
          </span>
          {position.n > 1 ? (
            <span className="ask-pager nodrag">
              <Button kind="quiet" size="sm" icon="ChevronLeft" disabled={position.i === 0} onClick={() => onStep(-1)} />
              <span className="small">
                {position.i + 1} of {position.n}
              </span>
              <Button kind="quiet" size="sm" icon="ChevronRight" disabled={position.i >= position.n - 1} onClick={() => onStep(1)} />
            </span>
          ) : (
            <Status kind="needs">Needs you</Status>
          )}
        </div>
        <p className="ask-q">{detail?.title ?? item.question}</p>
      </div>

      <Part label="What happened">
        {event && (
          <div className={twin ? 'ask-compare' : 'ask-compare is-single'}>
            <Fact e={event} label={`${SOURCE_TITLES[event.source] ?? event.source} · ${kindLabel(event.kind)}`} />
            {twin && <Fact e={twin} label="Looks the same as" />}
          </div>
        )}
        <p className="ask-text">{detail?.whatHappened || item.reason}</p>
      </Part>

      {evidence.length > 0 && (
        <Part label={`Evidence (${evidence.length})`}>
          <ol className="sources">
            {evidence.map((line, i) => (
              <Source key={line} n={i + 1} source={line} detail="" />
            ))}
          </ol>
        </Part>
      )}

      <Part label="What the agent suggests">
        <p className="ask-suggestion">
          <span className="strong">{ACTION_LABEL[item.recommendation] ?? 'Keep as is'}.</span> {full && detail?.fix ? detail.fix : item.question}
        </p>
        {full && detail?.followUpMessage && (
          <details className="ask-sources nodrag">
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
      </Part>

      <Part label="Your call">
        <Decide item={item} event={event} />
      </Part>
    </>
  );
}

// Questions that read the same are one row with a count, so a run of repeat
// payments does not bury the rest.
const ALSO_SHOWN = 5;
function AlsoWaiting({
  open,
  current,
  detailBy,
  eventBy,
  onPick,
}: {
  open: ReviewItem[];
  current: number;
  detailBy: Map<string, ReviewDetail>;
  eventBy: Map<string, InboundEvent>;
  onPick: (j: number) => void;
}) {
  const [all, setAll] = useState(false);
  const groups = new Map<string, { title: string; first: number; n: number; total: number }>();
  open.forEach((o, j) => {
    if (j === current) return;
    const title = detailBy.get(o.id.toString())?.title ?? o.question;
    const ev = eventBy.get(o.eventId.toString());
    const g = groups.get(title) ?? { title, first: j, n: 0, total: 0 };
    g.n += 1;
    g.total += ev ? dollars(ev.amountMinor, ev.currency) : 0;
    groups.set(title, g);
  });
  const list = [...groups.values()];
  const shown = all ? list : list.slice(0, ALSO_SHOWN);
  if (!list.length) return null;
  return (
    <Part label={`Also waiting (${open.length - 1})`}>
      <ul className="row-list ask-also nodrag nowheel">
        {shown.map(g => (
          <li key={g.title}>
            <button type="button" className="row-button" onClick={() => onPick(g.first)}>
              <span className="strong">
                {g.title}
                {g.n > 1 && <span className="ask-count">{g.n}×</span>}
              </span>
              <Money value={g.total} />
            </button>
          </li>
        ))}
      </ul>
      {list.length > ALSO_SHOWN && (
        <button type="button" className="link-button nodrag" onClick={() => setAll(v => !v)}>
          {all ? 'Show fewer' : `Show ${list.length - ALSO_SHOWN} more kinds`}
        </button>
      )}
    </Part>
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
      big={
        <>
          {open.length} <span className="far-unit">{open.length === 1 ? 'question' : 'questions'}</span>
        </>
      }
      line={top?.title ?? open[0].question}
      band
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
          <AlsoWaiting open={open} current={i} detailBy={detailBy} eventBy={eventBy} onPick={setIndex} />
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
