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

// One step of the build, inline: icon, label, value. Steps sit on one line
// joined by chevrons, so the card reads as a sentence, not a form.
type StepState = 'done' | 'active' | 'waiting';
function BuildStep({ icon, label, value, state }: { icon: IconName; label: string; value: string; state: StepState }) {
  return (
    <span className={`rp-step is-${state}`}>
      {state === 'active' ? <span className="spinner" aria-hidden="true" /> : <Icon name={icon} size={14} />}
      <span className="rp-step-label">{label}</span>
      <span className="rp-step-value">{value}</span>
    </span>
  );
}

function StepJoin() {
  return (
    <span className="rp-join" aria-hidden="true">
      <Icon name="ChevronRight" size={12} />
    </span>
  );
}

// The reports agent in one card: a one-line trail of the build, the agent's
// sentence (or its live work while it builds), and when it runs next.
function AgentFull() {
  const { state, doc, building, running, next, status } = useReport();
  const t = totals(useRows());
  const taskId = state?.taskId ?? doc?.taskId;
  const built = doc ? clock(doc.updatedAt.toDate()) : null;
  const [showCommands, setShowCommands] = useState(false);
  return (
    <Card type="reportAgent" icon="agent" title="Reports agent" meta={<Status kind={status.kind} busy={status.busy}>{status.label}</Status>} className="w-ragent-full rp-card">
      <div className={`rp-flow${building ? ' is-building' : ''}`}>
        <BuildStep icon="FileTable" label="Ledger" value={`${t.settled.toLocaleString('en-US')} rows`} state="done" />
        <StepJoin />
        <BuildStep icon="agent" label="Droid" value={building ? 'building' : built ? 'done' : 'not run'} state={building ? 'active' : built ? 'done' : 'waiting'} />
        <StepJoin />
        <BuildStep icon="ChartLine" label="Report" value={building ? 'soon' : built ?? 'none yet'} state={building ? 'waiting' : built ? 'done' : 'waiting'} />
      </div>

      {state?.lastError && <p className="card-error">{state.lastError}</p>}

      {building ? (
        <Steps taskId={state?.taskId} limit={5} />
      ) : doc?.headline ? (
        <p className="agent-built">{doc.headline}</p>
      ) : (
        <p className="muted small">Build one to see the numbers so far.</p>
      )}

      <div className="rp-foot nodrag">
        <span className="muted small" title={`Rebuilds every ${EVERY_MIN} min while running, if the ledger changed`}>
          {running ? (next ? `Next build ${clock(next)}` : 'Next build soon') : 'Paused'}
        </span>
        <span className="rp-actions">
          {!building && taskId !== undefined && (
            <Button kind="quiet" size="sm" icon="Terminal" onClick={() => setShowCommands(v => !v)}>
              {showCommands ? 'Hide commands' : 'Commands'}
            </Button>
          )}
          <BuildNow />
        </span>
      </div>

      {showCommands && !building && taskId !== undefined && <Steps taskId={taskId} />}
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
  const { scenario } = useLive();
  const f = useFigures();
  return (
    <FarCard
      type="report"
      width="w-report"
      icon="ChartLine"
      word={scenario.report.title}
      big={<Money value={f.net} cents={false} />}
      line={doc ? `net income${f.margin !== null ? `, ${f.margin}% margin` : ''}` : 'net so far, no report yet'}
    />
  );
}

// The report at full size: the agent's conclusions on the left, the charts
// the team asked for and the whole dashboard on the right, over the canvas. Esc or Close returns.
function ReportViewer({ onClose, onDownload }: { onClose: () => void; onDownload: () => void }) {
  const { doc } = useReport();
  const commentary = jsonList(doc?.commentary);
  const watch = jsonList(doc?.watch);
  const title = useLive().scenario.report.title;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (!doc) return null;
  return createPortal(
    <div className="viewer-backdrop" onClick={onClose}>
      <div className="viewer" role="dialog" aria-label={title} onClick={e => e.stopPropagation()}>
        <header className="viewer-head">
          <span className="viewer-title">
            <Icon name="ChartLine" /> {title}
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
          <div className="viewer-main">
            <TeamCharts beforeAsk={onClose} />
            <iframe className="viewer-frame" title={`${title}, full size`} sandbox="" srcDoc={doc.html} />
          </div>
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
  const { scenario } = useLive();

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
      title={scenario.report.title}
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
            <iframe title={scenario.report.title} sandbox="" srcDoc={doc.html} />
          </div>
          <p className="muted small">Built {clock(doc.updatedAt.toDate())} from settled rows. The workbook has P&amp;L, cash flow, costs, vendors and {scenario.sales.title.toLowerCase()}.</p>
        </>
      ) : (
        <>
          <p className="muted">Built from settled ledger rows every 10 minutes while the pipeline runs, or now from the reports agent.</p>
          <TeamCharts />
        </>
      )}
      {viewing && <ReportViewer onClose={() => setViewing(false)} onDownload={download} />}
    </Card>
  );
}

export const report: CardLevels = { far: ReportFar, full: ReportFull };
