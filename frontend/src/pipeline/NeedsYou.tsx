import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useProcedure } from 'spacetimedb/react';
import { Button, Icon, Money, Status } from '../../../design-system/src/components';
import { procedures } from '../module_bindings';
import type { InboundEvent, ReviewDetail, ReviewItem } from '../module_bindings/types';
import { FarCard, Handles, type CardLevels } from '../canvas/levels';
import { describeSchedule, useFollowUpSchedule } from './followUps';
import { SOURCE_TITLES, dollars, jsonList, kindLabel, openItem } from './live';
import { Evidence } from './Evidence';
import { useLive } from './store';

// Needs you: the calls the agent isn't sure about, grouped into kinds so a
// long queue reads as a few dozen decisions. The question sits on an orange
// band; the queue and the chosen question on white below. A decision goes
// back to the agent on its next run.

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

// One labelled part of the question.
function Part({ label, children }: { label: ReactNode; children: ReactNode }) {
  return (
    <section className="ask-part">
      <h4 className="section-label">{label}</h4>
      {children}
    </section>
  );
}

// Questions that read the same are one kind: one row in the queue, one
// decision for all of them when it is safe.
type Kind = { key: string; title: string; items: ReviewItem[]; total: number; suggestion: string };

function useKinds(open: ReviewItem[], detailBy: Map<string, ReviewDetail>, eventBy: Map<string, InboundEvent>): Kind[] {
  return useMemo(() => {
    const kinds = new Map<string, Kind>();
    for (const item of open) {
      const title = detailBy.get(item.id.toString())?.title ?? item.question;
      const ev = eventBy.get(item.eventId.toString());
      const k = kinds.get(title) ?? { key: title, title, items: [], total: 0, suggestion: item.recommendation };
      k.items.push(item);
      k.total += ev ? dollars(ev.amountMinor, ev.currency) : 0;
      kinds.set(title, k);
    }
    // The biggest kinds first: one decision there clears the most
    return [...kinds.values()].sort((x, y) => y.items.length - x.items.length || Math.abs(y.total) - Math.abs(x.total));
  }, [open, detailBy, eventBy]);
}

// Bulk answers only where nothing leaves the building: voiding a duplicate
// or keeping a row. Emails and Stripe refunds stay one at a time.
const BULK_SAFE = ['void', 'keep'];

function DecideKind({ kind, onDone }: { kind: Kind; onDone: () => void }) {
  const resolve = useProcedure(procedures.resolveReviewItem);
  const [run, setRun] = useState<{ action: string; done: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stop = useRef(false);
  const actions = [...BULK_SAFE].sort(a => (a === kind.suggestion ? -1 : 1));

  const go = async (action: string) => {
    stop.current = false;
    setError(null);
    setRun({ action, done: 0 });
    let done = 0;
    for (const item of kind.items) {
      if (stop.current) break;
      try {
        await resolve({ itemId: item.id, action });
      } catch (err) {
        // Someone else may have answered one already; carry on with the rest
        if (!/already been decided/.test((err as Error).message)) setError((err as Error).message);
      }
      done += 1;
      setRun({ action, done });
    }
    setRun(null);
    onDone();
  };

  if (run) {
    return (
      <div className="triage-bulk is-running nodrag">
        <span className="spinner" aria-hidden="true" />
        <span>
          {run.action === 'void' ? 'Voiding' : 'Keeping'} {run.done} of {kind.items.length}
        </span>
        <Button kind="quiet" size="sm" onClick={() => (stop.current = true)}>
          Stop
        </Button>
      </div>
    );
  }
  return (
    <div className="triage-bulk nodrag">
      <span className="muted small">All {kind.items.length} like this:</span>
      {actions.map(a => (
        <Button key={a} kind="secondary" size="sm" onClick={() => go(a)}>
          {a === 'void' ? `Void all ${kind.items.length}` : `Keep all ${kind.items.length}`}
        </Button>
      ))}
      {error && <p className="card-error">{error}</p>}
    </div>
  );
}

// The question card, open: the queue grouped by kind on the left, the
// chosen question on the right, so 600 questions read as a few dozen calls.
function Triage() {
  const { open, detailBy, eventBy, applying } = useQueue();
  const kinds = useKinds(open, detailBy, eventBy);
  const [kindKey, setKindKey] = useState<string | null>(null);
  const [at, setAt] = useState(0);
  const [only, setOnly] = useState<string>('all');
  const [query, setQuery] = useState('');
  const { steps, ready } = useFollowUpSchedule();
  // Filters by what the agent suggests, so a long queue splits into a few
  // piles you can work through; the search narrows by name or bill
  const counts = kinds.reduce<Record<string, number>>((c, k) => ({ ...c, [k.suggestion]: (c[k.suggestion] ?? 0) + 1 }), {});
  const q = query.trim().toLowerCase();
  const shown = kinds.filter(k => (only === 'all' || k.suggestion === only) && (!q || k.title.toLowerCase().includes(q)));
  const kind = kinds.find(k => k.key === kindKey) ?? shown[0] ?? kinds[0];
  const i = Math.min(at, kind.items.length - 1);
  const item = kind.items[i];
  const detail = detailBy.get(item.id.toString());
  const event = eventBy.get(item.eventId.toString());
  const twin = item.duplicateOf !== undefined ? eventBy.get(item.duplicateOf.toString()) : undefined;
  const evidence = jsonList(detail?.evidence);
  const waiting = kinds.reduce((sum, k) => sum + k.total, 0);
  const pick = (key: string) => {
    setKindKey(key);
    setAt(0);
  };

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
    <div className="pnode escalation ask-banded w-flag-full triage">
      <div className="ask-top">
        <div className="escalation-head">
          <span className="escalation-who">
            <Icon name="agent" />
            Bookkeeper asks
          </span>
          <span className="small">
            <Money value={waiting} cents={false} /> waiting
          </span>
        </div>
        <p className="ask-q">
          {kinds.length < open.length
            ? `${open.length} questions in ${kinds.length} kinds. The biggest kinds are first: one call there clears the most.`
            : `${open.length} ${open.length === 1 ? 'question' : 'questions'} waiting on you.`}
        </p>
      </div>

      <div className="triage-cols">
        <section className="triage-queue">
          <div className="triage-tools nodrag">
            <label className="triage-search">
              <Icon name="search" size={14} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a vendor or bill" aria-label="Find a kind of question" />
            </label>
            <div className="triage-filter" role="tablist" aria-label="Filter by suggestion">
              {['all', ...Object.keys(counts).sort((x, y) => counts[y] - counts[x])].map(f => (
                <button key={f} type="button" role="tab" aria-selected={only === f} onClick={() => setOnly(f)}>
                  {f === 'all' ? 'All' : (ACTION_LABEL[f] ?? f).replace(' it', '').replace(' them', '').replace(' as is', '').replace(' on Stripe', '')}
                  <span className="triage-filter-n">{f === 'all' ? kinds.length : counts[f]}</span>
                </button>
              ))}
            </div>
          </div>
          <ul className="triage-kinds nodrag nowheel">
            {shown.map(k => (
              <li key={k.key}>
                <button type="button" className="triage-kind" aria-pressed={k === kind} onClick={() => pick(k.key)}>
                  <span className="triage-kind-title">{k.title}</span>
                  <span className="triage-kind-meta">
                    {k.items.length > 1 && <span className="triage-count">{k.items.length}×</span>}
                    <Money value={k.total} cents={false} />
                  </span>
                  <span className="triage-kind-suggest muted small">Suggests: {ACTION_LABEL[k.suggestion] ?? 'Keep as is'}</span>
                </button>
              </li>
            ))}
            {!shown.length && <li className="muted small triage-empty">Nothing matches.</li>}
          </ul>
          <p className="triage-foot muted small">
            Showing {shown.length} of {kinds.length} {kinds.length === 1 ? 'kind' : 'kinds'} · {open.length} questions
          </p>
        </section>

        <section className="triage-detail">
          <div className="triage-detail-body nodrag nowheel" key={item.id.toString()}>
          <header className="triage-detail-head">
            <h3>{detail?.title ?? item.question}</h3>
            {kind.items.length > 1 && (
              <span className="ask-pager nodrag">
                <Button kind="quiet" size="sm" icon="ChevronLeft" disabled={i === 0} onClick={() => setAt(i - 1)} />
                <span className="small muted">
                  {i + 1} of {kind.items.length}
                </span>
                <Button kind="quiet" size="sm" icon="ChevronRight" disabled={i >= kind.items.length - 1} onClick={() => setAt(i + 1)} />
              </span>
            )}
          </header>

          {event && (
            <div className={twin ? 'ask-compare' : 'ask-compare is-single'}>
              <Fact e={event} label={`${SOURCE_TITLES[event.source] ?? event.source} \u00b7 ${kindLabel(event.kind)}`} />
              {twin && <Fact e={twin} label="Looks the same as" />}
            </div>
          )}
          <p className="ask-text">{detail?.whatHappened || item.reason}</p>

          {evidence.length > 0 && (
            <Part label={`Evidence (${evidence.length})`}>
              <Evidence lines={evidence} />
            </Part>
          )}

          <p className="bill-suggest">
            <span className="strong">Suggested: {ACTION_LABEL[item.recommendation] ?? 'Keep as is'}.</span> {detail?.fix ?? item.question}
          </p>
          {detail?.followUpMessage && (
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

          </div>
          <footer className="triage-call">
            <Decide item={item} event={event} />
            {kind.items.length > 1 ? (
              <DecideKind key={kind.key} kind={kind} onDone={() => setAt(0)} />
            ) : (
              // Same row, same height, so the buttons above never move
              <div className="triage-bulk is-single">
                <span className="muted small">Only one question like this.</span>
              </div>
            )}
          </footer>
        </section>
      </div>

      {applying > 0 && (
        <p className="muted small">
          {applying} {applying === 1 ? 'decision goes' : 'decisions go'} to the agent on its next run.
        </p>
      )}
      <Handles type="flagged" />
    </div>
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
            Bookkeeper
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

function Full() {
  const { open, applying } = useQueue();
  if (!open.length) return <Calm applying={applying} width="w-flag-full" />;
  return <Triage />;
}

export const needsYou: CardLevels = { far: Far, full: Full };
