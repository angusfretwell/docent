/**
 * The substrate the `docent` subcommands still own now that
 * `effect/unstable/cli` owns argv parsing: the usage-error type every bespoke
 * validation fails with, the closed-enum and required-text checks, the
 * comma-splitting repeatable-flag combinator (`--x a,b` ≡ `--x a --x b`), the
 * `--body`-or-piped-stdin resolver, and the machine-readable JSON printer every
 * subcommand ends with.
 *
 * Nothing here duplicates `Flag`. It exists because the CLI's own error strings
 * and compact value syntaxes are a consumed contract — agent skills read both
 * the JSON on stdout and the messages on stderr (`skills/docent-cli`) — so they
 * are authored here rather than delegated to framework wording.
 */

import { Console, Context, Effect, Option, Schema, Stream } from "effect";
import { Stdio } from "effect/Stdio";
import { Flag } from "effect/unstable/cli";

/** A CLI usage error — a bad flag value, a missing anchor, an absent body. */
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

/**
 * Run a throwing synchronous parser as a typed `CliUsageError` failure. The
 * compact value parsers throw for readable, colocated validation; this converts
 * the throw into an Effect failure so it never escapes a handler as a defect.
 */
export function attempt<A>(parse: () => A): Effect.Effect<A, CliUsageError> {
  return Effect.try({
    catch: (error) =>
      error instanceof CliUsageError
        ? error
        : new CliUsageError({ reason: String(error) }),
    try: parse,
  });
}

/**
 * Assert a value is one of a closed set, or throw a usage error naming the
 * allowed values. `Flag.choice` covers the flags whose whole value is an enum;
 * this covers the enums nested inside a compact syntax (`--range`'s `@side`)
 * and the repeatable enums that comma-split before they can be checked
 * (`--status`). The sets are tiny (2–3 members), so a linear check is fine.
 */
export function parseEnum<T extends string>(
  flag: string,
  value: string,
  values: readonly T[]
): T {
  if (!values.includes(value as T)) {
    throw new CliUsageError({
      reason: `unknown --${flag}: ${value} (one of ${values.join(", ")})`,
    });
  }
  return value as T;
}

/**
 * Refuse every positional argument, in the wording the binary used before
 * `Command` owned argv.
 *
 * `Command` drops arguments no parameter claims, which on a read command widens
 * the answer instead of rejecting it: `docent finding list open` — a plausible
 * typo for `--status open` — would return the whole queue rather than erroring.
 * A write subcommand needs no such guard; its required flags reject the stray
 * invocation first.
 */
export function refuseArguments(args: readonly string[]): void {
  const stray = args.at(0);
  if (stray !== undefined) {
    throw new CliUsageError({ reason: `unexpected argument: ${stray}` });
  }
}

/**
 * The trimmed value of a flag that must carry text, or a usage error naming it.
 * `Flag` treats a present-but-blank `--title ""` as satisfied; the write path
 * does not — a blank id or title is never a legitimate write.
 */
export function requireText(flag: string, value: string): string {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new CliUsageError({ reason: `--${flag} <value> is required` });
  }
  return trimmed;
}

/**
 * A repeatable flag whose values also comma-split, so `--x a,b` and `--x a
 * --x b` are the same list. Empty segments drop, which is what makes a bare
 * `--x ""` mean "no values" rather than one blank one.
 *
 * Deliberately not applied to `--annotation`: its values are JSON, which embeds
 * commas.
 */
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

// Piped stdin, decoded as text. An unreadable stdin is indistinguishable from
// an empty one here: either way the caller gave no body, and the required/
// optional decision below is what turns that into an error or a "".
const pipedStdin = Effect.gen(function* readPipedStdin() {
  const stdio = yield* Stdio;
  return yield* Stream.mkString(Stream.decodeText(stdio.stdin));
}).pipe(Effect.orElseSucceed(() => ""));

/**
 * Resolve a write's body: `--body <text>`, else piped stdin. A TTY is never
 * read (a bodyless interactive call fails fast rather than hanging on a read).
 * `required` distinguishes a write whose body is the record itself (`finding
 * add`, `finding reply`) from one where the body is optional prose
 * (`walkthrough add-section`).
 */
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

  // No body given and none required: the section's prose is simply absent ("").
  return "";
});

/** Print a value as pretty JSON on stdout — the machine-readable result shape. */
export function printJson(value: unknown) {
  return Console.log(JSON.stringify(value, null, 2));
}

/**
 * The directory a subcommand resolves git + fs from (architecture.md §5) —
 * the process's own working directory by default. A reference rather than a
 * `process.cwd()` call at each site so the whole command tree can be driven
 * against a scratch repo without changing the process's directory.
 */
export const WorkingDirectory: Context.Reference<string> = Context.Reference(
  "docent/WorkingDirectory",
  { defaultValue: () => process.cwd() }
);
