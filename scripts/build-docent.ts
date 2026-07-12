#!/usr/bin/env bun

/**
 * Compile the docent binary to `dist/docent`.
 *
 * This replaces a plain `bun build --compile` invocation because the CLI
 * doesn't support bundler plugins, and the client's stylesheet needs
 * `bun-plugin-tailwind` to compile Tailwind at bundle time (the bunfig
 * `[serve.static]` registration only covers the dev server).
 */

import path from "node:path";

import tailwind from "bun-plugin-tailwind";

const root = path.join(import.meta.dir, "..");

try {
  const result = await Bun.build({
    compile: { outfile: path.join(root, "dist", "docent") },
    define: { "process.env.NODE_ENV": JSON.stringify("production") },
    entrypoints: [path.join(root, "src", "docent.ts")],
    minify: true,
    plugins: [tailwind],
  });

  if (result.logs.length > 0) {
    console.warn("Compiled docent with warnings:");
    for (const message of result.logs) {
      console.warn(message);
    }
  }
} catch (error) {
  console.error("Failed to compile docent:");
  console.error(error);
  process.exit(1);
}
