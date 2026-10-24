# Making the agent canvas easy to read

Research behind the canvas variants in `frontend/src/variants/`. The rule from the team: everything stays on one canvas, because the steps run one after another. The variants change how nodes and edges show the work, never the page.

Switch variants with the dock at the bottom of the canvas (arrows, the name menu, or keys 1 to 0). "Replay the run" (or R) plays the morning back so each variant shows the agents working.

## What the research says

### Keep it simple
- **Only show what answers the question.** Most text on a dense card is extraneous load. A node face should answer "what happened to my invoices here" and nothing else. ([NN/g, cognitive load](https://www.nngroup.com/articles/minimize-cognitive-load/))
- **About 4 chunks at a time.** Working memory holds 3 to 5 chunks (Cowan 2001). When zoomed out, the three checks should read as one "Checks" chunk. ([NN/g, chunking](https://www.nngroup.com/articles/chunking/))
- **One action per node, a recommended choice on the decision.** (Hick's law, [Laws of UX](https://lawsofux.com/hicks-law/))
- **Detail on demand, in place.** Progressive disclosure improves learnability and error rate. On a canvas, that means one lit node and one open decision at a time. ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/), [GOV.UK one thing per page](https://www.gov.uk/service-manual/design/form-structure))
- **Familiar objects beat jargon.** An envelope, a ledger page, an email card, a receipt, a parcel tracker. Say "same bill sent twice", not "dedupe". ([NN/g, recognition over recall](https://www.nngroup.com/articles/recognition-and-recall/))
- **Calm until needed.** Status should be readable in peripheral vision. Only "needs you" pulls attention to the center. ([Calm Technology](https://calmtech.com/))

### Showing the work
- **Visible effort raises value.** People value a service more when they see the work done, even if it is slower (Buell and Norton 2011). When customers and cooks could see each other, reported quality rose 22% (Buell, Kim and Tsay 2017). Show real, specific work, not spinners or fake delay.
- **Show the finished result.** Photos of completed city repairs raised trust about 14% ([Buell, Norton and Porter](https://www.informs.org/News-Room/INFORMS-Releases/News-Releases/Show-Me-Don-t-Tell-Me-Operational-Transparency-Increases-Trust-Support-of-Government)). Every step should leave something visible: the posted row, the sent email, the stopped duplicate.
- **Too much detail backfires.** Medium transparency restores trust, while full transparency can lower it (Kizilcec, CHI 2016). Step-by-step feedback distracts new users (Springer and Whittaker). Keep routine passes terse; explain only where something unexpected happened.
- **Evidence over persuasion.** Explanations make people accept AI advice whether or not it is right (Bansal et al., CHI 2021). On the approval, show the two conflicting facts side by side and say what the agent could not check.
- **Never change anything silently.** People miss large changes without a cue (change blindness). Give each new row or edited cell a one-second highlight that fades, then keep a small marker of who changed it. ([37signals yellow fade](https://signalvnoise.com/archives/000558))
- **Agents say they are agents.** Make the agent's state clear at a glance, keep its reasoning inspectable, and name the human accountable. ([Linear agent guidelines](https://linear.app/developers/aig))

### Presenting data
- **One or two numbers: just say them.** Lead with one big figure and one sentence (Knaflic).
- **Counts, not percentages.** "1 of 4 needs you" is understood far better than "25%" (Gigerenzer and Hoffrage 1995).
- **Label widths.** People misread line thickness (Cleveland and McGill), so a money-weighted edge needs its dollar amount on it.
- **Direction without arrowheads.** Tapered edges show direction better than arrowheads (Holten and van Wijk, CHI 2009).
- **Fewer crossings.** Edge crossings hurt understanding more than anything else in a diagram (Purchase 1997). Route send-back loops under the main line.
- **Stable positions.** Expanding a node should not move the others (Archambault and Purchase 2012).

### Peak and end
People remember an experience by its peak and its end. Here, the peak is the agent catching a duplicate before it is paid twice. The end is the summary.

## What we borrowed from real products (Mobbin)

- **ElevenLabs agent template:** the node is a noun, the edge is the reason, as a full sentence. ([screen](https://mobbin.com/screens/ebc17c84-6c86-44ce-9e2b-5345f71d69f1))
- **ElevenLabs Flows:** the node shows the output itself, not a description of it. ([screen](https://mobbin.com/screens/0048ee08-fb94-4655-b574-25037c0650fe))
- **n8n:** status on the node's frame, plus "5 items" counts on edges after a run. ([screen](https://mobbin.com/screens/d3af4413-04f9-4534-8aa4-01916d2b4910))
- **Twenty:** steps that did not run fade to about 40%. ([screen](https://mobbin.com/screens/e80799a2-b70a-44b8-bef2-2c6bfd819458))
- **Zapier Canvas and AirOps:** steps fold out in place, and repeated work sits in a dashed frame. ([Zapier](https://mobbin.com/screens/3bbd498a-cd4d-4ea5-a557-c0609562c093), [AirOps](https://mobbin.com/screens/ff79a5c0-07ad-4a62-b1b4-189e90c55c88))
- **OpenAI Agent Builder:** user approval is its own node type. ([screen](https://mobbin.com/screens/78a7b9aa-2cae-42fb-8600-bb6c4294c3f8))
- **Grok:** one live line while thinking, which folds to "Thoughts" when done. ([screen](https://mobbin.com/screens/bc2aecf1-1fb2-4216-901c-164499e66f4e))
- **Rox and Lemni:** the email draft fills in over skeleton lines, then waits for approval. ([Rox](https://mobbin.com/screens/749b3cd2-579f-420d-9ea6-71a3135b42c5), [Lemni](https://mobbin.com/screens/31c9c03a-dff3-4ab4-9710-b2990d13adbe))
- **Grok on X and Mercury:** inline diffs, and who set each value. ([Grok](https://mobbin.com/screens/77285694-53ac-4a67-bb93-255832d50be2), [Mercury](https://mobbin.com/screens/b6a338a6-37e9-42c2-9363-e402adb5b103))
- **Instacart and Live Activities:** a delivery tracker plus one human sentence about the worker. ([Instacart](https://mobbin.com/screens/1ea1bd7a-7b38-4ad2-8215-80154f0d81a7))
- **Miro and MagicPath:** collaborators, and an AI agent, as named cursors on the canvas. ([MagicPath](https://mobbin.com/screens/2ffdd1d5-4b5c-442d-8a25-f7dc17df0988))
- **Apollo:** an Outline and Detail toggle on the same canvas. ([screen](https://mobbin.com/screens/004995a0-1760-4014-9778-9a2c2e442ac2))

## The variants

| # | Variant | Idea | Built on |
|---|---|---|---|
| 1 | Detailed cards | The first version: every card shows everything | Baseline |
| 2 | Detailed cards, less text | Three zoom levels on one canvas. Overview: one word and one big number per card. Cards: one line per thing, orange only on the question. Full detail: version 1's cards. A switch at the top left jumps between them, and clicking a card zooms into it | Semantic zoom from version 5, Kizilcec on medium transparency, NN/g cognitive load |
| 3 | Status rings | Status on the frame, counts on edges, popovers in place | n8n, Duolingo, glanceability |
| 4 | The real thing | Nodes show the invoice, the ledger page and the email being written | ElevenLabs Flows, Rox, change blindness |
| 5 | Zoom to read | One big number when far, a sentence in the middle, everything when near | Semantic zoom (Pad, Pad++), chunking |
| 6 | Stages and a gate | Numbered stage frames, checks that fold, an approval gate | Zapier Canvas, OpenAI approval node, staged disclosure |
| 7 | Spotlight | Light one invoice's path, quiet the rest | Furnas's degree of interest, one thing at a time |
| 8 | Separate pages | No canvas. A sidebar with Today, Invoices, Ledger, Emails and Activity, each on its own page | Deel and Remote home to-dos, Acctual and Xero tabs with counts, Airwallex bill page, PlanetScale timeline |

## Trying it without a canvas

Variant 8 tests the opposite of the team rule. It uses the same run, the same clock and the same decision, but spreads them over pages the way finance tools do. Three things keep it easy:

- **The decision is never more than one click away.** Today leads with it, and the sidebar badge shows a count on Invoices until it is answered. ([Deel](https://mobbin.com/screens/48252700-fba2-4239-82fa-f2649c89a9e6), [Remote](https://mobbin.com/screens/019eccfa-6145-48ae-a6ab-7edf699fd1aa))
- **Lists filter by state, with counts on the tabs.** Needs you, Posted, Stopped. ([Acctual](https://mobbin.com/screens/4b992650-0ce5-4fc7-9efb-8407b7ac70ac), [Xero](https://mobbin.com/screens/5c2c4985-befa-4532-b555-de989baf4281))
- **One invoice, one page.** The question and facts, the checks, the invoice itself, and a timeline on the side. Every row, log line and email links back to its invoice. ([Airwallex](https://mobbin.com/screens/589696d6-00fb-4e2c-95a2-fe94a1e3b1d2), [PlanetScale](https://mobbin.com/screens/78880fb1-c0dc-4307-a635-1fb9a0c5527e))

What it loses: you can't see the agents hand work to each other. The canvas shows that handoff on a single screen. Pages show results.
