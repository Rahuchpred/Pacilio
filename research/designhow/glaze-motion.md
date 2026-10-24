[Skip to content](https://design.how/systems/glaze/foundations/motion#docs-main)

# Motion

Glass gives to 0.99 in 50ms and comes back in 200ms; an overlay comes from the control that opened it; nothing springs.

## The press

Join

rest

Join

held, --scale-press

Not now

secondary, held

JoinJoin

pending, --dur-spin

## By job

| Job | Time | Curve | What moves |
| --- | --- | --- | --- |
| Press | `--dur-glass-press 50ms` | `--ease-out` | Glass settles at --scale-press-glass in 50ms, the sheen goes and the dark centre deepens to --glass-core-held; it comes back in --dur-glass-release. A flat control settles at --scale-press in --dur-press |
| State | `--dur-state 160ms` | `--ease-out` | Hover brightness, a field's line, a row wash; a tick wipes in from its start edge (tick-draw) and goes at once; an opened section's text fades in while its height cuts |
| Overlay in | `--dur-overlay 200ms` | `--ease-out` | A menu, popover, select or tooltip fades in as it slides --overlay-shift (4px) from its trigger; a dialog fades in as it settles from --scale-overlay (0.97). One recipe, overlay-motion |
| Overlay out | `--dur-state 160ms` | `--ease-in` | It leaves the way it came, faster |
| Slide | `--dur-slide 200ms` | `--ease-out` | A selection mark moves to the new choice: the segmented thumb, the pill tab's paper; the labels crossfade |
| Pending | `--dur-spin 800ms` | `linear` | The arc turns, a loop |
| Indeterminate | `--dur-sweep 1400ms` | `linear` | A short glaze segment slides along a progress track, the other loop |

## Tokens

18 tokens

`--dur-press`

120ms

`--dur-glass-press`

50ms

`--dur-glass-release`

200ms

`--dur-state`

160ms

`--dur-overlay`

200ms

`--overlay-shift`

4px

`--scale-overlay`

0.97

`--dur-spin`

800ms

`--dur-slide`

200ms

`--dur-sweep`

1400ms

`--wait-show`

150ms

`--wait-hold`

400ms

`--stale`

0.6

`--ease-out`

cubic-bezier(0.2, 0.8, 0.2, 1)

`--ease-in`

cubic-bezier(0.4, 0, 1, 1)

`--scale-press-flat`

0.99

`--scale-press`

0.97

`--scale-press-glass`

0.99

By [Arlan Marat](https://x.com/arlanmarat)

[162](https://github.com/arla6ka/design.how 'Star design.how on GitHub, 162 stars')

Install

For your coding agent

Copy prompt

GitHub

Please star me pookie

[162](https://github.com/arla6ka/design.how 'Star design.how on GitHub, 162 stars')

Made by

[Arlan Marat](https://x.com/arlanmarat)

## A new design system every week

Leave your email before you copy the prompt.

EmailSubscribe and copyJust copy the prompt

HumanAgent

Customize

Install