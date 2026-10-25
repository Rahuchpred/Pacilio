import { useReducer } from 'spacetimedb/react';
import { Icon, Status, type StatusKind } from '../../../design-system/src/components';
import { reducers } from '../module_bindings';
import type { AgentMessage } from '../module_bindings/types';
import { logError } from '../throttle';

// Messages Ask Pacioli sent to the agents: "Sent '…' to Bookkeeper", where it
// stands, and the agent's one-line reply once a run has handled it.

export const AGENT_NAME: Record<string, string> = { main: 'Bookkeeper', reports: 'Reports agent' };

const STATE: Record<string, { kind: StatusKind; label: string }> = {
  queued: { kind: 'held', label: 'Queued' },
  sent: { kind: 'needs', label: 'Working on it' },
  done: { kind: 'cleared', label: 'Done' },
  cancelled: { kind: 'agent', label: 'Cancelled' },
};

export function MessageLine({ m, showTarget = true }: { m: AgentMessage; showTarget?: boolean }) {
  const cancel = useReducer(reducers.cancelAgentMessage);
  const s = STATE[m.status] ?? { kind: 'agent' as StatusKind, label: m.status };
  return (
    <div className={`agent-msg is-${m.status}`}>
      <div className="agent-msg-head">
        <Icon name="Send" size={12} />
        <span>
          Sent <q>{m.text}</q>
          {showTarget && <> to {AGENT_NAME[m.target] ?? m.target}</>}
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
      {m.reply && <p className="agent-msg-reply">{m.reply}</p>}
    </div>
  );
}
