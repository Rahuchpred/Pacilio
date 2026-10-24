import tokens from "../tokens/tokens.json";
import { Button, Icon, IconName, Money, Status } from "../components";
import { contrast, PageDef, Preview, SwatchRows, Table, TokenList, tokenHex, useTheme } from "../doc";

const brandOf = () => tokens.brands;

/* ---------- Color ---------- */
function ContrastTable() {
  const { brand, orange } = useTheme();
  const pairs: [string, string, string, number][] = [
    ["text/primary", "bg/canvas", "Body text on the page", 4.5],
    ["text/secondary", "bg/surface", "Labels on a raised panel", 4.5],
    ["text/tertiary", "bg/canvas", "Timestamps and footnotes", 4.5],
    ["text/on-decide", "action/decide", "Label on the decide button", 4.5],
    ["text/decide", "action/decide-soft", "Needs you, on its tint", 4.5],
    ["status/cleared", "status/cleared-soft", "Cleared, on its tint", 4.5],
    ["status/held", "status/held-soft", "Held, on its tint", 4.5],
    ["status/disputed", "status/disputed-soft", "Disputed, on its tint", 4.5],
    ["text/inverse", "action/primary", "Label on the primary button", 4.5],
    ["border/strong", "bg/canvas", "Control edges, needs 3:1", 3],
  ];
  return (
    <Table
      head={["Pair", "Where", "Light", "Dark"]}
      rows={pairs.map(([fg, bg, where, min]) => {
        const l = contrast(tokenHex(brand, "light", fg, orange), tokenHex(brand, "light", bg, orange));
        const d = contrast(tokenHex(brand, "dark", fg, orange), tokenHex(brand, "dark", bg, orange));
        const cell = (r: number) => <span className={r >= min ? "pass" : "low"}>{r.toFixed(1)}:1</span>;
        return [<code key="p">{`${fg} on ${bg}`}</code>, where, cell(l), cell(d)];
      })}
    />
  );
}

function ValuesTable() {
  const { brand, orange } = useTheme();
  return (
    <Table
      head={["Role", "Light", "Dark"]}
      rows={Object.keys(tokens.color).map((k) => [
        <code key="k">{`--color-${k.replace(/\//g, "-")}`}</code>,
        <span className="hex" key="l">
          <span className="hex-chip" style={{ background: tokenHex(brand, "light", k, orange) }} />
          {tokenHex(brand, "light", k, orange)}
        </span>,
        <span className="hex" key="d">
          <span className="hex-chip" style={{ background: tokenHex(brand, "dark", k, orange) }} />
          {tokenHex(brand, "dark", k, orange)}
        </span>,
      ])}
    />
  );
}

const color: PageDef = {
  id: "color",
  group: "Foundations",
  title: "Color",
  lede: "Ink and paper, one theme color for the action you press next, and three state colors that only ever mark a result. The orange switch swaps the theme color in every theme.",
  agent: `# Color
- Ink and paper do the work: bg/canvas, bg/surface, bg/sunken, text/*, border/*.
- action/decide is the theme color. It appears on the one button you press next and on the Needs you status.
- action/accept and action/reject are the same material in green and coral, for approve and decline pairs.
- status/cleared, held, disputed mark results and always come with a glyph.
- Never hardcode hex. Use var(--color-<group>-<name>).`,
  sections: [
    {
      id: "ink-and-paper",
      title: "Ink and paper",
      body: (
        <SwatchRows
          items={[
            ["bg/canvas", "The page and every card"],
            ["bg/surface", "A raised area, a selected row"],
            ["bg/sunken", "An inset panel, a footer under a list"],
            ["text/primary", "Body text and numbers"],
            ["border/default", "Hairlines between rows"],
          ]}
        />
      ),
    },
    {
      id: "greys",
      title: "Greys",
      body: (
        <SwatchRows
          items={[
            ["text/secondary", "Labels, sources, meta"],
            ["text/tertiary", "Timestamps and footnotes only"],
            ["border/strong", "Control edges and totals"],
          ]}
        />
      ),
    },
    {
      id: "theme-color",
      title: "Theme color",
      body: (
        <SwatchRows
          items={[
            ["action/decide", "The one action you press next"],
            ["action/decide-soft", "Behind the Needs you status"],
            ["text/decide", "Text on decide-soft"],
          ]}
        />
      ),
    },
    {
      id: "state-colors",
      title: "Accept, reject and state",
      body: (
        <SwatchRows
          items={[
            ["action/accept", "Approve, keep, release a payment"],
            ["action/reject", "Decline, revoke, hold back money"],
            ["status/cleared", "Matched, cleared, paid"],
            ["status/held", "Waiting on a source or a person"],
            ["status/disputed", "A counterparty disagrees"],
          ]}
        />
      ),
    },
    {
      id: "text",
      title: "Text",
      body: (
        <Preview>
          <div className="text-demo">
            <p className="t-primary">Settlement agent, text/primary</p>
            <p className="t-secondary">Matches ticket scans to the bank and settles the night, text/secondary.</p>
            <p className="t-tertiary">Updated 11:41 pm, text/tertiary</p>
          </div>
        </Preview>
      ),
    },
    {
      id: "in-use",
      title: "Color in use",
      body: (
        <Preview>
          <div className="row-wrap">
            <Status kind="cleared">Matched</Status>
            <Status kind="held">Held</Status>
            <Status kind="disputed">Disputed</Status>
            <Button kind="reject" size="sm">
              Decline
            </Button>
            <Button kind="accept" size="sm">
              Release $36,876
            </Button>
          </div>
        </Preview>
      ),
    },
    { id: "contrast", title: "Contrast", body: <ContrastTable /> },
    { id: "values", title: "Light and dark values", body: <ValuesTable /> },
  ],
};

/* ---------- Typography ---------- */
function FontName() {
  const { brand } = useTheme();
  const b = brandOf()[brand] as { font: string; fontSource?: string };
  return (
    <>
      {b.font}
      {b.fontSource ? `, standing in for ${b.fontSource}` : ""}
    </>
  );
}

const typography: PageDef = {
  id: "typography",
  group: "Foundations",
  title: "Typography",
  lede: "One sans per theme for every word, the same sans with tabular figures for every number, and mono only for IDs and code at 0.8 of the text around it.",
  agent: `# Typography
- Each theme sets --font-sans. Every word uses it.
- Numbers use the same sans with font-variant-numeric: tabular-nums.
- Mono only for IDs, keys, paths and code, at 0.8 of the surrounding size.
- Large type is light or regular with negative tracking. Interface type is regular, labels 500.`,
  sections: [
    {
      id: "font",
      title: "Font",
      body: (
        <Preview>
          <div className="font-specimen">
            <p className="font-big">Settle the night</p>
            <p className="t-secondary">
              <FontName />, for every word
            </p>
            <p className="font-nums">
              0123456789 <Money value={36876.4} /> 85% 11:40 pm
            </p>
            <p className="t-secondary">
              Mono for <code className="code-inline">stl_8f2a91</code>
            </p>
          </div>
        </Preview>
      ),
    },
    {
      id: "weights",
      title: "Weights",
      body: (
        <Table
          head={["Weight", "Roles"]}
          rows={[
            ["Theme heading weight", "display, title"],
            ["400", "heading, body, small"],
            ["500", "subheading, label, button"],
            ["600", "a short strong phrase"],
          ]}
        />
      ),
    },
    {
      id: "scale",
      title: "Scale",
      body: (
        <div className="type-specimen">
          {Object.entries(tokens.type).map(([k, v]) => (
            <div className="type-row" key={k}>
              <span className="type-meta">
                {k}, {v.size}px
              </span>
              <span className={`type-sample t-${k}`}>{k === "money" ? "$36,876.40" : k === "body" || k === "small" ? "The agent matched 1,912 scans to the bank deposit." : "Settle the night"}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "classes",
      title: "Classes",
      body: <Table head={["Class", "Size", "Line", "Weight"]} code={[0]} rows={Object.entries(tokens.type).map(([k, v]) => [`t-${k}`, `${v.size}px`, `${v.line}px`, String(v.weight)])} />,
    },
    {
      id: "mono",
      title: "Mono beside sans",
      body: (
        <Preview>
          <div className="mono-demo">
            <p>
              Settlement <code className="code-full">stl_8f2a</code> held, mono at 1em
            </p>
            <p>
              Settlement <code className="code-inline">stl_8f2a</code> held, mono at 0.8em
            </p>
          </div>
        </Preview>
      ),
    },
  ],
};

/* ---------- Space ---------- */
const space: PageDef = {
  id: "space",
  group: "Foundations",
  title: "Space",
  lede: "A 4px grid, 32px and 40px controls, 52px rows.",
  agent: `# Space
- Use --space-* only, base 4px.
- Controls: sm 32px, md 40px. Rows in a list: 52px.
- Panels inset their list by 4px (the panel shell).`,
  sections: [
    {
      id: "scale",
      title: "Scale",
      body: (
        <div className="scale">
          {Object.entries(tokens.space).map(([k, v]) => (
            <div className="scale-row" key={k}>
              <code className="scale-name">--space-{k}</code>
              <span className="scale-bar" style={{ width: v }} />
              <span className="scale-val">{v}px</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "controls",
      title: "Controls and rows",
      body: (
        <Preview>
          <div className="controls-demo">
            <div className="row-wrap">
              <Button size="sm">32px</Button>
              <Button>40px</Button>
            </div>
            <div className="panel-list">
              {["Ticketing report", "Merch split", "Production charge"].map((r) => (
                <div className="panel-row" key={r}>
                  <span>{r}</span>
                  <span className="t-tertiary">52px row</span>
                </div>
              ))}
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "tokens",
      title: "Tokens",
      body: <TokenList items={[...Object.entries(tokens.space).map(([k, v]) => [`--space-${k}`, `${v}px`] as [string, string]), ["--control-sm", "32px"], ["--control", "40px"], ["--row", "52px"]]} />,
    },
  ],
};

/* ---------- Radius ---------- */
function RadiusSamples() {
  const { brand } = useTheme();
  const b = brandOf()[brand] as { radiusControl: number; radiusPanel: number };
  const items: [string, string, string][] = [
    ["Control", `${b.radiusControl === 999 ? "pill" : b.radiusControl + "px"}`, "var(--radius-control)"],
    ["Panel", `${b.radiusPanel}px`, "var(--radius-panel)"],
    ["Overlay", "10px", "var(--radius-md)"],
    ["Tag", "6px", "var(--radius-sm)"],
  ];
  return (
    <div className="radius-row">
      {items.map(([n, v, r]) => (
        <div className="radius-item" key={n}>
          <span className={`radius-box${n === "Control" ? " radius-control" : ""}`} style={{ borderRadius: r }} />
          <span>{n}</span>
          <span className="t-tertiary">{v}</span>
        </div>
      ))}
    </div>
  );
}

const radius: PageDef = {
  id: "radius",
  group: "Foundations",
  title: "Radius",
  lede: "Each theme sets two radii, one for controls and one for panels. Overlays and tags stay fixed.",
  agent: `# Radius
- Buttons, inputs, chips and segmented controls: var(--radius-control).
- Cards, lists, the facts panel, the sheet: var(--radius-panel).
- Menus and popovers 10px, tags and menu items 6px, status pills full.`,
  sections: [
    { id: "scale", title: "Scale", body: <Preview><RadiusSamples /></Preview> },
    {
      id: "use",
      title: "Where each one goes",
      body: (
        <Table
          head={["Token", "Used by"]}
          code={[0]}
          rows={[
            ["--radius-control", "button, input, select, segmented control, chip"],
            ["--radius-panel", "card, list, facts panel, settlement sheet"],
            ["--radius-md", "menu, popover, dialog, textarea"],
            ["--radius-sm", "menu item, tag in a row"],
            ["--radius-full", "status pill, switch"],
          ]}
        />
      ),
    },
    {
      id: "tokens",
      title: "Tokens",
      body: <TokenList items={[["--radius-control", "theme"], ["--radius-panel", "theme"], ...Object.entries(tokens.radius).map(([k, v]) => [`--radius-${k}`, `${v}px`] as [string, string])]} />,
    },
  ],
};

/* ---------- Borders and lines ---------- */
const borders: PageDef = {
  id: "borders-and-lines",
  group: "Foundations",
  title: "Borders and lines",
  lede: "One hairline weight, from the faint row rule to the field edge that darkens when the cursor is in it.",
  agent: `# Borders and lines
- 1px only. border/default for rows and cards, border/strong for control edges and totals.
- A field's edge goes from border/strong to text/secondary on focus, plus the 2px focus ring.
- Never a colored bar on one edge.`,
  sections: [
    {
      id: "steps",
      title: "Steps",
      body: (
        <div className="line-steps">
          {[
            ["border/default", "row rule, card edge"],
            ["border/strong", "input edge, total, secondary button"],
            ["text/secondary", "input edge with the cursor in it"],
          ].map(([t, u]) => (
            <div className="line-step" key={t}>
              <span className="line-sample" style={{ borderTopColor: `var(--color-${t.replace("/", "-")})` }} />
              <code>{t}</code>
              <span className="t-secondary">{u}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "field",
      title: "A field at rest and with the cursor",
      body: (
        <Preview>
          <div className="field-pair">
            <span className="input">
              <input aria-label="At rest" defaultValue="Low Tide Choir" readOnly />
            </span>
            <span className="input is-focus">
              <input aria-label="With the cursor" defaultValue="Low Tide Choir" readOnly />
            </span>
          </div>
        </Preview>
      ),
    },
    {
      id: "rows",
      title: "Rows in a panel",
      body: (
        <Preview>
          <div className="panel">
            <div className="panel-list">
              {["Ticketing report", "Merch split", "Production charge"].map((r) => (
                <div className="panel-row" key={r}>
                  {r}
                </div>
              ))}
            </div>
          </div>
        </Preview>
      ),
    },
  ],
};

/* ---------- Elevation ---------- */
const elevation: PageDef = {
  id: "elevation",
  group: "Foundations",
  title: "Elevation",
  lede: "No shadows on cards. Depth lives inside the button you press, and overlays lift with a ring.",
  agent: `# Elevation
- Cards and panels: a hairline, no shadow.
- Overlays (menu, popover, dialog): canvas with a 1px ring in border/strong.
- Depth only inside the crafted buttons: decide, accept, reject. Their recipe comes from the theme.`,
  sections: [
    {
      id: "levels",
      title: "Levels",
      body: (
        <Preview wide>
          <div className="elev">
            <div className="elev-card">
              <strong>Low Tide Choir</strong>
              <span className="t-secondary">Settled 11:52 pm</span>
              <span className="t-tertiary">card, hairline</span>
            </div>
            <div className="elev-menu" role="menu" aria-label="Example menu">
              <span role="menuitem">Rerun</span>
              <span role="menuitem">Duplicate</span>
              <span role="menuitem">Archive</span>
              <span className="t-tertiary">overlay, ring</span>
            </div>
            <div className="elev-dialog">
              <strong>Release the payout?</strong>
              <div className="row-wrap">
                <Button kind="quiet" size="sm">
                  Not now
                </Button>
                <Button kind="accept" size="sm">
                  Release
                </Button>
              </div>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "pressed",
      title: "Depth on what is pressed",
      body: (
        <Preview wide>
          <div className="press-grid">
            {[
              ["decide", "Keep the charge", {}],
              ["reject", "Decline", {}],
              ["accept", "Release", {}],
              ["secondary", "Not now", {}],
              ["decide", "Held", { held: true }],
              ["decide", "Disabled", { disabled: true }],
            ].map(([k, l, o], i) => (
              <div className="press-item" key={i}>
                <Button kind={k as "decide"} size="sm" {...(o as object)}>
                  {l as string}
                </Button>
                <span className="t-tertiary">{(o as { held?: boolean }).held ? "held" : (o as { disabled?: boolean }).disabled ? "disabled" : (k as string)}</span>
              </div>
            ))}
          </div>
        </Preview>
      ),
    },
  ],
};

/* ---------- Motion ---------- */
const motion: PageDef = {
  id: "motion",
  group: "Foundations",
  title: "Motion",
  lede: "A button gives a little under the finger and comes back. Panels fade. Nothing slides across the screen and nothing loops for show.",
  agent: `# Motion
- Press: scale 0.985 in 50ms, back in 120ms.
- State (hover, a field's edge, a row wash): 120ms ease-out.
- Overlay in: fade 200ms; out 120ms.
- Pending: the spinner turns, the only loop.
- No sliding thumbs, no sweeping light, no content moving left or right.
- Under prefers-reduced-motion, everything is instant.`,
  sections: [
    {
      id: "press",
      title: "The press",
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
              <span className="t-tertiary">held, 0.985</span>
            </div>
            <div className="press-item">
              <Button kind="decide" size="sm" pending>
                Keep
              </Button>
              <span className="t-tertiary">pending</span>
            </div>
          </div>
        </Preview>
      ),
    },
    {
      id: "jobs",
      title: "By job",
      body: (
        <Table
          head={["Job", "Time", "What moves"]}
          rows={[
            ["Press", "50ms in, 120ms out", "The button scales to 0.985 and its gloss dims"],
            ["State", "120ms", "Hover brightness, a field's edge, a row wash"],
            ["Overlay", "200ms in, 120ms out", "A menu or dialog fades in place"],
            ["Pending", "800ms loop", "The spinner turns"],
          ]}
        />
      ),
    },
    {
      id: "tokens",
      title: "Tokens",
      body: <TokenList items={[["--motion-fast", "120ms"], ["--motion-base", "200ms"], ["--motion-slow", "320ms"], ["--motion-ease", tokens.motion.ease], ["press scale", "0.985"]]} />,
    },
  ],
};

/* ---------- Iconography ---------- */
const ICONS: IconName[] = ["check", "clock", "hourglass", "alert", "agent", "rule", "person", "doc", "bank", "ticket", "mail", "copy", "download", "search", "filter", "calendar", "lock", "retry", "plus", "close", "arrow", "sun", "spinner"];
const iconography: PageDef = {
  id: "iconography",
  group: "Foundations",
  title: "Iconography",
  lede: "One line set on a 16px grid at 1.5 stroke, drawn for this product. 14px inside controls.",
  agent: `# Iconography
- Use <Icon name> from components.tsx. 16px grid, 1.5 stroke, round caps.
- 14px in buttons, statuses and citations; 16px elsewhere.
- Never put an icon in a tinted tile.`,
  sections: [
    {
      id: "set",
      title: "The set",
      body: (
        <div className="icon-grid">
          {ICONS.map((n) => (
            <div className="icon-cell" key={n}>
              <Icon name={n} size={20} />
              <span>{n}</span>
            </div>
          ))}
        </div>
      ),
    },
  ],
};

/* ---------- Money, Voice, Anti-slop ---------- */
const money: PageDef = {
  id: "money",
  group: "Foundations",
  title: "Money",
  lede: "Plain amounts with tabular figures so columns line up. Cents in tables and facts, whole dollars in sentences, a true minus sign.",
  agent: `# Money
- Always <Money value={n} />. cents={false} inside sentences.
- Right align in tables. Never mono.`,
  sections: [
    {
      id: "forms",
      title: "Forms",
      body: (
        <Preview>
          <div className="money-specimen">
            <span className="money-xl">
              <Money value={36876.4} />
            </span>
            <Money value={-9576} />
            <Money value={3500} cents={false} />
          </div>
        </Preview>
      ),
    },
  ],
};

const voice: PageDef = {
  id: "voice",
  group: "Foundations",
  title: "Voice",
  lede: "Say what happened, name the person and the number. Never cheer.",
  agent: `# Voice
- Name the person, the amount and the time.
- Past tense for agent work. A direct question only when a person must answer.
- No exclamation marks, no emoji, no "AI-powered".`,
  sections: [
    {
      id: "examples",
      title: "Write this, not that",
      body: (
        <Table
          head={["Write", "Not"]}
          rows={[
            ["One line waits on you.", "Great news! Your settlement is almost ready!"],
            ["Kept the $4,200 charge. M. Carter, 11:52 pm.", "Action completed successfully."],
            ["Nothing posts until you answer.", "Are you sure?"],
            ["Matched 1,912 scans to the bank.", "AI-powered insights detected an anomaly."],
          ]}
        />
      ),
    },
  ],
};

const antiSlop: PageDef = {
  id: "anti-slop",
  group: "Foundations",
  title: "Anti-slop",
  lede: "The habits of generated UI that this system avoids, and what it does instead.",
  agent: `# Anti-slop
See skills/settle-design/references/anti-slop.md. Look, words and behaviour tables apply to every theme.`,
  sections: [
    {
      id: "look",
      title: "Look",
      body: (
        <Table
          head={["Avoid", "Instead"]}
          rows={[
            ["Craft on cards, headers, badges and fields", "Craft on the button you press, flat everywhere else"],
            ["Gradients, blobs, grids, glow on surfaces", "Ink and paper"],
            ["A shadow to lift a card or a menu", "A hairline for a card, a ring for a menu"],
            ["A row of equal stat cards", "A sentence or a table"],
            ["Icons in tinted tiles", "The heading alone"],
            ["A colored bar on one edge", "A wash on the chosen row"],
            ["A small round dot for a status", "A glyph and a word"],
          ]}
        />
      ),
    },
    {
      id: "words",
      title: "Words",
      body: (
        <Table
          head={["Avoid", "Instead"]}
          rows={[
            ["A small label above a title", "The heading alone"],
            ["Capitals and spaced letters", "Sentence case"],
            ["Emoji", "Words and the icon set"],
            ["Seamless, effortless, supercharge", "What happened and when"],
            ["Mono for labels and numbers", "Tabular sans; mono for IDs and code at 0.8"],
            ["John Doe and 1,234", "Believable names and figures"],
          ]}
        />
      ),
    },
    {
      id: "behaviour",
      title: "Behaviour",
      body: (
        <Table
          head={["Avoid", "Instead"]}
          rows={[
            ["Light sweeping across a button", "A short press and nothing else"],
            ["A thumb or tab line sliding sideways", "The choice switches in place"],
            ["Content that fades in on scroll", "Content that is there"],
            ["A shimmer on streamed text", "The text as it arrives"],
          ]}
        />
      ),
    },
  ],
};

export const FOUNDATIONS: PageDef[] = [color, typography, space, radius, borders, elevation, motion, iconography, money, voice, antiSlop];
