import { ReactNode, useEffect, useState } from "react";
import tokens from "./tokens/tokens.json";
import { Actor, Button, Citation, Confidence, Icon, Money, Status } from "./components";
import { AGENT_NOTES, INSTALL_PROMPT } from "./agent";

type Mode = "human" | "agent";

const NAV: { group: string; items: { id: string; label: string }[] }[] = [
  { group: "Settle", items: [{ id: "introduction", label: "Introduction" }] },
  {
    group: "Foundations",
    items: [
      { id: "color", label: "Color" },
      { id: "typography", label: "Typography" },
      { id: "money", label: "Money" },
      { id: "space", label: "Space and radius" },
      { id: "lines", label: "Borders and elevation" },
      { id: "motion", label: "Motion" },
      { id: "voice", label: "Voice" },
      { id: "anti-slop", label: "Anti-slop" },
    ],
  },
  {
    group: "Components",
    items: [
      { id: "button", label: "Button" },
      { id: "status", label: "Status" },
      { id: "citation", label: "Citation" },
      { id: "actor", label: "Actor" },
    ],
  },
  {
    group: "Patterns",
    items: [
      { id: "tonight", label: "Tonight" },
      { id: "escalation", label: "Needs your OK" },
      { id: "sheet", label: "Settlement sheet" },
      { id: "dispute", label: "Dispute" },
      { id: "policy", label: "Answer becomes policy" },
      { id: "log", label: "Agent log" },
    ],
  },
];

const ON_PAGE = ["tonight", "escalation", "sheet", "dispute", "policy", "log"];
const LABEL: Record<string, string> = Object.fromEntries(NAV.flatMap((g) => g.items.map((i) => [i.id, i.label])));

function Section({ id, title, lede, mode, children }: { id: string; title: string; lede?: string; mode: Mode; children: ReactNode }) {
  return (
    <section id={id} className="doc-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="section-title">
        {title}
      </h2>
      {lede && <p className="section-lede">{lede}</p>}
      {mode === "human" ? (
        <div className="preview">{children}</div>
      ) : (
        <pre className="agent-note">
          <code>{AGENT_NOTES[id] ?? "No agent notes yet."}</code>
        </pre>
      )}
    </section>
  );
}

function hex(path: string) {
  const [group, step] = path.split(".");
  return (tokens.primitives as Record<string, Record<string, string>>)[group][step];
}

export default function App() {
  const [mode, setMode] = useState<Mode>("human");
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState("introduction");

  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    else delete document.documentElement.dataset.theme;
  }, [theme]);

  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".doc-section, #introduction"));
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [mode]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const toggleTheme = () => {
    const isDark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <div className="shell">
      <nav className="side" aria-label="Design system">
        {NAV.map((g) => (
          <div className="side-group" key={g.group}>
            <p className="side-heading">{g.group}</p>
            {g.items.map((i) => (
              <a key={i.id} href={`#${i.id}`} className={`side-link${active === i.id ? " is-active" : ""}`}>
                {i.label}
              </a>
            ))}
          </div>
        ))}
      </nav>

      <main className="content">
        <header id="introduction" className="intro">
          <h1 className="intro-title">Settle</h1>
          <p className="intro-lede">Ink and paper for money. Color appears only where a person has to decide.</p>
          <p className="intro-body">
            Settle runs show settlement for concert promoters. Agents do the counting. People make the calls. This system keeps those two
            visibly different: agent work is black and white with a citation on every number, and the one thing waiting on you is the only
            thing in color.
          </p>
        </header>

        <Section id="tonight" title="Tonight" lede="The first screen a promoter sees. One sentence says what happened, one row waits." mode={mode}>
          <div className="stage">
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
          </div>
        </Section>

        <Section
          id="escalation"
          title="Needs your OK"
          lede="The only colored surface in the product. It names who decides, shows the evidence and says what happens if nobody answers."
          mode={mode}
        >
          <div className="stage">
            <article className="escalation">
              <div className="escalation-head">
                <Status kind="needs">Needs your OK</Status>
                <span className="escalation-route">Routed to M. Carter, controller</span>
              </div>
              <h3 className="escalation-title">
                Keep the <Money value={4200} /> production charge against Low Tide Choir?
              </h3>
              <p className="escalation-body">
                The rider caps production at <Money value={3500} />. A March 14 email from their tour manager asked for the extra lighting
                rig at the artist's cost, which covers the other <Money value={700} />.
              </p>
              <ul className="evidence">
                <li>
                  <Citation icon="doc" source="Contract §7.2" detail="Production capped at $3,500" />
                </li>
                <li>
                  <Citation icon="mail" source="Email, Mar 14" detail="“Add the Mac Aura rig, bill to us”" />
                </li>
                <li>
                  <Citation icon="bank" source="Vendor invoice #2291" detail="Lighting rig, $700.00" />
                </li>
              </ul>
              <Confidence value={62} note="no precedent for rider overrides by email" />
              <div className="escalation-actions">
                <Button kind="decide">Keep the charge</Button>
                <Button kind="secondary">Cap it at $3,500</Button>
                <Button kind="quiet">Ask the tour manager</Button>
              </div>
              <p className="escalation-foot">Nothing posts until you answer. Your answer becomes policy for the next show.</p>
            </article>
          </div>
        </Section>

        <Section id="sheet" title="Settlement sheet" lede="Every line shows its amount, where the number came from and who set it." mode={mode}>
          <div className="stage stage-wide">
            <div className="sheet" role="table" aria-label="Settlement sheet">
              <div className="sheet-row sheet-head" role="row">
                <span role="columnheader">Line</span>
                <span role="columnheader">Source</span>
                <span role="columnheader">Set by</span>
                <span role="columnheader" className="num">
                  Amount
                </span>
              </div>
              {[
                { line: "Gross ticket sales", src: "Ticketing report", icon: "ticket" as const, by: <Actor kind="agent" name="Agent" />, v: 68400 },
                { line: "Ticket fees and facility fee", src: "Ticketing report", icon: "ticket" as const, by: <Actor kind="rule" name="Deal §3" />, v: -9576 },
                { line: "Venue rent", src: "Contract §5", icon: "doc" as const, by: <Actor kind="rule" name="Deal §5" />, v: -6000 },
                { line: "Production", src: "Invoice #2291", icon: "bank" as const, by: <Actor kind="person" name="M. Carter" />, v: -4200, flag: true },
                { line: "Security and stagehands", src: "Payroll export", icon: "doc" as const, by: <Actor kind="agent" name="Agent" />, v: -5240 },
              ].map((r) => (
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
          </div>
        </Section>

        <Section id="dispute" title="Dispute" lede="When the counterparty pushes back, the agent answers with sources, never with agreement for its own sake." mode={mode}>
          <div className="stage">
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
                  The rider cap is $3,500. On March 14 you asked us to add the Mac Aura rig and bill it to the artist. The vendor invoiced
                  $700 for it, so the line is $4,200.
                </p>
                <div className="msg-cites">
                  <Citation icon="doc" source="Contract §7.2" detail="cap $3,500" />
                  <Citation icon="mail" source="Email, Mar 14" detail="from dana@lowtide.band" />
                </div>
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
          </div>
        </Section>

        <Section id="policy" title="Answer becomes policy" lede="A controller's answer turns into a versioned rule. The diff is reviewed like code before it applies." mode={mode}>
          <div className="stage">
            <div className="diff">
              <div className="diff-head">
                <span className="diff-file">policy/production.rules</span>
                <span className="diff-meta">v14 · proposed by agent</span>
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
          </div>
        </Section>

        <Section id="log" title="Agent log" lede="The audit trail. Every row says what happened, who did it and what it cited." mode={mode}>
          <div className="stage">
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
          </div>
        </Section>

        <Section id="color" title="Color" lede="Neutrals do almost all the work. Signal is for the one decision on screen. Status colors only mark state." mode={mode}>
          <div className="swatches">
            {Object.entries(tokens.color).map(([k, v]) => (
              <div className="swatch" key={k}>
                <span className="swatch-chip" style={{ background: `var(--color-${k.replace(/\//g, "-")})` }} />
                <span className="swatch-name">{k}</span>
                <span className="swatch-hex">
                  {hex(v.light)} / {hex(v.dark)}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="typography" title="Typography" lede="Geist, light at large sizes like Stripe, regular in the interface like Ramp. Geist Mono for every number." mode={mode}>
          <div className="type-specimen">
            {Object.entries(tokens.type).map(([k, v]) => (
              <div className="type-row" key={k}>
                <span className="type-meta">
                  {k} · {v.size}/{v.line} · {v.weight}
                </span>
                <span className={`type-sample t-${k}`}>{k === "money" ? "$36,876.40" : "Settle the night"}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section id="money" title="Money" lede="Dollars full size, cents smaller and raised, always tabular so columns line up. Negative uses a true minus." mode={mode}>
          <div className="money-specimen">
            <span className="money-xl">
              <Money value={36876.4} />
            </span>
            <span>
              <Money value={-9576} />
            </span>
            <span>
              <Money value={700} sign />
            </span>
          </div>
        </Section>

        <Section id="space" title="Space and radius" lede="A 4px base. Radius stays small: 6 for controls, 10 for panels, full only for status." mode={mode}>
          <div className="scale">
            {Object.entries(tokens.space).map(([k, v]) => (
              <div className="scale-row" key={k}>
                <span className="scale-name">space/{k}</span>
                <span className="scale-bar" style={{ width: v }} />
                <span className="scale-val">{v}px</span>
              </div>
            ))}
            <div className="radius-row">
              {Object.entries(tokens.radius).map(([k, v]) => (
                <div className="radius-item" key={k}>
                  <span className="radius-box" style={{ borderRadius: Math.min(v, 28) }} />
                  <span className="scale-name">
                    radius/{k} · {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Section>

        <Section id="lines" title="Borders and elevation" lede="Hairlines separate. Surfaces step from canvas to surface to sunken. Shadows exist only on overlays." mode={mode}>
          <div className="elev">
            <div className="elev-item elev-canvas">canvas</div>
            <div className="elev-item elev-surface">surface</div>
            <div className="elev-item elev-sunken">sunken</div>
            <div className="elev-item elev-overlay">overlay</div>
          </div>
        </Section>

        <Section id="motion" title="Motion" lede="120ms for controls, 200ms for panels, 320ms for a sheet settling. Reduced motion turns all of it into instant changes." mode={mode}>
          <div className="motion-demo">
            <span className="motion-dot" />
            <span className="motion-meta">ease {tokens.motion.ease}</span>
          </div>
        </Section>

        <Section id="voice" title="Voice" lede="Say what happened, name the person and the number. Never cheer." mode={mode}>
          <div className="voice">
            <div className="voice-col">
              <span className="voice-label">Write</span>
              <p>One line waits on you.</p>
              <p>Kept the $4,200 charge. M. Carter, 11:52 pm.</p>
              <p>Nothing posts until you answer.</p>
            </div>
            <div className="voice-col voice-no">
              <span className="voice-label">Not</span>
              <p>Great news! Your settlement is almost ready 🎉</p>
              <p>AI-powered insights detected an anomaly.</p>
              <p>Are you sure?</p>
            </div>
          </div>
        </Section>

        <Section id="anti-slop" title="Anti-slop" lede="Things this system never does, so the product never looks generated." mode={mode}>
          <ul className="rules">
            <li>No gradients, glows or sparkle icons for AI. The agent is black and white like the ledger.</li>
            <li>No second accent. If two things are colored, one of them is wrong.</li>
            <li>No number without a source. If the agent can't cite it, it shows as held.</li>
            <li>No shadows on cards. Hairlines and surface steps only.</li>
            <li>No centered marketing layouts inside the product.</li>
          </ul>
        </Section>

        <Section id="button" title="Button" lede="Primary is ink. Decide is the only colored button and appears once per screen." mode={mode}>
          <div className="row-wrap">
            <Button kind="primary">Approve rule</Button>
            <Button kind="decide">Keep the charge</Button>
            <Button kind="secondary">Cap it at $3,500</Button>
            <Button kind="quiet">Ask the tour manager</Button>
          </div>
        </Section>

        <Section id="status" title="Status" lede="Five states, each with an icon so color is never the only signal." mode={mode}>
          <div className="row-wrap">
            <Status kind="cleared">Cleared</Status>
            <Status kind="held">Held</Status>
            <Status kind="disputed">Disputed</Status>
            <Status kind="needs">Needs you</Status>
            <Status kind="agent">Agent working</Status>
          </div>
        </Section>

        <Section id="citation" title="Citation" lede="The source of a number, small enough to sit under it and specific enough to open." mode={mode}>
          <div className="row-wrap">
            <Citation icon="doc" source="Contract §7.2" detail="cap $3,500" />
            <Citation icon="bank" source="Bank, Oct 24" detail="deposit $58,824.00" />
            <Citation icon="ticket" source="Ticketing" detail="1,912 scans" />
          </div>
        </Section>

        <Section id="actor" title="Actor" lede="Who set this value: the agent, a rule or a person." mode={mode}>
          <div className="row-wrap">
            <Actor kind="agent" name="Agent" />
            <Actor kind="rule" name="Deal §5" />
            <Actor kind="person" name="M. Carter" />
          </div>
        </Section>
      </main>

      <aside className="rail" aria-label="On this page">
        <div className="rail-block">
          <p className="rail-heading">On this page</p>
          {ON_PAGE.map((id) => (
            <a key={id} href={`#${id}`} className={`rail-link${active === id ? " is-active" : ""}`}>
              {LABEL[id]}
            </a>
          ))}
        </div>
        <div className="rail-block">
          <p className="rail-heading">Install</p>
          <p className="rail-note">For your coding agent</p>
          <button type="button" className="rail-button" onClick={copyPrompt}>
            <Icon name={copied ? "check" : "download"} />
            {copied ? "Copied" : "Copy prompt"}
          </button>
        </div>
        <div className="rail-block">
          <p className="rail-heading">Source</p>
          <a className="rail-link" href="https://github.com/Rahuchpred/cal-hacks" target="_blank" rel="noreferrer">
            GitHub
          </a>
          <a className="rail-link" href="https://www.figma.com/design/j5FmqSGsD6uUaGOeOq06GP" target="_blank" rel="noreferrer">
            Figma file
          </a>
        </div>
        <div className="rail-block">
          <p className="rail-heading">Made at</p>
          <p className="rail-note">Cal Hacks 13.0</p>
        </div>
      </aside>

      <div className="toolbar" role="toolbar" aria-label="View">
        <button type="button" className={`tool${mode === "human" ? " is-on" : ""}`} onClick={() => setMode("human")} aria-pressed={mode === "human"}>
          Human
        </button>
        <button type="button" className={`tool${mode === "agent" ? " is-on" : ""}`} onClick={() => setMode("agent")} aria-pressed={mode === "agent"}>
          Agent
        </button>
        <span className="tool-sep" />
        <button type="button" className="tool" onClick={toggleTheme}>
          <Icon name="sun" /> Theme
        </button>
        <span className="tool-sep" />
        <button type="button" className="tool" onClick={copyPrompt}>
          <Icon name={copied ? "check" : "download"} /> {copied ? "Copied" : "Install"}
        </button>
      </div>
    </div>
  );
}
