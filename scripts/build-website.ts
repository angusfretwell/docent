#!/usr/bin/env bun

/**
 * Bundle the marketing website to `dist/website` as plain static output: the
 * landing page at the root, and under `demo/` the hosted demo — the real review
 * client replaying a captured snapshot with no backend.
 *
 * Like `build-docent.ts`, this goes through `Bun.build` rather than the CLI
 * because the website's stylesheet needs `bun-plugin-tailwind` to compile
 * Tailwind at bundle time, and the CLI doesn't support bundler plugins.
 *
 * @see docs/adr/0003-website-as-a-static-build-target.md
 * @see scripts/assemble-vercel-output.ts for the layout the deploy expects.
 */

import fs from "node:fs/promises";
import path from "node:path";

import tailwind from "bun-plugin-tailwind";

import { ensureDiffWorker, workerBundle } from "./build-worker";

const root = path.join(import.meta.dir, "..");
const outdir = path.join(root, "dist", "website");
const demoOutdir = path.join(outdir, "demo");
const snapshotFile = path.join(root, "dist", "demo-snapshot.json");

/**
 * Two calls, not one entrypoint list: a single `Bun.build` shares one `outdir`
 * and one `publicPath`, and the two pages need different ones.
 *
 * `publicPath` is what makes the emitted asset urls absolute. Bun's HTML loader
 * writes them relative by default, and the demo's SPA fallback serves the same
 * html at every `/demo/*` url, so a relative url would resolve against whichever
 * url served it and a two-segment deep link would 404 its own bundle.
 *
 * Everything then has to land beside the html rather than under an `assets/`
 * prefix. Bun 1.3.14 builds an asset's url as `publicPath` joined with the
 * asset's path *relative to the chunk that imports it*, which only agrees with
 * where the file was written when that chunk sits at the root: a chunk in
 * `assets/` points `<img src>` at `/icon-<hash>.svg` for a file written to
 * `assets/icon-<hash>.svg`. One flat directory keeps the two in step, and the
 * deploy's immutable cache-control rule matches the hash in the filename.
 */
async function bundlePage(
  entrypoint: string,
  into: string,
  publicPath: string
): Promise<void> {
  const result = await Bun.build({
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    entrypoints: [entrypoint],
    minify: true,
    naming: {
      asset: "[name]-[hash].[ext]",
      chunk: "[name]-[hash].[ext]",
      entry: "[dir]/[name].[ext]",
    },
    outdir: into,
    plugins: [tailwind],
    publicPath,
    // No `splitting: true`, for a cousin of the reason `build-docent.ts` can't
    // split: under Bun 1.3.14's html loader it emits ~360 chunks with no
    // imports between them and points the `<script>` at a leaf, so the demo
    // never boots. Until that's fixed upstream the demo ships as one chunk.
    target: "browser",
  });

  if (result.logs.length > 0) {
    console.warn(`Bundled ${path.relative(root, entrypoint)} with warnings:`);
    for (const message of result.logs) {
      console.warn(message);
    }
  }
}

/**
 * The worker is bundled standalone (oven-sh/bun#29478) and loaded by url, so the
 * demo needs it as a file beside its html — without it the diff renders
 * unhighlighted.
 * @see src/client/lib/worker-factory.ts
 */
async function copyDiffWorker(): Promise<void> {
  await ensureDiffWorker();

  await fs.cp(workerBundle, path.join(demoOutdir, "diff-worker.js"));
}

/**
 * Fetched at runtime rather than bundled, so this build — and with it
 * `bun run build` and preflight — stays green on a clone where nobody has run
 * the heavy capture. A deploy missing the snapshot is caught by
 * `assemble-vercel-output.ts`, which refuses to assemble without it.
 */
async function copySnapshot(): Promise<void> {
  if (!(await Bun.file(snapshotFile).exists())) {
    console.warn(
      `No ${path.relative(root, snapshotFile)}, so the demo will boot to a blank page. Record it with \`bun run build:snapshot\`.`
    );
    return;
  }

  await fs.cp(snapshotFile, path.join(demoOutdir, "demo-snapshot.json"));
}

await fs.rm(outdir, { force: true, recursive: true });

try {
  await bundlePage(
    path.join(root, "src", "website", "index.html"),
    outdir,
    "/"
  );
  await bundlePage(
    path.join(root, "src", "website", "demo", "index.html"),
    demoOutdir,
    "/demo/"
  );

  await copyDiffWorker();
  await copySnapshot();
} catch (error) {
  console.error("Failed to bundle website:");
  console.error(error);
  process.exit(1);
}
