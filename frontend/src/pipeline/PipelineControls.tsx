import { useState } from 'react';
import { useReducer, useTable } from 'spacetimedb/react';
import { reducers, tables } from '../module_bindings';
import { logError } from '../throttle';

// Run / Pause / Restart for every inbound source at once.
export function PipelineControls() {
  const [statuses] = useTable(tables.inboundSourceStatus);
  const [events] = useTable(tables.inboundEvent);
  const run = useReducer(reducers.runInbound);
  const pause = useReducer(reducers.pauseInbound);
  const restart = useReducer(reducers.restartInbound);
  const [busy, setBusy] = useState(false);

  const running = statuses.filter(s => s.enabled).length;
  const isRunning = running > 0;

  const act = (fn: () => Promise<void>) => () => {
    setBusy(true);
    fn().catch(logError).finally(() => setBusy(false));
  };

  return (
    <div className="pipeline-controls">
      <p className="controls-summary">
        <strong>{isRunning ? '▶ Running' : '‖ Paused'}</strong>
        {isRunning && ` · ${running} of ${statuses.length || 4} sources`}
        {` · ${events.length} events`}
      </p>
      <div className="controls-buttons">
        <button className="btn btn-primary" onClick={act(() => run())} disabled={busy || isRunning}>
          Run
        </button>
        <button className="btn btn-secondary" onClick={act(() => pause())} disabled={busy || !isRunning}>
          Pause
        </button>
        <button
          className="btn btn-quiet"
          onClick={act(() => restart())}
          disabled={busy}
          title="Clears the feed and replays every source from the start"
        >
          Restart
        </button>
      </div>
    </div>
  );
}
