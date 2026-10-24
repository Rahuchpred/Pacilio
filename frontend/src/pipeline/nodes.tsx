import type { ReactNode } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import {
  Actor,
  Button,
  Icon,
  Money,
  Status,
  type IconName,
} from '../../../design-system/src/components';
import {
  followUps,
  inbox,
  ledger,
  routes,
  subagents,
  summary,
  type Subagent,
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
        {meta && <span className="pnode-meta">{meta}</span>}
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

export function InboxNode() {
  return (
    <Card icon="mail" title="Inbox" meta="ap@ironworks.live" className="w-inbox">
      <ul className="rows">
        {inbox.map((e, i) => (
          <li key={i} className="row">
            <div className="row-main">
              <span className="row-title">{e.vendor}</span>
              <span className="row-sub">
                Invoice <span className="id">{e.invoice}</span>
                {e.note && <> · {e.note}</>}
              </span>
            </div>
            <div className="row-side">
              <Money value={e.amount} />
              <span className="row-time">{e.time}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="foot">Read 4 invoices since 9:00 am.</p>
      <H type="source" position={Position.Right} />
    </Card>
  );
}

export function MainAgentNode() {
  return (
    <Card
      icon="agent"
      title="Main agent"
      meta={<Status kind="agent">Running</Status>}
      className="w-main pnode-main"
    >
      <p className="lede">
        Split 4 invoices across 3 checks. Fixed what the checks sent back and flagged the one it could not.
      </p>
      <table className="tbl">
        <thead>
          <tr>
            <th>Invoice</th>
            <th>Sent to</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {routes.map((r, i) => (
            <tr key={i}>
              <td>
                <span className="row-title">{r.vendor}</span>
                <span className="row-sub id">{r.invoice}</span>
              </td>
              <td className="muted">{r.to}</td>
              <td>
                <Status kind={r.status}>{r.result}</Status>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <H type="target" position={Position.Left} id="in" />
      <H type="source" position={Position.Right} id="out" />
      <H type="source" position={Position.Top} id="flag" />
      <H type="source" position={Position.Bottom} id="delegate" left="44%" />
      <H type="target" position={Position.Bottom} id="report" left="56%" />
    </Card>
  );
}

const fixedByLabel: Record<Subagent['fixedBy'], string> = {
  subagent: 'Fixed by this check',
  main: 'Fixed by main agent',
  person: 'Needs a person',
};

export function SubagentNode({ data }: NodeProps) {
  const s = subagents.find(x => x.id === data.subId)!;
  return (
    <Card icon="agent" title={s.name} meta={<Status kind={s.status}>{s.statusLabel}</Status>} className="w-sub">
      <p className="job">{s.job}</p>
      <p className="finding">{s.finding}</p>
      <div className="outcome">
        <span className="outcome-who">{fixedByLabel[s.fixedBy]}</span>
        <span>{s.outcome}</span>
      </div>
      <H type="target" position={Position.Top} id="delegate" left="44%" />
      <H type="source" position={Position.Top} id="report" left="56%" />
    </Card>
  );
}

export function FlaggedNode() {
  return (
    <Card
      icon="hourglass"
      title="Needs your OK"
      meta={<span className="count">1 of 4</span>}
      className="w-flag pnode-flag"
    >
      <p className="question">
        Halcyon Staffing billed <Money value={6240} /> for 52 hours. PO 4410 covers 48. Pay it all, or cap it at{' '}
        <Money value={5760} />?
      </p>
      <div className="confidence">
        <span className="confidence-bar">
          <span style={{ width: '62%' }} />
        </span>
        <span>62% · past Halcyon overages were approved 3 of 5 times</span>
      </div>
      <div className="actions">
        <Button kind="decide" size="sm">
          Cap it at $5,760.00
        </Button>
        <Button kind="secondary" size="sm">
          Pay $6,240.00
        </Button>
      </div>
      <p className="foot">Nothing posts until you answer.</p>
      <H type="target" position={Position.Bottom} id="in" />
      <H type="source" position={Position.Right} id="out" />
    </Card>
  );
}

export function LedgerNode() {
  const total = ledger.reduce((t, r) => t + r.amount, 0);
  return (
    <Card icon="bank" title="Ledger" meta="Oct 23" className="w-ledger">
      <table className="tbl">
        <thead>
          <tr>
            <th>Vendor</th>
            <th>By</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((r, i) => (
            <tr key={i}>
              <td>
                <span className="row-title">{r.vendor}</span>
                <span className="row-sub">{r.gl}</span>
              </td>
              <td>
                <Actor kind={r.actorKind} name={r.actor} />
              </td>
              <td className="num">
                <Money value={r.amount} />
                <Status kind={r.status}>{r.statusLabel}</Status>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>Total</td>
            <td className="num">
              <Money value={total} />
            </td>
          </tr>
        </tfoot>
      </table>
      <H type="target" position={Position.Left} id="in" />
      <H type="target" position={Position.Top} id="answer" />
      <H type="source" position={Position.Right} id="out" />
    </Card>
  );
}

export function FollowUpNode() {
  return (
    <Card icon="mail" title="Follow-ups" meta={`${followUps.length} open`} className="w-follow">
      <ul className="rows">
        {followUps.map((f, i) => (
          <li key={i} className="row row-stack">
            <div className="row-line">
              <span className="row-title">{f.subject}</span>
              <Status kind={f.status}>{f.statusLabel}</Status>
            </div>
            <span className="row-sub">{f.body}</span>
            <span className="row-time">
              <span className="id">{f.to}</span> · {f.time}
            </span>
          </li>
        ))}
      </ul>
      <H type="target" position={Position.Left} id="in" />
      <H type="source" position={Position.Right} id="out" />
    </Card>
  );
}

const SPAN = 120; // minutes shown on the timeline, 9:00 to 11:00 am

export function SummaryNode() {
  const s = summary;
  const clearedPct = (s.cleared / s.processed) * 100;
  return (
    <Card icon="doc" title="Today" meta="9:00 to 10:44 am" className="w-summary">
      <div className="hero">
        <span className="hero-num">
          <Money value={s.processed} />
        </span>
        <span className="muted">across {s.read} invoices</span>
      </div>

      <div className="split">
        <div className="split-bar">
          <span className="split-cleared" style={{ width: `${clearedPct}%` }} />
          <span className="split-held" style={{ width: `${100 - clearedPct}%` }} />
        </div>
        <div className="split-legend">
          <Status kind="cleared">
            Posted <Money value={s.cleared} />
          </Status>
          <Status kind="held">
            Held <Money value={s.held} />
          </Status>
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

      <table className="tbl tbl-plain">
        <tbody>
          <tr>
            <td>No issues</td>
            <td className="num">{s.clean}</td>
          </tr>
          <tr>
            <td>Fixed by a check</td>
            <td className="num">{s.fixedBySubagent}</td>
          </tr>
          <tr>
            <td>Fixed by main agent</td>
            <td className="num">{s.fixedByMain}</td>
          </tr>
          <tr>
            <td>Waiting on you</td>
            <td className="num">{s.waitingOnYou}</td>
          </tr>
          <tr>
            <td>Median time to post</td>
            <td className="num">{s.medianToPost}</td>
          </tr>
        </tbody>
      </table>
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
