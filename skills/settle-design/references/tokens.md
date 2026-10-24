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
| `--color-action-accept` | Approve, release, keep |
| `--color-action-reject` | Decline, revoke, hold back |
| `--color-status-cleared[-soft]` | Matched, cleared, paid |
| `--color-status-held[-soft]` | Waiting on a source or a person |
| `--color-status-disputed[-soft]` | A counterparty disagrees |

Status colors always come with an icon. Color is never the only signal.

## Type

Family per theme (see Themes). Numbers use the same sans with tabular figures. Geist Mono only for IDs, keys, paths and code, at 0.8 of the text around it. Scale (size/line, weight):
display 56/60 300, title 40/44 300, heading 28/34 400, subheading 20/26 500, body-lg 17/26, body 15/22, small 13/18, label 12/16 500.
Large type is light with negative tracking. Interface type is regular.

## Space and shape

Space: 2, 4, 8, 12, 16, 24, 32, 48, 64, 96 (`--space-2xs` to `--space-5xl`).
Radius: `--radius-control` and `--radius-panel` come from the theme (see Themes below).
Borders: 1px hairlines. No shadows: overlays lift with a 1px ring.

## Motion

120ms buttons, 200ms panels, 320ms sheets, easing `--motion-ease`. Under `prefers-reduced-motion` there are no transitions.

## Themes

Set `data-brand` on `<html>`: `navy` (default), `ramp`, `stripe`, `mercury` or `zuzu`. Every theme has light and dark values. Ramp, Stripe, Mercury and Zuzu (orange from whop.com) come from their sites via context.dev (`research/brands/`); Navy follows Glaze from design.how with navy ink.

| Theme | Crafted buttons | Font (stands in for) | Radius control/panel | Status |
|---|---|---|---|---|
| Navy | Glass, a cool light rising from the bottom, silver-blue rim | Geist | pill / 14 | Glyph and word |
| Ramp | Foil with a brushed grain; dark label on yellow | Inter (Lausanne) | 6 / 8 | Square tag, Needs is solid ink |
| Stripe | Lacquer lit from the top left | Geist (Sohne) | 4 / 8 | Tinted pill, icon after the word |
| Mercury | Frosted pill with a pale rim | Instrument Sans (Arcadia) | pill / 12 | Outlined pill |
| Zuzu | Glossy orange enamel with an ember and a burnt ring, labels 600 | Schibsted Grotesk (Acid Grotesk) | pill / 16 | Word over a 2px underline |

Crafted kinds: `decide` (theme color), `accept` (green) and `reject` (coral). Each theme writes one recipe in terms of `--tint` in `design-system/src/buttons.css`, so all three share the material. Nothing slides or sweeps; the only motion is a short press.
