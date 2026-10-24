import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { END, START, advance, stateAt, type Decision, type RunState } from './timeline';

type Run = {
  state: RunState;
  playing: boolean;
  replay: () => void;
  pause: () => void;
  play: () => void;
  decide: (choice: Exclude<Decision, null>) => void;
  undoDecision: () => void;
};

const RunCtx = createContext<Run | null>(null);

// Holds the clock for the morning's run. It opens on the finished state, so the
// canvas is readable at a glance; Replay plays the run back so the work is visible.
export function RunProvider({ children }: { children: ReactNode }) {
  const [minute, setMinute] = useState(END);
  const [playing, setPlaying] = useState(false);
  const [decision, setDecision] = useState<{ choice: Decision; m: number } | null>(null);
  const minuteRef = useRef(minute);
  minuteRef.current = minute;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.5, (now - last) / 1000);
      last = now;
      const extra = decision ? [decision.m] : [];
      const next = advance(minuteRef.current, dt, extra);
      // Keep running a little past a decision so its posting finishes on screen.
      const stop = Math.max(END, (decision?.m ?? 0) + 2);
      if (next >= stop) {
        setMinute(stop);
        setPlaying(false);
        return;
      }
      setMinute(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, decision]);

  const replay = useCallback(() => {
    setDecision(null);
    setMinute(START);
    setPlaying(true);
  }, []);

  const decide = useCallback((choice: Exclude<Decision, null>) => {
    setDecision({ choice, m: minuteRef.current });
    setPlaying(true);
  }, []);

  const state = useMemo(() => stateAt(minute, decision), [minute, decision]);

  const value = useMemo<Run>(
    () => ({
      state,
      playing,
      replay,
      pause: () => setPlaying(false),
      play: () => setPlaying(true),
      decide,
      undoDecision: () => {
        setDecision(null);
        setMinute(END);
      },
    }),
    [state, playing, replay, decide]
  );

  return <RunCtx.Provider value={value}>{children}</RunCtx.Provider>;
}

export function useRun() {
  const ctx = useContext(RunCtx);
  if (!ctx) throw new Error('useRun must be used inside RunProvider');
  return ctx;
}
