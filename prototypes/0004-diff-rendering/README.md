# Prototype: diff rendering perf (docent #4)

**Throwaway.** This directory exists only to answer one question from
[#4](https://github.com/angusfretwell/docent/issues/4): does diffs.com
(`@pierre/diffs`) clear the "high-performance" bar against a large real diff?

**Answer + numbers: [`FINDINGS.md`](./FINDINGS.md).** Verdict: yes — adopt it.

Not production code, not the docent app. Kept in-repo so the issue can link to
runnable evidence; delete once the diff-viewer build starts.

## Layout

- `src/main.tsx` — minimal Vite + React app rendering a fixture patch with
  `@pierre/diffs` `CodeView`.
- `public/fixtures/*.diff` — real diffs of two `three.js` `src/` trees, served
  as static assets the app fetches at runtime.
- `bench.mjs` — Playwright driver: render timing, shadow-DOM node counts,
  scroll frame sampling, screenshots.
- `results/` — `results.json` + screenshots (gitignored; regenerate with the
  steps in `FINDINGS.md`).

## Run

```bash
bun install && bun run build && bun run preview &
node bench.mjs
```
