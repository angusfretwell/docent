# Diff rendering: perf prototype — findings

Resolves [#4](https://github.com/angusfretwell/docent/issues/4). Throwaway
prototype; the code in this directory exists only to produce these numbers.

## Verdict

**diffs.com (`@pierre/diffs`) clears the "high-performance" bar. Adopt it as
the diff renderer.** No alternative had to be reached for.

It renders a 319-file / 35k-line diff with **~300 live DOM nodes**, first rows
painted in **≤250 ms** and fully syntax-highlighted in **<900 ms**, scrolling
the entire diff at a steady **~60 fps with zero long frames**. It is also a
near-exact fit for docent beyond raw speed: a first-class **annotation
framework** (inline comments anchored to a line — the primitive
[#7 Comment model](https://github.com/angusfretwell/docent/issues/7) needs), a
**Web Worker** tokenization path, split/unified layouts, sticky file headers,
and Apache-2.0 licensing.

## What was measured

- Library: `@pierre/diffs@1.2.12` via its React `CodeView` (the cross-file
  virtualizer), one `CodeViewDiffItem` per file, `processPatch()` to parse.
- Real fixtures, built by diffing two published `three.js` source trees
  (`src/`, human-authored JS) committed to a throwaway git repo:
  - **Large** — `three@0.150.0 → 0.160.0`: 178 files, 17.5k patch lines
    (≈39k rendered diff rows).
  - **XL** — `three@0.140.0 → 0.165.0`: 319 files, 35k patch lines
    (≈60–63k rendered diff rows). Includes new/deleted/renamed files and a
    2.8k-line single-file change (`WebGLRenderer.js`).
- Driver: `bench.mjs` (Playwright + headless Chromium). Time-to-first-rows,
  settle (no shadow-DOM mutation for 600 ms = structure + async highlighting
  done), total DOM nodes **piercing the `diffs-container` shadow root**, heap,
  and 40-step full-length scroll frame sampling.

> **Environment caveat.** Run in headless Chromium on a shared build container
> (variable CPU), so the millisecond figures are *conservative and
> indicative*, not benchmark-grade — a real laptop will be faster. The
> virtualization evidence (bounded node count, flat while scrolling) is
> hardware-independent and is the decisive result.

## Results

| Fixture | Worker | Layout | First rows | Settled (highlighted) | Live DOM nodes | Heap | Scroll p95 | Long frames (>50 ms) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Large (178 files / ≈39k rows) | on | unified | 178 ms | 1073 ms | 502 | 8 MB | 16.8 ms | 0 |
| Large | **off** | unified | 420 ms | 1034 ms | 400 | 11 MB | 16.8 ms | 0 |
| XL (319 files / ≈63k rows) | on | unified | 240 ms | 854 ms | 302 | 10 MB | 16.8 ms | 0 |
| XL | on | split | 243 ms | 854 ms | 307 | 10 MB | 17.1 ms | 0 |

## What the numbers show

- **Virtualization is airtight.** Total live DOM stays at **300–550 nodes**
  whether the diff is 39k or 63k rows, and stays *flat while scrolling the
  full length* (`502 → 502 → 502 → 502`). Only ~53 line rows (one viewport)
  are materialized at a time. This is the property that makes "high
  performance" hold as diffs grow — it doesn't degrade with size.
- **Fast to first paint and to highlighted.** Structure is on screen in
  under a quarter-second even at 319 files; Shiki highlighting streams in and
  settles under ~1.1 s. Bigger diff settled *faster* here because per-file
  work is bounded and only visible files highlight first.
- **Smooth scroll.** p95 frame ~17 ms (~60 fps) with **zero** frames over
  50 ms across a full-diff scroll, in both unified and split.
- **Bounded memory.** 8–11 MB heap regardless of diff size.
- **Worker pays off on the main thread.** Worker on cut first-paint 420→178 ms
  by moving tokenization off the main thread; settle time was similar at this
  size because both finish quickly. The worker's value grows with size and
  with interaction (typing a comment, selecting lines) where main-thread
  stalls would otherwise show. **Recommend keeping the worker pool on.**

## Edge cases exercised

- **Large single file** (2.8k-line `WebGLRenderer.js`) — rendered inside the
  same virtualized budget; no special handling needed.
- **Syntax highlighting** — Shiki, github-light/dark, correct per-token
  colouring (see screenshots). Grammars lazy-load per language.
- **New / deleted / renamed files** — parsed and rendered (rename headers,
  add/delete change types) from a standard `git diff`.
- **Split & unified layouts** — both perform identically.
- **Sticky file headers**, per-file change icons, and `-N/+N` counts render.

## Two findings that shape neighbouring tickets

1. **Context expansion needs full file contents, not just the patch.** Diffs
   parsed from a patch are `isPartial: true`, and the library documents that
   **hunk expansion (load surrounding unchanged context) is unavailable** in
   that mode. To offer "expand context" in the viewer, docent must feed the
   library full file contents, not only the unified diff. This is compatible
   with — and argues for — the
   [#3 Change model](https://github.com/angusfretwell/docent/issues/3):
   a Change carries `(baseSha, headSha)`, so both full blobs are fetchable.
   → a real input for the deferred **Diff viewer UX** work.
2. **The annotation framework is the comment-rendering substrate.**
   `renderAnnotation` injects arbitrary React content anchored to a
   `{ side, lineNumber }` inside a specific file item — exactly the diff
   anchor primitive [#7 Comment model](https://github.com/angusfretwell/docent/issues/7)
   is about (see `results/annotate.png`). #7 can assume this rendering
   substrate exists and focus on the comment *envelope* and *drift*, not on
   how a comment paints onto a diff.

## Screenshots (`results/`)

- `three_worker_1_unified.png` — Large diff, highlighted, unified.
- `three-xl_worker_1_split.png` — XL diff, split layout.
- `annotate.png` — inline comment annotations anchored to diff lines.

## How to reproduce

```bash
cd prototypes/0004-diff-rendering
bun install
bun run build
bun run preview &            # serves http://localhost:4173
node bench.mjs               # writes results/results.json + screenshots
```

Query params on the app: `?fixture=three|three-xl&worker=1|0&style=unified|split&annotate=1`.
