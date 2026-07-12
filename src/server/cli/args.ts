/**
 * The generic argv-parsing kit shared by every `docent` subcommand
 * (`finding`, `walkthrough`, `capture`, `validate`, `install`, `status`):
 * splitting `--flag value` / `--flag=value` / bare-boolean argv into a flag
 * map, reading one or many values back out of it, enforcing a required flag
 * or a closed enum, resolving a write's body from `--body` or piped stdin,
 * and printing the machine-readable JSON result every subcommand ends with.
 * None of this is finding-specific — the finding subcommand (`./finding`)
 * layers its anchor/author/write parsing on top of it, and the other
 * subcommands import it directly.
 */

import { Console, Effect, Schema } from "effect";

/** A CLI usage error — a bad flag, missing anchor, or unknown subcommand. */
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
 * parsers throw for readable, colocated validation; this converts the throw into
 * an Effect failure so it never escapes an `Effect.fn` generator as a defect.
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
 * Assert a flag value is one of a closed set, or throw a usage error naming the
 * allowed values — the one shape shared by every enum-valued flag across the
 * subcommands (`--side`, `--disposition`, `--whats-next`, `--kind`, …). The sets
 * are tiny (2–5 members), so a linear membership check is fine.
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

// A parsed argv: repeated `--flag value` / `--flag=value` accumulate under the
// key; a valueless `--flag` (at the end or before another `--flag`) is a bool.
export interface ParsedArgs {
  values: Map<string, string[]>;
  bools: Set<string>;
}

/** Append `value` under `key`, starting the list if this is the first. */
function push(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key);
  if (existing === undefined) {
    map.set(key, [value]);
  } else {
    existing.push(value);
  }
}

/**
 * Split `--flag value` / `--flag=value` / bare `--flag` argv into a flag map.
 * `booleans` names the valueless flags so they never swallow a following token;
 * every other `--flag` takes the next non-`--` token as its value, and repeats
 * accumulate. A bare token that is not a flag is rejected — every subcommand is
 * all-flags (`validate`'s lone path argument is parsed separately), so a stray
 * positional is a usage error.
 */
export function parseArgs(
  args: readonly string[],
  booleans: ReadonlySet<string>
): ParsedArgs {
  const values = new Map<string, string[]>();
  const bools = new Set<string>();
  for (let i = 0; i < args.length; i += 1) {
    const token = args[i] ?? "";
    if (!token.startsWith("--")) {
      throw new CliUsageError({ reason: `unexpected argument: ${token}` });
    }
    const body = token.slice(2);
    const eq = body.indexOf("=");
    const next = args[i + 1];
    if (eq !== -1) {
      push(values, body.slice(0, eq), body.slice(eq + 1));
    } else if (
      booleans.has(body) ||
      next === undefined ||
      next.startsWith("--")
    ) {
      // A valueless flag not declared boolean is still tolerated as a bool, so a
      // typo surfaces later as "unknown"/"missing" rather than eating a token.
      bools.add(body);
    } else {
      push(values, body, next);
      i += 1;
    }
  }
  return { bools, values };
}

/** The last value given for a flag, or `undefined`. */
export function one(args: ParsedArgs, key: string): string | undefined {
  return args.values.get(key)?.at(-1);
}

/** Every value given for a (repeatable) flag, flattened across `,`-lists. */
export function many(args: ParsedArgs, key: string): string[] {
  const out: string[] = [];
  for (const value of args.values.get(key) ?? []) {
    for (const part of value.split(",")) {
      if (part !== "") {
        out.push(part);
      }
    }
  }
  return out;
}

/** The last value of a required flag, or a usage error naming it. */
export function requireFlag(args: ParsedArgs, key: string): string {
  const value = one(args, key)?.trim();
  if (value === undefined || value === "") {
    throw new CliUsageError({ reason: `--${key} <value> is required` });
  }
  return value;
}

/**
 * Resolve a write's body: `--body <text>`, else piped stdin (never a TTY, so a
 * bodyless interactive call fails fast rather than hanging on a read). `required`
 * distinguishes a write whose body is the record itself (`finding add`,
 * `finding reply`) from one where the body is an optional reason (`finding
 * resolve`).
 */
export const resolveBody = Effect.fn("resolveBody")(function* resolveBody(
  args: ParsedArgs,
  required: boolean
) {
  const flag = one(args, "body");
  if (flag !== undefined) {
    return flag;
  }
  const piped = process.stdin.isTTY
    ? ""
    : (yield* Effect.promise(() => Bun.stdin.text())).trim();
  if (piped !== "") {
    return piped;
  }
  if (required) {
    return yield* Effect.fail(
      new CliUsageError({ reason: "--body <text> is required (or pipe stdin)" })
    );
  }
  // No body given and none required: resolve's reason is simply absent ("").
  return "";
});

/** Print a value as pretty JSON on stdout — the machine-readable result shape. */
export function printJson(value: unknown) {
  return Console.log(JSON.stringify(value, null, 2));
}
