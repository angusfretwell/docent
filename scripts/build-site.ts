#!/usr/bin/env bun

/**
 * Bundle the marketing site to `dist/site` as plain static output.
 *
 * Like `build-docent.ts`, this goes through `Bun.build` rather than the CLI
 * because the site's stylesheet needs `bun-plugin-tailwind` to compile Tailwind
 * at bundle time, and the CLI doesn't support bundler plugins.
 *
 * @see docs/adr/0003-site-as-a-static-build-target.md
 */

import fs from "node:fs/promises";
import path from "node:path";

import tailwind from "bun-plugin-tailwind";

const root = path.join(import.meta.dir, "..");
const outdir = path.join(root, "dist", "site");

await fs.rm(outdir, { force: true, recursive: true });

try {
  const result = await Bun.build({
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    entrypoints: [path.join(root, "src", "site", "index.html")],
    minify: true,
    outdir,
    plugins: [tailwind],
    target: "browser",
  });

  if (result.logs.length > 0) {
    console.warn("Bundled site with warnings:");
    for (const message of result.logs) {
      console.warn(message);
    }
  }
} catch (error) {
  console.error("Failed to bundle site:");
  console.error(error);
  process.exit(1);
}
