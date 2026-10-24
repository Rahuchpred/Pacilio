import { Actor, Button, Icon, Money, Ref, Source, Status } from "../components";
import { PageDef, Preview } from "../doc";
import { AGENT_NOTES } from "../agent";

const sheetRows = [
  { line: "Gross ticket sales", src: "Ticketing report", icon: "ticket" as const, by: <Actor kind="agent" name="Agent" />, v: 68400 },
  { line: "Ticket fees and facility fee", src: "Ticketing report", icon: "ticket" as const, by: <Actor kind="rule" name="Deal §3" />, v: -9576 },
  { line: "Venue rent", src: "Contract §5", icon: "doc" as const, by: <Actor kind="rule" name="Deal §5" />, v: -6000 },
  { line: "Production", src: "Invoice #2291", icon: "bank" as const, by: <Actor kind="person" name="M. Carter" />, v: -4200, flag: true },
  { line: "Security and stagehands", src: "Payroll export", icon: "doc" as const, by: <Actor kind="agent" name="Agent" />, v: -5240 },
];

export const INTRO: PageDef = {
  id: "introduction",
  group: "Settle",
  title: "Settle",
  lede: "Show settlement for concert promoters. Agents do the counting and people make the calls. Ink and paper for the record; the one action you press next is the only crafted surface.",
  agent: Object.values(AGENT_NOTES).slice(0, 6).join("\n\n"),
  sections: [
    {
      id: "tonight",
      title: "Tonight",
      body: (
        <Preview>
          <p className="stage-line">Doors at 7. Settlement at 11:40. One line waits on you.</p>
          <div className="panel">
            <div className="panel-list">
              <div className="panel-row panel-row-head">Since doors</div>
              <div className="panel-row">
                <span>Ticketing report matched to the bank</span>
                <Status kind="cleared">Matched</Status>
              </div>
              <div className="panel-row">
                <span>Merch split, 80/20 soft goods</span>
                <Status kind="cleared">Cleared</Status>
              </div>
              <div className="panel-row">
                <span>Production charge over the rider cap</span>
                <Status kind="needs">Needs you</Status>
              </div>
            </div>
            <div className="panel-foot">
              <span className="panel-meta">Sat, Oct 24 · The Foundry · 2,000 cap</span>
              <Button kind="decide" size="sm">
                Review the charge
              </Button>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "needs-your-ok",
      title: "Needs your OK",
      body: (
        <Preview>
          <article className="escalation">
            <div className="escalation-head">
              <span className="escalation-who">
                <Icon name="agent" size={14} /> Settle agent
              </span>
              <Status kind="needs">Waiting on M. Carter</Status>
            </div>
            <p className="escalation-message">
              The rider caps production at <Money value={3500} cents={false} />
              <Ref n={1} />, but a March 14 email asked for the extra lighting rig at the artist's cost
              <Ref n={2} />. I'm 62% sure the charge stands and there's no precedent for an override by email, so I'm asking first.
            </p>
            <div className="facts">
              <p className="facts-title">Production charge, Low Tide Choir</p>
              <dl className="facts-list">
                <div>
                  <dt>Charged</dt>
                  <dd>
                    <Money value={4200} />
                  </dd>
                </div>
                <div>
                  <dt>Rider cap</dt>
                  <dd>
                    <Money value={3500} />
                  </dd>
                </div>
                <div>
                  <dt>Lighting rig</dt>
                  <dd>
                    <Money value={700} />
                    <Ref n={3} />
                  </dd>
                </div>
              </dl>
              <div className="facts-foot">
                <span className="facts-hold">Held until settlement, 11:40 pm</span>
                <div className="facts-actions">
                  <Button kind="quiet" size="sm">
                    Cap it at $3,500
                  </Button>
                  <Button kind="decide" size="sm">
                    Keep the charge
                  </Button>
                </div>
              </div>
            </div>
            <ol className="sources">
              <Source n={1} source="Contract §7.2" detail="Production capped at $3,500" />
              <Source n={2} source="Email from Dana Reyes, Mar 14" detail="Add the Mac Aura rig, bill it to us" />
              <Source n={3} source="Vendor invoice #2291" detail="Lighting rig, $700.00" />
            </ol>
          </article>
        </Preview>
      ),
    },
    {
      id: "release",
      title: "Release the payout",
      body: (
        <Preview>
          <article className="escalation">
            <div className="escalation-head">
              <span className="escalation-who">
                <Icon name="agent" size={14} /> Settle agent
              </span>
              <Status kind="needs">Waiting on M. Carter</Status>
            </div>
            <p className="escalation-message">
              The sheet is signed by both sides. Releasing sends the artist's share by wire tonight; declining holds it for a second look.
            </p>
            <div className="facts">
              <p className="facts-title">Payout, Low Tide Choir</p>
              <dl className="facts-list">
                <div>
                  <dt>85% of net</dt>
                  <dd>
                    <Money value={36876.4} />
                  </dd>
                </div>
                <div>
                  <dt>Deposit paid in March</dt>
                  <dd>
                    <Money value={-7500} />
                  </dd>
                </div>
                <div>
                  <dt>Wire tonight</dt>
                  <dd>
                    <Money value={29376.4} />
                  </dd>
                </div>
              </dl>
              <div className="facts-foot">
                <span className="facts-hold">Requested by the agent, approved by you</span>
                <div className="facts-actions">
                  <Button kind="reject" size="sm">
                    Hold it
                  </Button>
                  <Button kind="accept" size="sm">
                    Release $29,376
                  </Button>
                </div>
              </div>
            </div>
          </article>
        </Preview>
      ),
    },
    {
      id: "settlement-sheet",
      title: "Settlement sheet",
      body: (
        <Preview wide>
          <div className="sheet" role="table" aria-label="Settlement sheet">
            <div className="sheet-row sheet-head" role="row">
              <span role="columnheader">Line</span>
              <span role="columnheader">Source</span>
              <span role="columnheader">Set by</span>
              <span role="columnheader" className="num">
                Amount
              </span>
            </div>
            {sheetRows.map((r) => (
              <div className={`sheet-row${r.flag ? " is-flagged" : ""}`} role="row" key={r.line}>
                <span role="cell">{r.line}</span>
                <span role="cell" className="sheet-src">
                  <Icon name={r.icon} size={14} />
                  {r.src}
                </span>
                <span role="cell">{r.by}</span>
                <span role="cell" className="num">
                  <Money value={r.v} />
                </span>
              </div>
            ))}
            <div className="sheet-row sheet-total" role="row">
              <span role="cell">Net after expenses</span>
              <span role="cell" />
              <span role="cell" />
              <span role="cell" className="num">
                <Money value={43384} />
              </span>
            </div>
            <div className="sheet-row sheet-total" role="row">
              <span role="cell">Artist payout, greater of $15,000 or 85% of net</span>
              <span role="cell" />
              <span role="cell">
                <Status kind="held">Held</Status>
              </span>
              <span role="cell" className="num">
                <Money value={36876.4} />
              </span>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "dispute",
      title: "Dispute",
      body: (
        <Preview>
          <div className="thread">
            <div className="msg msg-them">
              <span className="msg-who">Dana Reyes, tour manager</span>
              <p>The rider says $3,500 for production. Why are we paying $4,200?</p>
            </div>
            <div className="msg msg-agent">
              <span className="msg-who">
                <Icon name="agent" size={14} /> Settle agent
              </span>
              <p>
                The rider cap is $3,500
                <Ref n={1} />. On March 14 you asked us to add the Mac Aura rig and bill it to the artist
                <Ref n={2} />. The vendor invoiced $700 for it, so the line is $4,200.
              </p>
            </div>
            <div className="msg-actions">
              <Button kind="secondary" size="sm">
                Send the email
              </Button>
              <Button kind="quiet" size="sm">
                Escalate to M. Carter
              </Button>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "policy",
      title: "Answer becomes policy",
      body: (
        <Preview>
          <div className="diff">
            <div className="diff-head">
              <span className="diff-file">policy/production.rules</span>
              <span className="diff-meta">v14, proposed by the agent</span>
            </div>
            <pre className="diff-body">
              <span className="diff-ctx"> production_cap: rider.production_cap</span>
              {"\n"}
              <span className="diff-del">- overage: escalate</span>
              {"\n"}
              <span className="diff-add">+ overage: allow_if(email_from_tour_manager, before: show_date)</span>
              {"\n"}
              <span className="diff-add">+ cite: [contract.7_2, email.request]</span>
            </pre>
            <div className="diff-foot">
              <Actor kind="person" name="Approve as M. Carter" />
              <Button kind="primary" size="sm">
                Approve rule
              </Button>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "agent-log",
      title: "Agent log",
      body: (
        <Preview>
          <ol className="log">
            {[
              { t: "11:41 pm", what: "Matched 1,912 scans to the ticketing report", who: <Actor kind="agent" name="Agent" /> },
              { t: "11:43 pm", what: "Applied the merch split from the deal", who: <Actor kind="rule" name="Deal §8" /> },
              { t: "11:44 pm", what: "Stopped on the production charge, sent to the controller", who: <Actor kind="agent" name="Agent" /> },
              { t: "11:52 pm", what: "Kept the $4,200 charge", who: <Actor kind="person" name="M. Carter" /> },
            ].map((e) => (
              <li className="log-row" key={e.t}>
                <span className="log-time">{e.t}</span>
                <span className="log-what">{e.what}</span>
                {e.who}
              </li>
            ))}
          </ol>
        </Preview>
      ),
    },
  ],
};
