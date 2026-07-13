#!/usr/bin/env bun

/**
 * The `bun run dev` runner: one command that boots docent against the rich dev
 * fixture with hot reload. It prepares, then hands off to the watching dev
 * entry — with one server process there is nothing to supervise:
 *
 *  1. ensure the pre-bundled diff worker exists (scripts/build-worker.ts),
 *     since `src/docent.ts` imports it and Bun's bundler can't build the worker
 *     inline;
 *  2. exec `bun --watch src/docent.ts` with its cwd set to the target repo, so
 *     the server — which serves `process.cwd()` — renders that repo's review.
 *
 * The fixture repo at `.dev/` is materialized by the `prepare:fixture` step that
 * `bun install` runs, not here. With no argument the target is that fixture; an
 * optional path argument points the dev server at a real repo instead.
 *
 * @example bun run dev             # against .dev/
 * @example bun run dev ~/my-repo   # against an arbitrary repo
 */

import fs from "node:fs";
import path from "node:path";

const PORT = process.env.PORT ?? "4801";

const root = path.join(import.meta.dir, "..");
const workerBundle = path.join(root, "dist", "worker", "diff-worker.js");
const entry = path.join(root, "src", "docent.ts");
const fixture = path.join(root, ".dev");

// An optional path argument targets a real repo; without it we boot the fixture.
const pathArgument = process.argv.at(2);
const target = pathArgument ? path.resolve(pathArgument) : fixture;

if (!fs.existsSync(workerBundle)) {
  const result = Bun.spawnSync(["bun", "build:worker"]);

  if (!result.success) {
    process.exit(result.exitCode ?? 1);
  }
}

// The server runs with its cwd in the target repo, where Bun would never find
// this project's bunfig.toml — pass it explicitly so the [serve.static]
// Tailwind plugin still registers.
const server = Bun.spawn(
  ["bun", `--config=${path.join(root, "bunfig.toml")}`, "--watch", entry],
  {
    cwd: target,
    env: { ...process.env, PORT },
    stdio: ["inherit", "inherit", "inherit"],
  }
);

// The runner owns the terminal only to forward Ctrl+C and let the watcher exit
// cleanly; it then exits with the dev server's own status.
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

process.exit((await server.exited) ?? 0);
