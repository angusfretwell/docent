export const themes = {
  dark: "pierre-dark-soft",
  light: "pierre-light",
} as const;

/**
 * One Shiki-tokenizing worker per hardware thread (capped by the caller).
 * Tokenization must stay off the main thread: the #4 re-benchmark measured
 * worker-off scroll at p95 225 ms with 15 long frames vs. zero with the pool on.
 */
export function workerFactory() {
  // Bun's fullstack bundler can't bundle a browser Web Worker referenced by
  // `new Worker(new URL(…, import.meta.url))` (oven-sh/bun#29478), so the worker
  // is pre-bundled (scripts/build-worker.ts) and served at this fixed route by
  // the server (see the `/diff-worker.js` route in src/serve/index.ts).
  return new Worker("/diff-worker.js", {
    type: "module",
  });
}
