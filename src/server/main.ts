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

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect, Schema } from "effect";
import open from "open";
import type { ClientAssets } from "../client/assets.ts";
import { runFinding } from "./cli.ts";
import { runCapture, runWalkthrough } from "./cli-walkthrough.ts";
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

function serve(assets: ClientAssets) {
  return Effect.gen(function* serveApp() {
    if (assets.size === 0) {
      return yield* Effect.fail(ClientAssetsMissing.make({}));
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
  }).pipe(Effect.provide(serveLayer({ assets, cwd: process.cwd() })));
}

// Print the error message and exit non-zero — the shared failure tail for every
// subcommand. All the binary's errors carry a human `.message`.
function crash(error: unknown) {
  return Effect.andThen(
    Console.error(error instanceof Error ? error.message : String(error)),
    Effect.sync(() => process.exit(1)),
  );
}

// The non-serve CLI subcommands, each an argv → effect the binary runs against
// git + fs (architecture.md §5). `finding` is the review loop's I/O; `walkthrough`
// and `capture` the walkthrough write path — one binary, one write implementation.
// Each carries its own typed error channel, so they are matched (not unified into
// one callable) and run through the shared `provide + crash` tail below.
const CLI_SUBCOMMANDS = ["finding", "walkthrough", "capture"] as const;

/** Run one non-serve CLI effect: provide the Bun services and crash on failure. */
function runCli<E>(effect: Effect.Effect<void, E, BunServices.BunServices>): void {
  BunRuntime.runMain(effect.pipe(Effect.provide(BunServices.layer), Effect.catch(crash)));
}

/**
 * The process entry: dispatch the subcommand and run it. `serve` — the default
 * when no subcommand is given — boots the server; the non-serve subcommands
 * (`finding`, `walkthrough`, `capture`) are the CLI write path. Every subcommand
 * is served by this one binary (architecture.md §5).
 */
export function runMain(assets: ClientAssets): void {
  const subcommand = process.argv[2] ?? "serve";
  const argv = process.argv.slice(3);

  if (subcommand === "finding") {
    return runCli(runFinding(process.cwd(), argv));
  }
  if (subcommand === "walkthrough") {
    return runCli(runWalkthrough(process.cwd(), argv));
  }
  if (subcommand === "capture") {
    return runCli(runCapture(process.cwd(), argv));
  }

  if (subcommand !== "serve") {
    const known = ["serve", ...CLI_SUBCOMMANDS].map((name) => `"${name}"`).join(", ");
    console.error(`unknown subcommand: ${subcommand} (expected one of ${known})`);
    process.exit(1);
  }

  BunRuntime.runMain(serve(assets).pipe(Effect.catch(crash)));
}
