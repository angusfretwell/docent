---
status: accepted
---

# The `/docent` run is an orchestrator with phase subagents

`skills/docent/SKILL.md` stops being the agent that does the work and becomes the agent that decides and reports. It keeps the capability gate, the preflight, the per-walkthrough decision, the serve-and-open step, and every sentence addressed to the human. The work moves into four subagents — a code-walkthrough author, a capture planner, a capture executor, and a product-walkthrough author — each of which loads its own reference file, holds its own context, and returns a structured receipt rather than prose.

## Context

A `/docent` run is one agent in one context that reads the whole diff, drives a browser through the app, then authors both walkthroughs. Context grows monotonically and never sheds: the diff is read once but re-priced against every token that follows it, and the accessibility-tree snapshots that capture emits — the largest single consumer in the run — are still sitting in context when the product walkthrough's prose is written. The two most expensive judgment passes, selecting diff ranges and deciding which screens to shoot, run one after the other despite depending on nothing but the diff.

Four problems trace back to that single shared context. It is expensive and slow. An agent holding the full diff drifts into reviewing the change rather than describing it — the review loop is a separate flow ([comments.md](../../skills/docent/reference/comments.md)), but a prohibition does not stop the impulse, it only redirects it into the prose. Prose authored in a context crowded with snapshots and hunks comes out list-shaped and evaluative. And the run's own vocabulary had drifted from the product's: the skill used `pillar` 42 times as its primary organising noun for an axis the UI names "Code walkthrough" and "Product walkthrough", and which `CONTEXT.md` already carried on its avoid list.

## Decision

- **The seam test is: split where the intermediate artifact carries its own meaning and the middle step is mechanical.** A Capture passes — it is self-describing, so an author can narrate a screen it did not shoot, and driving the app to a named state is mechanical. So the product walkthrough splits three ways: plan, capture, author. A list of diff ranges fails — `src/parser.ts:40-88` tells a narrator nothing, so it would re-read the diff anyway, at the cost of discarding the rationale that chose the range, which is the sentence worth writing. So the code walkthrough stays one agent that selects and narrates in the same act. The asymmetry is deliberate.

- **The capture plan is ephemeral and expressed as intent, never as steps.** A shot names a state to reach ("the export modal open with a filename entered") plus whatever hints the diff yields; how to get there is the executor's problem. A planner reading only the diff cannot know how the app actually renders, so a plan of clicks would be confidently wrong. The plan is not persisted: durable shot lists would buy consistency across Changes and human editability, but they would need their own staleness story duplicating the one walkthroughs already have.

- **Only the code-walkthrough author reads the full diff.** The planner reads `git log` and `git diff --stat` plus targeted reads of user-facing files — enough to choose screens. The product-walkthrough author reads **no diff at all**: it gets the captures plus a short intent brief carried on the planner's receipt. This is load-bearing and will look like an omission to a future reader. It is not. It keeps the largest artifact out of a context that was only using it as background, it keeps product prose product-shaped rather than a code tour with pictures, and it removes the material that invites an author to evaluate the code. Restoring the diff there would quietly undo all three.

- **Parallelism stops at the planning stage.** The code author and the capture planner run concurrently — both need only the diff, and concurrent writes are safe by construction, since `mintChange` is idempotent by `(baseSha, headSha)` and walkthrough ids are ULIDs. The executor stays single even though agent-browser offers isolated `--session` browsers: the sessions are isolated but the app is not, so parallel executors racing one dev server produce captures that record a race rather than the product. They would also re-pay login and seeding per session, and a partial failure would leave a half-populated walkthrough an author cannot distinguish from an editorial gap.

- **The executor runs on the cheapest capable model and is budgeted.** Its work is bounded and mechanical and its token volume is the highest in the run; everything else inherits the session model, because a human paying for a strong model is paying for judgment and prose. The budget is what makes this safe: three attempts per shot, then record the shot unreachable and move to the next. An unbounded cheap agent loose in a UI it cannot drive does not fail — it loops on full accessibility trees, and would cost more than the single strong agent it replaced.

- **Subagents are never framed as reviewers, and obstacles are not findings.** A brief says "here is a change, here is the voice guide, author a tour" — not "you are reviewing this branch". The one thing that travels back is an obstacle: something that made the tour **less truthful**, such as a screen that 500s so its capture is of an error state. That reaches the human through the orchestrator's closing report and never reaches `.docent/`. Opinions about the code are silent, always, however confident.

- **Voice lives in one shared `reference/voice.md`** that both authoring agents load — the mechanism by which the two tours sound like one tour, replacing the rejected option of a single author for both. It is the sibling of [comment-standards.md](../comment-standards.md) one level up, built on the same deletion test: imagine the prose gone and only the diff or the screenshot left; if the reader loses nothing, do not write it. There is no self-critique pass — a second pass over the tour regresses prose toward the safe and bland.

- **Subagents return structured receipts.** Ids, section titles, capture titles, obstacles. This is what keeps the last of the context win — a chatty subagent quietly refills the context the split just drained — and it makes the closing report a table of contents rather than a paraphrase.

- **The skill speaks only what the UI shows.** User-facing narration uses the vocabulary a docent user actually sees — code walkthrough, product walkthrough, diff, change, comment, capture, screenshot, recording — and plain English for everything else. Ids and flags remain in the skill as the tool's interface but are never spoken. Terms the skill invented for itself (`pillar`, `mint`, `reconcile`, `staleness`) are removed from its prose rather than merely left unspoken. Nothing about a first run is described as missing, empty, or stale: no walkthrough yet is a clean start, not a deficiency.

## Considered options

- **Keep one agent and tighten the prompt** — rejected: it leaves the structural cause untouched. Capture snapshots would still be in context when prose is authored, which is the thing making the prose worse and the run expensive.
- **Split the code walkthrough into a selector and a narrator** — rejected by the seam test above: two strong-model diff reads instead of one, and worse prose, because the narrator inherits a selection whose reasoning was discarded at the handoff.
- **One author for both walkthroughs, for a consistent voice** — rejected: it re-inflates the context the split just drained, blocks the code walkthrough behind capture, and makes the slowest path plan → capture → author-everything. A shared voice document buys the same consistency for nothing.
- **Persist the shot list as a durable artifact** — deferred, not refused. It would make re-runs cheap and let a reviewer compare the same screens across Changes, but its win over the ephemeral plan is consistency rather than tokens, and it needs a staleness model of its own.
- **Fan the executor out across shots** — rejected: isolated browser sessions do not isolate the app's backend.
- **Let walkthrough authors file Comments for what they notice** — rejected: it collapses the two flows the skill separates on purpose.

## Consequences

- **A subagent cannot ask the human anything**, so [capture.md](../../skills/docent/reference/capture.md)'s precedence ladder loses its bottom rung. All human contact and the authoring of `.docent/capture.md` move to the orchestrator's preflight; the executor treats the runbook as input and reports it as an obstacle when wrong. Left unchanged, this shape hangs a subagent on a question nobody can answer.
- **The reference files become standalone briefs**, each specifying its own inputs, non-goals, and return shape. The orchestrator passes its absolute base directory and the subagent reads the file itself — inlining a brief would make the orchestrator pay for it anyway.
- **The diff is read up to three times instead of once.** This is a real cost and the split only wins because context compounds: three small reads in three small contexts beat one read in one enormous one. On a very small change with a short capture the two approaches converge.
- **The run's phases are less visible**, because subagent work does not scroll past the human. The orchestrator has to narrate on their behalf: the decision up front rather than at the end, an explicit announcement before capture launches Chrome against the human's own dev server, and the receipts read back as a table of contents at the close.
- **`walkthrough create --title` has no counterpart for a shell minted by capture**, so the product author currently hand-edits `manifest.json` — the one place the skill breaks its own rule against hand-authoring walkthrough files, and the only reason that agent needs file-write access at all.
