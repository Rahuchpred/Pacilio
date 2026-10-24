import { useEffect } from 'react';
import { Button } from '../../../design-system/src/components';
import { useRun } from '../run/RunContext';

// Bottom center: replay the morning and see the run's clock. R replays.
export function Dock() {
  const { state, playing, replay, pause, play } = useRun();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el?.closest?.('input, textarea, [contenteditable]')) return;
      if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) replay();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [replay]);

  return (
    <div className="dock">
      {playing ? (
        <Button kind="secondary" size="sm" onClick={pause}>
          Pause
        </Button>
      ) : state.minute < 90 ? (
        <Button kind="secondary" size="sm" onClick={play}>
          Resume
        </Button>
      ) : (
        <Button kind="secondary" size="sm" icon="retry" onClick={replay}>
          Replay the run
        </Button>
      )}
      <span className="dock-clock">{state.clock}</span>
    </div>
  );
}
