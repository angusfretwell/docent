#!/usr/bin/env bun
/**
 * The `mise dev` / `bun run dev` runner: one command that boots docent against
 * the rich dev fixture with hot reload. It prepares, then hands off to the
 * watching dev entry — with one server process there is nothing to supervise:
 *
 *  1. ensure the pre-bundled diff worker exists (scripts/bundle-worker.ts),
 *     since `dev.ts` imports it and Bun's bundler can't build the worker inline;
 *  2. materialize the fixture repo when `.dev/fixture/` is missing — an existing
 *     one (with its uncommitted Pending edit) is left untouched so it survives
 *     across runs (scripts/fixture.ts);
 *  3. exec `bun --watch dev.ts` with its cwd set to the target repo, so the
 *     server — which serves `process.cwd()` — renders that repo's review.
 *
 * With no argument the target is the fixture; an optional path argument points
 * the dev server at a real repo instead (fixture prep is skipped).
 *
 *   bun run dev            # against .dev/fixture/
 *   bun run dev ../my-repo # against an arbitrary repo
 */

import { existsSync } from "node:fs";
import path from "node:path";

const repoRoot = path.join(import.meta.dir, "..");
const workerBundle = path.join(repoRoot, "dist", "worker", "diff-worker.js");
const fixture = path.join(repoRoot, ".dev", "fixture");
const devEntry = path.join(repoRoot, "dev.ts");

/** Run a repo prep script to completion, exiting the runner if it fails. */
function prepare(script: string): void {
  const result = Bun.spawnSync(
    ["bun", path.join(repoRoot, "scripts", script)],
    { stdio: ["inherit", "inherit", "inherit"] }
  );
  if (!result.success) {
    process.exit(result.exitCode ?? 1);
  }
}

// An optional path argument targets a real repo; without it we boot the fixture.
const pathArgument = process.argv.at(2);
const target =
  pathArgument === undefined ? fixture : path.resolve(pathArgument);

if (pathArgument !== undefined && !existsSync(target)) {
  console.error(`docent dev: no such directory: ${target}`);
  process.exit(1);
}

if (!existsSync(workerBundle)) {
  prepare("bundle-worker.ts");
}

if (pathArgument === undefined && !existsSync(fixture)) {
  prepare("fixture.ts");
}

const server = Bun.spawn(["bun", "--watch", devEntry], {
  cwd: target,
  stdio: ["inherit", "inherit", "inherit"],
});

// The runner owns the terminal only to forward Ctrl+C and let the watcher exit
// cleanly; it then exits with the dev server's own status.
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

process.exit((await server.exited) ?? 0);
