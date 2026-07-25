#!/usr/bin/env bun

/**
 * Compile the docent binary.
 *
 * `Bun.build` (not a plain `bun build --compile`) because the CLI doesn't
 * support bundler plugins, and the client's stylesheet needs
 * `bun-plugin-tailwind` to compile Tailwind at bundle time (the bunfig
 * `[serve.static]` registration only covers the dev server).
 *
 * Run directly (`build:docent`) it compiles for the host into `dist/docent`.
 * `build-release.ts` imports `compileDocent` to cross-compile the per-platform
 * release assets, so both binaries embed the same version and build config.
 */

import path from "node:path";

import tailwind from "bun-plugin-tailwind";

const root = path.join(import.meta.dir, "..");

/**
 * Compile `src/docent.ts` into a standalone binary. `target` cross-compiles for
 * another platform (any `Bun.Build.CompileTarget`); omit it to build for the
 * host. Rejects if the compile fails.
 */
export async function compileDocent({
  outfile,
  target,
}: {
  outfile: string;
  target?: Bun.Build.CompileTarget;
}) {
  const { version } = await Bun.file(
    path.join(root, "npm", "package.json")
  ).json();

  const result = await Bun.build({
    compile: target ? { outfile, target } : { outfile },
    define: {
      "process.env.DOCENT_VERSION": JSON.stringify(version),
      "process.env.NODE_ENV": JSON.stringify("production"),
    },
    entrypoints: [path.join(root, "src", "docent.ts")],
    minify: true,
    plugins: [tailwind],
    // No `splitting: true`: under `compile`, Bun 1.3.14 drops one client
    // shared chunk from the served routes (404), so the split app can't boot.
    // Everything stays in one client chunk until that's fixed upstream.
  });

  if (result.logs.length > 0) {
    console.warn(`Compiled ${path.basename(outfile)} with warnings:`);
    for (const message of result.logs) {
      console.warn(message);
    }
  }

  return result;
}

if (import.meta.main) {
  try {
    await compileDocent({ outfile: path.join(root, "dist", "docent") });
  } catch (error) {
    console.error("Failed to compile docent:");
    console.error(error);
    process.exit(1);
  }
}
