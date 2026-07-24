/**
 * The flag-value parsers the write subcommands share: a record id
 * (`--finding`, `--walkthrough`, `--capture`), a `--range` token
 * (`<file>:<start>[-<end>][@<side>]`), a `WxH` dimensions token (`--viewport` /
 * `--dims`), and a non-negative-integer duration (`--duration-ms`). Each turns
 * one raw argv string into a value — pure and synchronous, so they are
 * unit-tested directly, and each carries its rejection as a typed
 * `CliUsageError` rather than a throw the handler would have to catch.
 */

import { sides } from "@shared/enums/side";
import type { Side } from "@shared/enums/side";
import { Effect, Option } from "effect";

import { CliUsageError, parseEnum, requireText } from "./usage";

/** An id schema's synchronous constructor — its `<prefix>_` refinement as a check. */
interface IdSchema<Id extends string> {
  readonly makeOption: (input: string) => Option.Option<Id>;
}

/**
 * Parse a flag's value as a branded record id, through the id schema's own
 * `<prefix>_` refinement. The brand starts at the argv boundary, so a
 * mis-prefixed id is a usage error here rather than a missing record deeper in
 * the write path.
 */
export function parseRecordId<Id extends string>(
  flag: string,
  schema: IdSchema<Id>,
  value: string
): Effect.Effect<Id, CliUsageError> {
  return requireText(flag, value).pipe(
    Effect.flatMap((text) =>
      Option.match(schema.makeOption(text), {
        onNone: () =>
          Effect.fail(new CliUsageError({ reason: `bad --${flag}: ${text}` })),
        onSome: (id) => Effect.succeed(id),
      })
    )
  );
}

// A `--range` token: `<file>:<start>[-<end>][@<side>]`, e.g.
// `src/index.ts:10-24@head` or `src/parser.ts:40` (side defaults to head).
const RANGE_LINES = /^(?<start>\d+)(?:-(?<end>\d+))?$/;

/** A parsed `--range` before git resolves its `blobSha`. */
export interface RangeSpec {
  file: string;
  side: Side;
  lines: [number, number];
}

/**
 * Parse one compact `--range` token into its file, side, and 1-based inclusive
 * line span. The optional `@side` suffix and a `-`-separated line range keep the
 * token colon-unambiguous (the file/lines split is the last `:`). Any malformed
 * part fails as a `CliUsageError`.
 */
export const parseRangeSpec = Effect.fn("parseRangeSpec")(
  function* parseRangeSpec(spec: string) {
    let rest = spec.trim();
    let side: Side = "head";

    const at = rest.lastIndexOf("@");
    if (at !== -1) {
      side = yield* parseEnum("side", rest.slice(at + 1), sides);
      rest = rest.slice(0, at);
    }

    const colon = rest.lastIndexOf(":");
    if (colon === -1) {
      return yield* Effect.fail(
        new CliUsageError({
          reason: `bad --range: ${spec} (file:start[-end][@side])`,
        })
      );
    }

    const file = rest.slice(0, colon);
    const match = RANGE_LINES.exec(rest.slice(colon + 1));
    if (file === "" || match?.groups === undefined) {
      return yield* Effect.fail(
        new CliUsageError({
          reason: `bad --range: ${spec} (file:start[-end][@side])`,
        })
      );
    }

    const start = Number(match.groups.start);
    const end =
      match.groups.end === undefined ? start : Number(match.groups.end);

    return { file, lines: [start, end], side } satisfies RangeSpec;
  }
);

// A `WxH` viewport/dimensions token, e.g. `1280x800`.
const DIMENSIONS = /^(?<width>\d+)x(?<height>\d+)$/;

/** Parse a `WxH` flag (`--viewport` / `--dims`) into `[width, height]`, or a usage error. */
export function parseDimensions(
  flag: string,
  value: string
): Effect.Effect<[number, number], CliUsageError> {
  const match = DIMENSIONS.exec(value.trim());

  return match?.groups === undefined
    ? Effect.fail(
        new CliUsageError({
          reason: `bad --${flag}: ${value} (WxH, e.g. 1280x800)`,
        })
      )
    : Effect.succeed([Number(match.groups.width), Number(match.groups.height)]);
}

/** Parse `--duration-ms` as a non-negative integer, or a usage error. */
export function parseDurationMs(
  value: string
): Effect.Effect<number, CliUsageError> {
  const millis = Number(value.trim());

  return Number.isInteger(millis) && millis >= 0
    ? Effect.succeed(millis)
    : Effect.fail(
        new CliUsageError({
          reason: `bad --duration-ms: ${value} (a non-negative integer)`,
        })
      );
}
