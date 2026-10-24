import { useState } from "react";
import { Actor, Button, ButtonGroup, Chip, CopyButton, Field, Icon, Input, Money, Ref, Segmented, Source, Status, Switch, Tabs, Textarea } from "../components";
import { BRANDS, PageDef, Preview, Table } from "../doc";
import tokens from "../tokens/tokens.json";

/* ---------- Actions ---------- */
function ThemeRow() {
  return (
    <div className="brand-grid">
      {BRANDS.map((k) => (
        <div className="brand-sample" data-brand={k} key={k}>
          <span className="brand-sample-name">{tokens.brands[k].label}</span>
          <div className="brand-sample-row">
            <Button kind="decide" size="sm">
              Keep the charge
            </Button>
          </div>
          <div className="brand-sample-row">
            <Button kind="reject" size="sm">
              Decline
            </Button>
            <Button kind="accept" size="sm">
              Release
            </Button>
          </div>
          <div className="brand-sample-row">
            <Button kind="primary" size="sm">
              Approve rule
            </Button>
            <Status kind="needs">Needs you</Status>
          </div>
        </div>
      ))}
    </div>
  );
}

const button: PageDef = {
  id: "button",
  group: "Actions",
  title: "Button",
  lede: "The button you press next is crafted in the theme's material. Approve and decline pairs use the same material in green and coral. Everything else is flat.",
  agent: `# Button
kinds: decide, accept, reject (crafted), primary (lacquered ink), secondary (hairline), quiet (text).
sizes: sm 32px, md 40px. States: held, pending, disabled.
- One crafted button per screen, or one accept and reject pair.
- The label says what happens: "Release $36,876", not "Submit".
- Icon-only buttons get an aria-label.`,
  sections: [
    {
      id: "kinds",
      title: "Kinds",
      body: (
        <Preview wide>
          <div className="row-wrap">
            <Button kind="decide">Keep the charge</Button>
            <Button kind="reject">Decline</Button>
            <Button kind="accept">Release</Button>
            <Button kind="primary">Approve rule</Button>
            <Button kind="secondary">Cap it at $3,500</Button>
            <Button kind="quiet">Not now</Button>
          </div>
        </Preview>
      ),
    },
    { id: "themes", title: "In every theme", body: <ThemeRow /> },
    {
      id: "sizes",
      title: "Sizes and icons",
      body: (
        <Preview>
          <div className="row-wrap">
            <Button kind="decide" size="sm">
              Small
            </Button>
            <Button kind="decide">Medium</Button>
            <Button kind="secondary" icon="download">
              Export sheet
            </Button>
            <Button kind="secondary" icon="retry" size="sm">
              Rerun
            </Button>
          </div>
        </Preview>
      ),
    },
    {
      id: "states",
      title: "States",
      body: (
        <Preview>
          <div className="press-grid">
            <div className="press-item">
              <Button kind="decide" size="sm">
                Keep
              </Button>
              <span className="t-tertiary">rest</span>
            </div>
            <div className="press-item">
              <Button kind="decide" size="sm" held>
                Keep
              </Button>
              <span className="t-tertiary">held</span>
            </div>
            <div className="press-item">
              <Button kind="decide" size="sm" pending>
                Keep
              </Button>
              <span className="t-tertiary">pending</span>
            </div>
            <div className="press-item">
              <Button kind="decide" size="sm" disabled>
                Keep
              </Button>
              <span className="t-tertiary">disabled</span>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "use",
      title: "When to use which",
      body: (
        <Table
          head={["Kind", "Use"]}
          code={[0]}
          rows={[
            ["decide", "The one action the screen exists for"],
            ["accept", "Approve, release, keep, in a pair with reject"],
            ["reject", "Decline, revoke, hold back"],
            ["primary", "A strong action that is not the next one"],
            ["secondary", "An alternative choice"],
            ["quiet", "Not now, cancel, dismiss"],
          ]}
        />
      ),
    },
  ],
};

const buttonGroup: PageDef = {
  id: "button-group",
  group: "Actions",
  title: "Button group",
  lede: "Related flat actions joined on one edge. Never a crafted button inside a group.",
  agent: `# Button group
- 2 to 4 secondary buttons that act on the same thing, joined with shared hairlines.
- Radius only on the outer corners.`,
  sections: [
    {
      id: "example",
      title: "Example",
      body: (
        <Preview>
          <ButtonGroup label="Sheet actions">
            <Button kind="secondary" size="sm" icon="retry">
              Rerun
            </Button>
            <Button kind="secondary" size="sm" icon="copy">
              Duplicate
            </Button>
            <Button kind="secondary" size="sm" icon="download">
              Export
            </Button>
          </ButtonGroup>
        </Preview>
      ),
    },
  ],
};

const toolbar: PageDef = {
  id: "toolbar",
  group: "Actions",
  title: "Toolbar",
  lede: "A floating row of quiet tools with hairline separators. The selected tool sits on the surface color.",
  agent: `# Toolbar
- Canvas background with a 1px ring, radius 10.
- Tools are quiet buttons; the selected one uses bg/surface.
- Separators are 1px border/default, 20px tall.`,
  sections: [
    {
      id: "example",
      title: "Example",
      body: (
        <Preview>
          <div className="toolbar-inline" role="toolbar" aria-label="Sheet view">
            <button type="button" className="tool is-on">
              Sheet
            </button>
            <button type="button" className="tool">
              Log
            </button>
            <span className="tool-sep" />
            <button type="button" className="tool">
              <Icon name="filter" /> Filter
            </button>
            <button type="button" className="tool">
              <Icon name="download" /> Export
            </button>
          </div>
        </Preview>
      ),
    },
  ],
};

const copyButton: PageDef = {
  id: "copy-button",
  group: "Actions",
  title: "Copy button",
  lede: "Copies an ID or a figure and says Copied for a moment.",
  agent: `# Copy button
- Secondary sm button with the copy icon. On success the icon turns to a check and the label to Copied for 1.4s.`,
  sections: [
    {
      id: "example",
      title: "Example",
      body: (
        <Preview>
          <div className="row-wrap">
            <code className="code-inline">stl_8f2a91</code>
            <CopyButton text="stl_8f2a91" label="Copy ID" />
          </div>
        </Preview>
      ),
    },
  ],
};

/* ---------- Inputs ---------- */
const field: PageDef = {
  id: "field",
  group: "Inputs",
  title: "Field",
  lede: "A label above, the control, and one line under it: a hint, or what went wrong and how to fix it.",
  agent: `# Field
- Label 13px 500 above the control. Hint or error 13px below.
- Errors say what went wrong and how to fix it, with the alert glyph, in status/disputed.`,
  sections: [
    {
      id: "states",
      title: "Hint and error",
      body: (
        <Preview>
          <div className="field-stack">
            <Field id="f-artist" label="Artist" hint="As written on the contract">
              <Input id="f-artist" defaultValue="Low Tide Choir" />
            </Field>
            <Field id="f-guarantee" label="Guarantee" error="Enter a number, like 15000">
              <Input id="f-guarantee" defaultValue="fifteen k" invalid />
            </Field>
          </div>
        </Preview>
      ),
    },
  ],
};

const input: PageDef = {
  id: "input",
  group: "Inputs",
  title: "Input",
  lede: "One line of text at control height, with an optional leading icon. The edge darkens when the cursor is in it.",
  agent: `# Input
- Height 40px, radius var(--radius-control), 1px border/strong, canvas fill.
- Focus: edge text/secondary plus the 2px focus ring.`,
  sections: [
    {
      id: "examples",
      title: "Examples",
      body: (
        <Preview>
          <div className="field-stack">
            <Field id="i-search" label="Search settlements">
              <Input id="i-search" placeholder="Artist, venue or date" icon="search" />
            </Field>
            <Field id="i-date" label="Show date">
              <Input id="i-date" defaultValue="Sat, Oct 24" icon="calendar" />
            </Field>
          </div>
        </Preview>
      ),
    },
  ],
};

const textarea: PageDef = {
  id: "textarea",
  group: "Inputs",
  title: "Textarea",
  lede: "Several lines, the same edge as an input, a panel radius.",
  agent: `# Textarea
- Radius 10, 1px border/strong, min 3 rows, resizes vertically only.`,
  sections: [
    {
      id: "example",
      title: "Example",
      body: (
        <Preview>
          <Field id="t-note" label="Note to the tour manager" hint="Sent with the settlement sheet">
            <Textarea id="t-note" defaultValue="The production line includes the Mac Aura rig you asked for on March 14." />
          </Field>
        </Preview>
      ),
    },
  ],
};

function ChipDemo() {
  const [on, setOn] = useState<string[]>(["Held"]);
  const all = ["Matched", "Held", "Disputed", "Needs you"];
  return (
    <div className="row-wrap">
      {all.map((c) => (
        <Chip key={c} selected={on.includes(c)} onClick={() => setOn(on.includes(c) ? on.filter((x) => x !== c) : [...on, c])}>
          {c}
        </Chip>
      ))}
    </div>
  );
}
const chip: PageDef = {
  id: "chip",
  group: "Inputs",
  title: "Chip",
  lede: "A filter you turn on and off. On shows a check and the surface fill.",
  agent: `# Chip
- Height 32px, radius var(--radius-control), hairline. Selected: bg/surface, border/strong, check glyph.`,
  sections: [{ id: "example", title: "Example", body: <Preview><ChipDemo /></Preview> }],
};

function SegmentedDemo() {
  const [v, setV] = useState("Tonight");
  return <Segmented label="Range" options={["Tonight", "This week", "Season"]} value={v} onChange={setV} />;
}
const segmented: PageDef = {
  id: "segmented-control",
  group: "Inputs",
  title: "Segmented control",
  lede: "Two to four choices in one track. The choice switches in place.",
  agent: `# Segmented control
- Track bg/sunken, radius control. Selected segment: canvas with a 1px ring. No sliding thumb.`,
  sections: [{ id: "example", title: "Example", body: <Preview><SegmentedDemo /></Preview> }],
};

function TabsDemo() {
  const [v, setV] = useState("Sheet");
  return (
    <div className="tabs-demo">
      <Tabs label="Settlement" tabs={["Sheet", "Sources", "Log"]} value={v} onChange={setV} />
      <p className="t-secondary">
        {v === "Sheet" ? "Five lines, net $43,384." : v === "Sources" ? "Contract, bank deposit, ticketing report." : "Four entries since 11:41 pm."}
      </p>
    </div>
  );
}
const tabs: PageDef = {
  id: "tabs",
  group: "Inputs",
  title: "Tabs",
  lede: "Views of the same thing. The selected tab is ink with a hairline under it.",
  agent: `# Tabs
- Text tabs on a border/default rule. Selected: text/primary with a 2px text/primary line under it. No sliding indicator.`,
  sections: [{ id: "example", title: "Example", body: <Preview><TabsDemo /></Preview> }],
};

function SwitchDemo() {
  const [a, setA] = useState(true);
  const [b, setB] = useState(false);
  return (
    <div className="field-stack">
      <Switch id="s-auto" label="Settle cleared lines on their own" checked={a} onChange={setA} />
      <Switch id="s-email" label="Email the tour manager the sheet" checked={b} onChange={setB} />
    </div>
  );
}
const switchPage: PageDef = {
  id: "switch",
  group: "Inputs",
  title: "Switch",
  lede: "On or off, applied at once. On uses the theme color.",
  agent: `# Switch
- 36x20 track, full radius. Off: bg/sunken with border/strong. On: action/decide. The thumb changes side instantly.`,
  sections: [{ id: "example", title: "Example", body: <Preview><SwitchDemo /></Preview> }],
};

/* ---------- Display ---------- */
const status: PageDef = {
  id: "status",
  group: "Display",
  title: "Status",
  lede: "Each theme draws state its own way: Navy a glyph and a word, Ramp a square tag, Stripe a tinted pill with the icon after, Mercury an outlined pill, Zuzu a word over an underline.",
  agent: `# Status
kinds: cleared, held, disputed, needs, agent. The theme decides the shape. Color is never the only signal.`,
  sections: [
    {
      id: "kinds",
      title: "Kinds",
      body: (
        <Preview>
          <div className="row-wrap">
            <Status kind="cleared">Cleared</Status>
            <Status kind="held">Held</Status>
            <Status kind="disputed">Disputed</Status>
            <Status kind="needs">Needs you</Status>
            <Status kind="agent">Agent working</Status>
          </div>
        </Preview>
      ),
    },
    {
      id: "themes",
      title: "In every theme",
      body: (
        <div className="brand-grid">
          {BRANDS.map((k) => (
            <div className="brand-sample" data-brand={k} key={k}>
              <span className="brand-sample-name">{tokens.brands[k].label}</span>
              <div className="brand-sample-row">
                <Status kind="cleared">Cleared</Status>
                <Status kind="disputed">Disputed</Status>
                <Status kind="needs">Needs you</Status>
              </div>
            </div>
          ))}
        </div>
      ),
    },
  ],
};

const citation: PageDef = {
  id: "citation",
  group: "Display",
  title: "Citation",
  lede: "A small number after a claim points to a numbered source listed under the text.",
  agent: `# Citation
- <Ref n /> after the claim, <Source n source detail /> rows under a hairline.`,
  sections: [
    {
      id: "example",
      title: "Example",
      body: (
        <Preview>
          <p className="escalation-message">
            The bank deposit was <Money value={58824} cents={false} />
            <Ref n={1} />, which matches 1,912 scans
            <Ref n={2} /> after card fees.
          </p>
          <ol className="sources">
            <Source n={1} source="Bank, Oct 24" detail="Deposit $58,824.00" />
            <Source n={2} source="Ticketing report" detail="1,912 scans at doors" />
          </ol>
        </Preview>
      ),
    },
  ],
};

const actor: PageDef = {
  id: "actor",
  group: "Display",
  title: "Actor",
  lede: "Who set a value: the agent, a rule or a person.",
  agent: `# Actor
kinds: agent, rule, person. Icon and name, 13px.`,
  sections: [
    {
      id: "kinds",
      title: "Kinds",
      body: (
        <Preview>
          <div className="row-wrap">
            <Actor kind="agent" name="Agent" />
            <Actor kind="rule" name="Deal §5" />
            <Actor kind="person" name="M. Carter" />
          </div>
        </Preview>
      ),
    },
  ],
};

export const ACTIONS: PageDef[] = [button, buttonGroup, toolbar, copyButton];
export const INPUTS: PageDef[] = [field, input, textarea, chip, segmented, tabs, switchPage];
export const DISPLAY: PageDef[] = [status, citation, actor];
