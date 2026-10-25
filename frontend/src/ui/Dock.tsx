import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { Button, Status } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import { logError } from '../throttle';
import { SOURCES } from '../pipeline/live';
import { useLive } from '../pipeline/store';

// Bottom center: run, pause or restart every source and both agents at once,
// and tidy the canvas back to its default layout for everyone.
export function Dock() {
  const { statuses, events } = useLive();
  const run = useReducer(reducers.runInbound);
  const pause = useReducer(reducers.pauseInbound);
  const restart = useReducer(reducers.restartInbound);
  const tidy = useReducer(reducers.tidyPipelineLayout);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  // Only sources the board knows about (a removed source's old row doesn't count)
  const running = statuses.some(s => s.enabled && SOURCES.some(k => k.name === s.name));

  const act = (fn: () => Promise<void>) => () => {
    setBusy(true);
    fn().catch(logError).finally(() => setBusy(false));
  };

  return (
    <div className="dock">
      <span className="dock-state">
        <Status kind="agent" busy={running}>{running ? 'Running' : 'Paused'}</Status>
        <span className="dock-clock">{events.length} events</span>
      </span>
      {running ? (
        <Button kind="secondary" size="sm" icon="Pause" disabled={busy} onClick={act(() => pause())}>
          Pause
        </Button>
      ) : (
        <Button kind="primary" size="sm" icon="Play" disabled={busy} onClick={act(() => run())}>
          Run
        </Button>
      )}
      {confirming ? (
        <span className="dock-confirm">
          <span className="dock-clock">Clears every event, the ledger and the report</span>
          <Button
            kind="secondary"
            size="sm"
            icon="retry"
            disabled={busy}
            onClick={act(() => {
              setConfirming(false);
              return restart();
            })}
          >
            Clear and replay
          </Button>
          <Button kind="quiet" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
            Keep
          </Button>
        </span>
      ) : (
        <Button kind="quiet" size="sm" icon="retry" disabled={busy} onClick={() => setConfirming(true)}>
          Restart
        </Button>
      )}
      <span title="Put every card back in its place and close them, for everyone">
        <Button kind="quiet" size="sm" icon="CollapseAll" disabled={busy} onClick={act(() => tidy())}>
          Tidy
        </Button>
      </span>
    </div>
  );
}
