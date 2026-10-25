import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Button, Icon, type IconName } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import type { AuditLog, Pattern } from '../module_bindings/types';
import { FarCard, type CardLevels } from '../canvas/levels';
import { logError } from '../throttle';
import { Card } from './Card';
import { clock, openItem } from './live';
import { useLive } from './store';

// Audit log & patterns. Left: everything people did, newest first. Right:
// the patterns the learner drew from their decisions and corrections, which
// the Bookkeeper follows on every run. People can edit, delete or add them.

const LOG_SHOWN = 80;

const KIND_ICON: Record<string, IconName> = {
  decision: 'check',
  settle: 'Send',
  ask: 'Sparkle',
  classification: 'Settings',
  email: 'mail',
  pipeline: 'Play',
  report: 'ChartLine',
  pattern: 'Edit',
};

const SOURCE_LABEL: Record<string, string> = { learned: 'Learned', edited: 'Edited by a person', person: 'Added by a person' };

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
      big={`${active.length} ${active.length === 1 ? 'pattern' : 'patterns'}`}
      line={learning ? 'Learning from new decisions…' : `from ${log.length} ${log.length === 1 ? 'action' : 'actions'} people took`}
    />
  );
}

function LogEntry({ a }: { a: AuditLog }) {
  const time = clock(a.at.toDate());
  const body = (
    <>
      <Icon name={KIND_ICON[a.kind] ?? 'person'} size={14} />
      <span className="audit-text">
        <span className="strong">{a.whoName}</span> {a.summary}
      </span>
      <span className="audit-time">{time}</span>
    </>
  );
  return a.eventId !== undefined ? (
    <button type="button" className={`audit-entry${a.learnable ? ' is-learnable' : ''}`} onClick={() => openItem(a.eventId!)}>
      {body}
    </button>
  ) : (
    <div className={`audit-entry${a.learnable ? ' is-learnable' : ''}`}>{body}</div>
  );
}

function PatternItem({ p, log }: { p: Pattern; log: AuditLog[] }) {
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
    .map(a => `• ${a.whoName} ${a.summary}`)
    .join('\n');

  const save = () => {
    if (draft === null) return;
    setError(null);
    edit({ patternId: p.id, text: draft })
      .then(() => setDraft(null))
      .catch((err: Error) => setError(err.message));
  };

  return (
    <li className={`pattern is-${p.source}`}>
      {draft === null ? (
        <p className="pattern-text">{p.text}</p>
      ) : (
        <textarea className="pattern-edit" rows={3} value={draft} onChange={e => setDraft(e.target.value)} autoFocus />
      )}
      {p.because && <p className="pattern-why">{p.because}</p>}
      <div className="pattern-meta">
        <span className="pattern-tag">{SOURCE_LABEL[p.source] ?? p.source}</span>
        {evidence.length > 0 && (
          <span className="muted small" title={taught || undefined}>
            from {evidence.length} {evidence.length === 1 ? 'action' : 'actions'}
          </span>
        )}
        <span className="muted small">
          used {p.uses} {p.uses === 1 ? 'time' : 'times'}
        </span>
        <span className="pattern-actions">
          {draft === null ? (
            <>
              <Button kind="quiet" size="sm" icon="Edit" onClick={() => setDraft(p.text)}>
                Edit
              </Button>
              <Button kind="quiet" size="sm" icon="TrashCan" onClick={() => remove({ patternId: p.id }).catch(logError)}>
                Delete
              </Button>
            </>
          ) : (
            <>
              <Button kind="quiet" size="sm" onClick={() => setDraft(null)}>
                Cancel
              </Button>
              <button type="button" className="btn btn-primary btn-sm" disabled={!draft.trim()} onClick={save}>
                Save
              </button>
            </>
          )}
        </span>
      </div>
      {error && <p className="card-error">{error}</p>}
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
        Add a pattern
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
    <div className="pattern-add">
      <textarea
        rows={2}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Like: Treat Golden Gate Catering bills under $100 as Catering and don't ask."
        autoFocus
      />
      <div className="fu-actions">
        <span className="fu-spacer" />
        <Button kind="quiet" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <button type="button" className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={submit}>
          Add
        </button>
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
          <h4 className="section-label">Everything people did ({log.length})</h4>
          <ol className="audit-log nodrag nowheel">
            {log.slice(0, LOG_SHOWN).map(a => (
              <li key={a.id.toString()}>
                <LogEntry a={a} />
              </li>
            ))}
            {!log.length && <li className="muted small">Nothing yet. Decisions, Settle messages and settings changes land here.</li>}
            {log.length > LOG_SHOWN && <li className="muted small">+{log.length - LOG_SHOWN} earlier</li>}
          </ol>
        </section>

        <section className="audit-col">
          <h4 className="section-label">Patterns the Bookkeeper follows ({active.length})</h4>
          <p className="muted small">
            {learning
              ? 'Learning from the newest decisions…'
              : pending
                ? `${pending} new ${pending === 1 ? 'action' : 'actions'} to learn from in a moment.`
                : 'Learned from your decisions and corrections (the highlighted actions). Edit or delete any of them.'}
          </p>
          {state?.lastError && <p className="card-error">{state.lastError}</p>}
          <ul className="patterns nodrag nowheel">
            {active.map(p => (
              <PatternItem key={p.id.toString()} p={p} log={log} />
            ))}
            {!active.length && (
              <li className="muted small">No patterns yet. They appear once people decide a few similar things the same way.</li>
            )}
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
