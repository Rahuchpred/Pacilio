import { useReducer } from 'spacetimedb/react';
import { Icon, Status, type StatusKind } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import type { AgentMessage } from '../module_bindings/types';
import { logError } from '../throttle';
import { useFocus, useSetExpanded } from '../canvas/view';
import { chartFor, chartSelector } from './TeamCharts';
import { useLive } from './store';

// Messages Ask Pacioli sent to the agents: "Sent '…' to Bookkeeper", where it
// stands, and the agent's one-line reply once a run has handled it. A reply
// that made something links to it on the canvas.

export const AGENT_NAME: Record<string, string> = {
  main: 'Bookkeeper',
  reports: 'Reports agent',
};

const STATE: Record<string, { kind: StatusKind; label: string }> = {
  queued: { kind: 'held', label: 'Queued' },
  sent: { kind: 'needs', label: 'Working on it' },
  done: { kind: 'cleared', label: 'Done' },
  cancelled: { kind: 'agent', label: 'Cancelled' },
};

export function MessageLine({ m, showTarget = true }: { m: AgentMessage; showTarget?: boolean }) {
  const cancel = useReducer(reducers.cancelAgentMessage);
  const s = STATE[m.status] ?? { kind: 'agent' as StatusKind, label: m.status };
  const chart = chartFor(m, useLive().reportCharts);
  const { focusInside, focusWhenGrown } = useFocus();
  const setExpanded = useSetExpanded();
  const agent = AGENT_NAME[m.target] ?? m.target;
  // Opens the report for everyone, then brings the new chart to you
  const show = () => {
    setExpanded('report', true);
    if (chart) focusInside('report', chartSelector(chart.id));
    else focusWhenGrown('report');
  };
  return (
    <div className={`agent-msg is-${m.status}`}>
      <div className="agent-msg-head">
        <Icon name="Send" size={12} />
        <span>
          Sent <q>{m.text}</q>
          {showTarget && <> to {agent}</>}
        </span>
      </div>
      <div className="agent-msg-foot">
        <Status kind={s.kind}>{s.label}</Status>
        {m.status === 'queued' && (
          <button type="button" className="link-button" onClick={() => cancel({ messageId: m.id }).catch(logError)}>
            Cancel
          </button>
        )}
      </div>
      {m.reply && (
        <div className="agent-msg-reply">
          <span className="agent-msg-by">
            <Icon name="agent" size={12} /> {agent} replied
          </span>
          <p>{m.reply}</p>
          {m.target === 'reports' && m.status === 'done' && (
            <button type="button" className="agent-msg-link" onClick={show}>
              {chart ? `See “${chart.title}”` : 'Open the report'} <Icon name="ArrowRight" size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
