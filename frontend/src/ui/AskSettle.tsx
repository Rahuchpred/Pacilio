import { useEffect, useRef, useState } from 'react';
import { useReducer, useSpacetimeDB, useTable } from 'spacetimedb/react';
import { Icon } from '../../../design-system/src/components';
import { reducers, tables } from '../module_bindings';
import { logError } from '../throttle';
import './ask.css';

// Ask Settle: a small button in the corner that opens a mini window above it.
// A question goes to Droid on the Factory computer, which reads the ledger the
// main agent keeps there and answers in a few sentences.

const QUESTION_MARK = '\nQuestion: ';
const WORKDIR = '/home/factory-user/settle';

function askPrompt(question: string): string {
  return `You are Settle's assistant for a concert promoter's Oct 24 show. Answer a teammate's question about this run.
Work quickly: don't look for AGENTS.md, skills or other context. Only read files; never write, edit or delete anything.
The master ledger is ${WORKDIR}/ledger.json (every event with its status: ok, refunded, voided, review or following_up, its category and a note).
${WORKDIR}/report.json has the show report figures if it exists.
Reply in plain text, at most 4 short sentences, with exact amounts like $12,345.67. Say plainly if the files don't answer it.${QUESTION_MARK}${question}`;
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
            <span className="ask-sub">Reads the master ledger</span>
            <kbd>Esc</kbd>
          </header>
          <div className="ask-thread" ref={thread}>
            {mine.length === 0 && (
              <p className="ask-sub">Ask about this run, like "Which vendors are held?" or "What did we spend on catering?"</p>
            )}
            {mine.map(t => (
              <div key={t.id.toString()} className="ask-pair">
                <p className="ask-you">{questionOf(t.prompt)}</p>
                <div className="ask-answer">
                  <Icon name="Sparkle" size={14} />
                  <div>
                    {t.status === 'done' ? (
                      <p>{t.result ?? 'No answer came back.'}</p>
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
              placeholder={waiting ? 'Answering…' : 'Ask about this run'}
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
