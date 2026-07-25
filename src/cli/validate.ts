import { Console, Effect, Schema } from "effect";
import { Path } from "effect/Path";
import { Argument, Command } from "effect/unstable/cli";

import { resolveStateRoot, validateStateRoot } from "../core/validate";
import { CliUsageError, WorkingDirectory } from "./usage";

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

/** Declared variadic rather than optional because a second positional is a usage error here, and the parser silently drops arguments no parameter claims. */
function onlyPath(
  paths: readonly string[]
): Effect.Effect<string | undefined, CliUsageError> {
  return paths.length > 1
    ? Effect.fail(
        new CliUsageError({
          reason: `validate takes at most one path (got ${paths.length})`,
        })
      )
    : Effect.succeed(paths[0]);
}

export const validateCommand = Command.make(
  "validate",
  {
    paths: Argument.string("path").pipe(
      Argument.variadic(),
      Argument.withDescription(
        "The tree or repo to validate (default: current directory)"
      )
    ),
  },
  (config) =>
    Effect.gen(function* runValidate() {
      const cwd = yield* WorkingDirectory;
      const path = yield* Path;
      const target = yield* onlyPath(config.paths);
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
).pipe(Command.withDescription("Check the .docent/ tree for errors"));
