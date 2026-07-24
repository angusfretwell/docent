/**
 * The `docent` command tree and the process entry that runs it. The single
 * entry point `src/docent.ts` — the `bun build --compile` target and the
 * `bun --watch` dev entry alike — imports the client's `index.html` and the
 * pre-bundled diff worker and passes them in here as `EntryOptions`.
 *
 * Every subcommand is served by this one binary (architecture.md §5). `serve`
 * boots the fullstack server and is also the root command's own handler, so a
 * bare `docent` serves the current directory; `install` onboards; `finding`,
 * `walkthrough`, `capture` and `review` write; `validate` reports; `status`
 * detects. Argv parsing, `--help`, and `--version` belong to
 * `effect/unstable/cli`; this file only assembles the tree and owns the failure
 * tail.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Data, Effect, Option, Runtime } from "effect";
import { Argument, CliError, Command } from "effect/unstable/cli";
import { FetchHttpClient } from "effect/unstable/http";

import type { EntryOptions } from "../serve";
import { serve } from "../serve";
import { captureCommand } from "./capture";
import { findingCommand } from "./finding";
import { installCommand } from "./install";
import { reviewCommand } from "./review";
import { statusCommand } from "./status";
import { WorkingDirectory } from "./usage";
import { validateCommand } from "./validate";
import { walkthroughCommand } from "./walkthrough";

/** What `--version` reports. The released binary is versioned by `npm/package.json`. */
const VERSION = "0.0.0";

/**
 * A failure whose human message has already reached stderr. Marking it here
 * rather than on each error class is what keeps the marker true: "already
 * reported" is a fact about the tail, not about `CliUsageError` or the
 * platform's own `PlatformError`, which the tail also prints.
 */
class Reported extends Data.TaggedError("Reported") {
  override readonly [Runtime.errorReported] = false;
}

/**
 * Print the error message on stderr, then re-fail — the shared failure tail for
 * every subcommand. All the binary's own errors carry a human `.message`.
 *
 * The re-fail is load-bearing: `process.exit` here would tear the process down
 * mid-fiber and skip every pending finalizer — the provided layers' scopes,
 * `install`'s scoped child process, `serve`'s recorded-address cleanup.
 * `runMain` instead unwinds them and lets `Runtime.defaultTeardown` pick the
 * exit code — 1 for a plain failure.
 *
 * A `ShowHelp` failure is re-raised untouched: the runner has already rendered
 * the help, and the error carries its own exit code (0 for an asked-for
 * `--help`, 1 for a usage error) through `Runtime.errorExitCode`.
 */
export function crash(
  error: unknown
): Effect.Effect<never, CliError.ShowHelp | Reported> {
  if (CliError.isCliError(error) && error._tag === "ShowHelp") {
    return Effect.fail(error);
  }
  return Effect.andThen(
    Console.error(error instanceof Error ? error.message : String(error)),
    Effect.fail(new Reported())
  );
}

/**
 * The `docent` tree: `serve` (also the root's own handler, so a bare `docent`
 * serves) plus every non-serve subcommand. Parameterised by the bundled client
 * because only `serve` needs it.
 */
function docentCli(entry: EntryOptions) {
  const serveHere = Effect.gen(function* serveHere() {
    const cwd = yield* WorkingDirectory;
    return yield* serve(entry, cwd);
  });

  const serveCommand = Command.make(
    "serve",
    {
      directory: Argument.string("directory").pipe(
        Argument.optional,
        Argument.withDescription("The repo to serve (default: this directory)")
      ),
    },
    (config) =>
      Option.match(config.directory, {
        onNone: () => serveHere,
        onSome: (directory) => serve(entry, directory),
      })
  ).pipe(Command.withDescription("Serve the Review's UI for a repo"));

  return Command.make("docent", {}, () => serveHere).pipe(
    Command.withDescription(
      "Local code review: walkthroughs, findings, and the diff"
    ),
    Command.withSubcommands([
      serveCommand,
      findingCommand,
      walkthroughCommand,
      captureCommand,
      reviewCommand,
      validateCommand,
      installCommand,
      statusCommand,
    ])
  );
}

/** The process entry: parse argv against the `docent` tree and run the match. */
export function runMain(entry: EntryOptions): void {
  BunRuntime.runMain(
    Command.run(docentCli(entry), { version: VERSION }).pipe(
      // `BunServices` carries no HTTP client, and `status`'s liveness probe is
      // the binary's only outbound request.
      Effect.provide([BunServices.layer, FetchHttpClient.layer]),
      Effect.catch(crash)
    )
  );
}
