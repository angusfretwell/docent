/**
 * The `docent` entry logic, parameterised by the built client assets so the
 * compile entry (`bin.ts`) can hand it either the on-disk dev build or the
 * assets embedded into the `bun build --compile` binary
 * (docs/spec/architecture.md §5).
 *
 * `docent serve` — the default when no subcommand is given — boots the local
 * server for the repo containing the current directory, prints the URL, and
 * opens the browser. Non-serve subcommands route through this same binary.
 */

import { BunRuntime } from "@effect/platform-bun";
import { Console, Effect, Schema } from "effect";
import open from "open";
import type { ClientAssets } from "../client/assets.ts";
import { resolveChange } from "./git.ts";
import { layer as serveLayer, serverUrl } from "./serve.ts";

class ClientAssetsMissing extends Schema.TaggedErrorClass<ClientAssetsMissing>()(
  "ClientAssetsMissing",
  {},
) {
  override get message(): string {
    return "client assets not embedded — run `bun run build` first";
  }
}

// Best-effort browser open, only for interactive runs — piped/headless
// callers get just the printed URL.
const openBrowser = Effect.fn("openBrowser")(
  (url: string) => Effect.tryPromise(() => open(url)),
  // No opener available — the URL is printed above.
  (effect) => Effect.ignore(effect),
);

const serve = (assets: ClientAssets) =>
  Effect.gen(function* () {
    if (assets.size === 0) {
      return yield* Effect.fail(ClientAssetsMissing.make({}));
    }

    // Fail fast (and get the log line) before announcing the server; requests
    // still re-resolve the diff live from git on every load.
    const change = yield* resolveChange(process.cwd());
    const url = yield* serverUrl;

    yield* Console.log(
      `docent  ·  ${change.branch} → ${change.defaultBranch} @ ${change.root}`,
    );
    yield* Console.log(`        ·  ${url}`);

    if (process.stdout.isTTY) {
      yield* openBrowser(url);
    }

    // Serve until interrupted (Ctrl+C); the layer's scope stops the server.
    return yield* Effect.never;
  }).pipe(Effect.provide(serveLayer({ assets, cwd: process.cwd() })));

/**
 * The process entry: dispatch the subcommand and run it. `serve` is the
 * default; every subcommand is served by this one binary.
 */
export function runMain(assets: ClientAssets): void {
  const subcommand = process.argv[2] ?? "serve";
  if (subcommand !== "serve") {
    console.error(`unknown subcommand: ${subcommand} (expected "serve")`);
    process.exit(1);
  }

  BunRuntime.runMain(
    serve(assets).pipe(
      Effect.catch((error) =>
        Effect.andThen(
          Console.error(error instanceof Error ? error.message : String(error)),
          Effect.sync(() => process.exit(1)),
        ),
      ),
    ),
  );
}
