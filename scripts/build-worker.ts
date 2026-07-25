#!/usr/bin/env bun

/**
 * Pre-bundle the diff renderer's Shiki-tokenizing Web Worker into one
 * browser bundle at `dist/worker/diff-worker.js`, which the server serves at
 * `/diff-worker.js` (the client's `workerFactory` points there).
 *
 * Bun's fullstack bundler can't yet bundle a browser Web Worker referenced via
 * `new Worker(new URL(…, import.meta.url))` (oven-sh/bun#29478), so the worker
 * is bundled here standalone instead — served off disk in dev and embedded into
 * the compiled binary in prod (via `src/docent.ts`'s `with { type: "file" }`
 * import). The step is folded into the dev and build flows and re-runs only
 * when `@pierre/diffs` bumps.
 *
 * Run directly (`build:worker`) it always rebuilds; the dev, website-build and
 * capture flows import `ensureDiffWorker` so a bundle already on disk is reused.
 */

import path from "node:path";

const root = path.join(import.meta.dir, "..");
const outdir = path.join(root, "dist", "worker");

export const workerBundle = path.join(outdir, "diff-worker.js");

/** Rejects if the bundle fails, so a caller never proceeds against a missing worker. */
export async function bundleDiffWorker(): Promise<void> {
  const entry = Bun.resolveSync("@pierre/diffs/worker/worker.js", root);

  const result = await Bun.build({
    entrypoints: [entry],
    minify: true,
    naming: "diff-worker.[ext]",
    outdir,
    target: "browser",
  });

  if (result.logs.length > 0) {
    console.warn("Bundled diff worker with warnings:");
    for (const message of result.logs) {
      console.warn(message);
    }
  }
}

export async function ensureDiffWorker(): Promise<void> {
  if (await Bun.file(workerBundle).exists()) {
    return;
  }

  await bundleDiffWorker();
}

if (import.meta.main) {
  try {
    await bundleDiffWorker();
  } catch (error) {
    console.error("Failed to bundle diff worker:");
    console.error(error);
    process.exit(1);
  }
}
