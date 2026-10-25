import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Button } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import { useFollowUpSteps, wait, type Step } from './followUps';

// Edit the follow-up schedule: how long to wait before each nudge and what it
// says. Saved for every thread and everyone at once; waiting threads move to
// the new timing.

const UNITS = [
  { id: 'min', label: 'minutes', minutes: 1 },
  { id: 'h', label: 'hours', minutes: 60 },
  { id: 'd', label: 'days', minutes: 24 * 60 },
] as const;
type Unit = (typeof UNITS)[number]['id'];
type Draft = { amount: string; unit: Unit; message: string };

const MAX_STEPS = 10;

function toDraft(s: Step): Draft {
  const unit = s.delayMin % (24 * 60) === 0 ? 'd' : s.delayMin % 60 === 0 ? 'h' : 'min';
  const per = UNITS.find(u => u.id === unit)!.minutes;
  return { amount: String(s.delayMin / per), unit, message: s.message };
}

function minutesOf(d: Draft): number {
  return Math.round(Number(d.amount) * UNITS.find(u => u.id === d.unit)!.minutes);
}

export function FollowUpSettings({ onDone }: { onDone: () => void }) {
  const steps = useFollowUpSteps();
  const save = useReducer(reducers.setEmailFollowUps);
  const reset = useReducer(reducers.resetEmailFollowUps);
  const [drafts, setDrafts] = useState<Draft[]>(() => steps.map(toDraft));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const edit = (i: number, patch: Partial<Draft>) => setDrafts(ds => ds.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const remove = (i: number) => setDrafts(ds => ds.filter((_, j) => j !== i));
  const add = () =>
    setDrafts(ds => [...ds, { amount: '1', unit: 'd', message: 'Following up on the message below. A quick reply would help us close the books.' }]);

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    fn()
      .then(onDone)
      .catch((err: Error) => setError(err.message))
      .finally(() => setBusy(false));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const bad = drafts.findIndex(d => !(minutesOf(d) >= 1));
    if (bad >= 0) return setError(`Follow-up ${bad + 1}: enter how long to wait`);
    run(() => save({ steps: drafts.map(d => ({ delayMin: minutesOf(d), message: d.message })) }));
  };

  return (
    <form className="fu-settings nodrag" onSubmit={submit}>
      <div className="fu-head">
        <span className="strong">Follow-ups</span>
        <span className="muted small">For every thread and everyone. Each wait counts from the email before it.</span>
      </div>
      <ol className="fu-steps">
        {drafts.map((d, i) => (
          <li key={i} className="fu-step">
            <div className="fu-when">
              <span className="small">Follow-up {i + 1} after</span>
              <input
                type="number"
                min={1}
                step="any"
                value={d.amount}
                onChange={e => edit(i, { amount: e.target.value })}
                aria-label={`Follow-up ${i + 1} wait`}
              />
              <select value={d.unit} onChange={e => edit(i, { unit: e.target.value as Unit })} aria-label={`Follow-up ${i + 1} unit`}>
                {UNITS.map(u => (
                  <option key={u.id} value={u.id}>
                    {u.label}
                  </option>
                ))}
              </select>
              <span className="tertiary small">{minutesOf(d) >= 1 ? `= ${wait(minutesOf(d))}` : ''}</span>
              <Button kind="quiet" size="sm" icon="TrashCan" onClick={() => remove(i)} />
            </div>
            <textarea
              rows={2}
              value={d.message}
              onChange={e => edit(i, { message: e.target.value })}
              aria-label={`Follow-up ${i + 1} message`}
            />
          </li>
        ))}
        {drafts.length === 0 && <li className="muted small">No follow-ups: threads wait quietly for a reply.</li>}
      </ol>
      <div className="fu-actions">
        <Button kind="quiet" size="sm" icon="Add" disabled={drafts.length >= MAX_STEPS} onClick={add}>
          Add follow-up
        </Button>
        <span className="fu-spacer" />
        <Button kind="quiet" size="sm" disabled={busy} onClick={() => run(() => reset())}>
          Reset to default
        </Button>
        <Button kind="quiet" size="sm" disabled={busy} onClick={onDone}>
          Cancel
        </Button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error && <p className="card-error">{error}</p>}
    </form>
  );
}
