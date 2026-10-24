---
name: settle-design
description: Settle's design system for show settlement UI. Use whenever building or editing any screen, component, email or slide for Settle, including escalations ("needs your OK"), settlement sheets, disputes, policy diffs and agent logs. Covers tokens, money formatting, components, patterns, voice and what never to do.
---

# Settle design system

Ink and paper for money. Color appears only where a person has to decide.

Settle runs show settlement for concert promoters. Agents do the counting, people make the calls. Every screen keeps those two visibly different: agent work is black and white with a source on every number, and the one thing waiting on a person is the only thing in color.

## Before writing UI

1. Import `design-system/src/tokens/tokens.css`. Use only its variables. Never write a hex value, a px spacing value or a font name in a component.
2. Read `references/patterns.md` for the screen you are building.
3. Check the screen against `references/anti-slop.md` before you finish.

## The five rules

1. **One decision, one color.** `--color-action-decide` appears on at most one button per screen and on the escalation edge. Everything else is ink, paper and hairlines.
2. **Every number has a source.** Show a Citation (row, rule, document or person). If there is no source, the value is Held.
3. **Every value has an actor.** Agent, rule or person. Show it in tables and logs.
4. **Money is a component.** Render all amounts with `<Money />`: tabular digits, small raised cents, a true minus sign.
5. **Say what happened.** Past tense for agent work, a direct question when a person must answer, a name and a number in every sentence that matters.

## Files

| File | What it covers |
|---|---|
| `references/tokens.md` | Color, type, space, radius, elevation, motion and how to use them |
| `references/components.md` | Button, Status, Citation, Actor, Money, Confidence |
| `references/patterns.md` | Tonight, Needs your OK, Settlement sheet, Dispute, Answer becomes policy, Agent log |
| `references/voice.md` | How Settle writes |
| `references/anti-slop.md` | What Settle never does |

Source of truth for every value: `design-system/src/tokens/tokens.json`. The Figma file uses the same names as variables.
