import type { ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Button,
  Icon,
  Money,
  Source,
  Status,
  type IconName,
} from '../../../../design-system/src/components';
import {
  agentLog,
  escalation,
  followUps,
  inbox,
  ledger,
  subagents,
  summary,
} from '../../pipeline/data';

function Card({
  icon,
  title,
  meta,
  className = '',
  children,
}: {
  icon: IconName;
  title: string;
  meta?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`pnode ${className}`}>
      <header className="pnode-head">
        <Icon name={icon} />
        <h3>{title}</h3>
        {meta}
      </header>
      {children}
    </div>
  );
}

// Handles sit on the edge of a card; they are endpoints only, not editable.
function H(props: { type: 'source' | 'target'; position: Position; id?: string; left?: string }) {
  return (
    <Handle
      type={props.type}
      position={props.position}
      id={props.id}
      isConnectable={false}
      style={props.left ? { left: props.left } : undefined}
    />
  );
}

/* Inbox: the Tonight panel. A sunken frame, a list, a footer. */
export function InboxNode() {
  return (
    <div className="pnode-bare w-inbox">
      <h3 className="bare-title">
        <Icon name="mail" />
        Inbox
      </h3>
      <div className="panel">
        <div className="panel-list">
          {inbox.map((e, i) => (
            <div key={i} className="panel-row">
              <div className="stack">
                <span className="strong">{e.vendor}</span>
                <span className="muted small">
                  <span className="id">{e.invoice}</span> · {e.time}
                </span>
              </div>
              <div className="stack end">
                <Money value={e.amount} />
                <Status kind={e.status}>{e.statusLabel}</Status>
              </div>
            </div>
          ))}
        </div>
      </div>
      <H type="source" position={Position.Right} />
    </div>
  );
}

/* Main agent: the log alone. The actor shows only when it isn't the main agent. */
export function MainAgentNode() {
  return (
    <Card icon="agent" title="Main agent" meta={<Status kind="agent">Running</Status>} className="w-main pnode-main">
      <ol className="log">
        {agentLog.map((r, i) => (
          <li key={i} className="log-row">
            <span className="log-time">{r.time}</span>
            <span>
              {r.text}
              {r.actor !== 'Main agent' && <span className="log-by"> · {r.actor}</span>}
            </span>
          </li>
        ))}
      </ol>
      <H type="target" position={Position.Left} id="in" />
      <H type="source" position={Position.Right} id="out" />
      <H type="source" position={Position.Top} id="flag" />
      <H type="source" position={Position.Bottom} id="delegate" left="44%" />
      <H type="target" position={Position.Bottom} id="report" left="56%" />
    </Card>
  );
}

// One short line per check; the original canvas keeps the long versions.
const SHORT: Record<string, { finding: string; status?: 'held' }> = {
  'sub-duplicate': { finding: 'Rivera 2231 came in twice. Stopped the copy.' },
  'sub-coding': { finding: 'Northgate 7781 had no GL code. Used 6120 from past invoices.' },
  'sub-amount': { finding: 'Halcyon HS-0912 is 4 hours over PO 4410.', status: 'held' },
};

export function SubagentNode({ data }: NodeProps) {
  const base = subagents.find(x => x.id === data.subId)!;
  const short = SHORT[base.id];
  const s = { ...base, finding: short.finding, status: short.status ?? base.status };
  return (
    <Card icon="agent" title={s.name} meta={<Status kind={s.status}>{s.statusLabel}</Status>} className="w-sub">
      <p>{s.finding}</p>
      <H type="target" position={Position.Top} id="delegate" left="44%" />
      <H type="source" position={Position.Top} id="report" left="56%" />
    </Card>
  );
}

/* Needs your OK: the two numbers side by side, two choices. Sources fold away. */
export function FlaggedNode() {
  const e = escalation;
  return (
    <div className="pnode w-flag escalation">
      <div className="escalation-head">
        <span className="escalation-who">
          <Icon name="agent" />
          {e.asker}
        </span>
        <Status kind="needs">Needs you</Status>
      </div>
      <p className="ask-q">Halcyon billed 4 hours more than the PO. Pay them?</p>
      <div className="ask-compare">
        <div>
          <span className="muted small">Invoice HS-0912</span>
          <span className="ask-big">52 hrs</span>
          <Money value={6240} />
        </div>
        <div>
          <span className="muted small">PO 4410</span>
          <span className="ask-big">48 hrs</span>
          <Money value={5760} />
        </div>
      </div>
      <p className="muted small">You approved 3 of their last 5 overages.</p>
      <div className="ask-foot">
        <span className="muted small">{e.hold}</span>
        <div className="facts-actions">
          <Button kind="quiet" size="sm">
            Pay $6,240.00
          </Button>
          <Button kind="decide" size="sm">
            Cap at $5,760.00
          </Button>
        </div>
      </div>
      <details className="ask-sources nodrag">
        <summary>
          <Icon name="ChevronRight" size={12} /> Sources ({e.sources.length})
        </summary>
        <ol className="sources">
          {e.sources.map((s, i) => (
            <Source key={i} n={i + 1} source={s.source} detail={s.detail} />
          ))}
        </ol>
      </details>
      <H type="target" position={Position.Bottom} id="in" />
      <H type="source" position={Position.Right} id="out" />
    </div>
  );
}

/* Ledger: the settlement sheet. Who set each line shows as its icon (name on hover). */
export function LedgerNode() {
  const total = ledger.reduce((t, r) => t + r.amount, 0);
  return (
    <div className="pnode-bare w-ledger">
      <h3 className="bare-title">
        <Icon name="bank" />
        Ledger
        <span className="muted small">Oct 23</span>
      </h3>
      <div className="sheet">
        {ledger.map((r, i) => (
          <div key={i} className={`sheet-row${r.flagged ? ' is-held' : ''}`}>
            <span className="stack">
              <span className="strong">{r.line}</span>
              <span className="muted small">{r.sub}</span>
            </span>
            {r.flagged ? (
              <Status kind="held">Held for you</Status>
            ) : (
              <span className="sheet-src" title={`Set by ${r.actor}`}>
                <Icon name={r.actorKind === 'person' ? 'person' : 'agent'} size={14} />
                {r.source}
              </span>
            )}
            <span className="num">
              <Money value={r.amount} />
            </span>
          </div>
        ))}
        <div className="sheet-row sheet-total">
          <span>Total</span>
          <span />
          <span className="num">
            <Money value={total} />
          </span>
        </div>
      </div>
      <H type="target" position={Position.Left} id="in" />
      <H type="target" position={Position.Top} id="answer" />
      <H type="source" position={Position.Right} id="out" />
    </div>
  );
}

/* Follow-ups: one line per email; the body is in the email itself. */
export function FollowUpNode() {
  return (
    <Card icon="mail" title="Emails to vendors" className="w-follow">
      <ul className="mail-list">
        {followUps.map((f, i) => (
          <li key={i} title={f.body}>
            <span className="stack">
              <span className="strong">{f.to}</span>
              <span className="muted small">{f.subject}</span>
            </span>
            <Status kind={f.status}>{f.statusLabel}</Status>
          </li>
        ))}
      </ul>
      <H type="target" position={Position.Left} id="in" />
      <H type="source" position={Position.Right} id="out" />
    </Card>
  );
}

/* Today: one number, one bar, one sentence. */
export function SummaryNode() {
  const s = summary;
  const clearedPct = (s.cleared / s.processed) * 100;
  return (
    <Card icon="doc" title="Today" meta={<span className="muted small">9:00 to 10:44 am</span>} className="w-summary">
      <div className="money-xl">
        <Money value={s.processed} />
      </div>
      <div className="split">
        <div className="split-bar">
          <span className="split-cleared" style={{ width: `${clearedPct}%` }} />
          <span className="split-held" style={{ width: `${100 - clearedPct}%` }} />
        </div>
        <div className="split-legend">
          <span className="split-key">
            <Icon name="check" size={14} />
            Posted <Money value={s.cleared} />
          </span>
          <span className="split-key">
            <Icon name="clock" size={14} />
            Held <Money value={s.held} />
          </span>
        </div>
      </div>
      <p className="muted">3 of 4 invoices done. 1 waits on Maya Chen.</p>
      <H type="target" position={Position.Left} id="in" />
    </Card>
  );
}

export const nodeTypes = {
  inbox: InboxNode,
  main: MainAgentNode,
  subagent: SubagentNode,
  flagged: FlaggedNode,
  ledger: LedgerNode,
  followup: FollowUpNode,
  summary: SummaryNode,
};
