import { useTable } from 'spacetimedb/react';
import { Money, Status } from '../../../design-system/src/components';
import { tables } from '../module_bindings';
import type { InboundSourceStatus } from '../module_bindings/types';
import { FarCard, Handles, type CardLevels } from '../canvas/levels';
import { Card } from './Card';
import { ROW_STATUS, SOURCES, SOURCE_TITLES, byIdDesc, clock, dollars, kindLabel, openItem, useRows } from './live';

// Inbox: the four sources feeding the main agent, and what they sent.

const LATEST = 14;

function SourceTag({ status }: { status: InboundSourceStatus | undefined }) {
  if (status?.enabled && status.lastError) {
    return <Status kind="disputed">{status.configured ? 'Error' : 'Needs a key'}</Status>;
  }
  if (status?.enabled) return <Status kind="cleared">Running</Status>;
  return <Status kind="agent">Paused</Status>;
}

function useSources() {
  const [statuses] = useTable(tables.inboundSourceStatus);
  const [events] = useTable(tables.inboundEvent);
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
              <span className="strong">{s.title}</span>
              <span className="muted small">{s.provides}</span>
            </div>
            <div className="stack end">
              <span className="num strong">{s.count}</span>
              <SourceTag status={s.status} />
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
      icon="mail"
      word="Inbox"
      big={total}
      line={running ? `events from ${running} of 4 sources` : 'events, sources paused'}
    />
  );
}

function Short() {
  const { total } = useSources();
  return (
    <div className="pnode-bare w-inbox">
      <h3 className="bare-title">
        Inbox
        <span className="muted small">{total} events</span>
      </h3>
      <SourceList />
      <Handles type="inbox" />
    </div>
  );
}

// Full: the sources, then the newest events; any of them opens in the item panel.
function Full() {
  const rows = useRows();
  const { sources } = useSources();
  const latest = [...rows].sort((a, b) => byIdDesc(a.event, b.event)).slice(0, LATEST);
  const errors = sources.filter(s => s.status?.enabled && s.status.lastError);
  return (
    <Card type="inbox" icon="mail" title="Inbox" meta={<span className="muted small">{rows.length} events</span>} className="w-inbox-full">
      <SourceList />
      {errors.map(s => (
        <p key={s.name} className="card-error">
          {s.title}: {s.status?.lastError}
        </p>
      ))}
      <span className="section-label">Latest</span>
      <ul className="row-list nodrag nowheel">
        {latest.map(r => (
          <li key={r.event.id.toString()}>
            <button type="button" className="row-button" onClick={() => openItem(r.event.id)}>
              <span className="stack">
                <span className="strong">{r.event.counterparty}</span>
                <span className="muted small">
                  {SOURCE_TITLES[r.event.source] ?? r.event.source} · {kindLabel(r.event.kind)} · {clock(r.event.receivedAt.toDate())}
                </span>
              </span>
              <span className="stack end">
                <Money value={dollars(r.event.amountMinor, r.event.currency)} />
                <Status kind={ROW_STATUS[r.state].kind}>{ROW_STATUS[r.state].label}</Status>
              </span>
            </button>
          </li>
        ))}
        {latest.length === 0 && <li className="muted">Nothing yet. Press Run to start the sources.</li>}
      </ul>
    </Card>
  );
}

export const inbox: CardLevels = { far: Far, short: Short, full: Full };
