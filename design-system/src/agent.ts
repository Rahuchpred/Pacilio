// What the Agent toggle shows: the same rules a coding agent reads in skills/settle-design.

export const INSTALL_PROMPT = `Install the Settle design system in this project.
1. Copy skills/settle-design from github.com/Rahuchpred/cal-hacks into .claude/skills/settle-design.
2. Read skills/settle-design/SKILL.md before writing any UI.
3. Import design-system/src/tokens/tokens.css and use only its variables for color, type, space, radius and motion.
4. Follow the patterns in references/patterns.md for escalations, settlement sheets and agent logs.`;

export const AGENT_NOTES: Record<string, string> = {
  tonight: `# Tonight
- One sentence first: what happened, what time, how many things wait.
- Then a list of at most 5 rows. Each row: plain label left, Status right.
- Footer: date · venue · capacity on the left, one decide Button on the right.
- Only the row that needs a person uses Status kind="needs".`,
  escalation: `# Needs your OK (follows Glaze's "Book a table")
- Head: who is asking (agent icon + "Settle agent") and, beside it, Status kind="needs" with "Waiting on <name>". Never a label above a title.
- Message: one sentence that says why it is asking, with numbered Refs to the sources. Put the confidence in words: "I'm 62% sure ... so I'm asking first."
- Facts: a hairline panel with a title and 2 to 4 key/value rows (amounts right aligned).
- Foot of the facts panel (bg-sunken): the deadline left ("Held until settlement, 11:40 pm"), two buttons right: quiet then decide.
- Sources: numbered list under a hairline, source in text-primary, detail in text-secondary.
- No confidence bar, no colored edge, no third button.`,
  sheet: `# Settlement sheet
- Columns: Line | Source | Set by | Amount (right aligned, Money).
- Every row has a Source icon + name and an Actor.
- A flagged row gets a pressed wash: background --color-action-decide-soft. Never a colored bar on one edge.
- Totals use a top border of --color-border-strong and weight 500.
- Amounts use sans with tabular figures, never mono.`,
  dispute: `# Dispute
- Counterparty message: bg-sunken, name + role above.
- Agent reply: canvas with hairline border, Icon "agent" + "Settle agent".
- The reply cites with numbered Refs. Never apologize, never concede without a source.
- Actions under the thread: secondary "Send", quiet "Escalate to <controller>".`,
  policy: `# Answer becomes policy
- Show the rule change as a diff: removed lines in status-disputed, added lines in status-cleared, both on their soft backgrounds.
- Head: file path left, "v<n> · proposed by agent" right.
- Foot: who approves (Actor person) + primary Button "Approve rule".`,
  log: `# Agent log
- Ordered list. Each row: time (mono, tertiary) | what happened (sentence) | Actor.
- Past tense, specific numbers: "Matched 1,912 scans", not "Processed data".`,
  color: `# Color
- Neutrals: bg/canvas, bg/surface, bg/sunken, text/*, border/*.
- action/primary is ink. action/decide is signal and appears once per screen.
- status/* only mark state and always pair with an icon.
- Never hardcode hex. Use var(--color-<group>-<name>).`,
  typography: `# Typography
- Family: the theme's sans. Numbers: the same sans with tabular-nums.
- Mono only for IDs, keys, paths and code, at 0.8 of the text around it.
- display/title use weight 300 and negative tracking.
- Interface text is body (15/22) or small (13/18). Labels are 12/16 weight 500.`,
  money: `# Money
- Always render through <Money value={n} />: plain, tabular figures, U+2212 minus.
- Cents in tables and facts (cents default), whole dollars in sentences (cents={false}).
- Never mono, never raised cents.`,
  space: `# Space and radius
- Use --space-* only. Base unit 4px.
- Controls radius 6, panels 10, sheets 14, status chips full.`,
  lines: `# Borders and elevation
- 1px hairlines in --color-border-default.
- No shadows anywhere. Overlays lift with a 1px ring in --color-border-default.`,
  motion: `# Motion
- fast 120ms (buttons), base 200ms (panels), slow 320ms (sheets).
- Easing --motion-ease. Under prefers-reduced-motion, no transitions.`,
  voice: `# Voice
- Name the person, the amount and the time.
- Past tense for what the agent did. Questions only when a person must answer.
- No exclamation marks, no emoji, no "AI-powered".`,
  "anti-slop": `# Anti-slop (follows Glaze, design.how)
Look
- No gradients, blobs, grids, glow or blur. Ink and paper.
- No shadow to lift a card or menu. A ring for overlays.
- No row of equal stat cards. A sentence or a table.
- No icons in tinted tiles. The heading alone.
- No colored bar on one edge. A pressed wash on the chosen row.
- No small round dot for status. A glyph and a word.
- No card in a card. Space between groups.
Words
- No small label above a title. No capitals with spaced letters.
- No emoji. No "seamless", "effortless", "supercharge".
- No mono for labels or numbers. Mono for IDs, keys, paths, code at 0.8.
- Believable names and figures, never John Doe or 1,234.
Behaviour
- No shimmer or blinking cursor on streamed text.
- No content that fades in on scroll.
Settle
- No second accent color. No number without a source.`,
  button: `# Button
kinds: decide, accept, reject (crafted), primary, secondary, quiet. sizes: sm 32px, md 40px. Radius is --radius-control.
- decide is the one crafted surface on a screen. Its recipe comes from the theme (src/buttons.css):
  Navy: Glaze's glass in navy, a cool light rising from the bottom edge, a silver-blue rim.
  Ramp: yellow foil, a bright top and a darker lip.
  Stripe: violet lacquer lit from the top left.
  Mercury: a frosted periwinkle pill with a dome of light and a lavender rim.
- primary is lacquered ink. secondary and quiet stay flat.
- Never put a crafted recipe on anything that is not the next action.
- data-accent="orange" on <html> swaps the theme color to orange in every theme; components stay the same.`,
  status: `# Status
kinds: cleared, held, disputed, needs, agent. Each theme draws it its own way:
- Settle: glyph + word, no background (Glaze). needs uses an hourglass in ink.
- Ramp: square tag (radius 4), no icon, tinted background; needs is a solid ink tag.
- Stripe: tinted 4px tag, icon first, hairline in its own color.
- Mercury: outlined pill in the state color, no icon.`,
  citation: `# Citation
Ref: a small number after the claim, linking to #source-n.
Source: numbered row under the text, source (text-primary) over detail (text-secondary).`,
  actor: `# Actor
kinds: agent, rule, person. Icon + name. Used in tables and logs to show who set a value.`,
};
