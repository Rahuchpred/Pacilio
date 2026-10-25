import { useCallback, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Button, Icon } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import { SCENARIOS, type Scenario } from '../../../backend/src/scenarios';
import { useLive } from '../pipeline/store';
import { logError } from '../throttle';
import { useDismiss } from '../useDismiss';
import './scenarios.css';

// Top left, beside the name: the business Pacioli keeps books for. The
// sources stay the same (bank, Stripe, QuickBooks); a scenario changes who
// shows up in them. Switching clears the books and replays, for everyone.
export function Scenarios() {
  const { scenario } = useLive();
  const switchTo = useReducer(reducers.setScenario);
  const [open, setOpen] = useState(false);
  // The scenario waiting on Switch, since switching clears the books
  const [asking, setAsking] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => {
    setOpen(false);
    setAsking(null);
  }, []);
  useDismiss(rootRef, open, close);

  const confirm = (s: Scenario) => {
    setBusy(true);
    switchTo({ key: s.key })
      .then(close)
      .catch(logError)
      .finally(() => setBusy(false));
  };

  return (
    <div className="scenarios" ref={rootRef}>
      <button
        type="button"
        className={`scenario-toggle${open ? ' is-open' : ''}`}
        aria-label={`Scenario: ${scenario.name}`}
        aria-expanded={open}
        aria-controls="scenario-panel"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="Columns" size={14} />
        <span className="scenario-current">{scenario.name}</span>
        <Icon name="chevronDown" size={12} />
      </button>
      {open && (
        <aside id="scenario-panel" className="scenario-panel" aria-label="Scenarios">
          <header className="scenario-head">
            <span className="dropdown-title">Scenarios</span>
            <span className="muted small">Same bank, Stripe and QuickBooks. A different business in them.</span>
          </header>
          <ul className="scenario-list">
            {SCENARIOS.map(s => {
              const active = s.key === scenario.key;
              return (
                <li key={s.key} className={`scenario${active ? ' is-active' : ''}${asking === s.key ? ' is-asking' : ''}`}>
                  <button
                    type="button"
                    className="scenario-pick"
                    aria-current={active || undefined}
                    disabled={active}
                    onClick={() => setAsking(s.key)}
                  >
                    <span className="scenario-name">
                      {s.name}
                      {active && <Icon name="Check" size={14} />}
                    </span>
                    <span className="scenario-blurb">{s.blurb}</span>
                  </button>
                  {asking === s.key && !active && (
                    <div className="scenario-confirm">
                      <span className="muted small">Clears the events, ledger, QuickBooks and report, then replays.</span>
                      <span className="scenario-actions">
                        <Button kind="primary" size="sm" icon="retry" pending={busy} disabled={busy} onClick={() => confirm(s)}>
                          Switch
                        </Button>
                        <Button kind="quiet" size="sm" disabled={busy} onClick={() => setAsking(null)}>
                          Keep
                        </Button>
                      </span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>
      )}
    </div>
  );
}
