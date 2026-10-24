# Components

Code: `design-system/src/components.tsx`. Figma: the Components page.

## Button
`kind`: `decide` (the one crafted button per screen), `accept` and `reject` (an approve and decline pair in the same material), `primary` (lacquered ink), `secondary` (hairline), `quiet` (text). `size`: `sm` 32px, `md` 40px. States: held, pending, disabled. Label says exactly what happens. Figma: `Button` for structure, `Decide` (Theme x Intent) for the crafted look.

## Inputs
Field (label, control, hint or error), Input (40px, leading icon optional), Textarea, Chip (filter toggle), Segmented control and Tabs (switch in place, nothing slides), Switch (on uses the theme color).

## Status
`kind`: `cleared`, `held`, `disputed`, `needs`, `agent`. Each theme draws it differently, like design.how's systems do: Navy a glyph and a word with no background, Ramp a square tag with no icon (needs is solid ink), Stripe a tinted 4px tag with the icon first and a hairline in its own color, Mercury an outlined pill with no icon. Figma: the `Style` property on Status.

## Ref and Source
A small number after a claim (`<Ref n={1} />`) points to a numbered `<Source>` row listed under the text, the way Glaze cites an answer.

## Actor
`kind`: `agent`, `rule`, `person` plus a name. Shows who set a value.

## Money
`<Money value={-9576} />` renders `−$9,576.00` with tabular figures. `cents={false}` for whole dollars in sentences. Never mono.

## Confidence
No meter. Say it in the sentence: "I'm 62% sure the charge stands, so I'm asking first."
