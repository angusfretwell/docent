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

import { resolveStateRoot, validateStateRoot } from "../core/validate";
import { attempt, CliUsageError } from "./args";

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
 * Parse `validate [path]` argv: an optional target path, no flags. The finding
 * and walkthrough subcommands are all-flags, but validate's one argument is a
 * path — so it takes a lone positional and rejects both flags and a second one.
 */
export function parseValidateArgs(argv: readonly string[]): string | undefined {
  const positionals: string[] = [];
  for (const token of argv) {
    if (token.startsWith("--")) {
      throw new CliUsageError({ reason: `unknown flag: ${token}` });
    }
    positionals.push(token);
  }

  if (positionals.length > 1) {
    throw new CliUsageError({
      reason: `validate takes at most one path (got ${positionals.length})`,
    });
  }
  return positionals[0];
}

/**
 * Run one `docent validate [path]` invocation: resolve the state root, validate
 * every record, print the failures, and fail (exit non-zero) when any record was
 * invalid. A clean tree prints an `ok` line and exits zero.
 */
export const runValidate = Effect.fn("runValidate")(function* runValidate(
  cwd: string,
  argv: readonly string[]
) {
  const target = yield* attempt(() => parseValidateArgs(argv));
  const path = yield* Path;
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
});
