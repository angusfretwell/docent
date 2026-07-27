#!/usr/bin/env bun

/**
 * Assemble `.vercel/output` — the Build Output API directory that
 * `vercel deploy --prebuilt` uploads — from the finished static build in
 * `dist/website`.
 *
 * The deploy is prebuilt because producing `dist/website` means preparing the
 * fixture and driving a headless browser to capture the demo snapshot, which is
 * work for the CI runner rather than the host's builder. `--prebuilt` uploads
 * this directory verbatim and the platform runs no install and no build, so the
 * routing contract has to live in `config.json` here rather than in Vercel's
 * out-of-repo Project Settings.
 *
 * @see docs/adr/0003-website-as-a-static-build-target.md
 * @see https://vercel.com/docs/build-output-api/v3/configuration
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * `handle: filesystem` splits the routing phases: rules above it are evaluated
 * before the static files are consulted, rules below it only once the filesystem
 * lookup has missed. So the demo's SPA fallback cannot swallow its own bundle,
 * `/demo/diff-worker.js` or `/demo/demo-snapshot.json`, and the landing page
 * needs no rule at all — the filesystem phase serves `static/index.html` at `/`.
 *
 * Only content-hashed files get the immutable header, and the website build writes
 * them flat beside the html, so the rule matches Bun's `-[hash].[ext]` suffix
 * rather than a directory. `index.html`, `og.png`, `diff-worker.js` and
 * `demo-snapshot.json` keep revalidating because their names are stable across
 * deploys.
 */
const config = {
  routes: [
    {
      continue: true,
      headers: { "cache-control": "public, max-age=31536000, immutable" },
      src: "^/(?:demo/)?[^/]+-[a-z0-9]{8}\\.(?:css|js|svg)$",
    },
    { handle: "filesystem" },
    { check: true, dest: "/demo/index.html", src: "^/demo(?:/(.*))?$" },
  ],
  version: 3,
};

/**
 * A build that half-succeeded deploys perfectly happily and fails as a white
 * screen in production, so the layout the routes assume is checked up front.
 */
const REQUIRED = [
  "index.html",
  "og.png",
  "demo/index.html",
  "demo/diff-worker.js",
  "demo/demo-snapshot.json",
];

const root = path.join(import.meta.dir, "..");
const dist = path.join(root, "dist", "website");
const output = path.join(root, ".vercel", "output");

const checked = await Promise.all(
  REQUIRED.map(async (file) => ({
    exists: await Bun.file(path.join(dist, file)).exists(),
    file,
  }))
);

const missing = checked
  .filter((entry) => !entry.exists)
  .map((entry) => entry.file);

if (missing.length > 0) {
  console.error(`Incomplete website build in dist/website, missing:`);
  for (const file of missing) {
    console.error(`  ${file}`);
  }
  process.exit(1);
}

await fs.rm(output, { force: true, recursive: true });
await fs.cp(dist, path.join(output, "static"), { recursive: true });
await Bun.write(
  path.join(output, "config.json"),
  `${JSON.stringify(config, null, 2)}\n`
);
