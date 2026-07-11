#!/usr/bin/env bun
/**
 * Pre-bundle the diff renderer's Shiki-tokenizing Web Worker into one
 * browser bundle at `dist/worker/diff-worker.js`, which the server serves at
 * `/diff-worker.js` (the client's `workerFactory` points there).
 *
 * Bun's fullstack bundler can't yet bundle a browser Web Worker referenced via
 * `new Worker(new URL(…, import.meta.url))` (oven-sh/bun#29478), so the worker
 * is bundled here standalone instead — served off disk in dev and embedded into
 * the compiled binary in prod (via `bin.ts`'s `with { type: "file" }` import).
 * The step is folded into the dev, serve, and compile flows and re-runs only
 * when `@pierre/diffs` bumps.
 *
 *   bun run scripts/bundle-worker.ts
 */

import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");
const entrypoint = Bun.resolveSync("@pierre/diffs/worker/worker.js", repoRoot);
const outdir = path.join(repoRoot, "dist", "worker");

const result = await Bun.build({
  entrypoints: [entrypoint],
  minify: true,
  naming: "diff-worker.[ext]",
  outdir,
  target: "browser",
});

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}

const [output] = result.outputs;
console.log(
  `bundled diff worker → ${path.relative(repoRoot, output?.path ?? outdir)}`
);
