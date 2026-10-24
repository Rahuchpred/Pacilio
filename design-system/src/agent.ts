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
  escalation: `# Needs your OK
- The only surface allowed to use --color-action-decide.
- Head: Status kind="needs" + "Routed to <name>, <role>".
- Title is a yes/no question that contains the amount.
- Body explains the conflict between sources in two sentences.
- Evidence: 2 to 4 Citations, each with source + short detail.
- Confidence: percent + reason ("no precedent", "two sources disagree").
- Actions: exactly one decide Button, then secondary, then quiet.
- Foot: "Nothing posts until you answer."`,
  sheet: `# Settlement sheet
- Columns: Line | Source | Set by | Amount (right aligned, Money).
- Every row has a Source icon + name and an Actor.
- A flagged row gets a 2px left border in --color-action-decide. Nothing else changes color.
- Totals use a top border of --color-border-strong and weight 500.`,
  dispute: `# Dispute
- Counterparty message: bg-sunken, name + role above.
- Agent reply: canvas with hairline border, Icon "agent" + "Settle agent".
- The reply must cite at least one source. Never apologize, never concede without a source.
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
- Family: Geist. Numbers: Geist Mono with tabular-nums.
- display/title use weight 300 and negative tracking.
- Interface text is body (15/22) or small (13/18). Labels are 12/16 weight 500.`,
  money: `# Money
- Always render through <Money value={n} />.
- Cents at 0.72em, raised 0.28em. Negative uses U+2212 minus.
- Right align in tables.`,
  space: `# Space and radius
- Use --space-* only. Base unit 4px.
- Controls radius 6, panels 10, sheets 14, status chips full.`,
  lines: `# Borders and elevation
- 1px hairlines in --color-border-default.
- No card shadows. --elevation-overlay only for popovers and menus.`,
  motion: `# Motion
- fast 120ms (buttons), base 200ms (panels), slow 320ms (sheets).
- Easing --motion-ease. Under prefers-reduced-motion, no transitions.`,
  voice: `# Voice
- Name the person, the amount and the time.
- Past tense for what the agent did. Questions only when a person must answer.
- No exclamation marks, no emoji, no "AI-powered".`,
  "anti-slop": `# Anti-slop
- No gradients, glows or sparkle icons for AI.
- No second accent color.
- No number without a source.
- No shadows on cards.`,
  button: `# Button
kinds: primary (ink), decide (signal, once per screen), secondary (hairline), quiet (text only)
sizes: sm 32px, md 40px. Radius 6. Label is a verb phrase that says what happens.`,
  status: `# Status
kinds: cleared, held, disputed, needs, agent. Pill radius, soft background, icon + label.`,
  citation: `# Citation
icon + source (weight 500) + detail (secondary). Fits on one line under a number.`,
  actor: `# Actor
kinds: agent, rule, person. Icon + name. Used in tables and logs to show who set a value.`,
};
