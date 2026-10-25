import { Button, Icon, Money, Status } from '../../../design-system/src/components';
import { escalation } from '../pipeline/data';
import { useRun } from '../run/RunContext';

// The one question in the run: is it still waiting on a person, or answered?
export function useAnswer() {
  const { state, decide, undoDecision } = useRun();
  const decision = state.approval?.decision ?? null;
  return { decision, decide, undo: undoDecision, answeredClass: decision ? ' is-answered' : '' };
}

// Who decided: a small orange mark, the person's color on the canvas.
export function PersonMark() {
  return (
    <span className="person-mark">
      <span className="person-dot" aria-hidden="true" />
      Maya Chen
    </span>
  );
}

// The tag in the band: orange "Needs you" while waiting, green once answered.
export function AnswerStatus() {
  const { decision } = useAnswer();
  return decision ? <Status kind="cleared">Answered</Status> : <Status kind="needs">Needs you</Status>;
}

// The foot of the card: the two choices while waiting, the result and an undo after.
export function AnswerFoot() {
  const { decision, decide, undo } = useAnswer();
  if (decision) {
    return (
      <div className="ask-foot ask-result nodrag">
        <span className="ask-result-line">
          <Icon name="check" size={14} />
          {decision === 'cap' ? (
            <span>Capped at <Money value={5760} />. The extra 4 hours wait for Halcyon's timesheets.</span>
          ) : (
            <span>Paid <Money value={6240} /> in full.</span>
          )}
        </span>
        <PersonMark />
        <Button kind="quiet" size="sm" onClick={undo}>
          Undo
        </Button>
      </div>
    );
  }
  return (
    <div className="ask-foot nodrag">
      <span className="muted small">{escalation.hold}</span>
      <div className="facts-actions">
        <Button kind="quiet" size="sm" onClick={() => decide('pay')}>
          Pay $6,240.00
        </Button>
        <span className="ask-suggested">
          <span className="ask-suggest">Suggested</span>
          <Button kind="decide" size="sm" onClick={() => decide('cap')}>
            Cap at $5,760.00
          </Button>
        </span>
      </div>
    </div>
  );
}
