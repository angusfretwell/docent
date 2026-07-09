# Diff rendering: perf prototype — findings

Resolves [#4](https://github.com/angusfretwell/docent/issues/4). Throwaway
prototype; the code in this directory exists only to produce these numbers.

> **Correction (2026-07-09).** The first pass of this prototype shipped with a
> scroll-container bug that made the *scroll* measurements meaningless (the page
> couldn't actually scroll, and the harness "scrolled" a non-scrolling element).
> The bug is fixed and the benchmark re-run; the scroll section and results
> table below are the corrected numbers. See **[Harness correction](#harness-correction-what-the-first-run-got-wrong)**.
> The verdict is unchanged — if anything, strengthened.

## Verdict

**diffs.com (`@pierre/diffs`) clears the "high-performance" bar. Adopt it as
the diff renderer.** No alternative had to be reached for.

It renders a 319-file / 35k-line diff with **~550 live DOM nodes**, first rows
painted in **~100 ms** and fully syntax-highlighted in **~1.1 s**, and scrolls
the entire diff at a steady **~60 fps with zero long frames** — with the Worker
pool on. The materialized DOM window **tracks the scroll** and stays bounded
regardless of diff size. It is also a near-exact fit for docent beyond raw
speed: a first-class **annotation framework** (inline comments anchored to a
line — the primitive [#7 Comment model](https://github.com/angusfretwell/docent/issues/7)
needs), a **Web Worker** tokenization path, split/unified layouts, sticky file
headers, and Apache-2.0 licensing.

## What was measured

- Library: `@pierre/diffs@1.2.12` via its React `CodeView` (the cross-file
  virtualizer), one `CodeViewDiffItem` per file, `processPatch()` to parse.
- Real fixtures, built by diffing two published `three.js` source trees
  (`src/`, human-authored JS) committed to a throwaway git repo:
  - **Large** — `three@0.150.0 → 0.160.0`: 178 files, 17.5k patch lines
    (≈39k rendered diff rows).
  - **XL** — `three@0.140.0 → 0.165.0`: 319 files, 35k patch lines
    (≈59–63k rendered diff rows). Includes new/deleted/renamed files and a
    2.8k-line single-file change (`WebGLRenderer.js`).
- Driver: `bench.mjs` (Playwright + Chromium). Time-to-first-rows, settle (no
  shadow-DOM mutation for 600 ms = structure + async highlighting done), total
  DOM nodes **piercing the `diffs-container` shadow root**, heap, and a 40-step
  full-length scroll that samples frame times, confirms the scroller actually
  moved, and checks the **materialized line window shifts** (virtualization is
  tracking the scroll, not stuck on the first viewport).

> **Environment.** Re-run locally on an **Apple M1 Pro (10-core), 32 GB, macOS
> 26.4**, Playwright's bundled Chromium (headless). The millisecond figures are
> representative of a modern laptop — faster than the original shared-CI-container
> run, and no longer the bottleneck. The decisive results — bounded node count,
> node count independent of diff size, and the virtualizer tracking the scroll —
> are hardware-independent.

## Results

| Fixture | Worker | Layout | First rows | Settled (highlighted) | Live DOM (at rest) | Heap | Scroll median / p95 | Long frames (>50 ms) | Virtualization follows scroll |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Large (178 files / ≈39k rows) | **on** | unified | 89 ms | 797 ms | 501 | 8 MB | 8.3 / **16.0** ms | **0** | ✅ `[1,53]→[122,334]` |
| Large | off | unified | 169 ms | 777 ms | 399 | 12 MB | 24.2 / **225.4** ms | **15** | ✅ |
| XL (319 files / ≈63k rows) | **on** | unified | 99 ms | 1060 ms | 546 | 10 MB | 8.4 / **25.0** ms | **0** | ✅ `[1,53]→[41,120]` |
| XL | **on** | split | 106 ms | 1049 ms | 551 | 10 MB | 11.1 / **29.7** ms | **0** | ✅ `[1,53]→[40,120]` |

("Follows scroll" shows the min–max line number of the materialized rows at the
top vs. the bottom of a full-length scroll: the DOM window moves with the
viewport.)

## What the numbers show

- **Virtualization is airtight and size-independent.** Live DOM sits at
  **~400–550 nodes at rest** and fluctuates within **~300–700 nodes while
  actively scrolling** — and lands in the *same band* whether the diff is 39k
  rows or 63k. Only ~53 line rows (one viewport) are anchored at a time. This
  is the property that makes "high performance" hold as diffs grow: cost is
  bounded by the viewport, not the diff.
- **The materialized window tracks the scroll.** At the top the DOM holds the
  first lines; at the bottom it holds the last — proven by the shifting line
  ranges in the table (and asserted by the harness). This is what a virtualizer
  must do and now demonstrably does.
- **Fast to first paint and to highlighted.** Structure is on screen in ~100 ms
  even at 319 files; Shiki highlighting streams in and settles in ~1.1 s.
- **Smooth scroll — with the Worker on.** Worker-on scrolls the full diff at a
  median ~8–11 ms / p95 16–30 ms per frame (~60 fps) with **zero** frames over
  50 ms, in both unified and split.
- **Worker off janks the scroll.** With tokenization forced onto the main
  thread, the same full-length scroll spikes to **p95 225 ms with 15 long
  frames** (max ~930 ms) as Shiki re-highlights revealed files inline. First
  paint is also slower (169 vs 89 ms). **Keep the Worker pool on** — this is now
  a measured recommendation, not a hunch.
- **Bounded memory.** 8–12 MB heap regardless of diff size.

## Edge cases exercised

- **Large single file** (2.8k-line `WebGLRenderer.js`) — rendered inside the
  same virtualized budget; no special handling needed.
- **Syntax highlighting** — Shiki, github-light/dark, correct per-token
  colouring (see screenshots). Grammars lazy-load per language.
- **New / deleted / renamed files** — parsed and rendered (rename headers,
  add/delete change types) from a standard `git diff`.
- **Split & unified layouts** — both perform well; split materializes a few more
  nodes but stays in-band.
- **Sticky file headers**, per-file change icons, and `-N/+N` counts render.

## Harness correction (what the first run got wrong)

The prototype wrapped `CodeView` in an outer `<div id="scroll">` and put the
scroll on *that* wrapper. But `CodeView`'s virtualizer reads **its own
element's** `scrollTop` — it does not walk up to a scrollable ancestor. Net
effect of the original setup:

1. The wrapper was set to `overflow: hidden`, so **nothing scrolled at all** —
   the user-visible bug that kicked this off.
2. `bench.mjs`'s `__scroller()` picked "the largest element with overflowing
   content, excluding `#scroll`", which resolved to an `overflow: visible`
   element. Setting `scrollTop` on an `overflow: visible` element is a **no-op**,
   so the benchmark's scroll loop measured a page that never moved. That is why
   the first run reported a suspiciously perfect "p95 16.8 ms / 0 long frames
   for every config, node count flat at 502→502→502→502" — it was timing a
   stationary page and worker on/off looked identical.

**Fix.** `CodeView` is now its own scroll container (`overflow: auto` on the
`CodeView` element; the wrapper is a plain frame). `bench.mjs` now (a) requires
a real scroll container — computed `overflow-y: auto|scroll` **and** overflowing
content, piercing shadow roots — and (b) asserts the materialized line window
shifts between top and bottom, so a non-scrolling page can never again pass as
"smooth". The at-rest measurements from the first run (bounded node count, first
paint, highlight-settle, memory) were always valid and are unchanged; only the
**scroll** numbers were affected.

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

`bench.mjs` uses Playwright's bundled Chromium by default; set `CHROME_BIN` to
point at a system browser (e.g. in CI). Query params on the app:
`?fixture=three|three-xl&worker=1|0&style=unified|split&annotate=1`.
