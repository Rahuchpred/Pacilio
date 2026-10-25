import { useState } from 'react';
import { useProcedure, useReducer, useTable } from 'spacetimedb/react';
import { Button, Money, Status, type StatusKind } from '../../../design-system/src/components';
import { procedures, reducers, tables } from '../module_bindings';
import { logError } from '../throttle';
import { FarCard, type CardLevels, type Look } from '../canvas/levels';
import { Steps } from './Agent';
import { Card } from './Card';
import { clock, jsonList, totals, useRows } from './live';

// The reports agent, between the ledger and the show report: every 10 minutes
// while the pipeline runs (if the ledger changed), or on request, Droid runs
// the fixed report tool over the settled rows and writes the takeaways.

const EVERY_MIN = 10;

function useReport() {
  const [states] = useTable(tables.reportState);
  const [docs] = useTable(tables.reportDocument);
  const [agents] = useTable(tables.pipelineAgent);
  const state = states[0];
  const doc = docs[0];
  const running = !!agents[0]?.enabled;
  const building = state?.status === 'running' || !!state?.requested;
  const next = state?.lastStartedAt
    ? new Date(state.lastStartedAt.toDate().getTime() + EVERY_MIN * 60_000)
    : undefined;
  const status: { kind: StatusKind; label: string } = state?.lastError
    ? { kind: 'disputed', label: 'Error' }
    : building
      ? { kind: 'needs', label: 'Building' }
      : running
        ? { kind: 'cleared', label: 'Ready' }
        : { kind: 'agent', label: 'Paused' };
  return { state, doc, running, building, next, status };
}

function useReportLook(): Look {
  const { state, building, doc } = useReport();
  if (state?.lastError) return 'issue';
  if (building) return 'working';
  return doc ? 'idle' : 'idle';
}

function AgentFar() {
  const { doc, building, status } = useReport();
  return (
    <FarCard
      type="reportAgent"
      width="w-ragent"
      icon="agent"
      word="Reports agent"
      big={<Status kind={status.kind}>{status.label}</Status>}
      line={doc ? `Last report ${clock(doc.updatedAt.toDate())}` : 'No report yet'}
      craft={building ? 'decide' : undefined}
    />
  );
}

function BuildNow() {
  const refresh = useReducer(reducers.requestReport);
  const { building } = useReport();
  return (
    <Button kind="secondary" size="sm" icon="ChartLine" disabled={building} pending={building} onClick={() => refresh().catch(logError)}>
      {building ? 'Building…' : 'Build report now'}
    </Button>
  );
}

function AgentShort() {
  const { doc, running, next, status, state } = useReport();
  return (
    <Card type="reportAgent" icon="agent" title="Reports agent" meta={<Status kind={status.kind}>{status.label}</Status>} className="w-ragent">
      <dl className="counts">
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
        <p className="card-error">{state.lastError}</p>
      ) : (
        <p className="muted small">Reads settled rows only, every {EVERY_MIN} min when the ledger changes.</p>
      )}
      <div className="nodrag">
        <BuildNow />
      </div>
    </Card>
  );
}

function AgentFull() {
  const { state, doc } = useReport();
  const taskId = state?.taskId ?? doc?.taskId;
  return (
    <div className="w-ragent-full">
      <AgentShort />
      <div className="pnode agent-steps-card">
        <span className="section-label">{state?.taskId !== undefined ? 'Building now' : 'Last build'} · what Droid did</span>
        <Steps taskId={taskId} />
      </div>
    </div>
  );
}

export const reportAgent: CardLevels = { far: AgentFar, full: AgentFull, useLook: useReportLook };

// The show report: the agent's takeaways over the dashboard it built.

function useFigures() {
  const t = totals(useRows());
  const margin = t.moneyIn > 0 ? Math.round((t.net / t.moneyIn) * 1000) / 10 : null;
  return { ...t, margin };
}

function ReportFar() {
  const { doc } = useReport();
  const f = useFigures();
  return (
    <FarCard
      type="report"
      width="w-report"
      icon="ChartLine"
      word="Show report"
      big={<Money value={f.net} cents={false} />}
      line={doc ? `net income${f.margin !== null ? `, ${f.margin}% margin` : ''}` : 'net so far, no report yet'}
    />
  );
}

function ReportFull() {
  const { doc, status, building } = useReport();
  const xlsxUrl = useProcedure(procedures.reportXlsxUrl);
  const [error, setError] = useState<string | null>(null);
  const commentary = jsonList(doc?.commentary);
  const watch = jsonList(doc?.watch);

  const download = () => {
    setError(null);
    xlsxUrl()
      .then(url => window.open(url, '_blank', 'noopener'))
      .catch((err: Error) => setError(err.message));
  };

  return (
    <Card
      type="report"
      icon="ChartLine"
      title="Show report"
      className="w-report-full"
      meta={
        <>
          {building && <Status kind={status.kind}>{status.label}</Status>}
          <Button kind="secondary" size="sm" icon="download" disabled={!doc} onClick={download}>
            Download .xlsx
          </Button>
        </>
      }
    >
      {error && <p className="card-error">{error}</p>}
      {doc ? (
        <>
          {doc.headline && <p className="lede">{doc.headline}</p>}
          <div className="split-cols">
            <ul className="takeaways">
              {commentary.map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            {watch.length > 0 && (
              <div className="stack">
                <span className="section-label">Worth a look</span>
                <ul className="takeaways">
                  {watch.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <div className="workbook report-frame nodrag nowheel">
            <iframe title="Show report" sandbox="" srcDoc={doc.html} />
          </div>
          <p className="muted small">Built {clock(doc.updatedAt.toDate())} from settled rows. The workbook has P&amp;L, cash flow, costs, vendors and tickets.</p>
        </>
      ) : (
        <p className="muted">Built from settled ledger rows every 10 minutes while the pipeline runs, or now from the reports agent.</p>
      )}
    </Card>
  );
}

export const report: CardLevels = { far: ReportFar, full: ReportFull };
