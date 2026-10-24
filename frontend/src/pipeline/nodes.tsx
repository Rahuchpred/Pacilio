import type { ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Actor,
  Button,
  Icon,
  Money,
  Ref,
  Source,
  Status,
  type IconName,
} from '../../../design-system/src/components';
import {
  agentLog,
  escalation,
  followUps,
  inbox,
  ledger,
  subagents,
  summary,
} from './data';

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
        <div className="panel-foot">
          <span className="panel-meta">
            <span className="id">ap@ironworks.live</span> · 4 since 9:00 am
          </span>
        </div>
      </div>
      <H type="source" position={Position.Right} />
    </div>
  );
}

/* Main agent: one sentence, then the agent log. */
export function MainAgentNode() {
  return (
    <Card icon="agent" title="Main agent" meta={<Status kind="agent">Running</Status>} className="w-main pnode-main">
      <p className="lede">
        Read 4 invoices, sent 3 to checks, fixed 2 and asked Maya Chen about 1.
      </p>
      <ol className="log">
        {agentLog.map((r, i) => (
          <li key={i} className="log-row">
            <span className="log-time">{r.time}</span>
            <span>{r.text}</span>
            <Actor kind={r.actorKind} name={r.actor} />
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

export function SubagentNode({ data }: NodeProps) {
  const s = subagents.find(x => x.id === data.subId)!;
  return (
    <Card icon="agent" title={s.name} meta={<Status kind={s.status}>{s.statusLabel}</Status>} className="w-sub">
      <p className="muted">{s.job}</p>
      <p>{s.finding}</p>
      <div className="pnode-foot">
        <span className="muted small">Fixed by</span>
        <Actor kind={s.fixedByKind} name={s.fixedBy} />
      </div>
      <H type="target" position={Position.Top} id="delegate" left="44%" />
      <H type="source" position={Position.Top} id="report" left="56%" />
    </Card>
  );
}

/* Needs your OK: Glaze's escalation. Who asks, why, the facts, a deadline, two choices. */
export function FlaggedNode() {
  const e = escalation;
  return (
    <div className="pnode w-flag escalation">
      <div className="escalation-head">
        <span className="escalation-who">
          <Icon name="agent" />
          {e.asker}
        </span>
        <Status kind="needs">Waiting on {e.waitingOn}</Status>
      </div>
      <p className="escalation-message">
        Halcyon Staffing billed 52 hours<Ref n={1} />, but PO 4410 covers 48<Ref n={2} />. I'm 62% sure the extra
        hours are real, since you approved 3 of their last 5 overages<Ref n={3} />, so I'm asking first.
      </p>
      <div className="facts">
        <p className="facts-title">Halcyon HS-0912</p>
        <dl className="facts-list">
          {e.facts.map(f => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd>
                <Money value={f.v} />
              </dd>
            </div>
          ))}
        </dl>
        <div className="facts-foot">
          <span className="facts-hold">{e.hold}</span>
          <div className="facts-actions">
            <Button kind="quiet" size="sm">
              Pay $6,240.00
            </Button>
            <Button kind="decide" size="sm">
              Cap at $5,760.00
            </Button>
          </div>
        </div>
      </div>
      <ol className="sources">
        {e.sources.map((s, i) => (
          <Source key={i} n={i + 1} source={s.source} detail={s.detail} />
        ))}
      </ol>
      <H type="target" position={Position.Bottom} id="in" />
      <H type="source" position={Position.Right} id="out" />
    </div>
  );
}

/* Ledger: the settlement sheet. Every row has a source and an actor. */
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
        <div className="sheet-row sheet-head">
          <span>Line</span>
          <span>Source</span>
          <span>Set by</span>
          <span className="num">Amount</span>
        </div>
        {ledger.map((r, i) => (
          <div key={i} className={`sheet-row${r.flagged ? ' is-flagged' : ''}`}>
            <span className="stack">
              <span className="strong">{r.line}</span>
              <span className="muted small">{r.sub}</span>
            </span>
            <span className="sheet-src">
              <Icon name={r.sourceIcon} size={14} />
              {r.source}
            </span>
            <Actor kind={r.actorKind} name={r.actor} />
            <span className="num">
              <Money value={r.amount} />
            </span>
          </div>
        ))}
        <div className="sheet-row sheet-total">
          <span>Total</span>
          <span />
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

/* Follow-ups: the agent's side of each thread. */
export function FollowUpNode() {
  return (
    <Card icon="mail" title="Follow-ups" meta={<span className="muted small">{followUps.length} open</span>} className="w-follow">
      <div className="thread">
        {followUps.map((f, i) => (
          <div key={i} className="msg msg-agent">
            <div className="msg-line">
              <span className="msg-who">To {f.to}</span>
              <Status kind={f.status}>{f.statusLabel}</Status>
            </div>
            <span className="strong">{f.subject}</span>
            <p className="muted">{f.body}</p>
            <span className="tertiary small">{f.time}</span>
          </div>
        ))}
      </div>
      <H type="target" position={Position.Left} id="in" />
      <H type="source" position={Position.Right} id="out" />
    </Card>
  );
}

const SPAN = 120; // minutes on the timeline, 9:00 to 11:00 am

export function SummaryNode() {
  const s = summary;
  const clearedPct = (s.cleared / s.processed) * 100;
  return (
    <Card icon="doc" title="Today" meta={<span className="muted small">9:00 to 10:44 am</span>} className="w-summary">
      <p className="lede">
        Posted <Money value={s.cleared} /> of <Money value={s.processed} /> by 10:44 am. One invoice waits on Maya Chen.
      </p>

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

      <div className="timeline">
        {s.timeline.map((t, i) => {
          const end = t.out ?? s.now;
          return (
            <div key={i} className="tl-row">
              <span className="tl-label">{t.label}</span>
              <span className="tl-track">
                <span
                  className={`tl-bar tl-${t.status}`}
                  style={{
                    left: `${(t.in / SPAN) * 100}%`,
                    width: `${Math.max(((end - t.in) / SPAN) * 100, 1.5)}%`,
                  }}
                />
                <span className="tl-now" style={{ left: `${(s.now / SPAN) * 100}%` }} />
              </span>
            </div>
          );
        })}
        <div className="tl-axis">
          <span>9 am</span>
          <span>10 am</span>
          <span>11 am</span>
        </div>
      </div>

      <dl className="facts-list plain">
        {s.rows.map(r => (
          <div key={r.label}>
            <dt>{r.label}</dt>
            <dd>{r.value}</dd>
          </div>
        ))}
      </dl>
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
