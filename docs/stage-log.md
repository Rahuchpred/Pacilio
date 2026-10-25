# Stage log: Settle

Settle runs show settlement for concert promoters. Agents read invoices, check them and post them; a person only sees the calls the agents are unsure about.

- Figma file: https://www.figma.com/design/j5FmqSGsD6uUaGOeOq06GP (pages are numbered by stage)
- Figma Slides: https://www.figma.com/slides/e4vwifUeeOymRiDCOY6APj (built by Claude Code through the Figma MCP from this log)
- Repo: this one. Times come from git commits and Figma version history.
- Team: rahuchpred (design system, Figma, front end), AnSingh1 (SpacetimeDB backend, live canvas, Droid client). Handles from git.

Our real path was not a straight line. We started the design system in Figma, built the canvas in code because the agents' work changes every second, then brought Figma back to check the shipped screens and to prototype the decision. That loop is the workflow we would reuse.

## 1. Ideation

**Tools:** Figma Design (page "1 Ideation: pipeline map"), Mobbin, context.dev for brand research.
**Why:** a map of the six steps (sources, agent seats, controls, escalate, settle, learn) was faster to argue about on a canvas than in a doc.
**Time:** about 20 min, Friday 19:40 to 19:59, first commit to team brief (git). **Rating:** 4/5.
**Into the project:** the map became the six-step pipeline in `AGENTS.md` and the node layout of the canvas.
**Friction:** Mobbin found good finance and agent screens, but none for "agent hands a decision to a person", so that pattern came from Glaze on design.how.

## 2. Prototyping

**Tools:** Figma Design for the system; code for the canvas; then Figma prototype for the decision flow.
**Why:** tokens and components needed one source of truth for both sides. The canvas itself needed live data, so we prototyped it in code.
**Time:** Friday 21:07 to 22:26 design system and themes (git). Saturday morning, eight canvas versions in code, narrowed to one.
**Rating:** Figma for the system 5/5. Figma for a live canvas 2/5, it cannot show agents moving.
**Into the project:** `design-system/src/tokens/tokens.json` uses the same names as the Figma variables (Color, Space, Radius, Accent).
**Also:** page 5 compares four agent marks and a simpler chat layout side by side.
**Friction:** we drew a phone prototype and an A vs B theme comparison, then deleted both on Saturday because the product is web only. Dead end, kept in version history.

## 3. Handoff

**Tools:** Figma MCP (official connector) driven by Claude Code.
**Why:** after a day of code changes, Figma had drifted from the app. The MCP let the agent read the code and update Figma directly.
**Time:** about 15 min, Saturday ~11:30. **Rating:** 4/5.
**What happened:**
- Synced the Status component to the code: 4px rectangle, icon first, hairline in its own color (it was still the old round pill).
- Rebuilt the app's three views as 1440x900 frames from our components and variables, not screenshots: Overview, Cards (real size, scrolls like the canvas, controls pinned) and "Needs you, open".
- Wired a clickable prototype: the Detail filter switches Overview and Cards, clicking "Needs you" opens the card, Close card or Esc goes back.
**Friction:** the MCP has no capture-a-web-page tool in our setup, so frames were rebuilt from components. Hidden layers inside instances could not be found by search; we had to reset overrides. Saving a named version is blocked through the MCP, so a person saves the checkpoints. One script bound a radius variable where a color belonged and failed; Figma rolled it back cleanly.

## 4. Code generation

**Tools:** Claude Code writing React with the Settle agent skill (`skills/settle-design/SKILL.md`), plus the Figma and Mobbin MCPs.
**Why:** the skill holds the design rules, so generated code follows the system without us repeating them.
**Time:** Friday 20:38 to Saturday 21:49 (git). **Rating:** 4/5.
**Loop 1, Saturday ~11:30, 15 min:** Figma frames, exported through the MCP, sat next to the running app. 4 differences, all where code had moved ahead; we fixed Figma.
**Loop 2, Saturday 15:30, 10 min:** code moved first. The agent pushed the card glow to Figma as effect styles and pulled five question-card patterns from Mobbin; we kept Band.
**Loop 3, Saturday 18:40 to 22:07:** a teammate's merge broke the system in six places. The agent logged each on Figma page "6 Merge check" with file and line; we fixed them in code (78a08e0). Recheck: five fixed, one back, because a chart file added four minutes earlier reused the raw blue. The agent then rebuilt the triage view in Figma from our components.

| Figma frame | Running app |
|---|---|
| ![Figma overview](stage-log/figma-overview.png) | ![App overview](stage-log/app-overview.jpg) |
| ![Figma needs you open](stage-log/figma-needs-you-open.png) | ![App needs you open](stage-log/app-needs-you-open.jpg) |
| ![Figma cards](stage-log/figma-cards.png) | ![App cards](stage-log/app-cards.jpg) |
| ![Figma needs you glow](stage-log/figma-needs-you-glow.png) | ![App needs you glow](stage-log/app-needs-you-glow.png) |
| ![Figma triage](stage-log/figma-triage.png) | ![App triage](stage-log/app-triage.png) |

**Friction:** a variable-bound fill ignored its opacity; new auto-layout frames hid the band under a default white fill. A fix only covers the files it touched.

## Run this yourself

1. Keep tokens in one JSON file and mirror the names as Figma variables.
2. Build fast-changing UI in code. Every few hours, ask the agent to rebuild the key screens in Figma from your components through the Figma MCP.
3. Export each Figma frame and screenshot the app at the same size. List every difference, decide which side is right, fix the other.
4. Prototype only the moment a person decides, in Figma, and test it on someone outside the team.
5. After every merge, log what broke in Figma with file and line, fix it in code, then recheck the whole app, not just the files you fixed.
