import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useProcedure, useReducer } from 'spacetimedb/react';
import { Button, Icon, Money, Status, type IconName, type StatusKind } from '../../../design-system/src/components';
import { procedures, reducers } from '../module_bindings';
import { logError } from '../throttle';
import { FarCard, type CardLevels, type Look } from '../canvas/levels';
import { Steps } from './Agent';
import { TeamCharts } from './TeamCharts';
import { Card } from './Card';
import { clock, jsonList, totals, useRows } from './live';
import { useLive } from './store';

// The reports agent, between the ledger and the show report: every 10 minutes
// while the pipeline runs (if the ledger changed), or on request, Droid runs
// the fixed report tool over the settled rows and writes the takeaways.

const EVERY_MIN = 10;

function useReport() {
  const { reportStates: states, reportDocs: docs, agents } = useLive();
  const state = states[0];
  const doc = docs[0];
  const running = !!agents[0]?.enabled;
  const building = state?.status === 'running' || !!state?.requested;
  const next = state?.lastStartedAt
    ? new Date(state.lastStartedAt.toDate().getTime() + EVERY_MIN * 60_000)
    : undefined;
  const status: { kind: StatusKind; label: string; busy?: boolean } = state?.lastError
    ? { kind: 'disputed', label: 'Error' }
    : building
      ? { kind: 'agent', label: 'Building', busy: true }
      : running
        ? { kind: 'cleared', label: 'Ready' }
        : { kind: 'agent', label: 'Paused' };
  return { state, doc, running, building, next, status };
}

function useReportLook(): Look {
  const { state, building, doc, running } = useReport();
  if (state?.lastError) return 'issue';
  if (building) return 'working';
  // Green only while it is on duty; a paused agent stays plain
  return doc && running ? 'done' : 'idle';
}

function AgentFar() {
  const { doc, status } = useReport();
  const look = useReportLook();
  return (
    <FarCard
      type="reportAgent"
      width="w-ragent"
      icon="agent"
      word="Reports agent"
      big={<Status kind={status.kind} busy={status.busy}>{status.label}</Status>}
      line={doc ? `Last report ${clock(doc.updatedAt.toDate())}` : 'No report yet'}
      craft={look === 'issue' ? 'reject' : look === 'done' ? 'accept' : undefined}
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

// One step of the build: a tile with its state, joined to the next by a line
// that flows while work moves along it.
type StepState = 'done' | 'active' | 'waiting';
function BuildStep({ icon, label, value, state }: { icon: IconName; label: string; value: string; state: StepState }) {
  return (
    <div className={`rp-step is-${state}`}>
      {state === 'active' ? <span className="spinner" aria-hidden="true" /> : <Icon name={icon} size={16} />}
      <span className="rp-step-label">{label}</span>
      <span className="rp-step-value">{value}</span>
    </div>
  );
}

// The reports agent in one card: how a report gets made, step by step, with
// the live work while it builds and the last result while it rests.
function AgentFull() {
  const { state, doc, building, running, next, status } = useReport();
  const t = totals(useRows());
  const taskId = state?.taskId ?? doc?.taskId;
  const built = doc ? clock(doc.updatedAt.toDate()) : null;
  return (
    <Card type="reportAgent" icon="agent" title="Reports agent" meta={<Status kind={status.kind} busy={status.busy}>{status.label}</Status>} className="w-ragent-full rp-card">
      <div className={`rp-flow${building ? ' is-building' : ''}`}>
        <BuildStep icon="FileTable" label="Ledger" value={`${t.settled.toLocaleString('en-US')} settled rows`} state="done" />
        <span className="rp-link" aria-hidden="true" />
        <BuildStep
          icon="agent"
          label="Droid builds"
          value={building ? 'Building now' : built ? 'Done' : 'Not run yet'}
          state={building ? 'active' : built ? 'done' : 'waiting'}
        />
        <span className="rp-link" aria-hidden="true" />
        <BuildStep icon="ChartLine" label="Show report" value={building ? 'Next version soon' : built ?? 'None yet'} state={building ? 'waiting' : built ? 'done' : 'waiting'} />
      </div>

      {state?.lastError && <p className="card-error">{state.lastError}</p>}

      {building ? (
        <section className="stack">
          <h4 className="section-label">Droid, right now</h4>
          <Steps taskId={state?.taskId} limit={5} />
        </section>
      ) : (
        <section className="stack">
          <h4 className="section-label">{built ? `Last report · ${built}` : 'No report yet'}</h4>
          {doc?.headline ? <p className="agent-built">{doc.headline}</p> : <p className="muted small">Build one to see the show's numbers.</p>}
        </section>
      )}

      <div className="rp-foot nodrag">
        <span className="muted small">
          {running ? (next ? `Next build after ${clock(next)}, if the ledger changed` : 'Next build soon') : 'Paused'} · every {EVERY_MIN} min
        </span>
        <BuildNow />
      </div>

      {!building && taskId !== undefined && (
        <details className="agent-steps">
          <summary>
            <Icon name="ChevronRight" size={12} /> Commands Droid ran
          </summary>
          <Steps taskId={taskId} />
        </details>
      )}
    </Card>
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

// The report at full size: the agent's conclusions on the left, the whole
// dashboard on the right, over the canvas. Esc or Close returns.
function ReportViewer({ onClose, onDownload }: { onClose: () => void; onDownload: () => void }) {
  const { doc } = useReport();
  const commentary = jsonList(doc?.commentary);
  const watch = jsonList(doc?.watch);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!doc) return null;
  return createPortal(
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer" role="dialog" aria-label="Show report" onClick={e => e.stopPropagation()}>
        <header className="viewer-head">
          <span className="viewer-title">
            <Icon name="ChartLine" /> Show report
            <span className="muted small">Built {clock(doc.updatedAt.toDate())} from settled rows</span>
          </span>
          <span className="viewer-actions">
            <Button kind="secondary" size="sm" icon="download" onClick={onDownload}>
              Download .xlsx
            </Button>
            <Button kind="quiet" size="sm" icon="Close" onClick={onClose}>
              Close
            </Button>
          </span>
        </header>
        <div className="viewer-body">
          <aside className="viewer-side">
            {doc.headline && <p className="lede">{doc.headline}</p>}
            <section className="stack">
              <h4 className="section-label">What the reports agent concluded</h4>
              <ul className="takeaways">
                {commentary.map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
            {watch.length > 0 && (
              <section className="stack">
                <h4 className="section-label">Worth a look</h4>
                <ul className="takeaways">
                  {watch.map(line => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
          <iframe className="viewer-frame" title="Show report, full size" sandbox="" srcDoc={doc.html} />
        </div>
      </div>
    </div>,
    document.body
  );
}

function ReportFull() {
  const { doc, status, building } = useReport();
  const xlsxUrl = useProcedure(procedures.reportXlsxUrl);
  const [error, setError] = useState<string | null>(null);
  const commentary = jsonList(doc?.commentary);
  const watch = jsonList(doc?.watch);
  const [viewing, setViewing] = useState(false);

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
          {building && <Status kind={status.kind} busy={status.busy}>{status.label}</Status>}
          <Button kind="secondary" size="sm" icon="ExpandAll" disabled={!doc} onClick={() => setViewing(true)}>
            Full screen
          </Button>
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
          <TeamCharts />
          <div className="workbook report-frame nodrag nowheel">
            <iframe title="Show report" sandbox="" srcDoc={doc.html} />
          </div>
          <p className="muted small">Built {clock(doc.updatedAt.toDate())} from settled rows. The workbook has P&amp;L, cash flow, costs, vendors and tickets.</p>
        </>
      ) : (
        <p className="muted">Built from settled ledger rows every 10 minutes while the pipeline runs, or now from the reports agent.</p>
      )}
      {viewing && <ReportViewer onClose={() => setViewing(false)} onDownload={download} />}
    </Card>
  );
}

export const report: CardLevels = { far: ReportFar, full: ReportFull };
