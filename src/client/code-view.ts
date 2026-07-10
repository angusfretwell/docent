/**
 * Shared `@pierre/diffs` `CodeView` plumbing — the one Shiki theme pair and the
 * tokenizing worker factory used by every code surface (the Diff tab and the
 * Code walkthrough tab), so there is a single rendering substrate across tabs
 * (walkthroughs.md §1). Kept out of the component modules so importing it never
 * trips React Fast Refresh's component-only export rule.
 */

/** The shared Shiki theme pair for light/dark. */
export const themes = { dark: "github-dark", light: "github-light" } as const;

/**
 * One Shiki-tokenizing worker per hardware thread (capped by the caller).
 * Tokenization must stay off the main thread: the #4 re-benchmark measured
 * worker-off scroll at p95 225 ms with 15 long frames vs. zero with the pool on.
 */
export function workerFactory() {
  return new Worker(new URL("@pierre/diffs/worker/worker.js", import.meta.url), {
    type: "module",
  });
}
