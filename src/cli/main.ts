/**
 * The `docent` entry logic: dispatch the subcommand named on argv and run it.
 * The single entry point `src/docent.ts` — the `bun build --compile` target
 * and the `bun --watch` dev entry alike — imports the client's `index.html`
 * and the pre-bundled diff worker and passes them in here as `EntryOptions`.
 *
 * `docent serve` — the default when no subcommand is given — boots the
 * fullstack server (`../api/serve`); every non-serve subcommand routes through
 * this same binary via the dispatch table below.
 */

import { BunRuntime, BunServices } from "@effect/platform-bun";
import { Console, Effect } from "effect";

import type { EntryOptions } from "../api/serve";
import { serve } from "../api/serve";
import { runFinding } from "./finding";
import { runInstall } from "./install";
import { runStatus } from "./status";
import { runValidate } from "./validate";
import { runCapture, runWalkthrough } from "./walkthrough";

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
