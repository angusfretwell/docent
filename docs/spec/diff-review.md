# Diff review

The Diff tab is the first of docent's three tabbed pillars (Diff / Code walkthrough / Product walkthrough — see [README.md](README.md)). It renders the current Change of the checked-out branch's Review as one continuous, virtualized diff, alongside a navigation tree, per-file viewed tracking, a read-only Pending entry for the dirty working tree, and the Review-global Findings panel.

Terminology follows [CONTEXT.md](../../CONTEXT.md). Entity schemas, Finding anchors, and drift mechanics live in [data-model.md](data-model.md); server endpoints and the SSE channel in [architecture.md](architecture.md); the walkthrough tabs in [walkthroughs.md](walkthroughs.md).

## 1. Renderer

The diff renderer is **`@pierre/diffs`** (`CodeView`, Apache-2.0) ([#4](https://github.com/angusfretwell/docent/issues/4)). It is the single diff-rendering substrate across all three tabs — the walkthrough tabs reuse the same `CodeView` per section ([#14](https://github.com/angusfretwell/docent/issues/14)) — so its virtualization, context expansion, and blob sourcing carry everywhere. No second renderer exists.

### Performance bar

The adoption was validated against real large diffs (178-file / ≈39k-row and 319-file / ≈63k-row fixtures) with a Playwright harness that pierces the renderer's shadow DOM ([#4](https://github.com/angusfretwell/docent/issues/4)):

- **Virtualization is size-independent**: live DOM stays at roughly **300–550 nodes at any diff size** (~400–550 at rest, ~300–700 during active scroll), and the materialized line window tracks the scroll.
- **First paint under 250 ms**: first rows at 89–106 ms, fully-highlighted settle around 0.8–1.1 s on the corrected benchmark (Apple M1 Pro, headless Chromium).
- **~60 fps scroll with zero long frames** (>50 ms) on both fixtures, unified and split — _with the Web Worker tokenization pool on_. Worker off janks the scroll (p95 225 ms, 15 long frames): **the worker pool ships enabled**.
- Bounded 8–11 MB heap; correct Shiki highlighting; large single files (2.8k lines), adds, deletes, and renames all handled.

These numbers are the bar the built Diff tab is held to.

### Build gotcha — `CodeView` owns its scroll

`CodeView` must be **its own scroll container**. Its virtualizer reads its **own element's** `scrollTop` — it does not walk up to a scrollable ancestor. Wrapping it in an outer scrolling `<div>` breaks both scrolling and virtualization; this exact mistake invalidated the first benchmark run and was fixed in the re-benchmark ([#4](https://github.com/angusfretwell/docent/issues/4)).

## 2. The review surface

([#9](https://github.com/angusfretwell/docent/issues/9))

### Single virtualized scroll

The Diff tab renders the **entire Change as one virtualized scroll** through `CodeView`'s cross-file virtualizer — that is where the renderer's performance lives, and the tab embraces it rather than fighting it. The diff renders **live from the branch's current head straight from git**; a Change is minted lazily only when a durable artifact must reference the head ([#24](https://github.com/angusfretwell/docent/issues/24)).

Per-file focus mode (tree selects one file; only it is mounted) is **deferred** — a later affordance, not the primary model.

### Navigation tree

A **compact-folder tree** panel sits beside the scroll: a directory tree that collapses single-child folder chains into one row (VS Code "compact folders" style), taming the deep single-child paths agent-authored changes produce. Rows carry: path, change type (A/M/D/R), `+/−` counts, and the viewed check.

The tree is a **build-spec, not a graduated prototype** — a nav tree of a few hundred nodes carries no performance risk, so unlike the renderer it required no validation pass. **`trees.software` is the first component to reach for**; rolling our own compact-folder logic is acceptable if it doesn't fit. This is an implementation choice, not a spec gate.

The tree carries a lightweight **substring filter box** plus quick filters (**unviewed-only**, **has-findings**) to keep the panel usable at 300 files.

### Jump primitives

Three jump primitives operate on the single scroll:

1. **Tree ↔ scroll two-way sync** — clicking a file smooth-scrolls the stream to it; scrolling the stream highlights and auto-reveals the active file in the tree. The tree is a position indicator, not just a launcher.
2. **Next/prev file.**
3. **Next/prev change** — hunk-level, crossing file boundaries: next-hunk at a file's end lands on the next file's first hunk. A "change" here is a contiguous hunk.

Exact key bindings are build detail. **Jump-to-next-unresolved-Finding** belongs to the annotation surface (see [data-model.md](data-model.md)) — noted as a seam, not designed here.

### File order

- **Default:** alphabetical by full path, directory-grouped, so the tree and the scroll agree and position is predictable.
- **Size-sort:** an optional user toggle (largest hunks first), never the default.
- **Explicit-order override:** the viewer accepts an ordered file list as input. After [#14](https://github.com/angusfretwell/docent/issues/14)'s redraw made the code walkthrough its own tab, this contract survives only as the **deep-link target**: a walkthrough section's range deep-links into the Diff tab (open that file/line here), and the walkthrough manifest order is the "open Diff tab in walkthrough order" payload. It is not the walkthrough's rendering path — see [walkthroughs.md](walkthroughs.md).

### Layout

**Unified view is the default**, with a **persisted per-user toggle** to split (a global preference, not per-file).

## 3. Mark-as-viewed

([#9](https://github.com/angusfretwell/docent/issues/9))

- An explicit per-file **"Viewed" checkbox** in the sticky file header. Checking it **collapses** the file's body in the scroll (thinning the stream as review progresses) and checks it in the tree.
- **Manual only** — no auto-mark-on-scroll-past. The value of "viewed" is that the reviewer asserted it.
- **Keyed on the file's head-blob SHA.** "Viewed" asserts _I've seen this file's resulting content_. Across Changes:
  - head blob **byte-identical** → viewed **persists**;
  - head blob **changed** → viewed **clears**, and the file flags as **"changed since viewed."**
  - A pure rebase that leaves head content identical **keeps** the marks. The rare edge — the base moved so a line is _framed_ as newly-changed though its head bytes are unchanged — is accepted: those bytes were seen.
- Persisted as **append-only viewed events** in `.docent/` — the storage shape is owned by [data-model.md](data-model.md).
- Viewed is **orthogonal to Finding resolution** — its own axis, exactly as resolution is orthogonal to drift. Solo tool → single reviewer; no multi-user viewed state.
- **Progress = viewed files / total files** in the Change — file-granular, shown as a count plus a thin bar in the panel header. It is a pure read-model over the viewed events and recomputes automatically: a new Change that clears marks drops progress to reflect the re-review owed.

## 4. Context expansion

([#9](https://github.com/angusfretwell/docent/issues/9), [#4](https://github.com/angusfretwell/docent/issues/4))

Patch-only input leaves the renderer `isPartial`, which disables hunk expansion — so the "expand unchanged context" affordance must feed the renderer **full file blobs**.

- **Source: local git.** Blobs resolve via `git cat-file` from the checked-out repo — offline, instant, free. There is **no GitHub fallback**; the fetch path is pure local git ([#24](https://github.com/angusfretwell/docent/issues/24)).
- **Lazy / on-demand** — a file's full blob is fetched only when the reviewer expands context there (or opens whole-file context), never eagerly for all files.
- **Content-addressed endpoint** `GET /api/blob/:sha`, returning raw bytes. SHAs are immutable → responses are **cached forever**. Both base and head sides (split view) go through the same endpoint; the Change's `(baseSha, headSha)` makes both blobs addressable. Endpoint details live in [architecture.md](architecture.md).

## 5. Edge-case chrome

([#9](https://github.com/angusfretwell/docent/issues/9)) The renderer handles the diff _body_ (renames, adds/deletes, very large files all validated in [#4](https://github.com/angusfretwell/docent/issues/4)); this is the surrounding chrome:

| Case | Chrome | Body | Viewed / progress |
| --- | --- | --- | --- |
| **Binary** (non-image) | row: change type + size delta | none (placeholder) | viewable at file granularity |
| **Image** | change type | **side-by-side before/after** (both blobs via `/api/blob/:sha`) | viewable |
| **Pure rename** (100% similarity) | `old → new` header | collapsed — nothing to review | auto-viewable |
| **Rename + modify** | `old → new` header | normal diff | normal |
| **Very large / minified** | normal header | **collapsed past a threshold** (e.g. >2k changed lines, or a minified megabyte-wide line) + "load diff" | normal |
| **Generated / lockfile / vendored** | de-emphasized in tree | **collapsed + auto-marked-viewed** (via `.gitattributes linguist-generated` + a default glob set — lockfiles, `dist/`); reviewer can expand and un-view | auto-viewed, still counted |
| **Mode-only / submodule** | row: mode `x→y` / submodule `sha→sha` | none | viewable |

Onion-skin/swipe image comparison is **deferred** behind side-by-side.

## 6. The Pending entry

([#23](https://github.com/angusfretwell/docent/issues/23), as amended by [#24](https://github.com/angusfretwell/docent/issues/24))

A **read-only preview of the working tree**, letting the reviewer eyeball an `actioned` edit **before** it's committed. It is a thin reuse of the existing diff apparatus — `CodeView`, the compact-folder tree, context expansion — with **no new rendering machinery**.

### What it is

- A plain **"Pending" entry at the top of the Diff tab's Change selector**, above the minted Changes.
- **Not a Change**: no identity, no persistence. It is a Change-shaped view whose head side is the dirty working tree.
- **Auto-surfaces** (with a dirty badge) when the working tree is dirty; **auto-hides** when clean.
- **Diff-tab only** — walkthroughs are durable and immutable, untouched by live edits.
- The binding is **definitional**: the Review _is_ the checked-out branch ([#24](https://github.com/angusfretwell/docent/issues/24)), so the dirty working tree is by definition this Review's pending state.

### Range & rendering

- **Two selectable ranges:**
  - **Incremental `git diff HEAD`** (primary) — just the pending edit, the delta since the last commit. The surgical view for verifying one `actioned` fix; empties the moment `HEAD` moves.
  - **Cumulative `base..worktree`** (toggle) — the whole current Change **plus** uncommitted edits, previewing the next Change's full diff.
- **Staged + unstaged combined** — staging is treated as an invisible git detail (the human's commit workflow); the reviewer sees "everything since the last commit" as one delta.
- **Untracked files included** (respecting `.gitignore`) — a newly-created, not-yet-staged file renders as a full-file add (enumerated via `git status --porcelain` / intent-to-add). `git diff HEAD` alone omits these, and agents routinely _create_ files as part of a fix.

### Blob sourcing

- **Base side (committed):** the cached, content-addressed `/api/blob/:sha`, unchanged.
- **Head side (working tree):** a **path-addressed, explicitly-uncached** read — `GET /api/worktree?path=…` — reading the live file from disk on each request. Forced by the mutable working tree: there is no stable SHA to cache against. Endpoint details in [architecture.md](architecture.md).

### Watch & live refresh

An **event-driven fs-watch of the repo** — **gitignore-aware** (so `node_modules`/`dist` don't drown it) and **debounced** (agents write files in bursts) — reuses the server's watch → recompute → SSE mechanism, rooted at the repo instead of `.docent/`. On a debounced change the server recomputes the diff and pushes it over the **same SSE channel**, so the Pending view refreshes live like everything else ([architecture.md](architecture.md)).

### Lifecycle — none of its own

Pending **owns no lifecycle logic**. On commit, `HEAD` moves → `git diff HEAD` empties → the entry auto-hides. Everything committed is covered by lazy minting: the diff always renders the live head, and a Change crystallizes on first durable reference ([#24](https://github.com/angusfretwell/docent/issues/24)). The committed-but-unpushed gap [#23](https://github.com/angusfretwell/docent/issues/23) had accepted is thereby **closed** — Pending covers uncommitted work, first-reference covers everything committed; there is nothing to caveat. Commit stays the human's git workflow, out of scope.

### Verify-only for Findings

- **No Finding authoring on Pending.** An anchor bound to a mutable working-tree blob would be transient and strand on commit, so all Finding anchors stay on committed Changes.
- **Existing Findings are not rendered inline** on Pending (v1) — it is a pure code preview. Verifying an `actioned` Finding: read it in the Findings panel (or on the committed head Change), eyeball the edit on Pending, then write the resolve on the existing Finding — its born anchor untouched. _(Noted for later: because Pending's base side literally is the head Change's blobs, rendering existing Findings read-only on Pending is coherent and could be added without redrawing anything.)_
- **Mark-as-viewed applies**, keyed on full content SHAs. The "un-SHA'd" premise is false: a working file's bytes are content-addressed at assertion time — `git hash-object` yields the same blob SHA the file will carry once committed. So the Review's viewed events fold into Pending exactly as into a Change: editing a file auto-clears its mark (changed-since-viewed on the new head blob), and committing unchanged bytes carries the mark into the minted Change (identical content SHA) — a genuine progress win, with the append-only event log and progress bar unchanged. This requires `git diff --full-index` on the Pending diff (`resolvePending`), matching the Change diff; git hashes worktree files even under `--no-index`, so untracked adds key too.

### Scope

git cannot distinguish an agent's edit from a human's — the working tree is just dirty state — so Pending is a **general uncommitted-changes surface** (human edits show too; no author attribution or filtering) which the `actioned`-verify flow _leans on_ rather than owns.

## 7. The Findings panel

([#20](https://github.com/angusfretwell/docent/issues/20), as amended by [#24](https://github.com/angusfretwell/docent/issues/24))

The aggregate surface for Findings as a Review ages across Changes — the surface that per-Finding drift badges and inline-in-diff rendering do not cover.

**Forcing function:** once a Review spans several Changes, some Findings go **outdated** — their anchored code was edited or deleted, so there is no line in the current diff to pin them to. Detached Findings render against their born text, but inline-in-diff has no home for a Finding whose code is gone. That alone forces an off-diff surface.

- A **Review-global side panel**, available from **all three tabs** (Diff / Code walkthrough / Product walkthrough) — **not a fourth tab** (a fourth content tab would compete with the three and pull the reviewer out of context). It lists **every** Finding regardless of anchor pillar and is the home for triage **and** for detached Findings (which may have no live pillar at all).
- **Inline-in-diff rendering is unchanged** for anchored live/shifted Findings — a Finding shows in both surfaces when anchored, panel-only when detached.
- **v1 layout is deliberately minimal:**
  - a single **flat list sorted by location** (natural reading order across pillars);
  - one control — a **"show resolved" toggle**, off by default, so the panel is the open items;
  - each row carries a **(drift × resolved) badge** plus a one-line location (`file:line` / "§ Section title" / "Screenshot N");
  - **detached/outdated rows expand to their born text in place**;
  - **click a row → jump** to its anchor in the content, or expand born text if detached.
- **Cross-Change history renders as labels, not navigation**: "opened on C1 · replied on C3 · resolved on C4." Every Finding record carries the `changeId` current when it was authored — capture-now-or-lose-forever metadata whose schema is owned by [data-model.md](data-model.md).

The panel is the **human-facing** browser surface; which Findings docent points an agent at, and how the agent consumes them, is [agent-integration.md](agent-integration.md)'s concern.

## 8. Deferred

Recorded, not silently dropped ([#9](https://github.com/angusfretwell/docent/issues/9), [#20](https://github.com/angusfretwell/docent/issues/20)):

- **Onion-skin / swipe image diff** — behind side-by-side.
- **Per-file focus mode** — tree selects one active file; only it is mounted.
- **Change time-travel** — a selector that re-renders an earlier Change's diff and reconstructs Findings as they stood. Not needed in v1: born text travels with each Finding, so an outdated Finding's original context is readable without navigating to its birth Change. Seam = the frozen Change history plus the per-record `changeId`.
- **Findings-panel refinements** — a summary-count header, status-priority grouping, and pillar / author-kind / Change facet filters — all additive later.
- **Read-only Findings on Pending** — coherent under the current model, addable without redrawing anything.
