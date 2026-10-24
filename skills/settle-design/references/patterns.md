# Patterns

Each pattern is live on the docs site (`npm --prefix design-system run dev`) and drawn in the Figma Screens page.

## Tonight
- One sentence first: what happened, what time, how many things wait.
- Then a list of at most 5 rows. Each row: plain label left, Status right.
- Footer: date · venue · capacity on the left, one decide Button on the right.
- Only the row that needs a person uses Status kind="needs".

## Needs your OK
- The decide button is the only thing on screen in --color-action-decide. No colored edge bar on the card.
- Head: Status kind="needs" + "Routed to <name>, <role>".
- Title is a yes/no question that contains the amount.
- Body explains the conflict between sources in two sentences.
- Evidence: 2 to 4 Citations, each with source + short detail.
- Confidence: percent + reason ("no precedent", "two sources disagree").
- Actions: exactly one decide Button, then secondary, then quiet.
- Foot: "Nothing posts until you answer."

## Settlement sheet
- Columns: Line | Source | Set by | Amount (right aligned, Money).
- Every row has a Source icon + name and an Actor.
- A flagged row gets a pressed wash: background --color-action-decide-soft. Never a colored bar on one edge.
- Totals use a top border of --color-border-strong and weight 500.
- Amounts use sans with tabular figures, never mono.

## Dispute
- Counterparty message: bg-sunken, name + role above.
- Agent reply: canvas with hairline border, Icon "agent" + "Settle agent".
- The reply must cite at least one source. Never apologize, never concede without a source.
- Actions under the thread: secondary "Send", quiet "Escalate to <controller>".

## Answer becomes policy
- Show the rule change as a diff: removed lines in status-disputed, added lines in status-cleared, both on their soft backgrounds.
- Head: file path left, "v<n> · proposed by agent" right.
- Foot: who approves (Actor person) + primary Button "Approve rule".

## Agent log
- Ordered list. Each row: time (mono, tertiary) | what happened (sentence) | Actor.
- Past tense, specific numbers: "Matched 1,912 scans", not "Processed data".
