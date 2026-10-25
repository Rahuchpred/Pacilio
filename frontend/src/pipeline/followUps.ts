import { useLive } from './store';

// The shared follow-up schedule (email_follow_up): one row per nudge, in order.

export type Step = { delayMin: number; message: string };

export function useFollowUpSteps(): Step[] {
  return useFollowUpSchedule().steps;
}

// The steps, and whether they have loaded (before that, say nothing about them).
export function useFollowUpSchedule(): { steps: Step[]; ready: boolean } {
  const { followUpSteps: steps, followUpsReady: ready } = useLive();
  return { steps, ready };
}

// "10 min", "2 h", "1 day", "1 day 6 h"
export function wait(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.floor(minutes / (24 * 60));
  const h = Math.round((minutes % (24 * 60)) / 60);
  return `${d} ${d === 1 ? 'day' : 'days'}${h ? ` ${h} h` : ''}`;
}

// "after 10 min, 30 min, 2 h and 1 day" (each counted from the one before)
export function describeSchedule(steps: Step[]): string {
  if (!steps.length) return 'never follows up';
  const parts = steps.map(s => wait(s.delayMin));
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `follows up after ${list}`;
}
