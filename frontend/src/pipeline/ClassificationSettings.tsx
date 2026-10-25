import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Button } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import { useLive } from './store';

// How the Bookkeeper classifies money. Auto (the default): it picks from the
// list and adds a new category when nothing fits. Manual: people edit the
// list and the agent must use exactly one from it. Shared by everyone; the
// agent's next run uses it, and rows already in the ledger keep theirs.

const MAX = 40;

export function useClassifying() {
  const { classifications, classificationModes, reviews } = useLive();
  const list = [...classifications].sort((a, b) => a.position - b.position).map(c => c.name);
  const mode = classificationModes[0]?.mode === 'manual' ? 'manual' : 'auto';
  // Categories the agent made up itself (auto mode), so people can see them
  const extra = [...new Set(reviews.map(r => r.category).filter((c): c is string => !!c && !list.includes(c)))];
  return { list, mode, extra };
}

export function ClassificationSettings({ onDone }: { onDone: () => void }) {
  const { list, mode, extra } = useClassifying();
  const setMode = useReducer(reducers.setClassificationMode);
  const save = useReducer(reducers.setClassifications);
  const reset = useReducer(reducers.resetClassifications);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [adding, setAdding] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const names = draft ?? list;

  const run = (fn: () => Promise<void>, then?: () => void) => {
    setBusy(true);
    setError(null);
    fn()
      .then(then)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const add = (e?: React.FormEvent) => {
    e?.preventDefault();
    const name = adding.trim();
    if (!name || names.some(n => n.toLowerCase() === name.toLowerCase())) return setAdding('');
    setDraft([...names, name]);
    setAdding('');
  };

  return (
    <div className="fu-settings cl-settings nodrag">
      <div className="fu-head">
        <span className="strong">Classifications</span>
        <span className="muted small">For everyone. The agent uses these from its next run; rows already in the ledger keep theirs.</span>
      </div>

      <div className="card-tabs" role="radiogroup" aria-label="Classification mode">
        {(['auto', 'manual'] as const).map(m => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            aria-selected={mode === m}
            disabled={busy}
            onClick={() => mode !== m && run(() => setMode({ mode: m }), () => setDraft(null))}
          >
            {m === 'auto' ? 'Auto' : 'Manual'}
          </button>
        ))}
      </div>
      <p className="muted small">
        {mode === 'auto'
          ? 'The agent picks from this list, and adds a new category when nothing fits.'
          : 'The agent must use exactly one of these. Edit, remove or add categories below.'}
      </p>

      <ul className="cl-list">
        {names.map((name, i) => (
          <li key={name} className="cl-item">
            {mode === 'manual' ? (
              <>
                <input
                  value={name}
                  onChange={e => setDraft(names.map((n, j) => (j === i ? e.target.value : n)))}
                  aria-label={`Category ${i + 1}`}
                />
                <Button kind="quiet" size="sm" icon="TrashCan" onClick={() => setDraft(names.filter((_, j) => j !== i))} />
              </>
            ) : (
              <span className="class-chip">{name}</span>
            )}
          </li>
        ))}
      </ul>

      {mode === 'auto' && extra.length > 0 && (
        <div className="stack">
          <span className="section-label">Added by the agent</span>
          <ul className="cl-list">
            {extra.map(name => (
              <li key={name} className="cl-item">
                <span className="class-chip is-new">{name}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {mode === 'manual' && (
        <form className="cl-add" onSubmit={add}>
          <input value={adding} onChange={e => setAdding(e.target.value)} placeholder="New category, like Production · Staging" aria-label="New category" />
          <Button kind="quiet" size="sm" icon="Add" disabled={!adding.trim() || names.length >= MAX} onClick={() => add()}>
            Add
          </Button>
        </form>
      )}

      <div className="fu-actions">
        <Button kind="quiet" size="sm" disabled={busy} onClick={() => run(() => reset(), () => setDraft(null))}>
          Reset to default
        </Button>
        <span className="fu-spacer" />
        <Button kind="quiet" size="sm" disabled={busy} onClick={onDone}>
          {draft ? 'Cancel' : 'Close'}
        </Button>
        {mode === 'manual' && (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={busy || !draft}
            onClick={() => run(() => save({ names: draft ?? list }), () => setDraft(null))}
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
        )}
      </div>
      {error && <p className="card-error">{error}</p>}
    </div>
  );
}
