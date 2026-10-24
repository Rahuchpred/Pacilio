import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
import { useState } from 'react';
import { useProcedure, useTable } from 'spacetimedb/react';
import { procedures, tables } from '../module_bindings';
import type { InboundEvent, InboundSourceStatus } from '../module_bindings/types';
import { usePipelineActivity } from './activity';
import { FollowUpsNode } from './FollowUps';
import { Money } from './Money';
import type { ChipState } from './chipStates';
import {
  SOURCES,
  SOURCE_TITLES,
  agentChipHandleId,
  agentHandleId,
  chipHandleId,
  type ChipSide,
} from './sources';

const SIDES: [ChipSide, Position][] = [
  ['top', Position.Top],
  ['right', Position.Right],
  ['bottom', Position.Bottom],
  ['left', Position.Left],
];

const newestFirst = (a: InboundEvent, b: InboundEvent) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

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
  const failing = status?.enabled && status.lastError;

  return (
    <div className={`pipeline-node source-node${sending ? ' is-sending' : ''}`}>
      <div className="node-head">
        <h3>{meta?.title ?? name}</h3>
        <SourceStatus status={status} />
      </div>
      <p className="node-meta">{meta?.provides}</p>
      {failing ? (
        <p className="node-error">{status.lastError}</p>
      ) : (
        <>
          <dl className="node-stats">
            <div>
              <dt>Sent</dt>
              <dd>{events.length}</dd>
            </div>
            <div>
              <dt>Last amount</dt>
              <dd>{last ? <Money amountMinor={last.amountMinor} currency={last.currency} /> : '–'}</dd>
            </div>
          </dl>
          <p className="node-latest">{last ? last.counterparty : 'Nothing sent yet'}</p>
        </>
      )}
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function AgentStatus() {
  const [agents] = useTable(tables.pipelineAgent);
  const agent = agents[0];
  if (agent?.lastError) return <span className="status is-held">! Error</span>;
  if (agent?.status === 'running') return <span className="status is-held">● Working</span>;
  if (agent?.enabled) return <span className="status is-cleared">▶ Ready</span>;
  return <span className="status">‖ Paused</span>;
}

// The main agent: Droid on the Factory cloud computer, working in batches.
export function AgentNode() {
  const { landed, packets } = usePipelineActivity();
  const [agents] = useTable(tables.pipelineAgent);
  const [runs] = useTable(tables.agentRun);
  const [reviews] = useTable(tables.eventReview);
  const [queue] = useTable(tables.reviewItem.where(r => r.status.eq('open')));
  const agent = agents[0];
  const receiving = Object.values(packets).some(p => p.length > 0);
  const reviewed = new Set(reviews.map(r => r.eventId.toString()));
  const waiting = landed.filter(e => !reviewed.has(e.id.toString())).length;
  const processing = reviews.filter(r => r.status !== 'done').length;
  const done = reviews.filter(r => r.status === 'done').length;
  const lastRun = [...runs].filter(r => r.status === 'done').sort((a, b) => (a.id < b.id ? 1 : -1))[0];

  return (
    <div className={`pipeline-node agent-node${receiving ? ' is-receiving' : ''}`}>
      {/* One input per source, spaced down the left edge */}
      {SOURCES.map((source, i) => (
        <Handle
          key={source.name}
          id={agentHandleId(source.name)}
          type="target"
          position={Position.Left}
          isConnectable={false}
          style={{ top: `${((i + 1) * 100) / (SOURCES.length + 1)}%` }}
        />
      ))}
      <div className="node-head">
        <h3>Main agent</h3>
        <AgentStatus />
      </div>
      <dl className="node-stats">
        <div>
          <dt>Waiting</dt>
          <dd>{waiting}</dd>
        </div>
        <div>
          <dt>In this run</dt>
          <dd>{processing}</dd>
        </div>
        <div>
          <dt>Done</dt>
          <dd>{done}</dd>
        </div>
        <div>
          <dt>Needs you</dt>
          <dd>{queue.length}</dd>
        </div>
      </dl>
      <p className="node-latest">
        {agent?.lastError
          ? agent.lastError
          : agent?.status === 'running'
            ? `Working on ${processing} ${processing === 1 ? 'event' : 'events'}…`
            : lastRun?.summary ?? 'Waiting for the first batch'}
      </p>
      {/* Out to the follow-ups and the ledger below */}
      <Handle id="out" type="source" position={Position.Bottom} isConnectable={false} />
      {/* Where event threads come in, one per side */}
      {SIDES.map(([side, position]) => (
        <Handle
          key={side}
          id={agentChipHandleId(side)}
          type="target"
          position={position}
          isConnectable={false}
          className="thread-handle"
        />
      ))}
    </div>
  );
}

// The master ledger workbook exactly as Droid rendered it on the Factory computer.
export function LedgerNode() {
  const [docs] = useTable(tables.ledgerDocument);
  const xlsxUrl = useProcedure(procedures.ledgerXlsxUrl);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const doc = docs[0];
  const updated = doc?.updatedAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  const download = () => {
    setDownloading(true);
    setError(null);
    xlsxUrl()
      .then(url => window.open(url, '_blank', 'noopener'))
      .catch((err: Error) => setError(err.message))
      .finally(() => setDownloading(false));
  };

  return (
    <div className="pipeline-node ledger-node">
      <NodeResizer
        minWidth={480}
        minHeight={320}
        lineClassName="ledger-resize-line"
        handleClassName="ledger-resize-handle"
      />
      <Handle type="target" position={Position.Top} isConnectable={false} />
      <div className="node-head">
        <h3>Master ledger.xlsx</h3>
        <div className="ledger-actions">
          <span className="status">{doc ? `Updated ${updated}` : 'Not written yet'}</span>
          <button className="btn btn-secondary" onClick={download} disabled={!doc || downloading}>
            {downloading ? 'Preparing…' : 'Download .xlsx'}
          </button>
        </div>
      </div>
      {error && <p className="node-error">{error}</p>}
      <div className="ledger-frame nodrag nowheel">
        {doc ? (
          // Sandboxed: the agent's page can't run scripts or reach this app
          <iframe title="Master ledger" sandbox="" srcDoc={doc.html} />
        ) : (
          <p className="node-meta">The agent writes the ledger after its first run.</p>
        )}
      </div>
    </div>
  );
}

// One received event, parked around the agent.
export function EventNode({ data }: NodeProps) {
  const { event, state } = data as { event: InboundEvent; state: ChipState; side: ChipSide };
  const { flashing } = usePipelineActivity();
  const isNew = state === 'waiting' && flashing.has(event.id.toString());

  return (
    <div
      className={`event-chip is-${state}${isNew ? ' is-new' : ''}`}
      title={`${SOURCE_TITLES[event.source] ?? event.source} · ${event.kind.replace(/_/g, ' ')} · ${event.description}`}
    >
      <span className="chip-party">{event.counterparty}</span>
      <Money amountMinor={event.amountMinor} currency={event.currency} />
      {/* The thread to the agent leaves from whichever side faces it */}
      {SIDES.map(([side, position]) => (
        <Handle
          key={side}
          id={chipHandleId(side)}
          type="source"
          position={position}
          isConnectable={false}
          className="thread-handle"
        />
      ))}
    </div>
  );
}

export const pipelineNodeTypes = {
  source: SourceNode,
  agent: AgentNode,
  ledger: LedgerNode,
  followups: FollowUpsNode,
  event: EventNode,
};
