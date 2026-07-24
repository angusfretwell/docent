import { Console, Context, Effect, Option, Schema, Stream } from "effect";
import { Stdio } from "effect/Stdio";
import { Flag } from "effect/unstable/cli";

export class CliUsageError extends Schema.TaggedErrorClass<CliUsageError>()(
  "CliUsageError",
  {
    reason: Schema.String,
  }
) {
  override get message(): string {
    return this.reason;
  }
}

/** Covers the enums `Flag.choice` can't: those nested in a compact syntax (`--range`'s `@side`) and repeatable enums that comma-split before they can be checked (`--status`). */
export function parseEnum<T extends string>(
  flag: string,
  value: string,
  values: readonly T[]
): Effect.Effect<T, CliUsageError> {
  const allowed = values.find((candidate) => candidate === value);

  return allowed === undefined
    ? Effect.fail(
        new CliUsageError({
          reason: `unknown --${flag}: ${value} (one of ${values.join(", ")})`,
        })
      )
    : Effect.succeed(allowed);
}

/**
 * `Command` drops arguments no parameter claims, which on a read command widens
 * the answer instead of rejecting it: `docent comment list open` — a plausible
 * typo for `--status open` — would return the whole queue rather than erroring.
 * A write subcommand needs no such guard; its required flags reject the stray
 * invocation first.
 */
export function refuseArguments(
  args: readonly string[]
): Effect.Effect<void, CliUsageError> {
  const stray = args.at(0);

  return stray === undefined
    ? Effect.void
    : Effect.fail(
        new CliUsageError({ reason: `unexpected argument: ${stray}` })
      );
}

/** `Flag` treats a present-but-blank `--title ""` as satisfied; the write path does not — a blank id or title is never a legitimate write. */
export function requireText(
  flag: string,
  value: string
): Effect.Effect<string, CliUsageError> {
  const trimmed = value.trim();

  return trimmed === ""
    ? Effect.fail(
        new CliUsageError({ reason: `--${flag} <value> is required` })
      )
    : Effect.succeed(trimmed);
}

/** Empty segments drop, so a bare `--x ""` means "no values" rather than one blank one. Not applied to `--callout`: its values are JSON, which embeds commas. */
export function commaSeparated(
  flag: Flag.Flag<string>
): Flag.Flag<readonly string[]> {
  return flag.pipe(
    Flag.atLeast(0),
    Flag.map((values) =>
      values.flatMap((value) => value.split(",")).filter((part) => part !== "")
    )
  );
}

// An unreadable stdin is indistinguishable from an empty one: either way the caller gave no body.
const pipedStdin = Effect.gen(function* readPipedStdin() {
  const stdio = yield* Stdio;
  return yield* Stream.mkString(Stream.decodeText(stdio.stdin));
}).pipe(Effect.orElseSucceed(() => ""));

/** A TTY is never read: a bodyless interactive call fails fast rather than hanging on a read. */
export const resolveBody = Effect.fn("resolveBody")(function* resolveBody(
  flag: Option.Option<string>,
  required: boolean
) {
  if (Option.isSome(flag)) {
    return flag.value;
  }

  const piped = process.stdin.isTTY ? "" : (yield* pipedStdin).trim();
  if (piped !== "") {
    return piped;
  }
  if (required) {
    return yield* Effect.fail(
      new CliUsageError({ reason: "--body <text> is required (or pipe stdin)" })
    );
  }

  return "";
});

export function printJson(value: unknown) {
  return Console.log(JSON.stringify(value, null, 2));
}

/** A reference rather than a `process.cwd()` call at each site, so the whole command tree can be driven against a scratch repo without changing the process's directory. */
export const WorkingDirectory: Context.Reference<string> = Context.Reference(
  "docent/WorkingDirectory",
  { defaultValue: () => process.cwd() }
);
