/**
 * The `docent validate` subcommand — the CLI face of the schema oracle
 * (architecture.md §3, testing.md). It resolves a `.docent/` state root from an
 * optional path (default: the current directory), decodes every record against
 * the shared schemas via `validateStateRoot`, and prints each malformed record.
 *
 * It is **non-gating** (data-model.md §1): the files stay plain and directly
 * writable; validate only reports. The report is signalled two ways — the
 * offending records on stdout, and a non-zero exit when any failed (a typed
 * failure through the shared crash tail, whose summary lands on stderr) — so a
 * test suite can gate on the exit code while a human reads the detail.
 */

import { Console, Effect, Schema } from "effect";
import { Path } from "effect/Path";
import { Argument, Command } from "effect/unstable/cli";

import { resolveStateRoot, validateStateRoot } from "../core/validate";
import { attempt, CliUsageError, WorkingDirectory } from "./usage";

/**
 * The report found invalid records. A typed failure so the shared crash tail
 * prints the summary to stderr and exits non-zero — the oracle's report signal
 * (testing.md). It never blocks a write; it only reports.
 */
export class ValidationFailed extends Schema.TaggedErrorClass<ValidationFailed>()(
  "ValidationFailed",
  {
    checked: Schema.Number,
    invalid: Schema.Number,
    stateRoot: Schema.String,
  }
) {
  override get message(): string {
    return `${this.invalid} of ${this.checked} record(s) invalid in ${this.stateRoot}`;
  }
}

/**
 * The lone target path, or `undefined` for the current directory. Declared
 * variadic rather than optional because a second positional is a usage error
 * here, and the parser silently drops arguments no parameter claims.
 */
export function onlyPath(paths: readonly string[]): string | undefined {
  if (paths.length > 1) {
    throw new CliUsageError({
      reason: `validate takes at most one path (got ${paths.length})`,
    });
  }
  return paths[0];
}

/** The `docent validate [path]` subcommand — the non-gating schema oracle. */
export const validateCommand = Command.make(
  "validate",
  {
    paths: Argument.string("path").pipe(
      Argument.variadic(),
      Argument.withDescription("The tree to validate (default: this directory)")
    ),
  },
  (config) =>
    Effect.gen(function* runValidate() {
      const cwd = yield* WorkingDirectory;
      const path = yield* Path;
      const target = yield* attempt(() => onlyPath(config.paths));
      const base = target === undefined ? cwd : path.resolve(cwd, target);

      const stateRoot = yield* resolveStateRoot(base);
      const report = yield* validateStateRoot(stateRoot);

      for (const problem of report.problems) {
        yield* Console.log(`${problem.file}: ${problem.message}`);
      }

      if (report.problems.length > 0) {
        return yield* Effect.fail(
          new ValidationFailed({
            checked: report.checked,
            invalid: report.problems.length,
            stateRoot: report.stateRoot,
          })
        );
      }

      yield* Console.log(
        `ok — ${report.checked} record(s) valid in ${report.stateRoot}`
      );
    })
).pipe(
  Command.withDescription("Decode every record in a .docent/ tree and report")
);
