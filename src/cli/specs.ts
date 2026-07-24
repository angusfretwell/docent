import { sides } from "@shared/enums/side";
import type { Side } from "@shared/enums/side";
import { Effect, Option } from "effect";

import { CliUsageError, parseEnum, requireText } from "./usage";

interface IdSchema<Id extends string> {
  readonly makeOption: (input: string) => Option.Option<Id>;
}

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

const RANGE_LINES = /^(?<start>\d+)(?:-(?<end>\d+))?$/;

export interface RangeSpec {
  file: string;
  side: Side;
  lines: [number, number];
}

/** The line span is 1-based inclusive; the file/lines split is the last `:`, keeping the token colon-unambiguous. */
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

const DIMENSIONS = /^(?<width>\d+)x(?<height>\d+)$/;

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
