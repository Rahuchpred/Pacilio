import { useState } from 'react';
import { Icon, Money, Status } from '../../../design-system/src/components';
import type { AgentRun } from '../module_bindings/types';
import { FarCard, type CardLevels, type Look } from '../canvas/levels';
import { useLiveList } from '../canvas/motion';
import { Card } from './Card';
import { ROW_STATUS, clock, dollars, openItem, useAgentLook, useRows, type Row, type RowState } from './live';
import { useLive } from './store';

// The main agent: Droid on the Factory computer, checking events in batches
// and writing the master ledger.

const RUNS_SHOWN = 12;
const STEPS = 14;

// Tool chatter that says nothing about the books.
const NOISE = /^(ran tools in parallel|updated plan|\/home\/)/i;

function useAgent() {
  const look = useAgentLook();
  const { agents, runsDesc } = useLive();
  const rows = useRows();
  const checking = rows.filter(r => r.state === 'checking').length;
  const waiting = rows.filter(r => r.state === 'waiting').length;
  const done = rows.length - checking - waiting;
  return { look, agent: agents[0], runs: runsDesc, rows, checking, waiting, done };
}

// Where a run's events ended up, in reading order.
const OUTCOMES: { states: RowState[]; label: string }[] = [
  { states: ['posted', 'refunded'], label: 'posted' },
  { states: ['review'], label: 'asked' },
  { states: ['following_up'], label: 'following up' },
  { states: ['voided'], label: 'void' },
];

function outcomeLine(rows: Row[]): string {
  const parts = OUTCOMES.map(o => ({ n: rows.filter(r => o.states.includes(r.state)).length, label: o.label }))
    .filter(p => p.n > 0)
    .map(p => `${p.n} ${p.label}`);
  return parts.join(' · ');
}

function minutes(run: AgentRun): string | null {
  if (!run.finishedAt) return null;
  const ms = run.finishedAt.toDate().getTime() - run.startedAt.toDate().getTime();
  const s = Math.max(1, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.round(s / 60)} min`;
}

// What Droid did in one run: commands, files, its notes.
export function Steps({ taskId, limit = STEPS }: { taskId: bigint | undefined; limit?: number }) {
  const { stepsByTask } = useLive();
  if (taskId === undefined) return null;
  // Droid's own words and tool calls; not the prompt, its thinking, the JSON reply or tool chatter
  const mine = (stepsByTask.get(taskId.toString()) ?? [])
    .filter(s => s.role !== 'user' && s.kind !== 'thinking' && s.text.trim() && !s.text.trim().startsWith('{') && !NOISE.test(s.text.trim()))
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

// Working stays ink; green once the queue is empty after a clean run; red on an error.
function useMainLook(): Look {
  const { look, runs, waiting, checking } = useAgent();
  if (look.state === 'issue') return 'issue';
  if (look.state === 'working') return 'working';
  if (runs[0]?.status === 'failed') return 'issue';
  if (runs.length && !waiting && !checking) return 'done';
  return 'idle';
}

function Far() {
  const { look, checking, waiting } = useAgent();
  const state = useMainLook();
  return (
    <FarCard
      type="main"
      width="w-main"
      icon="agent"
      word="Main agent"
      big={
        look.state === 'working' ? (
          <>
            {checking} <span className="far-unit">checking</span>
          </>
        ) : waiting ? (
          <>
            {waiting} <span className="far-unit">waiting</span>
          </>
        ) : (
          'Caught up'
        )
      }
      line={<Status kind={look.kind} busy={look.busy}>{look.label}</Status>}
      craft={state === 'issue' ? 'reject' : state === 'done' ? 'accept' : undefined}
    />
  );
}

// One sentence on what the agent is doing right now.
function nowLine(running: AgentRun | undefined, waiting: number, paused: boolean): string {
  if (running) return `Checking ${running.eventIds.length} events since ${clock(running.startedAt.toDate())}. ${waiting} more wait for the next batch.`;
  if (paused) return waiting ? `Paused with ${waiting} events waiting.` : 'Paused. Nothing is waiting.';
  return waiting ? `${waiting} events wait for the next batch.` : 'Every event so far is checked.';
}

// Full: what it is doing now, where everything ended up, and each run's calls.
function Full() {
  const { look, agent, runs, rows, waiting, checking } = useAgent();
  const [openRun, setOpenRun] = useState<string | null>(null);
  const running = runs.find(r => r.status === 'running');
  const shown = runs.find(r => r.id.toString() === openRun) ?? running ?? runs[0];
  const byEvent = new Map(rows.map(r => [r.event.id.toString(), r]));
  const rowsOf = (run: AgentRun) => run.eventIds.map(id => byEvent.get(id.toString())).filter((r): r is Row => !!r);
  const count = (...states: RowState[]) => rows.filter(r => states.includes(r.state)).length;
  const shownRows = shown ? rowsOf(shown) : [];
  const live = useLiveList(runs.slice(0, RUNS_SHOWN), r => r.id.toString());

  return (
    <Card type="main" icon="agent" title="Main agent" meta={<Status kind={look.kind} busy={look.busy}>{look.label}</Status>} className="w-main-full pnode-main">
      <p className="lede">{nowLine(running, waiting, !agent?.enabled)}</p>
      {agent?.lastError && <p className="card-error">{agent.lastError}</p>}

      <dl className="counts agent-counts">
        <div>
          <dt>Waiting</dt>
          <dd>{waiting}</dd>
        </div>
        <div>
          <dt>Checking</dt>
          <dd>{checking}</dd>
        </div>
        <div>
          <dt>Posted</dt>
          <dd>{count('posted', 'refunded')}</dd>
        </div>
        <div>
          <dt>Asked you</dt>
          <dd>{count('review')}</dd>
        </div>
        <div>
          <dt>Following up</dt>
          <dd>{count('following_up')}</dd>
        </div>
        <div>
          <dt>Voided</dt>
          <dd>{count('voided')}</dd>
        </div>
      </dl>

      <div className="agent-cols">
        <section className="agent-col">
          <h4 className="section-label agent-col-head">Runs</h4>
          <ol className="agent-runs live-list nodrag nowheel" ref={live.list as React.Ref<HTMLOListElement>}>
            {live.shown.map(({ item: r, key, leaving }) => {
              const took = minutes(r);
              return (
                <li key={key} data-key={key} data-leaving={leaving}>
                  <button type="button" className="agent-run" aria-pressed={r === shown} onClick={() => setOpenRun(r.id.toString())}>
                    <span className="agent-run-time">{clock(r.startedAt.toDate())}</span>
                    <span className="agent-run-what">
                      {r.status === 'running'
                        ? `Checking ${r.eventIds.length}`
                        : r.status === 'failed'
                          ? 'Failed'
                          : outcomeLine(rowsOf(r)) || `${r.eventIds.length} checked`}
                    </span>
                    <span className="agent-run-took">{took ?? ''}</span>
                  </button>
                </li>
              );
            })}
            {!runs.length && <li className="muted small">No runs yet.</li>}
          </ol>
        </section>

        <section className="agent-col">
          <h4 className="section-label agent-col-head">
            {shown ? `Run ${shown.id.toString()} · ${clock(shown.startedAt.toDate())} · ${shown.eventIds.length} events` : 'Run'}
          </h4>
          {shown ? (
            <div className="agent-run-panel">
              {shown.status === 'failed' && <p className="card-error">{shown.error ?? 'The run failed; its events go back in the queue.'}</p>}
              <ul className="agent-events nodrag nowheel">
                {shownRows.map(r => (
                  <li key={r.event.id.toString()}>
                    <button type="button" className="agent-event" onClick={() => openItem(r.event.id)}>
                      <span className="agent-event-name">
                        <span className="strong">{r.event.counterparty}</span>
                        {r.review?.note && <span className="muted small">{r.review.note}</span>}
                      </span>
                      <span className="agent-event-amount">
                        <Money value={dollars(r.event.amountMinor, r.event.currency)} />
                      </span>
                      <span className="agent-event-status">
                        <Status kind={ROW_STATUS[r.state].kind} busy={ROW_STATUS[r.state].busy}>{ROW_STATUS[r.state].label}</Status>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {shown.summary && (
                <p className="agent-summary">
                  <Icon name="agent" size={14} /> {shown.summary}
                </p>
              )}
              <details className="agent-steps">
                <summary>
                  <Icon name="ChevronRight" size={12} /> Commands Droid ran
                </summary>
                <Steps taskId={shown.taskId} />
              </details>
            </div>
          ) : (
            <p className="muted small">No runs yet.</p>
          )}
        </section>
      </div>
    </Card>
  );
}

export const mainAgent: CardLevels = { far: Far, full: Full, useLook: useMainLook };
