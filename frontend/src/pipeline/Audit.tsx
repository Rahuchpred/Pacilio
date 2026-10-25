import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Actor, Button, Icon, Status, type IconName } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import type { AuditLog, Pattern } from '../module_bindings/types';
import { FarCard, type CardLevels } from '../canvas/levels';
import { logError } from '../throttle';
import { Card } from './Card';
import { clock, openItem } from './live';
import { useLive } from './store';

// Audit log & patterns. Left: everything people did, newest first, one line
// each. Right: the patterns the learner drew from their calls, which the
// Bookkeeper follows on every run. People can edit, delete or add them.

const LOG_SHOWN = 80;

const SOURCE_ACTOR: Record<string, { kind: 'agent' | 'person'; name: string }> = {
  learned: { kind: 'agent', name: 'Learned' },
  edited: { kind: 'person', name: 'Edited' },
  person: { kind: 'person', name: 'Added' },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The log keeps the whole sentence; the row shows what was done on one line
// and, under it, what changed: a word diff for patterns, the quote or aside
// for everything else. The whole sentence stays in the hover title.
function headline(summary: string) {
  return summary
    .replace(/:\s*".*$/s, '')
    .replace(/\s*\([^()]*\)$/, '')
    .trim();
}

type Op = { kind: 'same' | 'add' | 'del'; text: string };

// Word diff by longest common subsequence. Patterns are a sentence or two, so
// the n*m table stays small.
function wordDiff(before: string, after: string): Op[] {
  const a = before.split(/(\s+)/);
  const b = after.split(/(\s+)/);
  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
  const ops: Op[] = [];
  const push = (kind: Op['kind'], text: string) => {
    const last = ops[ops.length - 1];
    if (last?.kind === kind) last.text += text;
    else ops.push({ kind, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) push('same', a[i++]), j++;
    else if (lcs[i + 1][j] >= lcs[i][j + 1]) push('del', a[i++]);
    else push('add', b[j++]);
  }
  while (i < a.length) push('del', a[i++]);
  while (j < b.length) push('add', b[j++]);
  return ops;
}

// Keep a few words of context either side of each change; long unchanged
// stretches become an ellipsis so the change stays short.
const CONTEXT = 3;
function trimSame(ops: Op[]): Op[] {
  return ops.map((op, k) => {
    if (op.kind !== 'same') return op;
    const words = op.text.split(/(\s+)/);
    const keep = CONTEXT * 2;
    const first = k === 0;
    const last = k === ops.length - 1;
    const head = () => words.slice(0, keep).join('').trimEnd();
    const tail = () => words.slice(-keep).join('').trimStart();
    if (first && words.length > keep) return { ...op, text: `… ${tail()}` };
    if (last && words.length > keep) return { ...op, text: `${head()} …` };
    if (!first && !last && words.length > keep * 2) return { ...op, text: `${head()} … ${tail()}` };
    return op;
  });
}

function patternChange(summary: string): Op[] | null {
  const edited = summary.match(/^Edited a pattern: "(.*)" \(was "(.*)"\)$/s);
  if (edited) return trimSame(wordDiff(edited[2], edited[1]));
  const added = summary.match(/^Added a pattern: "(.*)"$/s);
  if (added) return [{ kind: 'add', text: added[1] }];
  const deleted = summary.match(/^Deleted a pattern: "(.*)"$/s);
  if (deleted) return [{ kind: 'del', text: deleted[1] }];
  return null;
}

function detail(summary: string) {
  const quote = summary.match(/:\s*"(.*)"/s);
  if (quote) return quote[1];
  const aside = summary.match(/\(([^()]*)\)$/);
  return aside ? aside[1] : null;
}

function Change({ summary }: { summary: string }) {
  const ops = patternChange(summary);
  if (ops) {
    return (
      <span className="audit-detail audit-diff">
        {ops.map((op, k) =>
          op.kind === 'same' ? (
            <span key={k}>{op.text}</span>
          ) : op.kind === 'add' ? (
            <ins key={k}>{op.text}</ins>
          ) : (
            <del key={k}>{op.text}</del>
          )
        )}
      </span>
    );
  }
  const more = detail(summary);
  return more ? <span className="audit-detail">{more}</span> : null;
}

function useAudit() {
  const { auditLog, patterns, patternStates } = useLive();
  const log = [...auditLog].sort((a, b) => (a.id < b.id ? 1 : -1));
  const active = [...patterns].filter(p => p.status === 'active').sort((a, b) => (a.id < b.id ? -1 : 1));
  const state = patternStates[0];
  const pending = log.filter(a => a.learnable && (!state || a.id > state.learnedThrough)).length;
  return { log, active, state, pending, learning: state?.taskId !== undefined };
}

function Far() {
  const { log, active, learning } = useAudit();
  return (
    <FarCard
      type="audit"
      width="w-audit"
      icon="Document"
      word="Audit log & patterns"
      big={plural(active.length, 'pattern')}
      line={learning ? <Status kind="agent" busy>Learning</Status> : `${plural(log.length, 'action')} logged`}
    />
  );
}

function IconButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn-quiet btn-sm btn-icon" aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

function LogRow({ a }: { a: AuditLog }) {
  const agent = a.whoName === 'Bookkeeper';
  const body = (
    <>
      <span className="audit-time">{clock(a.at.toDate())}</span>
      <span className="audit-what">
        <span className="audit-text">{headline(a.summary)}</span>
        <Change summary={a.summary} />
      </span>
      <Actor kind={agent ? 'agent' : 'person'} name={a.whoName} />
    </>
  );
  return a.eventId !== undefined ? (
    <button type="button" className="audit-row" title={a.summary} onClick={() => openItem(a.eventId!)}>
      {body}
    </button>
  ) : (
    <div className="audit-row" title={a.summary}>
      {body}
    </div>
  );
}

function PatternRow({ p, log }: { p: Pattern; log: AuditLog[] }) {
  const edit = useReducer(reducers.editPattern);
  const remove = useReducer(reducers.deletePattern);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  let evidence: string[] = [];
  try {
    evidence = JSON.parse(p.evidence);
  } catch {
    evidence = [];
  }
  const taught = evidence
    .map(id => log.find(a => `a${a.id}` === id))
    .filter((a): a is AuditLog => !!a)
    .map(a => `${a.whoName} ${a.summary}`)
    .join('\n');
  const actor = SOURCE_ACTOR[p.source] ?? { kind: 'person' as const, name: p.source };

  const save = () => {
    if (draft === null) return;
    setError(null);
    edit({ patternId: p.id, text: draft })
      .then(() => setDraft(null))
      .catch((err: Error) => setError(err.message));
  };

  if (draft !== null) {
    return (
      <li className="pattern">
        <textarea className="pattern-input" rows={3} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
        <div className="pattern-foot">
          <Button kind="quiet" size="sm" onClick={() => setDraft(null)}>
            Cancel
          </Button>
          <Button kind="primary" size="sm" disabled={!draft.trim()} onClick={save}>
            Save
          </Button>
        </div>
        {error && <p className="card-error">{error}</p>}
      </li>
    );
  }

  return (
    <li className="pattern">
      <p className="pattern-text" title={p.because || undefined}>
        {p.text}
      </p>
      <div className="pattern-meta">
        <Actor kind={actor.kind} name={actor.name} />
        <span className="tertiary small" title={taught || undefined}>
          Used {plural(p.uses, 'time')}
        </span>
        <span className="pattern-actions">
          <IconButton icon="Edit" label="Edit pattern" onClick={() => setDraft(p.text)} />
          <IconButton icon="TrashCan" label="Delete pattern" onClick={() => remove({ patternId: p.id }).catch(logError)} />
        </span>
      </div>
    </li>
  );
}

function AddPattern() {
  const add = useReducer(reducers.addPattern);
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!open) {
    return (
      <Button kind="quiet" size="sm" icon="Add" onClick={() => setOpen(true)}>
        Add pattern
      </Button>
    );
  }
  const submit = () => {
    setError(null);
    add({ text })
      .then(() => {
        setText('');
        setOpen(false);
      })
      .catch((err: Error) => setError(err.message));
  };
  return (
    <div className="pattern pattern-new">
      <textarea
        className="pattern-input"
        rows={2}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Treat Golden Gate Catering bills under $100 as Catering."
        autoFocus
      />
      <div className="pattern-foot">
        <Button kind="quiet" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button kind="primary" size="sm" disabled={!text.trim()} onClick={submit}>
          Add
        </Button>
      </div>
      {error && <p className="card-error">{error}</p>}
    </div>
  );
}

function Full() {
  const { log, active, state, pending, learning } = useAudit();
  return (
    <Card type="audit" icon="Document" title="Audit log & patterns" className="w-audit-full">
      <div className="audit-cols">
        <section className="audit-col">
          <header className="audit-col-head">
            <h4>Log</h4>
            <span className="tertiary small">{log.length}</span>
          </header>
          <div className="audit-log nodrag nowheel">
            {log.slice(0, LOG_SHOWN).map(a => (
              <LogRow key={a.id.toString()} a={a} />
            ))}
            {!log.length && <p className="audit-empty">Nothing yet.</p>}
            {log.length > LOG_SHOWN && <p className="audit-empty">{log.length - LOG_SHOWN} earlier</p>}
          </div>
        </section>

        <section className="audit-col">
          <header className="audit-col-head">
            <h4>Patterns</h4>
            <span className="tertiary small">{active.length}</span>
            <span className="audit-col-status">
              {learning ? (
                <Status kind="agent" busy>
                  Learning
                </Status>
              ) : pending > 0 ? (
                <span className="tertiary small">{plural(pending, 'new call')} to learn from</span>
              ) : null}
            </span>
          </header>
          {state?.lastError && <p className="card-error">{state.lastError}</p>}
          <ul className="patterns nodrag nowheel">
            {active.map(p => (
              <PatternRow key={p.id.toString()} p={p} log={log} />
            ))}
            {!active.length && <li className="audit-empty">None yet. They appear after a few similar calls.</li>}
          </ul>
          <div className="nodrag">
            <AddPattern />
          </div>
        </section>
      </div>
    </Card>
  );
}

export const audit: CardLevels = { far: Far, full: Full };
