# Components

Code: `design-system/src/components.tsx`. Figma: the Components page.

## Button
`kind`: `primary` (ink), `decide` (signal, once per screen), `secondary` (hairline), `quiet` (text). `size`: `sm` 32px, `md` 40px. Label is a verb phrase that says exactly what happens ("Keep the charge", not "Submit").

## Status
`kind`: `cleared`, `held`, `disputed`, `needs`, `agent`. Pill, soft background, icon plus a one or two word label.

## Citation
Icon, source (weight 500), detail (secondary). Sits under or beside the number it explains. Wraps to two lines on phones.

## Actor
`kind`: `agent`, `rule`, `person` plus a name. Shows who set a value.

## Money
`<Money value={-9576} />` renders `−$9,576.00` with tabular digits and cents at 0.72em raised 0.28em. Sans with tabular figures everywhere, never mono.

## Confidence
A 96px bar plus `62% · reason`. The reason is required. Only shown on escalations.
