import { useState } from 'react';
import { useReducer, useTable } from 'spacetimedb/react';
import { Button, Status } from '../../../design-system/src/components';
import { reducers, tables } from '../module_bindings';
import { logError } from '../throttle';

// Bottom center: run, pause or restart every source and both agents at once.
export function Dock() {
  const [statuses] = useTable(tables.inboundSourceStatus);
  const [events] = useTable(tables.inboundEvent);
  const run = useReducer(reducers.runInbound);
  const pause = useReducer(reducers.pauseInbound);
  const restart = useReducer(reducers.restartInbound);
  const [busy, setBusy] = useState(false);
  const running = statuses.filter(s => s.enabled).length > 0;

  const act = (fn: () => Promise<void>) => () => {
    setBusy(true);
    fn().catch(logError).finally(() => setBusy(false));
  };

  return (
    <div className="dock">
      <span className="dock-state">
        <Status kind={running ? 'cleared' : 'agent'}>{running ? 'Running' : 'Paused'}</Status>
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
      <Button
        kind="quiet"
        size="sm"
        icon="retry"
        disabled={busy}
        onClick={act(() => {
          if (!window.confirm('Restart clears every event, the ledger and the report, and replays the sources from the start.')) {
            return Promise.resolve();
          }
          return restart();
        })}
      >
        Restart
      </Button>
    </div>
  );
}
