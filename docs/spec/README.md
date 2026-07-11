# docent — build-ready product spec

**docent** is an interactive, local-first tool for reviewing code changes — especially agent-authored ones — on local git branches. `npx docent` spawns a local server and opens a browser UI over three tabbed pillars: **Diff review**, **Code walkthrough**, and **Product walkthrough**, with deep agent integration throughout.

This directory is the build-ready spec: every cross-cutting decision is resolved and the domain model and data schemas are pinned, so an implementer — agent or human — can build without further design. It consolidates the resolutions of the [product-spec wayfinder map](https://github.com/angusfretwell/docent/issues/1); each claim in these documents links back to the issue that decided it. The ubiquitous language lives in [`CONTEXT.md`](../../CONTEXT.md) at the repo root — read it first.

## Shape of the product

- **Solo, local-first.** No backend, auth, or sync. All review state persists as plain, self-describing files under `.docent/` in the repo (gitignored). The filesystem is the interface: agents read and write the files directly; docent renders and optionally validates, but never gates.
- **Local-branch-centric.** v1's sole input is a local git branch checked out in the repo. There is no GitHub integration — no PR input, no API reads. (A PR returns later as additive _provenance_ on a Change, never identity.)
- **docent is inert.** The human drives their agent in their own session (e.g. Claude Code); docent is a renderer over the shared `.docent/` filesystem, never an agent runtime. It ships skills, renders live, and lets the human write Findings the agent then reads.

## Documents

| Document | Owns |
| --- | --- |
| [data-model.md](data-model.md) | The core entities — Review, Change, Finding — and their schemas; the canonical `.docent/` layout; the anchor union; drift; the what's-next state machine. The schema appendix of record for the core model. |
| [architecture.md](architecture.md) | The app shell: Bun-native local server, the `server/client/skills/shared` layout, the React client stack (TanStack Query, nuqs, Tailwind + Base UI + coss/ui, react-markdown) served by Bun's fullstack bundler, HTTP file API + SSE live-reload, packaging and delivery (`npx docent`). |
| [diff-review.md](diff-review.md) | The Diff tab: @pierre/diffs rendering, virtualized review surface, nav tree, mark-as-viewed, context expansion, the Pending entry, the Findings panel. |
| [walkthroughs.md](walkthroughs.md) | The Code and Product walkthrough pillars: the unified walkthrough schema, sections and ranges, captures and annotations, the capture pipeline (agent-browser + rrweb), staleness and regeneration. The schema appendix of record for walkthroughs. |
| [agent-integration.md](agent-integration.md) | The human↔agent review loop: the findings queue, roles-not-actors, the skills catalogue (`/to-docent`, `/address`, `/docent` + reference skills), the docent CLI, serving the app under review. |
| [testing.md](testing.md) | The test strategy: testable-by-inertness, the skill-over-tested-engine seam, `docent validate` as oracle, engine-generated fixtures, the four deterministic tiers (unit / contract / skill↔CLI lint / Playwright E2E), and why CI runs no live agent. |

## Schema index

Every on-disk schema, stated once in its owning document:

| Schema | Shape | Owned by |
| --- | --- | --- |
| `docent/review@4` | `review.json` — per-branch file of record | [data-model.md](data-model.md) |
| `docent/change@3` | `changes/chg_NNN.json` — immutable diff snapshot | [data-model.md](data-model.md) |
| `docent/finding@3` | `findings/fnd_*/NNN-*.md` — Finding records (anchors, dispositions, drift inputs) | [data-model.md](data-model.md) |
| `docent/walkthrough@2` | `walkthroughs/{code,product}/wlk_*/manifest.json` — unified, `kind: code \| product` | [walkthroughs.md](walkthroughs.md) |
| `docent/walkthrough-section@2` | section files — prose interleaved with ranges (code) or captures (product) | [walkthroughs.md](walkthroughs.md) |

## Out of scope for v1

Ruled out by the map, with the seams that let them return: GitHub PR input and posting back to GitHub (seam: an additive provenance field on Change), CI / non-interactive use, IDE extensions, non-git VCS, branch terminal-status signals, and Change time-travel. See the [map's Out of scope](https://github.com/angusfretwell/docent/issues/1) for the full rationale.
