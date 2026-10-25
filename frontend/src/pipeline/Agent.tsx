import { useState } from 'react';
import { Icon, Status } from '../../../design-system/src/components';
import type { AgentRun } from '../module_bindings/types';
import { FarCard, type CardLevels } from '../canvas/levels';
import { Card } from './Card';
import { clock, openItem, useAgentLook, useRows } from './live';
import { useLive } from './store';

// The main agent: Droid on the Factory computer, checking events in batches
// and writing the master ledger.

const LOG_FULL = 12;
const STEPS = 14;
const RUN_CHIPS = 10;

function useAgent() {
  const look = useAgentLook();
  const { agents, runsDesc } = useLive();
  const rows = useRows();
  const checking = rows.filter(r => r.state === 'checking').length;
  const waiting = rows.filter(r => r.state === 'waiting').length;
  const done = rows.length - checking - waiting;
  return { look, agent: agents[0], runs: runsDesc, checking, waiting, done };
}

function runLine(run: AgentRun): string {
  if (run.status === 'running') return `Checking ${run.eventIds.length} ${run.eventIds.length === 1 ? 'event' : 'events'}…`;
  if (run.status === 'failed') return run.error ?? 'The run failed; its events go back in the queue.';
  return run.summary ?? `Checked ${run.eventIds.length} events.`;
}

// What Droid did in one run: commands, files, its notes.
export function Steps({ taskId, limit = STEPS }: { taskId: bigint | undefined; limit?: number }) {
  const { stepsByTask } = useLive();
  if (taskId === undefined) return null;
  // Droid's own words and tool calls; not the prompt, its thinking or the JSON reply
  const mine = (stepsByTask.get(taskId.toString()) ?? [])
    .filter(s => s.role !== 'user' && s.kind !== 'thinking' && s.text.trim() && !s.text.trim().startsWith('{'))
    .slice(-limit);
  if (!mine.length) return <p className="muted small">Starting up on the Factory computer…</p>;
  return (
    <ol className="steps nodrag nowheel">
      {mine.map(s => (
        <li key={s.id.toString()} className={`step is-${s.status ?? 'done'}`}>
          <Icon name={s.kind === 'tool' ? (s.status === 'error' ? 'alert' : 'check') : 'agent'} size={14} />
          <span>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}

function Far() {
  const { look, checking, waiting } = useAgent();
  return (
    <FarCard
      type="main"
      width="w-main"
      icon="agent"
      word="Main agent"
      big={look.state === 'working' ? `Checking ${checking}` : `${waiting} waiting`}
      line={<Status kind={look.kind}>{look.label}</Status>}
      craft={look.state === 'working' ? 'decide' : look.state === 'issue' ? 'reject' : undefined}
    />
  );
}

function Counts() {
  const { checking, waiting, done } = useAgent();
  return (
    <dl className="counts">
      <div>
        <dt>Checking</dt>
        <dd>{checking}</dd>
      </div>
      <div>
        <dt>Waiting</dt>
        <dd>{waiting}</dd>
      </div>
      <div>
        <dt>Done</dt>
        <dd>{done}</dd>
      </div>
    </dl>
  );
}

// Full: every run, and for the open one, what Droid actually did.
function Full() {
  const { look, agent, runs } = useAgent();
  const rows = useRows();
  const [openRun, setOpenRun] = useState<string | null>(null);
  const shown = runs.find(r => r.id.toString() === openRun) ?? runs[0];
  const byEvent = new Map(rows.map(r => [r.event.id.toString(), r]));
  return (
    <Card type="main" icon="agent" title="Main agent" meta={<Status kind={look.kind}>{look.label}</Status>} className="w-main-full pnode-main">
      <p className="muted small">Droid on the Factory computer. It checks events in batches, writes the master ledger and asks you about anything it isn't sure of.</p>
      <Counts />
      {agent?.lastError && <p className="card-error">{agent.lastError}</p>}
      <div className="split-cols">
        <div className="stack">
          <span className="section-label">Runs</span>
          <ol className="run-list nodrag nowheel">
            {runs.slice(0, LOG_FULL).map(r => (
              <li key={r.id.toString()}>
                <button
                  type="button"
                  className="row-button"
                  aria-pressed={r === shown}
                  onClick={() => setOpenRun(r.id.toString())}
                >
                  <span className="log-time">{clock(r.startedAt.toDate())}</span>
                  <span>{runLine(r)}</span>
                </button>
              </li>
            ))}
            {!runs.length && <li className="muted">No runs yet.</li>}
          </ol>
        </div>
        {shown && (
          <div className="stack">
            <span className="section-label">Run {shown.id.toString()} · what Droid did</span>
            <Steps taskId={shown.taskId} />
            <span className="section-label">Events in this run</span>
            <div className="chip-row nodrag">
              {shown.eventIds.slice(0, RUN_CHIPS).map(id => {
                const row = byEvent.get(id.toString());
                return (
                  <button key={id.toString()} type="button" className="mini-chip" onClick={() => openItem(id)}>
                    {row?.event.counterparty ?? `Event ${id}`}
                  </button>
                );
              })}
              {shown.eventIds.length > RUN_CHIPS && <span className="muted small">+{shown.eventIds.length - RUN_CHIPS} more</span>}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

export const mainAgent: CardLevels = { far: Far, full: Full };
