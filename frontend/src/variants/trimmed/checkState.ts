import type { StatusKind } from '../../../../design-system/src/components';
import { useRun } from '../../run/RunContext';

// How one check agent looks right now, read from the run.
// Working: orange with a sheen. Finished clean or fixed: green.
// Found an issue nobody has resolved yet: red.
export type CheckLook = { state: 'idle' | 'working' | 'done' | 'issue'; kind: StatusKind; label: string };

const ISSUE_LABEL: Record<string, string> = { 'sub-amount': 'Over PO' };

export function useCheckLook(subId: string): CheckLook {
  const { state } = useRun();
  const c = state.checks.find(x => x.id === subId);
  if (!c) return { state: 'idle', kind: 'agent', label: 'Waiting' };
  if (c.working.length) return { state: 'working', kind: 'needs', label: 'Checking' };
  const open = c.found > 0 && (!c.outcome || c.outcome.text.startsWith('Waiting'));
  if (open) return { state: 'issue', kind: 'disputed', label: ISSUE_LABEL[subId] ?? 'Found an issue' };
  if (c.checked > 0) return { state: 'done', kind: 'cleared', label: c.found ? 'Fixed' : 'Passed' };
  return { state: 'idle', kind: 'agent', label: 'Waiting' };
}
