# Patterns

Each pattern is live on the docs site (`npm --prefix design-system run dev`) and drawn in the Figma Screens page.

## Tonight
- One sentence first: what happened, what time, how many things wait.
- Then a list of at most 5 rows. Each row: plain label left, Status right.
- Footer: date · venue · capacity on the left, one decide Button on the right.
- Only the row that needs a person uses Status kind="needs".

## Needs your OK (follows Glaze's "Book a table")
- Head: who is asking (agent icon + "Settle agent") and, beside it, Status kind="needs" with "Waiting on <name>". Never a label above a title.
- Message: one sentence that says why it is asking, with numbered Refs to the sources. Put the confidence in words: "I'm 62% sure ... so I'm asking first."
- Facts: a hairline panel with a title and 2 to 4 key/value rows (amounts right aligned).
- Foot of the facts panel (bg-sunken): the deadline left ("Held until settlement, 11:40 pm"), two buttons right: quiet then decide.
- Sources: numbered list under a hairline, source in text-primary, detail in text-secondary.
- No confidence bar, no colored edge, no third button.

## Settlement sheet
- Columns: Line | Source | Set by | Amount (right aligned, Money).
- Every row has a Source icon + name and an Actor.
- A flagged row gets a pressed wash: background --color-action-decide-soft. Never a colored bar on one edge.
- Totals use a top border of --color-border-strong and weight 500.
- Amounts use sans with tabular figures, never mono.

## Dispute
- Counterparty message: bg-sunken, name + role above.
- Agent reply: canvas with hairline border, Icon "agent" + "Settle agent".
- The reply cites with numbered Refs. Never apologize, never concede without a source.
- Actions under the thread: secondary "Send", quiet "Escalate to <controller>".

## Answer becomes policy
- Show the rule change as a diff: removed lines in status-disputed, added lines in status-cleared, both on their soft backgrounds.
- Head: file path left, "v<n> · proposed by agent" right.
- Foot: who approves (Actor person) + primary Button "Approve rule".

## Agent log
- Ordered list. Each row: time (mono, tertiary) | what happened (sentence) | Actor.
- Past tense, specific numbers: "Matched 1,912 scans", not "Processed data".
