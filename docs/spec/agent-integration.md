# Agent integration

How agents and humans collaborate through docent: the invocation model, the actor-agnostic review loop over `.docent/`, the skills catalogue, the docent CLI, and serving the app under review. Record schemas live in [data-model.md](data-model.md); server endpoints and the watch/SSE pipeline in [architecture.md](architecture.md); walkthrough artifact schemas and capture-pipeline mechanics in [walkthroughs.md](walkthroughs.md); the reading of terms in [`CONTEXT.md`](../../CONTEXT.md).

## 1. The invocation model — docent is inert

docent never runs an agent. The human drives their agent in their **own session** (e.g. Claude Code), and docent is a renderer over the shared `.docent/` filesystem — never an agent runtime ([#2](https://github.com/angusfretwell/docent/issues/2), [#18](https://github.com/angusfretwell/docent/issues/18)). Concretely:

- **The filesystem is the interface** ([#2](https://github.com/angusfretwell/docent/issues/2)). All review state persists as plain, self-describing files under `.docent/`. Agents read and write those files directly; the `docent` binary is a renderer plus optional validating sugar over the very same files — never a gate.
- **docent ships skills; the human invokes them.** Every skill in the catalogue (§3) is a slash command the human runs in their own agent session. docent never invokes a skill ([#21](https://github.com/angusfretwell/docent/issues/21)).
- **docent renders live.** `docent serve` runs the server + UI, fs-watches every write under `.docent/`, and re-renders over SSE — no bespoke write path, no gate ([#21](https://github.com/angusfretwell/docent/issues/21); pipeline in [architecture.md](architecture.md)).
- **The human writes Findings in the UI; the agent reads them from disk** — and vice versa. The round-trip between review and agent is expressed entirely as files ([#18](https://github.com/angusfretwell/docent/issues/18)).

v1's input is a local git branch checked out in the repo; there is no GitHub integration anywhere in this loop ([#24](https://github.com/angusfretwell/docent/issues/24)). The Review auto-creates on first use and Changes mint on first reference — tool behavior, not skill behavior (§3.4).

Chosen over a tool-owned store because the product is agent-first (agents author files natively; a mandated CLI is pure friction), local-first and solo (nothing needs a server-mediated store), and it mirrors how Claude Code skills already work. The store's real wins — validation, integrity, concurrency — are recovered inside this model: append-only files sidestep concurrency, and the CLI (§3.3) validates without gatekeeping ([#2](https://github.com/angusfretwell/docent/issues/2)).

## 2. The review loop

The round-trip collapses to a **single actor-agnostic findings queue** over `.docent/`, with two I/O primitives ([#18](https://github.com/angusfretwell/docent/issues/18)).

### 2.1 Roles, not actors

- The Review holds a queue of **Findings**; the Finding is the unit — an anchored, append-only review conversation ([#18](https://github.com/angusfretwell/docent/issues/18), [#24](https://github.com/angusfretwell/docent/issues/24); records at `findings/fnd_*/NNN-*.md`, schema `docent/finding@3`, owned by [data-model.md](data-model.md)).
- **Review, fix, and resolve are roles, not actors.** A human (via the docent UI) or an agent (via a skill) can occupy any role. An agent may resolve another agent's Finding ([#18](https://github.com/angusfretwell/docent/issues/18)).
- **Attribution is metadata only** — it records _who did it_, never gates _who may_ ([#18](https://github.com/angusfretwell/docent/issues/18)).

### 2.2 Two interface primitives

| Primitive | Does | UI equivalent | CLI surface (§3.3) |
| --- | --- | --- | --- |
| **write-findings** | Append findings / replies / resolves | The UI performs this when you write a comment | `docent finding add / reply / resolve` |
| **fetch-findings** | Read findings (any author), filtered on open/resolved + what's-next (+ anchor / author scope) | The UI performs this when it renders | `docent finding list` + filter flags |

Chosen over manual copy-paste or a UI "copy as prompt" button: it keeps `.docent/` authoritative, preserves anchors, and scales to a whole review pass ([#18](https://github.com/angusfretwell/docent/issues/18)). Every finding-touching skill conforms to these two primitives ([#18](https://github.com/angusfretwell/docent/issues/18)).

### 2.3 State model

Two axes, folded from a Finding's records ([#18](https://github.com/angusfretwell/docent/issues/18); folding rules owned by [data-model.md](data-model.md)):

- **Axis 1 — open / resolved**, with reopen available.
- **Axis 2 — what's-next** (for open Findings), derived from the **latest record**, **actor-blind**:

| Latest record                                 | What's-next        |
| --------------------------------------------- | ------------------ |
| fresh Finding · plain comment · "do it again" | **needs action**   |
| reply with Disposition `actioned`             | **needs verify**   |
| reply with Disposition `question`             | **needs answer**   |
| reply with Disposition `declined`             | **needs decision** |
| resolve                                       | **closed**         |

Author-kind is **not** a routing signal — a first-pass rule that routed by human-vs-agent authorship was replaced by the disposition-driven, actor-agnostic model ([#18](https://github.com/angusfretwell/docent/issues/18)). A reply may carry a **Disposition** ∈ {`actioned`, `declined`, `question`} — MECE for how a fixer ends its turn; fresh Findings and plain comments carry none (they simply need action). Disposition is the only schema addition the loop required — an optional field on the reply record ([#18](https://github.com/angusfretwell/docent/issues/18)).

### 2.4 The loop — both directions, one machine

```
review → write  →[needs action]→  fetch → fix → reply  →[needs verify]→  verify → resolve  →[closed]
```

- A **reviewer** (the human in the UI, or an agent) writes Findings → born **needs-action**.
- A **fixer** fetches needs-action Findings, acts, writes a reply carrying a Disposition → **needs-verify / needs-answer / needs-decision**.
- A **resolver** (any actor) verifies and writes a resolve → **closed**; or re-comments → **needs-action** again.

"The agent reviews me" and "I review the agent" differ only in who authors record `001`; everything downstream is identical — the loop needs no new state and no new machinery ([#18](https://github.com/angusfretwell/docent/issues/18)).

### 2.5 Review input

A reviewer defaults to the **live head** of the branch, minting a Change on reference; it may target **any prior Change** in the Review's history ([#18](https://github.com/angusfretwell/docent/issues/18) as amended by [#24](https://github.com/angusfretwell/docent/issues/24)). Anchoring spans Changes for free — a Finding born on an older Change is simply born drifted against head, which is what Drift is for ([#18](https://github.com/angusfretwell/docent/issues/18)). An optional focus scopes the pass.

### 2.6 Resolution is unconstrained

Any actor may write a resolve record, including an agent resolving another agent's Finding. This is safe because resolution is an append-only, attributed, **reopenable** event ([#18](https://github.com/angusfretwell/docent/issues/18)). Motivating cases: **verify-and-resolve** in a fix pipeline (a distinct verify pass closes the fixes that hold), **autonomous / headless** passes (nothing leaves the queue otherwise), and **review housekeeping** (dedup / stale-check). **Fixer ≠ resolver** is recommended guidance — not a mechanism-level rule ([#18](https://github.com/angusfretwell/docent/issues/18)). It once held by construction, when a separate `/review` skill owned resolves; now that `/to-docent` carries the full write vocabulary, it holds as **prose guidance in that skill** ("don't resolve a Finding you claimed to fix in the same turn", §3.1) — realization moved, the rule did not ([#79](https://github.com/angusfretwell/docent/issues/79)).

## 3. The skills catalogue

docent ships **7 skills**, pinned by [#21](https://github.com/angusfretwell/docent/issues/21). Invocation is uniform: every skill is a slash command the **human runs in their own agent session**; docent never invokes one. The catalogue splits along the human-facing surface:

- **Invokable** — the blessed entry points a human types.
- **Reference** — building blocks the invokable skills load; still directly runnable by a power user, but not the headline surface.

| Skill | Kind | Role | Reads | Writes |
| --- | --- | --- | --- | --- |
| `/to-docent` | Invokable | Recorder — writes the session's review outcomes | The session's own outcomes (a review pass, a fix pass over `/from-docent` findings), the open findings queue | Fresh Findings; Disposition-carrying replies; resolves / re-comments — the full write vocabulary |
| `/address` | Invokable | Fixer | Needs-action Findings, the code | Code edits; reply records carrying a Disposition. **Never a resolve** |
| `/docent` | Invokable | Walkthrough reconciler | Head Change; each pillar's latest walkthrough's `bornChangeId` | Fresh immutable `wlk_*` for stale/missing pillars only |
| `/docent-cli` | Reference | CLI usage guide | — | — (describes the `docent` binary's non-`serve` subcommands) |
| `/author-code-walkthrough` | Reference | Code-walkthrough author | A Change (via `git`), optional focus | `walkthroughs/code/wlk_*/` — manifest + ordered sections, `bornChangeId`-bound, immutable |
| `/author-product-walkthrough` | Reference | Product-walkthrough author (editorial half) | A Change, already-produced captures, optional focus | `walkthroughs/product/wlk_*/` — manifest + sections with `{{capture:i}}` interleave + annotations. **No browser** |
| `/capture-product-walkthrough` | Reference | Capture recorder | A served, reachable app; the dev-server contract (URL + route + viewport); a capture target | Content-addressed capture blobs (`captures/<sha>.{png,rrweb.json}`) + `captures[]` registry entries; the `.docent/capture.md` runbook |

Artifact schemas the walkthrough skills produce are owned by [walkthroughs.md](walkthroughs.md); Finding record schemas by [data-model.md](data-model.md).

### 3.1 Invokable skills

**`/to-docent` — record the session's review outcomes.** docent is out of the reviewing business: the outcomes come from whatever process the human already ran this session — `/code-review`, an ad-hoc conversation, another tool, or a fix pass over findings pulled via `/from-docent`. The skill **records what that session produced**, driving the finding CLI's **full write vocabulary**: **fresh Findings** (born needs-action), **Disposition-carrying replies** (`actioned` / `declined` / `question`), and **resolves** — distinguishing "a reply to an existing Finding" from "a new Finding" by matching against the open queue. It reviews and fixes nothing of its own; it transcribes outcomes already in the session, and it never invents a Finding, Disposition, or resolution the work did not produce. Because one skill now carries the full write vocabulary, the loop's _fixer ≠ resolver_ guidance holds **as prose in the skill** ("don't resolve a Finding you claimed to fix in the same turn"), no longer by construction — the old `/review` (reviewer + verifier/resolver) is retired ([#21](https://github.com/angusfretwell/docent/issues/21), [#79](https://github.com/angusfretwell/docent/issues/79)).

**`/address` — fix.** Reads **needs-action** Findings plus the code; writes code edits (ordinary file edits) plus reply records carrying a **Disposition** (`actioned` / `declined` / `question`). **It never writes a resolve** — that is what keeps it the fixer, not the resolver ([#21](https://github.com/angusfretwell/docent/issues/21)).

**`/docent` — the walkthrough reconciler** (a docent gives the guided tour). Per pillar, it reads the head Change and the `bornChangeId` of the pillar's latest walkthrough, and decides what to do from **existence + drift**: it regenerates only the pillar(s) the diff actually affects (**selective on pillars**), minting a fresh immutable `wlk_*` — never editing in place. For a stale product walkthrough it re-drives capture **wholesale**; content-addressing dedups byte-identical screens ([#21](https://github.com/angusfretwell/docent/issues/21)). It composes the three reference walkthrough skills below.

**`/docent` is the answer to "how and when is a walkthrough regenerated"**: the human runs it; the tool can only _surface_ staleness (the `bornChangeId`-vs-head badge, [#15](https://github.com/angusfretwell/docent/issues/15)), never auto-regenerate — decision B ([#21](https://github.com/angusfretwell/docent/issues/21)). This closes the regen-trigger question [#14](https://github.com/angusfretwell/docent/issues/14) and [#15](https://github.com/angusfretwell/docent/issues/15) deferred.

### 3.2 Reference skills

**`/docent-cli`.** The skill describes how to use a **real CLI**: the non-`serve` subcommands of the same `docent` binary. The loop's two I/O primitives become subcommands — fetch-findings → `docent finding list` with filter flags (`--open`/`--resolved`, `--whats-next`, `--anchor-file`, `--author`); write-findings → `docent finding add / reply / resolve …` — extended to `walkthrough` / `capture` writes, so ULID / anchor / manifest / content-address minting, append semantics, and what's-next / disposition derivation have **one implementation** shared by the UI's write path and the agent's ([#21](https://github.com/angusfretwell/docent/issues/21)). The CLI is **non-gating** ([#2](https://github.com/angusfretwell/docent/issues/2)): the files stay plain and directly writable; the CLI is the canonical, convenient path, never a lock. `docent serve` fs-watches every write — CLI-made or direct — and re-renders.

**`/author-code-walkthrough`.** Reads a Change (plus optional focus) via `git`; writes `walkthroughs/code/wlk_*/` — manifest plus ordered section files, `bornChangeId`-bound, immutable. The code pillar has no capture phase, so it stays a single skill ([#21](https://github.com/angusfretwell/docent/issues/21), [#14](https://github.com/angusfretwell/docent/issues/14)).

**`/author-product-walkthrough`.** The editorial half of the product pillar. Reads a Change, already-produced captures, and an optional focus; writes `walkthroughs/product/wlk_*/` — manifest plus sections with `{{capture:i}}` interleave and annotations. **It touches no browser**, so it re-runs cheaply against existing captures — the whole point of splitting it from capture ([#21](https://github.com/angusfretwell/docent/issues/21), [#15](https://github.com/angusfretwell/docent/issues/15)).

**`/capture-product-walkthrough`.** Records the product walkthrough on the agent-browser driver ([#12](https://github.com/angusfretwell/docent/issues/12); pipeline mechanics in [walkthroughs.md](walkthroughs.md)). Reads a served, reachable app, the dev-server contract (URL + route + viewport), and a capture target; writes content-addressed capture blobs and their `captures[]` registry entries. It **owns the `.docent/capture.md` runbook** — sourcing setup in §4's precedence order and authoring the runbook first-run when nothing is discoverable. It runs AFK when setup is discoverable or a runbook exists; a one-time human-in-the-loop prompt fires only when it isn't ([#21](https://github.com/angusfretwell/docent/issues/21), [#19](https://github.com/angusfretwell/docent/issues/19)).

### 3.3 The CLI, precisely

The `docent` binary has two faces ([#21](https://github.com/angusfretwell/docent/issues/21)):

- **`docent serve`** — the server + UI ([architecture.md](architecture.md)): watches `.docent/`, renders, streams updates over SSE.
- **Non-`serve` subcommands** — `docent finding list / add / reply / resolve`, plus `walkthrough` and `capture` write subcommands: the single home for ULID minting, anchor construction, append semantics, content-addressing, and what's-next / Disposition derivation. Both the UI's write path and agents use it; neither is required to (non-gating).

### 3.4 Deliberately _not_ skills

Tool / UI / human concerns, kept out of the catalogue so the invocation model stays crisp ([#21](https://github.com/angusfretwell/docent/issues/21), as amended by [#24](https://github.com/angusfretwell/docent/issues/24)):

- **Review creation and Change minting** → the **tool**. The Review auto-creates on first use; a Change mints lazily on first reference (a Finding, a Walkthrough, a `/to-docent` write referencing the head). [#21](https://github.com/angusfretwell/docent/issues/21)'s original "materialize a Review from a PR / mint a new Round" items are superseded by this local-branch model ([#24](https://github.com/angusfretwell/docent/issues/24)).
- **Mark-as-viewed** → a **human UI** action ([diff-review.md](diff-review.md)); agents never mark files viewed.
- **Serving the app** → the **human's** dev workflow (§4); capture only consumes a served app.
- **Commit / push** → the **human's** git workflow, unspecified by this spec ([#18](https://github.com/angusfretwell/docent/issues/18)).
- **Verifying uncommitted fixes** → the **Pending changes surface** ([#23](https://github.com/angusfretwell/docent/issues/23); rendered per [diff-review.md](diff-review.md)), not a skill.

## 4. Serving the app under review

**Serving is the human's responsibility; the capture skill consumes a served app — it never owns the process** ([#19](https://github.com/angusfretwell/docent/issues/19)). docent-the-tool never spawns the app; this keeps decision B intact.

### 4.1 Who boots the app

The human invoking the capture skill owns serving: either the dev server is already running, or the human tells the agent the command and the agent runs it via Bash **in the human's own session** ([#19](https://github.com/angusfretwell/docent/issues/19)).

### 4.2 How setup knowledge is sourced — precedence order

1. **Existing codebase context** — README, CONTRIBUTING, `package.json` scripts, `.env.example`, any in-repo agent docs.
2. The optional **`.docent/capture.md` runbook**.
3. **Ask the human.**

The runbook is **markdown, not a config schema** — a fallback brief the agent both _reads and authors_, carrying prose setup instructions: how to log in, how to seed data, which port the dev server uses. It is not the source of truth; it is consulted only when the knowledge isn't discoverable elsewhere. **First-run generation:** when nothing is discoverable, the skill generates the runbook from what it learned (asked the human / inferred) so later captures don't re-ask ([#19](https://github.com/angusfretwell/docent/issues/19)).

### 4.3 Viewport and starting route

- **Viewport** — a default declared in the runbook (a stable property of the app), **overridable per-capture**.
- **Starting route** — a **per-capture concern, not a runbook one**: user-specified if given; else the agent **infers it from the Change under review** (the changed files/routes point at what to walk); `/` (app entry) only as a last-resort fallback.
- Both are **recorded on each capture entity** (`route` / `viewport`, [walkthroughs.md](walkthroughs.md)); the runbook or instruction is only their _source_ ([#19](https://github.com/angusfretwell/docent/issues/19)).

### 4.4 Readiness

No health endpoint is imposed on the app under review ([#19](https://github.com/angusfretwell/docent/issues/19), honoring [#5](https://github.com/angusfretwell/docent/issues/5)'s zero-app-changes):

- **Already-running server** → navigate agent-browser to the starting route and **verify the page actually rendered** (a snapshot shows real DOM, not a connection-refused or error page).
- **Agent-launched server** → **poll the base URL until it responds** (TCP connect / any HTTP status) with a timeout, _then_ navigate and verify as above.
- **On failure** → **hard stop with a clear, actionable message** ("app not reachable at `<url>` — is your dev server up?"). Never emit a broken capture silently.

### 4.5 Teardown

The skill tears down **only what it started**. A human-run server is never stopped. An agent-launched server is **reused across captures within the session** (capture is expensive and deliberately separable, [#15](https://github.com/angusfretwell/docent/issues/15)) and **stopped when the capture work is done** ([#19](https://github.com/angusfretwell/docent/issues/19)).

## 5. Deferred

Recorded exactly as the tickets flagged them:

- **Verifying uncommitted (`actioned`) edits.** A Change is an immutable committed snapshot, so uncommitted edits are not a Change. Graduated by [#18](https://github.com/angusfretwell/docent/issues/18) to the **Pending changes surface** ([#23](https://github.com/angusfretwell/docent/issues/23)): a read-only working-tree view, verify-only (no Finding anchors on ephemeral blobs), which becomes the next Change on commit. Under lazy minting, Pending covers uncommitted work and first-reference minting covers everything committed ([#24](https://github.com/angusfretwell/docent/issues/24)).
- **Commit / push.** Stays the human's git workflow; unspecified by this spec ([#18](https://github.com/angusfretwell/docent/issues/18)).
- **Selective capture reuse.** `/docent` re-drives capture **wholesale** for a stale product walkthrough; selective per-capture reuse is a documented future optimization — the per-capture `route` seam is preserved for it ([#21](https://github.com/angusfretwell/docent/issues/21)).
- **Deep triage UX.** Inbox, cross-Change navigation, filter ergonomics belong to the review-surface tickets ([#20](https://github.com/angusfretwell/docent/issues/20) / [#9](https://github.com/angusfretwell/docent/issues/9); see [diff-review.md](diff-review.md)). The loop asserts only that the UI surfaces each Finding's **attribution + what's-next**, and that the human acts via the same records regardless of author ([#18](https://github.com/angusfretwell/docent/issues/18)).
- **GitHub anything.** PR input, PR metadata, posting back — out of v1 entirely; PR metadata returns someday as an additive provenance field on Change, never identity ([#24](https://github.com/angusfretwell/docent/issues/24)).

The runbook's name and shape were left by [#19](https://github.com/angusfretwell/docent/issues/19) to settle at consolidation; this spec fixes the name as **`.docent/capture.md`** and the shape as free-form markdown prose (per [#19](https://github.com/angusfretwell/docent/issues/19)'s "markdown, not a config schema").
