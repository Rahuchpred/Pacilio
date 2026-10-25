import { useState } from 'react';
import { Handle, NodeResizer, Position } from '@xyflow/react';
import { useProcedure, useReducer, useTable } from 'spacetimedb/react';
import { procedures, reducers, tables } from '../module_bindings';
import { logError } from '../throttle';

// The reports agent and the show report it builds from the settled ledger rows
// (P&L, cash, costs, vendors, tickets).

const EVERY_MIN = 10;

function clock(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

// Sits between the ledger and the report: runs the report tool, writes the takeaways.
export function ReportAgentNode() {
  const [states] = useTable(tables.reportState);
  const [docs] = useTable(tables.reportDocument);
  const [agents] = useTable(tables.pipelineAgent);
  const refresh = useReducer(reducers.requestReport);
  const state = states[0];
  const doc = docs[0];
  const running = agents[0]?.enabled;
  const building = state?.status === 'running' || state?.requested;
  const next = state?.lastStartedAt
    ? new Date(state.lastStartedAt.toDate().getTime() + EVERY_MIN * 60_000)
    : undefined;

  const status = state?.lastError
    ? <span className="status is-held">! Error</span>
    : building
      ? <span className="status is-held">● Building</span>
      : running
        ? <span className="status is-cleared">▶ Ready</span>
        : <span className="status">‖ Paused</span>;

  return (
    <div className={`pipeline-node report-agent-node${building ? ' is-receiving' : ''}`}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="node-head">
        <h3>Reports agent</h3>
        {status}
      </div>
      <p className="node-meta">Charts and P&amp;L from settled rows only</p>
      <dl className="node-stats">
        <div>
          <dt>Last report</dt>
          <dd>{doc ? clock(doc.updatedAt.toDate()) : '–'}</dd>
        </div>
        <div>
          <dt>Next</dt>
          <dd>{running ? (next ? `after ${clock(next)}` : 'soon') : 'paused'}</dd>
        </div>
      </dl>
      {state?.lastError ? (
        <p className="node-error">{state.lastError}</p>
      ) : (
        <p className="node-latest">Runs every {EVERY_MIN} min when the ledger changes</p>
      )}
      <button
        className="btn btn-secondary report-refresh"
        disabled={!!building}
        onClick={() => refresh().catch(logError)}
      >
        {building ? 'Building…' : 'Build report now'}
      </button>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

function list(json: string | undefined): string[] {
  try {
    const v = JSON.parse(json ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function ReportsNode() {
  const [docs] = useTable(tables.reportDocument);
  const [states] = useTable(tables.reportState);
  const xlsxUrl = useProcedure(procedures.reportXlsxUrl);
  const [error, setError] = useState<string | null>(null);
  const doc = docs[0];
  const state = states[0];
  const building = state?.status === 'running' || state?.requested;
  const updated = doc?.updatedAt.toDate().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const commentary = list(doc?.commentary);
  const watch = list(doc?.watch);

  const download = () => {
    setError(null);
    xlsxUrl()
      .then(url => window.open(url, '_blank', 'noopener'))
      .catch((err: Error) => setError(err.message));
  };

  return (
    <div className="pipeline-node reports-node">
      <NodeResizer
        minWidth={560}
        minHeight={420}
        lineClassName="ledger-resize-line"
        handleClassName="ledger-resize-handle"
      />
      <Handle type="target" position={Position.Left} isConnectable={false} />
      <div className="node-head">
        <h3>Show report</h3>
        <div className="ledger-actions">
          <span className={building ? 'status is-held' : 'status'}>
            {building ? '● Building…' : doc ? `Updated ${updated}` : 'Not built yet'}
          </span>
          <button className="btn btn-secondary" onClick={download} disabled={!doc}>
            Download .xlsx
          </button>
        </div>
      </div>
      {(error || state?.lastError) && <p className="node-error">{error ?? state?.lastError}</p>}

      {doc ? (
        <>
          {doc.headline && <p className="report-headline">{doc.headline}</p>}
          {(commentary.length > 0 || watch.length > 0) && (
            <div className="report-notes">
              {commentary.length > 0 && (
                <ul>
                  {commentary.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {watch.length > 0 && (
                <div className="report-watch">
                  <span className="followup-label">Worth a look</span>
                  <ul>
                    {watch.map(line => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          <div className="ledger-frame nodrag nowheel">
            <iframe title="Show report" sandbox="" srcDoc={doc.html} />
          </div>
        </>
      ) : (
        <p className="node-meta">
          Built from settled ledger rows every 10 minutes while the pipeline runs, or now from the Reports agent.
        </p>
      )}
    </div>
  );
}
