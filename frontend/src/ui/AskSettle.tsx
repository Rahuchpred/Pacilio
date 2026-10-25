import { useEffect, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Icon } from '../../../design-system/src/components';
import { reducers, tables } from '../module_bindings';
import { logError } from '../throttle';
import { MessageLine } from '../pipeline/AgentMessages';
import { useLive } from '../pipeline/store';
import type { Scenario } from '../../../backend/src/scenarios';
import './ask.css';

// Ask Pacioli: a small button in the corner that opens a mini window above it.
// Droid reads the ledger the Bookkeeper keeps and answers. When the ask is
// really for an agent ("move these to Catering", "make me a vendor report"),
// it also sends that agent a one-off message, queued for its next run.

const QUESTION_MARK = '\nQuestion: ';
// Where the ledger lives before any snapshot exists (the backend writes
// snapshots to their own folders; see backend pipeline/snapshot.ts)
const WORKDIR = '/home/factory-user/settle';

function askPrompt(question: string, scenario: Scenario, ledgerDir = WORKDIR, reportDir = WORKDIR): string {
  const report = scenario.report.title.toLowerCase();
  return `You are Pacioli, the assistant for ${scenario.business} (${scenario.context}). A teammate wrote to you (below).
Work quickly: don't look for AGENTS.md, skills or other context. Only read files; never write, edit or delete anything.
The master ledger is ${ledgerDir}/ledger.json (every event with its row number, status: ok, refunded, void, review or
following_up, its category and a note; one row per line, so Grep it rather than reading it whole).
${reportDir}/report.json has the ${report} figures if it exists.

You work with two agents:
- "main": the Bookkeeper. It keeps the ledger (always call it "the Bookkeeper" when you mention it). Send it anything that should change the ledger or how it
  handles rows on its next run: recategorize rows, void a duplicate, fix a note, re-check something.
- "reports": the reports agent. Send it anything about the ${report}: a new analysis or breakdown, a new chart
  (bar, line or table; it stays in the report and updates on every build), removing a chart, something to call out.
Messages steer the agents: they follow them even where it changes how they normally work.
If the teammate asks a question, answer it from the files. If they want something done, send it to the right agent as
a clear instruction under 400 characters with the names, row numbers and amounts it needs (look them up in the
ledger first). Say what you want, not how to do it. You may do both.

Reply with ONLY this JSON:
{"answer": "what you say back, at most 3 short sentences with exact amounts like $12,345.67. If you sent something, say so",
 "send": [{"to": "main" or "reports", "message": "the instruction for that agent"}]}
"send" is [] when nothing needs doing. At most 3 messages.${QUESTION_MARK}${question}`;
}

// The answer part of Pacioli's JSON reply (plain text replies pass through).
function answerOf(result: string | undefined): string {
  const raw = (result ?? '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(raw.slice(start, end + 1)) as { answer?: unknown };
      if (typeof parsed.answer === 'string') return parsed.answer;
    } catch {
      // not JSON after all
    }
  }
  return raw;
}

// Open Ask Pacioli from anywhere on the page. "chart" starts a chart request
// and offers a few ideas, so nobody has to work out what to ask for.
const OPEN = 'pacioli:ask';
export const openAsk = (mode: 'chart' | 'ask' = 'ask') => window.dispatchEvent(new CustomEvent(OPEN, { detail: mode }));

const CHART_START = 'Make a chart of ';

const questionOf = (prompt: string) => {
  const at = prompt.lastIndexOf(QUESTION_MARK);
  return at < 0 ? prompt : prompt.slice(at + QUESTION_MARK.length);
};

export function AskSettle() {
  const [open, setOpen] = useState(false);
  // Opened from the keyboard: no animation (it is used often and should feel instant).
  const [instant, setInstant] = useState(false);
  const [draft, setDraft] = useState('');
  const [ideas, setIdeas] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const ask = useReducer(reducers.requestAgentTask);
  const { identity } = useSpacetimeDB();
  const [tasks] = useTable(tables.agentTask.where(r => r.kind.eq('ask')));
  const { messagesByAsk, ledgerFiles, scenario } = useLive();
  const files = ledgerFiles[0];
  // Your questions this session's identity asked, oldest first
  const mine = tasks
    .filter(t => identity && t.createdBy.isEqual(identity))
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .slice(-6);
  const waiting = mine.some(t => t.status !== 'done' && t.status !== 'failed' && t.status !== 'cancelled');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setInstant(true);
        setOpen(o => !o);
      } else if (e.key === 'Escape' && open) {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open]);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const chart = (e as CustomEvent<string>).detail === 'chart';
      setInstant(false);
      setOpen(true);
      setIdeas(chart);
      if (chart) setDraft(d => (d.trim() ? d : CHART_START));
      requestAnimationFrame(() => input.current?.focus());
    };
    window.addEventListener(OPEN, onOpen);
    return () => window.removeEventListener(OPEN, onOpen);
  }, []);

  useEffect(() => {
    if (open) input.current?.focus();
    else setIdeas(false);
  }, [open]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [open, mine.length, mine[mine.length - 1]?.status]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || q === CHART_START.trim() || waiting) return;
    setDraft('');
    setIdeas(false);
    ask({ kind: 'ask', prompt: askPrompt(q, scenario, files?.latestDir || undefined, files?.reportDir || undefined), autonomy: 'high' }).catch(logError);
  };

  return (
    <div className="ask">
      {open && (
        <div className={`ask-window${instant ? ' is-instant' : ''}`} role="dialog" aria-label="Ask Pacioli">
          <header className="ask-head">
            <Icon name="Pacioli" />
            <span className="strong">Ask Pacioli</span>
            <span className="ask-sub ask-head-sub">Talks to your agents</span>
            <button type="button" className="ask-close" aria-label="Close (Esc)" title="Close (Esc)" onClick={() => setOpen(false)}>
              <Icon name="Close" size={14} />
            </button>
          </header>
          <div className="ask-thread" ref={thread}>
            {mine.length === 0 && (
              <p className="ask-sub">
                Ask about this run ("What did we spend on catering?"), or tell an agent what to do ("Move the Castro Coffee
                rows to Catering", "Make me a vendor-by-vendor report").
              </p>
            )}
            {mine.map(t => (
              <div key={t.id.toString()} className="ask-pair">
                <p className="ask-you">{questionOf(t.prompt)}</p>
                <div className="ask-answer">
                  <Icon name="Pacioli" size={14} />
                  <div>
                    {t.status === 'done' ? (
                      <>
                        {answerOf(t.result) && <p>{answerOf(t.result)}</p>}
                        {(messagesByAsk.get(t.id.toString()) ?? []).map(m => (
                          <MessageLine key={m.id.toString()} m={m} />
                        ))}
                      </>
                    ) : t.status === 'failed' || t.status === 'cancelled' ? (
                      <p className="ask-sub">{t.error ?? "Couldn't answer that one."}</p>
                    ) : (
                      <p className="ask-sub">Reading the ledger…</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {ideas && (
            <div className="ask-ideas" aria-label="Chart ideas">
              <span className="ask-sub">Not sure what to chart? Try one</span>
              <div className="ask-chips">
                {scenario.chartIdeas.map(idea => (
                  <button
                    key={idea}
                    type="button"
                    className="ask-chip"
                    onClick={() => {
                      setDraft(CHART_START + idea.charAt(0).toLowerCase() + idea.slice(1));
                      input.current?.focus();
                    }}
                  >
                    {idea}
                  </button>
                ))}
              </div>
            </div>
          )}
          <form className="ask-compose" onSubmit={send}>
            <input
              ref={input}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              placeholder={waiting ? 'Answering…' : 'Ask, or tell an agent what to do'}
              aria-label="Ask about this run"
            />
            <button type="submit" className="ask-send" aria-label="Send" disabled={!draft.trim() || waiting}>
              <Icon name="Send" size={14} />
            </button>
          </form>
        </div>
      )}
      <button
        type="button"
        className={`ask-button${open ? ' is-open' : ''}`}
        aria-expanded={open}
        onClick={() => {
          setInstant(false);
          setOpen(o => !o);
        }}
      >
        <Icon name="Pacioli" />
        <span>Ask Pacioli</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
  );
}
