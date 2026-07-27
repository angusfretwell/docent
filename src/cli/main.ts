import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Data, Effect, Option, Runtime } from "effect";
import { Argument, CliError, Command } from "effect/unstable/cli";
import { FetchHttpClient } from "effect/unstable/http";

import type { EntryOptions } from "../serve";
import { serve } from "../serve";
import { VERSION } from "../version";
import { captureCommand } from "./capture";
import { commentCommand } from "./comment";
import { renameCommand } from "./rename";
import { rrwebCommand } from "./rrweb";
import { statusCommand } from "./status";
import { WorkingDirectory } from "./usage";
import { validateCommand } from "./validate";
import { walkthroughCommand } from "./walkthrough";

/** A failure whose human message has already reached stderr. */
class Reported extends Data.TaggedError("Reported") {
  override readonly [Runtime.errorReported] = false;
}

/**
 * The re-fail is load-bearing: `process.exit` here would tear the process down
 * mid-fiber and skip every pending finalizer — the provided layers' scopes,
 * `serve`'s recorded-address cleanup. `runMain` instead unwinds them and lets
 * `Runtime.defaultTeardown` pick the exit code.
 *
 * A `ShowHelp` failure is re-raised untouched: the runner has already rendered
 * the help, and the error carries its own exit code through
 * `Runtime.errorExitCode`.
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

function docentCli(entry: EntryOptions) {
  const serveCommand = Command.make(
    "serve",
    {
      directory: Argument.string("directory").pipe(
        Argument.optional,
        Argument.withDescription(
          "The repo to serve (default: current directory)"
        )
      ),
    },
    (config) =>
      Effect.gen(function* runServe() {
        const cwd = yield* WorkingDirectory;
        return yield* serve(
          entry,
          Option.getOrElse(config.directory, () => cwd)
        );
      })
  ).pipe(Command.withDescription("Serve the review UI"));

  return Command.make("docent").pipe(
    Command.withDescription(
      "Review your agent's work with guided walkthroughs of code and product changes"
    ),
    Command.withSubcommands([
      serveCommand,
      commentCommand,
      walkthroughCommand,
      captureCommand,
      renameCommand,
      validateCommand,
      statusCommand,
      rrwebCommand(entry.recorderBundle),
    ])
  );
}

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
