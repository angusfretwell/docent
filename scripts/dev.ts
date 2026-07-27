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

import path from "node:path";

import { ensureRecorder } from "./build-recorder";
import { ensureDiffWorker } from "./build-worker";

const PORT = process.env.PORT ?? "8037";

const root = path.join(import.meta.dir, "..");
const entry = path.join(root, "src", "docent.ts");
const fixture = path.join(root, ".dev");

// An optional path argument targets a real repo; without it we boot the fixture.
const pathArgument = process.argv.at(2);

const target = pathArgument ? path.resolve(pathArgument) : fixture;

await ensureDiffWorker();
await ensureRecorder();

const server = Bun.spawn(["bun", "--watch", entry, "serve", target], {
  env: { ...process.env, PORT },
  stdio: ["inherit", "inherit", "inherit"],
});

// The runner owns the terminal only to forward Ctrl+C and let the watcher exit
// cleanly; it then exits with the dev server's own status.
process.on("SIGINT", () => server.kill("SIGINT"));
process.on("SIGTERM", () => server.kill("SIGTERM"));

process.exit((await server.exited) ?? 0);
