import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import type { InboundEvent, InboundSourceStatus } from '../module_bindings/types';
import { usePipelineActivity } from './activity';
import { Money } from './Money';
import { SOURCES } from './sources';

const FEED_ROWS = 30;

const newestFirst = (a: InboundEvent, b: InboundEvent) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

function time(event: InboundEvent): string {
  return event.receivedAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

// Glyph and word, never a bare dot or color alone.
function SourceStatus({ status }: { status: InboundSourceStatus | undefined }) {
  if (status?.enabled && status.lastError) {
    return <span className="status is-held">! {status.configured ? 'Error' : 'Needs a key'}</span>;
  }
  if (status?.enabled) return <span className="status is-cleared">▶ Running</span>;
  return <span className="status">‖ Paused</span>;
}

export function SourceNode({ data }: NodeProps) {
  const name = (data as { source: string }).source;
  const meta = SOURCES.find(s => s.name === name);
  const [statuses] = useTable(tables.inboundSourceStatus);
  const [events] = useTable(tables.inboundEvent.where(r => r.source.eq(name)));
  const { packets } = usePipelineActivity();
  const status = statuses.find(s => s.name === name);
  const last = [...events].sort(newestFirst)[0];
  const sending = (packets[name] ?? []).length > 0;

  return (
    <div className={`pipeline-node source-node${sending ? ' is-sending' : ''}`}>
      <div className="node-head">
        <h3>{meta?.title ?? name}</h3>
        <SourceStatus status={status} />
      </div>
      <p className="node-meta">{meta?.provides}</p>
      {status?.enabled && status.lastError ? (
        <p className="node-error">{status.lastError}</p>
      ) : (
        <p className="node-last">
          {last ? (
            <>
              <span className="event-party">{last.counterparty}</span>
              <Money amountMinor={last.amountMinor} currency={last.currency} />
            </>
          ) : (
            <span className="node-meta">No events yet</span>
          )}
        </p>
      )}
      <p className="node-count">
        {events.length} {events.length === 1 ? 'event' : 'events'} sent
      </p>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

export function FeedNode() {
  const [events] = useTable(tables.inboundEvent);
  const { inFlight, flashing } = usePipelineActivity();
  const landed = events.filter(e => !inFlight.has(e.id.toString()));
  const latest = [...landed].sort(newestFirst).slice(0, FEED_ROWS);
  const title = Object.fromEntries(SOURCES.map(s => [s.name, s.title]));

  return (
    <div className="pipeline-node feed-node">
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="node-head">
        <h3>Inbound feed</h3>
        <span className="node-count">{landed.length} received</span>
      </div>
      {latest.length === 0 ? (
        <p className="node-meta">Nothing has arrived yet. Press Run to start the sources.</p>
      ) : (
        <div className="feed-scroll nowheel nodrag">
          <table className="feed-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Counterparty</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {latest.map(e => (
                <tr key={e.id.toString()} className={flashing.has(e.id.toString()) ? 'is-new' : undefined}>
                  <td className="mono">{time(e)}</td>
                  <td>
                    {title[e.source] ?? e.source}
                    <span className="kind">{e.kind.replace(/_/g, ' ')}</span>
                  </td>
                  <td className="party" title={e.description}>{e.counterparty}</td>
                  <td className="num">
                    <Money amountMinor={e.amountMinor} currency={e.currency} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const pipelineNodeTypes = { source: SourceNode, feed: FeedNode };
