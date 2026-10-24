# Tokens

Generated into CSS variables by `design-system/scripts/build-tokens.mjs`. Figma variables use the same names with `/` instead of `-`.

## Color (light / dark)

| Token | Use |
|---|---|
| `--color-bg-canvas` | Page and card background |
| `--color-bg-surface` | Raised areas, previews, side nav selection |
| `--color-bg-sunken` | Inset panels, counterparty messages |
| `--color-text-primary` | Body text and numbers |
| `--color-text-secondary` | Labels, meta, sources |
| `--color-text-tertiary` | Timestamps and footnotes only |
| `--color-text-inverse` | Text on `action-primary` |
| `--color-border-default` | Hairlines |
| `--color-border-strong` | Totals, secondary button outline |
| `--color-action-primary` | Ink button |
| `--color-action-decide` | The one decision on screen |
| `--color-action-decide-soft` | Background of the "Needs you" status |
| `--color-text-decide` | Text on `decide-soft` |
| `--color-status-cleared[-soft]` | Matched, cleared, paid |
| `--color-status-held[-soft]` | Waiting on a source or a person |
| `--color-status-disputed[-soft]` | A counterparty disagrees |

Status colors always come with an icon. Color is never the only signal.

## Type

Family Geist by default (each theme swaps it). Numbers use the same sans with tabular figures. Geist Mono only for IDs, keys, paths and code, at 0.8 of the text around it. Scale (size/line, weight):
display 56/60 300, title 40/44 300, heading 28/34 400, subheading 20/26 500, body-lg 17/26, body 15/22, small 13/18, label 12/16 500.
Large type is light with negative tracking. Interface type is regular.

## Space and shape

Space: 2, 4, 8, 12, 16, 24, 32, 48, 64, 96 (`--space-2xs` to `--space-5xl`).
Radius: `--radius-control` and `--radius-panel` come from the theme (Settle 6/10, Ramp 6/8, Stripe 4/8, Mercury pill/12). Status pills are full.
Borders: 1px hairlines. No shadows: overlays lift with a 1px ring.

## Motion

120ms buttons, 200ms panels, 320ms sheets, easing `--motion-ease`. Under `prefers-reduced-motion` there are no transitions.

## Themes

Set `data-brand` on `<html>`: `ramp`, `stripe` or `mercury` (none means Settle). Each theme has light and dark values scraped from the company's site with context.dev (see `research/brands/`). Their fonts are licensed, so free stand-ins are used:

| Theme | Accent | Font (stands in for) | Radius control/panel | Heading weight |
|---|---|---|---|---|
| Settle | #4b4cf0 | Geist | 6 / 10 | 300 |
| Ramp | #e4f222 with dark text | Inter (Lausanne) | 6 / 8 | 400 |
| Stripe | #533afd | Geist (Sohne) | 4 / 8 | 300 |
| Mercury | #5266eb | Instrument Sans (Arcadia) | pill / 12 | 480 |
