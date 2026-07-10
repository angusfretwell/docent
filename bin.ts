#!/usr/bin/env bun
/**
 * The `docent` entry point (and eventual `bun build --compile` target).
 * `docent serve` — the default when no subcommand is given — boots the local
 * server for the repo containing the current directory, prints the URL, and
 * opens the browser.
 */

import path from "node:path";
import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, FileSystem, Schema } from "effect";
import open from "open";
import { resolveChange } from "./src/server/git.ts";
import { layer as serveLayer, serverUrl } from "./src/server/serve.ts";

class ClientAssetsMissing extends Schema.TaggedErrorClass<ClientAssetsMissing>()(
  "ClientAssetsMissing",
  { clientDir: Schema.String },
) {
  override get message(): string {
    return "client assets not built — run `bun run build` first";
  }
}

const subcommand = process.argv[2] ?? "serve";
if (subcommand !== "serve") {
  console.error(`unknown subcommand: ${subcommand} (expected "serve")`);
  process.exit(1);
}

// Dev serving path: built client assets on disk. Packaging embeds these into
// the compiled binary later (docs/spec/architecture.md §5).
const clientDir = path.join(import.meta.dir, "dist", "client");

// Best-effort browser open, only for interactive runs — piped/headless
// callers get just the printed URL.
const openBrowser = Effect.fn("openBrowser")(
  (url: string) => Effect.tryPromise(() => open(url)),
  // No opener available — the URL is printed above.
  (effect) => Effect.ignore(effect),
);

const main = Effect.gen(function* main() {
  const fs = yield* FileSystem.FileSystem;
  if (!(yield* fs.exists(path.join(clientDir, "index.html")))) {
    return yield* Effect.fail(ClientAssetsMissing.make({ clientDir }));
  }

  // Fail fast (and get the log line) before announcing the server; requests
  // still re-resolve the diff live from git on every load.
  const change = yield* resolveChange(process.cwd());
  const url = yield* serverUrl;

  yield* Console.log(`docent  ·  ${change.branch} → ${change.defaultBranch} @ ${change.root}`);
  yield* Console.log(`        ·  ${url}`);

  if (process.stdout.isTTY) {
    yield* openBrowser(url);
  }

  // Serve until interrupted (Ctrl+C); the layer's scope stops the server.
  return yield* Effect.never;
});

BunRuntime.runMain(
  main.pipe(
    Effect.provide(serveLayer({ clientDir, cwd: process.cwd() })),
    Effect.catch((error) =>
      Effect.andThen(
        Console.error(error instanceof Error ? error.message : String(error)),
        Effect.sync(() => process.exit(1)),
      ),
    ),
  ),
);
