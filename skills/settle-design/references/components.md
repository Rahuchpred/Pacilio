# Components

Code: `design-system/src/components.tsx`. Figma: the Components page.

## Button
`kind`: `primary` (ink), `decide` (signal, once per screen), `secondary` (hairline), `quiet` (text). `size`: `sm` 32px, `md` 40px. Label is a verb phrase that says exactly what happens ("Keep the charge", not "Submit").

## Status
`kind`: `cleared`, `held`, `disputed`, `needs`, `agent`. Each theme draws it differently, like design.how's systems do: Settle a glyph and a word with no background, Ramp a square tag with no icon (needs is solid ink), Stripe a tinted pill with the icon after the word, Mercury an outlined pill with no icon. Figma: the `Style` property on Status.

## Ref and Source
A small number after a claim (`<Ref n={1} />`) points to a numbered `<Source>` row listed under the text, the way Glaze cites an answer.

## Actor
`kind`: `agent`, `rule`, `person` plus a name. Shows who set a value.

## Money
`<Money value={-9576} />` renders `−$9,576.00` with tabular figures. `cents={false}` for whole dollars in sentences. Never mono.

## Confidence
No meter. Say it in the sentence: "I'm 62% sure the charge stands, so I'm asking first."
