#!/usr/bin/env bun

/**
 * The `docent` entry point and `bun build --compile` target. Bun's fullstack
 * bundler embeds the client (the `index.html` import — Bun bundles its scripts
 * and styles) and the pre-bundled diff worker (the `with { type: "file" }`
 * import) straight into the binary, so the compiled `docent` serves the full
 * app with nothing read off disk. `development: false` and an OS-picked port
 * (`0`) are the prod serving shape; `runMain` owns subcommand dispatch.
 *
 * The worker bundle must exist first (`bun run scripts/bundle-worker.ts`), which
 * `mise build` / `mise compile` run automatically. Excluded from `tsc` (the
 * bundler-magic imports have no ambient types) — the typed logic is in main.ts.
 */

import workerBundle from "./dist/worker/diff-worker.js" with { type: "file" };
import index from "./src/client/index.html";
import { runMain } from "./src/server/main";

runMain({ development: false, index, port: 0, workerBundle });
