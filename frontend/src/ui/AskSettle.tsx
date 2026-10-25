import { useEffect, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Icon } from '../../../design-system/src/components';
import { reducers, tables } from '../module_bindings';
import { logError } from '../throttle';
import { MessageLine } from '../pipeline/AgentMessages';
import { useLive } from '../pipeline/store';
import './ask.css';

// Ask Settle: a small button in the corner that opens a mini window above it.
// Droid reads the ledger the Bookkeeper keeps and answers. When the ask is
// really for an agent ("move these to Catering", "make me a vendor report"),
// it also sends that agent a one-off message, queued for its next run.

const QUESTION_MARK = '\nQuestion: ';
const WORKDIR = '/home/factory-user/settle';

function askPrompt(question: string): string {
  return `You are Settle, the assistant for a concert promoter's Oct 24 show. A teammate wrote to you (below).
Work quickly: don't look for AGENTS.md, skills or other context. Only read files; never write, edit or delete anything.
The master ledger is ${WORKDIR}/ledger.json (every event with its row number, status: ok, refunded, void, review or
following_up, its category and a note). ${WORKDIR}/report.json has the show report figures if it exists.

You work with two agents:
- "main": the Bookkeeper. It keeps the ledger (always call it "the Bookkeeper" when you mention it). Send it anything that should change the ledger or how it
  handles rows on its next run: recategorize rows, void a duplicate, fix a note, re-check something.
- "reports": the reports agent. Send it anything about the show report: a new analysis or breakdown, a new chart
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

// The answer part of Settle's JSON reply (plain text replies pass through).
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

const questionOf = (prompt: string) => {
  const at = prompt.lastIndexOf(QUESTION_MARK);
  return at < 0 ? prompt : prompt.slice(at + QUESTION_MARK.length);
};

export function AskSettle() {
  const [open, setOpen] = useState(false);
  // Opened from the keyboard: no animation (it is used often and should feel instant).
  const [instant, setInstant] = useState(false);
  const [draft, setDraft] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const ask = useReducer(reducers.requestAgentTask);
  const { identity } = useSpacetimeDB();
  const [tasks] = useTable(tables.agentTask.where(r => r.kind.eq('ask')));
  const { messagesByAsk } = useLive();
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
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight });
  }, [open, mine.length, mine[mine.length - 1]?.status]);

  const send = (e: React.FormEvent) => {
    e.preventDefault();
    const q = draft.trim();
    if (!q || waiting) return;
    setDraft('');
    ask({ kind: 'ask', prompt: askPrompt(q), autonomy: 'high' }).catch(logError);
  };

  return (
    <div className="ask">
      {open && (
        <div className={`ask-window${instant ? ' is-instant' : ''}`} role="dialog" aria-label="Ask Settle">
          <header className="ask-head">
            <Icon name="Sparkle" />
            <span className="strong">Ask Settle</span>
            <span className="ask-sub ask-head-sub">Talks to your agents</span>
            <kbd>Esc</kbd>
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
                  <Icon name="Sparkle" size={14} />
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
        <Icon name="Sparkle" />
        <span>Ask Settle</span>
        <kbd>⌘K</kbd>
      </button>
    </div>
  );
}
