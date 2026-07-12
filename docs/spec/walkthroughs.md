# Walkthroughs — the Code and Product pillars

A **Walkthrough** is a curated, ordered tour of a Change authored for a reader — prose woven through selected diff ranges (code) or captures (product). This document owns the walkthrough schemas — it is the appendix of record for `docent/walkthrough` and `docent/walkthrough-section` — plus captures, annotations, walkthrough drift and staleness, and the capture pipeline. The core entities (Review, Change, Finding), the anchor union, and the drift algorithm are owned by [data-model.md](data-model.md); the skills that generate walkthroughs are owned by [agent-integration.md](agent-integration.md).

## 1. Frame — two self-contained tabs

The tool has three tabbed view modes: **Diff**, **Code walkthrough**, **Product walkthrough** ([#14](https://github.com/angusfretwell/docent/issues/14)). Each walkthrough pillar is its **own self-contained tab**, not a lens or reordering of the Diff tab's single scroll surface ([#14](https://github.com/angusfretwell/docent/issues/14) — this redraws the earlier [#9](https://github.com/angusfretwell/docent/issues/9) line that a curated tour reorders the same scroll).

- The code walkthrough tab **reuses the diff renderer's `@pierre/diffs` `CodeView` per section** — one diff-rendering substrate across all three tabs, so the Diff tab's virtualization, context expansion, and `/api/blob/:sha` sourcing carry for free; there is no second renderer ([#14](https://github.com/angusfretwell/docent/issues/14)). See [diff-review.md](diff-review.md) for the renderer itself.
- A section's range **deep-links into the Diff tab** (view that file/line there) — the lighter form of the seam [#9](https://github.com/angusfretwell/docent/issues/9) named ([#14](https://github.com/angusfretwell/docent/issues/14)).
- The manifest's section order is also a deep-link payload: "open the Diff tab in walkthrough order" ([#14](https://github.com/angusfretwell/docent/issues/14)).

## 2. The unified model

There is **one** walkthrough schema, not two: `docent/walkthrough` with a `kind: code | product` discriminant, and one section schema `docent/walkthrough-section` whose targets swap by kind ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15) — #15 opened scoping product as its own entity, then aligned to #14's unified model when it landed mid-ticket). The product walkthrough is the `kind: product` arm of the shared envelope; only the envelope and schema names are shared — everything product-specific (captures, capture anchors, capture drift, the split generation skills) slots inside it ([#15](https://github.com/angusfretwell/docent/issues/15)).

Invariants, both kinds ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)):

- **Bound to `bornChangeId`** — the Change the walkthrough was authored against. A Walkthrough referencing the branch head is a first-reference event that mints a Change if none exists for that head (see [data-model.md](data-model.md); lazy minting per [#24](https://github.com/angusfretwell/docent/issues/24)).
- **Durable + immutable.** Walkthroughs live in the Review alongside Findings and Changes; viewing one against a later Change never mutates it. Regeneration **mints a new `wlk_` id** bound to the new Change; the old walkthrough persists, immutable and greppable. Throwaway/regenerate-in-place was rejected — it orphans narrative Findings and discards the durable tour ([#14](https://github.com/angusfretwell/docent/issues/14)).
- **One walkthrough per Change per pillar in v1.** Each walkthrough tab shows _the_ walkthrough, no picker. Identity is **multiplicity-ready**: the `wlk_`/`sec_` ids and the `walkthroughId`-carrying anchor arm mean multiple walkthroughs later (an "architecture tour" + a "security tour") is an additive layout + tab-subselector change, never a data or anchor migration ([#14](https://github.com/angusfretwell/docent/issues/14)).
- **Order = manifest array order, full stop.** No `rank`/`priority` field — array position _is_ the rank; a second field would be a source of truth that can disagree with the array. "High-signal first" is the generator's editorial call made when it chooses the order, not a data-model concept. Numeric filename prefixes (`s01-`) are cosmetic; reordering edits the manifest, not filenames ([#14](https://github.com/angusfretwell/docent/issues/14)).
- **Human-editable after.** A walkthrough is plain files; a human edits prose or order directly and the tool re-renders — no special affordance ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)).

The product spine is **prose-primary**: an ordered list of authored sections, each narration + embedded captures + annotations. A capture-timeline spine was rejected as under-curated for review, which wants "look here, in this order, because…" ([#15](https://github.com/angusfretwell/docent/issues/15)).

## 3. On-disk layout

Walkthroughs live under the Review, per the canonical `.docent/` layout ([data-model.md](data-model.md); root `.docent/` and the per-branch `reviews/<branch-slug>/` per [#24](https://github.com/angusfretwell/docent/issues/24), superseding the provisional `.review/reviews/pr-<N>/` paths in [#14](https://github.com/angusfretwell/docent/issues/14)/[#15](https://github.com/angusfretwell/docent/issues/15)):

```
.docent/reviews/<branch-slug>/walkthroughs/
  code/
    wlk_<ulid>/
      manifest.json
      s01-<slug>.md
      s02-<slug>.md
  product/
    wlk_<ulid>/
      manifest.json
      s01-<slug>.md
      s02-<slug>.md
      captures/
        <sha>.png            # content-addressed screenshot blobs
        <sha>.rrweb.json     # content-addressed recording blobs
```

Captures live **inside** the `wlk_<ulid>/` dir — born with that immutable walkthrough; regeneration mints a new dir with fresh captures ([#15](https://github.com/angusfretwell/docent/issues/15)).

## 4. Manifest — `docent/walkthrough`

One schema, `kind`-discriminated (upgrades the provisional draft; [#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)).

**`kind: code`:**

```jsonc
{
  "schema": "docent/walkthrough",
  "id": "wlk_…",
  "kind": "code",
  "title": "…",
  "bornChangeId": "chg_002", // the Change this tour was authored against
  "sections": ["s01-entry.md", "s02-dispatch.md"],
} // array order IS the order
```

**`kind: product`** — the shared envelope plus a product-only `captures[]` registry (code manifests omit it):

```jsonc
{
  "schema": "docent/walkthrough",
  "id": "wlk_…",
  "kind": "product",
  "title": "…",
  "bornChangeId": "chg_002",
  "sections": ["s01-upload.md", "s02-validation.md"],
  "captures": [
    {
      "id": "cap_a",
      "kind": "screenshot",
      "media": "<sha>",
      "route": "/signup",
      "viewport": [1280, 800],
      "dims": [1280, 2400],
    },
    {
      "id": "cap_b",
      "kind": "recording",
      "media": "<sha>",
      "route": "/signup",
      "viewport": [1280, 800],
      "durationMs": 8200,
    },
  ],
}
```

## 5. Section — `docent/walkthrough-section`

A section is one step of the tour: a titled unit of prose interleaved with its targets. It carries **`id`, `title`, its targets, and a markdown body — nothing else** ([#14](https://github.com/angusfretwell/docent/issues/14)). The two kinds mirror each other with the targets swapped ([#15](https://github.com/angusfretwell/docent/issues/15)).

**Code shape** ([#14](https://github.com/angusfretwell/docent/issues/14)):

```yaml
---
schema: docent/walkthrough-section
id: sec_<ulid>
title: "Entry point & dispatch"
ranges:
  - { file: src/index.ts, side: head, blobSha: 9c2a…, lines: [10, 24] }
  - { file: src/parser.ts, side: head, blobSha: a1b2…, lines: [40, 88] }
---
The request enters here {{range:0}} and is handed to the parser {{range:1}}.
```

- A **range** is `{ file, side, blobSha, lines }` — the **same coordinate as the `line` anchor arm** of the Finding anchor union ([data-model.md](data-model.md)). Content-addressed via `blobSha`; both `base` and `head` sides are allowed ([#14](https://github.com/angusfretwell/docent/issues/14)).
- Each range renders through `CodeView` and deep-links into the Diff tab (§1).

**Product shape** — `ranges` swaps for `captures` + `annotations` ([#15](https://github.com/angusfretwell/docent/issues/15)):

```yaml
---
schema: docent/walkthrough-section
id: sec_…
title: "Uploading a file"
captures: [cap_a, cap_b]
annotations:
  - anchor:
      { kind: screenshot-region, capture: cap_a, rect: [0.1, 0.2, 0.3, 0.1] }
    body: "The new upload control."
  - anchor:
      { kind: recording-timestamp, capture: cap_b, fromMs: 3200, toMs: 5000 }
    body: "Validation fires on blur."
---
Drag a file onto the dropzone {{capture:0}} and the upload begins {{capture:1}}.
```

**Literate interleave**, both kinds ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)):

- The body may place inline `{{range:i}}` (code) / `{{capture:i}}` (product) markers to narrate _between_ targets (prose → target → prose → target). Indices refer to positions in the frontmatter list.
- The frontmatter list (`ranges` / `captures`) is **canonical** — the machine-readable source for drift, deep-linking, and order; markers are pure presentation.
- **No markers ⇒ targets render in order after the prose** (the flat fallback).

## 6. Captures

A **capture** is one media artifact — one screenshot **or** one recording. It is **atomic** (a section composes several deliberately) and **first-class**: a stable `cap_<ulid>` id plus metadata, registered in the product manifest's `captures[]` ([#15](https://github.com/angusfretwell/docent/issues/15)).

- **Metadata:** `{ id, kind: screenshot | recording, media, route, viewport }` plus `dims` (full-page pixel dimensions) for screenshots and `durationMs` for recordings ([#15](https://github.com/angusfretwell/docent/issues/15)).
- **`media` is a content sha** → the blob at `captures/<sha>.png` or `captures/<sha>.rrweb.json`. Content-addressing enables cross-round dedup and **freezes the exact bytes an anchor points at** ([#15](https://github.com/angusfretwell/docent/issues/15)).
- **All captures are born against the walkthrough's `bornChangeId`** — no per-capture `capturedAgainst` field (it would be redundant). Before/after captures across refs in one tour is a deliberate future extension; v1 = all captures at the born head ([#15](https://github.com/angusfretwell/docent/issues/15)).
- A recording's blob is the raw rrweb event stream; it replays self-contained (no network, faithful DOM reconstruction, validated end-to-end in the [#5](https://github.com/angusfretwell/docent/issues/5) spike).

## 7. Annotations vs Findings

Two distinct acts point at walkthrough content, kept as **separate mechanisms sharing one pointer vocabulary** ([#15](https://github.com/angusfretwell/docent/issues/15)):

- **Annotation** — the generation agent's authored callout; lives _in the section_ (frontmatter `annotations[]`); durable; not a thread; not resolvable. A capture-arm annotation renders as a pin overlaid on its capture; every other arm it can carry renders instead as a **section-level note** (see the rendering contract below).
- **Finding** — a reviewer's anchored, append-only thread; lives in the Review's Finding records; replied-to, resolved, drifts ([data-model.md](data-model.md)).

Both render through the same overlay framework, but they are different data with different lifecycles — which also keeps a section a self-contained authored artifact ([#15](https://github.com/angusfretwell/docent/issues/15)).

The anchor arms themselves are **owned by [data-model.md](data-model.md)** — this document only records which arms the pillars exercise:

- `walkthrough-section` — `{ walkthroughId, sectionId }`; identity-based, narrative-only; anchors a Finding on the section _as an authored unit_ ("this explanation is misleading"). Pillar-agnostic — the same arm serves code and product sections ([#14](https://github.com/angusfretwell/docent/issues/14)).
- `screenshot-region`, `recording-timestamp`, `text-span` — the product arms (normalized rect; ms offsets from recording start; quote-based into section prose). A whole-capture Finding is the fine arm with its coordinate omitted; there is no `side` on capture anchors ([#15](https://github.com/angusfretwell/docent/issues/15)).
- **Findings on code inside a code section fall through to the existing `line`/`file` arms** (content-addressed). Payoff: a Finding on _code_ surfaces in **both** the Diff tab and the walkthrough (one source of truth); a Finding on the _narrative_ surfaces only in the walkthrough ([#14](https://github.com/angusfretwell/docent/issues/14)).

**Rendering contract — everything that validates renders; no silent drops** ([#68](https://github.com/angusfretwell/docent/issues/68)). An annotation's `anchor` spans the full Finding union, so the supported set is the whole union, not just the capture arms — the schema stays wide, and each arm renders in its natural surface:

- `screenshot-region` / `recording-timestamp` → a pin/marker on the capture (annotations and Findings alike).
- `text-span` → highlighted into the section prose, plus a note carrying the body.
- `walkthrough-section` → a narrative note under the section.
- `line` → beside its range (code Findings); `file` → a whole-file note at the section level (Findings in the code tab; annotations in a product section).
- `change` → a section-level note.

A capture-less annotation arm (`file` / `line` / `change` / `walkthrough-section`) is a **section-level note** located by its anchor rather than a pin — an authored callout with no capture to overlay. Narrowing the schema to capture arms was rejected in favour of rendering the whole set, so an agent that hand-authors any arm sees it surface rather than vanish ([#68](https://github.com/angusfretwell/docent/issues/68)).

## 8. Drift and staleness

Walkthroughs drift as later Changes are minted, using the Drift vocabulary — `live` / `shifted` / `outdated` ([data-model.md](data-model.md)) — but the two kinds resolve it differently.

**Code — per-range re-anchor, worst-of rollup** ([#14](https://github.com/angusfretwell/docent/issues/14)):

- Per-range drift is the **blob-to-blob re-anchor reused verbatim** from the Finding drift algorithm ([data-model.md](data-model.md)) — a range _is_ a `line` anchor, so each range independently resolves to live / shifted / outdated. No second drift algorithm.
- **Section state = worst-of rollup** of its ranges (`outdated > shifted > live`) → a section badge ("the code here changed since this tour was written"); per-range states stay available to pinpoint the stale hunk.
- Findings anchored to a section via `walkthrough-section` drift on **identity**: live while the section exists, outdated if it's gone — no `shifted` (there's no line-number movement for a whole section).

**Product — identity-based, no intra-capture re-anchor** ([#15](https://github.com/angusfretwell/docent/issues/15)):

- A capture's `media` is immutable and content-addressed, so blob-to-blob re-anchoring has **no analog** — there is no meaningful edit script between two screenshots, and re-mapping a timestamp across a re-record is unreliable (deliberately not attempted).
- A capture or section anchor is **live** while its capture/section exists in its (immutable) walkthrough; **outdated** once superseded — then it **detaches and renders against its born capture** (recoverable via the content sha). **No `shifted`** (nothing moves within an immutable image).

**Walkthrough staleness**, both kinds ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)):

- A walkthrough is a **pinned snapshot**, never auto-refreshed (agent-driven capture is expensive). Staleness = `bornChangeId` vs the current head — a per-walkthrough signal ("this tour depicts the product as of N Changes ago"), **surfaced, never hidden**.
- The tool can only _surface_ staleness; it never auto-regenerates. **Regeneration is triggered by the human running `/docent`**, which reconciles existence + drift per pillar and mints a fresh immutable `wlk_` for stale or missing pillars only ([#21](https://github.com/angusfretwell/docent/issues/21) — the skill contract is owned by [agent-integration.md](agent-integration.md)).
- Finding resolution stays orthogonal to drift throughout ([data-model.md](data-model.md)).

## 9. The capture pipeline

Validated end-to-end by spike ([#5](https://github.com/angusfretwell/docent/issues/5)): a running app → rrweb session recording + full-page screenshots → a self-contained replay that faithfully reconstructs the app, with **zero changes to the app under review**.

**Decisions** ([#5](https://github.com/angusfretwell/docent/issues/5)):

- **Agent-driven, headless.** Reproducible, re-runnable per Change, fits agent-authored changes. Human-driven / hybrid capture is deferred; the seam is just "who calls the driver."
- **rrweb is driver-injected** at capture time. The app needs no code changes and no runtime dependency on docent — it only has to be **served and reachable**.

**Driver — agent-browser, adopted over Playwright** ([#12](https://github.com/angusfretwell/docent/issues/12)):

- Drives **system Chrome over CDP** — no Playwright dependency, no bundled ~150 MB browser download; the capture footprint is rrweb only.
- **Fit for agent-driven flows was the deciding axis:** a persistent session driven one command at a time, reading the page live via `snapshot -i` (accessibility tree → element refs, disabled states visible) — no selectors invented up front, versus Playwright's write-a-script-first model.
- rrweb injection holds identically under agent-browser (driver `eval`; `--init-script` is available if rrweb is ever needed from first paint); screenshots via `screenshot --full` with viewport control.
- **Integration shape:** the capture module orchestrates an **out-of-process CLI/subprocess (shell/MCP)**, not an in-process library — a conscious architectural choice, confirmed.
- **Accepted cost — bring-your-own-Chrome:** a findable system Chrome/Chromium replaces a shipped browser (reasonable on dev machines; CI is out of scope for v1).

**Dev-server contract** ([#5](https://github.com/angusfretwell/docent/issues/5)): the app under review must be (1) served over HTTP at a known URL, (2) reachable from the driver, (3) at a known starting route, (4) with a chosen viewport. **Booting the dev server is upstream of the pipeline** — how the serving command is learned and run is owned by [agent-integration.md](agent-integration.md)'s serving section; the pipeline only consumes a served app.

**Output:** content-addressed capture blobs (`captures/<sha>.png`, `captures/<sha>.rrweb.json`) plus their `captures[]` registry entries (§6).

## 10. Generation

Generation is performed by agent skills that **drop plain files** under `walkthroughs/{code,product}/wlk_<ulid>/` in the shapes above — filesystem-is-the-interface; the running tool's watcher re-renders live; no bespoke write path ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15); see [architecture.md](architecture.md) for the watcher). The skill contracts — inputs, invocation, delivery — are **owned by [agent-integration.md](agent-integration.md)**; this document pins only the decomposition and the artifact:

- **Code = one skill**, `/author-code-walkthrough` — code has no capture phase ([#14](https://github.com/angusfretwell/docent/issues/14), [#21](https://github.com/angusfretwell/docent/issues/21)).
- **Product = three skills** ([#15](https://github.com/angusfretwell/docent/issues/15), [#21](https://github.com/angusfretwell/docent/issues/21)): `/capture-product-walkthrough` (drives the browser, §9; authors nothing), `/author-product-walkthrough` (the editorial half; touches no browser), and a wrapper entry point orchestrating capture → assemble — realized in the catalogue as the invokable `/docent` reconciler, which composes the reference skills ([#21](https://github.com/angusfretwell/docent/issues/21)). The split exists because **capture is expensive and separable from authoring** — assemble re-runs standalone against existing captures, so structure and narration iterate cheaply without re-driving the browser, and the capture skill is reusable beyond walkthroughs. This is a conscious divergence from the code pillar on skill _decomposition_ only — **the data model produced is identical** to a single skill's.

Properties both pillars share ([#14](https://github.com/angusfretwell/docent/issues/14), [#15](https://github.com/angusfretwell/docent/issues/15)):

- The generating agent reads the Change's diff and blobs **straight from the local clone** (it has repo access; it does not go through the tool's HTTP blob API).
- Intent context is read from the branch name, the `base..head` commit messages, and the agent's own session context ([#24](https://github.com/angusfretwell/docent/issues/24) — amending the "PR metadata" input named by [#14](https://github.com/angusfretwell/docent/issues/14)/[#15](https://github.com/angusfretwell/docent/issues/15); there is no GitHub in v1). An **optional focus** steers the tour (default: a general reviewer's tour; a focus like "security" is how the multiplicity seam gets exercised later).
- The skills own the **editorial judgment** — selecting high-signal targets, grouping into sections, ordering, narration. The ranking method is generation internals, deliberately unspecified.
- **Single-purpose:** they produce the walkthrough only, never Findings (the review → Findings loop is a separate flow, [agent-integration.md](agent-integration.md)).

## 11. Deferred

Recorded as the tickets flagged them; none are v1 work.

| Deferred item | Seam preserved | Source |
| --- | --- | --- |
| Multiple walkthroughs per Change per pillar (e.g. an "architecture tour" + a "security tour") | `wlk_`/`sec_` ids + `walkthroughId`-carrying anchor; additive layout + tab-subselector change only | [#14](https://github.com/angusfretwell/docent/issues/14) |
| Before/after captures across refs in one tour | a per-capture `capturedAgainst` field would be additive | [#15](https://github.com/angusfretwell/docent/issues/15) |
| Factoring `text-span` out of the pillars if the code side wants prose anchoring too | shape-identical arm already defined | [#15](https://github.com/angusfretwell/docent/issues/15) |
| Selective capture-reuse on regeneration (v1 re-drives capture wholesale; content-addressing dedups byte-identical screens) | the per-capture `route` field | [#21](https://github.com/angusfretwell/docent/issues/21) |
| Human-driven / hybrid capture | the seam is "who calls the driver" | [#5](https://github.com/angusfretwell/docent/issues/5) |
| rrweb live from first paint | agent-browser `--init-script` | [#12](https://github.com/angusfretwell/docent/issues/12) |
| Capture in CI / without a system Chrome | out of scope per the map; Lightpanda/cloud fallbacks exist | [#12](https://github.com/angusfretwell/docent/issues/12) |
| An optional walkthrough/branch description field for intent | additive field | [#24](https://github.com/angusfretwell/docent/issues/24) |
