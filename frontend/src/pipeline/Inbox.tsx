import { Money, Status } from '../../../design-system/src/components';
import type { InboundSourceStatus } from '../module_bindings/types';
import { FarCard, type CardLevels } from '../canvas/levels';
import { useLiveList } from '../canvas/motion';
import { Card } from './Card';
import { SourceTag, sentence } from './Transactions';
import { ROW_STATUS, SOURCES, byIdDesc, clock, dollars, openItem, useRows } from './live';
import { useLive } from './store';

// Sources: the bank, Stripe, the accounting system and receipts feeding the
// main agent, and what they sent.

const LATEST = 14;

function SourceState({ status }: { status: InboundSourceStatus | undefined }) {
  if (status?.enabled && status.lastError) {
    return <Status kind="disputed">{status.configured ? 'Error' : 'Needs a key'}</Status>;
  }
  // Running is the normal state, so it stays ink; green is for finished work
  if (status?.enabled) return <Status kind="agent" busy>Running</Status>;
  return <Status kind="agent">Paused</Status>;
}

function useSources() {
  const { statuses, events } = useLive();
  const counts = new Map<string, number>();
  for (const e of events) counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
  return {
    total: events.length,
    running: statuses.filter(s => s.enabled).length,
    sources: SOURCES.map(s => ({ ...s, status: statuses.find(x => x.name === s.name), count: counts.get(s.name) ?? 0 })),
  };
}

function SourceList() {
  const { sources } = useSources();
  return (
    <div className="panel">
      <div className="panel-list">
        {sources.map(s => (
          <div key={s.name} className="panel-row">
            <div className="stack">
              <SourceTag source={s.name} />
              <span className="muted small">{s.provides}</span>
            </div>
            <div className="stack end">
              <span className="num strong">{s.count}</span>
              <SourceState status={s.status} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Far() {
  const { total, running } = useSources();
  return (
    <FarCard
      type="inbox"
      width="w-inbox"
      icon="download"
      word="Sources"
      big={total}
      line={running ? `events from ${running} of 4 sources` : 'events, sources paused'}
    />
  );
}

// Full: the sources, then the newest events; any of them opens in the item panel.
function Full() {
  const rows = useRows();
  const { sources } = useSources();
  const latest = [...rows].sort((a, b) => byIdDesc(a.event, b.event)).slice(0, LATEST);
  const live = useLiveList(latest, r => r.event.id.toString());
  const errors = sources.filter(s => s.status?.enabled && s.status.lastError);
  return (
    <Card type="inbox" icon="download" title="Sources" meta={<span className="muted small">{rows.length} events</span>} className="w-inbox-full">
      <SourceList />
      {errors.map(s => (
        <p key={s.name} className="card-error">
          {s.title}: {s.status?.lastError}
        </p>
      ))}
      <span className="section-label">Latest</span>
      <ul className="row-list live-list nodrag nowheel" ref={live.list as React.Ref<HTMLUListElement>}>
        {live.shown.map(({ item: r, key, leaving }) => (
          <li key={key} data-key={key} data-leaving={leaving}>
            <button type="button" className="row-button" onClick={() => openItem(r.event.id)}>
              <span className="stack">
                <span className="strong">{sentence(r.event.counterparty)}</span>
                <span className="inbox-meta">
                  <SourceTag source={r.event.source} kind={r.event.kind} />
                  <span className="muted small">{clock(r.event.receivedAt.toDate())}</span>
                </span>
              </span>
              <span className="stack end">
                <Money value={dollars(r.event.amountMinor, r.event.currency)} />
                <Status kind={ROW_STATUS[r.state].kind} busy={ROW_STATUS[r.state].busy}>{ROW_STATUS[r.state].label}</Status>
              </span>
            </button>
          </li>
        ))}
        {latest.length === 0 && <li className="muted">Nothing yet. Press Run to start the sources.</li>}
      </ul>
    </Card>
  );
}

export const inbox: CardLevels = { far: Far, full: Full };
