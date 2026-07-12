/**
 * The `docent` entry logic, parameterised by the bundled client so the two
 * entry points hand it what Bun's fullstack bundler produced: `bin.ts` (the
 * `bun build --compile` target, `development: false`) and `dev.ts` (the
 * `bun --watch` dev entry, HMR on). Both import the client's `index.html` and
 * the pre-bundled diff worker and pass them in here.
 *
 * `docent serve` — the default when no subcommand is given — boots one plain
 * `Bun.serve` process for the repo containing the current directory: Bun's
 * HTML-bundle route serves the UI, the pre-bundled worker is served at
 * `/diff-worker.js`, and the Effect `/api/*` routes run one level down behind
 * `webHandler`'s `fetch`. Non-serve subcommands route through this same binary.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import type { HTMLBundle } from "bun";
import { Console, Effect } from "effect";
import open from "open";

import { runFinding } from "./cli/finding";
import { runInstall } from "./cli/install";
import { runStatus } from "./cli/status";
import { runValidate } from "./cli/validate";
import { runCapture, runWalkthrough } from "./cli/walkthrough";
import { removeServeAddress, writeServeAddress } from "./lib/serve-address";
import { webHandler } from "./routes";
import { resolveChange } from "./services/git";

/** What an entry point hands `runMain`: the bundled client and dev/prod knobs. */
export interface EntryOptions {
  /** `Bun.serve` development mode: `false` in the compiled binary, HMR in dev. */
  development: boolean | { console?: boolean; hmr?: boolean };
  /** The client bundle (`import index from "./src/client/index.html"`). */
  index: HTMLBundle;
  /** TCP port; `0` lets the OS pick (prod), a fixed port survives dev reloads. */
  port: number;
  /** `Bun.file` path to the pre-bundled diff worker (disk in dev, embedded in prod). */
  workerBundle: string;
}

// Best-effort browser open, only for interactive runs — piped/headless
// callers get just the printed URL.
const openBrowser = Effect.fn("openBrowser")(
  (url: string) => Effect.tryPromise(() => open(url)),
  // No opener available — the URL is printed above.
  (effect) => Effect.ignore(effect)
);

/**
 * Boot the fullstack server: Bun's HTML-bundle route serves the client, the
 * pre-bundled diff worker is served at `/diff-worker.js`, and the Effect
 * `/api/*` handler is the `fetch` fallback for everything Bun doesn't match.
 */
function serve(entry: EntryOptions) {
  const cwd = process.cwd();

  return Effect.gen(function* serveApp() {
    // Fail fast (and get the log line) before binding the port; requests still
    // re-resolve the diff live from git on every load.
    const change = yield* resolveChange(cwd);

    // Built once; `Bun.serve` calls `fetch(request, server)`, but the Effect
    // handler reads only the request, so wrap it to drop Bun's second argument.
    const { handler } = webHandler({ cwd });

    const server = yield* Effect.sync(() =>
      Bun.serve({
        development: entry.development,
        fetch: (request) => handler(request),
        // Loopback only, IPv4: `127.0.0.1` (not `localhost`) so the printed URL
        // is reachable on hosts where `localhost` resolves to IPv6-only.
        hostname: "127.0.0.1",
        // Never drop the long-lived SSE connection (`/api/events`) for being idle.
        idleTimeout: 0,
        port: entry.port,
        routes: {
          "/": entry.index,
          // The pre-bundled diff worker (scripts/bundle-worker.ts); the client's
          // `workerFactory` in code-view.ts loads it from this exact path.
          "/diff-worker.js": () =>
            new Response(Bun.file(entry.workerBundle), {
              headers: { "content-type": "text/javascript; charset=utf-8" },
            }),
        },
      })
    );
    const url = server.url.href;

    // Record the live URL so `docent status` (and `/docent`) can detect and
    // reuse this server instead of starting a second one; cleared on shutdown.
    // Best-effort — a serve that cannot write its address still serves.
    yield* writeServeAddress(change.root, url).pipe(Effect.ignore);

    yield* Console.log(
      `docent  ·  ${change.branch} → ${change.defaultBranch} @ ${change.root}`
    );
    yield* Console.log(`        ·  ${url}`);

    if (process.stdout.isTTY) {
      yield* openBrowser(url);
    }

    // Serve until interrupted (Ctrl+C); Bun keeps the server alive meanwhile.
    // `ensuring` runs on interruption too, so the address file is cleared when
    // the process is stopped.
    return yield* Effect.never.pipe(
      Effect.ensuring(removeServeAddress(change.root).pipe(Effect.ignore))
    );
  }).pipe(Effect.provide(BunServices.layer));
}

// Print the error message and exit non-zero — the shared failure tail for every
// subcommand. All the binary's errors carry a human `.message`.
function crash(error: unknown) {
  return Effect.andThen(
    Console.error(error instanceof Error ? error.message : String(error)),
    Effect.sync(() => process.exit(1))
  );
}

/** Run one non-serve CLI effect: provide the Bun services and crash on failure. */
function runCli<E>(
  effect: Effect.Effect<void, E, BunServices.BunServices>
): void {
  BunRuntime.runMain(
    effect.pipe(Effect.provide(BunServices.layer), Effect.catch(crash))
  );
}

// An argv-consuming non-serve subcommand: resolves against git + fs from `cwd`
// (architecture.md §5) and produces its own typed error channel. The `unknown`
// here is only the dispatch table's storage type — each registered runner
// below keeps its own concrete error type at its definition; entries are
// matched runners, never unified into one callable.
type SubcommandRunner = (
  cwd: string,
  argv: readonly string[]
) => Effect.Effect<void, unknown, BunServices.BunServices>;

// The non-serve CLI subcommands, each an argv → effect the binary runs against
// git + fs. `install` is the onboarding wizard; `finding` is the review loop's
// I/O; `walkthrough` and `capture` the walkthrough write path — one binary, one
// write implementation; `validate` the non-gating schema oracle over any
// `.docent/` tree (§3); `status` reports whether a docent server is already
// serving this repo.
const CLI_SUBCOMMANDS: Record<string, SubcommandRunner> = {
  capture: runCapture,
  finding: runFinding,
  install: runInstall,
  status: runStatus,
  validate: runValidate,
  walkthrough: runWalkthrough,
};

/**
 * Look up `name` in `table` and run its registered effect through the shared
 * `provide + crash` tail, or — for a name not registered — print the usual
 * "unknown subcommand" usage error (naming every registered name plus `serve`)
 * and exit non-zero.
 */
function dispatch(
  name: string,
  argv: readonly string[],
  table: Record<string, SubcommandRunner>
): void {
  const runner = table[name];
  if (runner === undefined) {
    const known = ["serve", ...Object.keys(table)]
      .map((candidate) => `"${candidate}"`)
      .join(", ");
    console.error(`unknown subcommand: ${name} (expected one of ${known})`);
    process.exit(1);
    return;
  }
  runCli(runner(process.cwd(), argv));
}

/**
 * The process entry: dispatch the subcommand and run it. `serve` — the default
 * when no subcommand is given — boots the server; every other subcommand
 * (`install` onboards; `finding`, `walkthrough`, `capture` write; `validate`
 * reports; `status` detects) runs through `dispatch` against `CLI_SUBCOMMANDS`.
 * Every subcommand is served by this one binary (architecture.md §5).
 */
export function runMain(entry: EntryOptions): void {
  const subcommand = process.argv[2] ?? "serve";
  const argv = process.argv.slice(3);

  if (subcommand === "serve") {
    BunRuntime.runMain(serve(entry).pipe(Effect.catch(crash)));
    return;
  }

  dispatch(subcommand, argv, CLI_SUBCOMMANDS);
}
