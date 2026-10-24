import { Handle, Position, type NodeProps } from '@xyflow/react';
import { useTable } from 'spacetimedb/react';
import { tables } from '../module_bindings';
import type { InboundEvent, InboundSourceStatus } from '../module_bindings/types';
import { usePipelineActivity } from './activity';
import { Money } from './Money';
import { MAX_CHIPS, SOURCES, SOURCE_TITLES, agentHandleId } from './sources';

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

// The main agent. Droid (Factory) will run here; for now it shows what it has received.
export function AgentNode() {
  const { landed, packets } = usePipelineActivity();
  const sources = new Set(landed.map(e => e.source)).size;
  const receiving = Object.values(packets).some(p => p.length > 0);
  const last = landed[landed.length - 1];

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
        <span className="status">◇ Not connected</span>
      </div>
      <p className="node-meta">Droid will classify, reconcile and flag incoming events.</p>
      <dl className="node-stats">
        <div>
          <dt>Received</dt>
          <dd>{landed.length}</dd>
        </div>
        <div>
          <dt>Sources</dt>
          <dd>{sources}</dd>
        </div>
        <div>
          <dt>On the board</dt>
          <dd>{Math.min(landed.length, MAX_CHIPS)}</dd>
        </div>
      </dl>
      <p className="node-latest">
        {last
          ? `Latest: ${last.counterparty} from ${SOURCE_TITLES[last.source] ?? last.source}`
          : 'Waiting for the first event'}
      </p>
    </div>
  );
}

// One received event, parked around the agent.
export function EventNode({ data }: NodeProps) {
  const event = (data as { event: InboundEvent }).event;
  const { flashing } = usePipelineActivity();
  const isNew = flashing.has(event.id.toString());

  return (
    <div
      className={`event-chip${isNew ? ' is-new' : ''}`}
      title={`${event.kind.replace(/_/g, ' ')} · ${event.description}`}
    >
      <div className="chip-top">
        <span className="chip-source">{SOURCE_TITLES[event.source] ?? event.source}</span>
        <Money amountMinor={event.amountMinor} currency={event.currency} />
      </div>
      <div className="chip-party">{event.counterparty}</div>
    </div>
  );
}

export const pipelineNodeTypes = { source: SourceNode, agent: AgentNode, event: EventNode };
