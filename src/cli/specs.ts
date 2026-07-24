/**
 * The compact flag-value syntaxes the walkthrough write path shares: a
 * `--range` token (`<file>:<start>[-<end>][@<side>]`), a `WxH` dimensions token
 * (`--viewport` / `--dims`), and a non-negative-integer duration
 * (`--duration-ms`). Each packs several fields into one argv token, so `Flag`
 * hands the raw string over and these turn it into a value — pure, so they are
 * unit-tested directly, and throwing so the failure reads as a usage error at
 * the call site.
 */

import { sides } from "@shared/enums/side";
import type { Side } from "@shared/enums/side";

import { CliUsageError, parseEnum } from "./usage";

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
 * token colon-unambiguous (the file/lines split is the last `:`). Throws a
 * `CliUsageError` on any malformed part.
 */
export function parseRangeSpec(spec: string): RangeSpec {
  let rest = spec.trim();
  let side: Side = "head";
  const at = rest.lastIndexOf("@");
  if (at !== -1) {
    side = parseEnum("side", rest.slice(at + 1), sides);
    rest = rest.slice(0, at);
  }
  const colon = rest.lastIndexOf(":");
  if (colon === -1) {
    throw new CliUsageError({
      reason: `bad --range: ${spec} (file:start[-end][@side])`,
    });
  }
  const file = rest.slice(0, colon);
  const match = RANGE_LINES.exec(rest.slice(colon + 1));
  if (file === "" || match?.groups === undefined) {
    throw new CliUsageError({
      reason: `bad --range: ${spec} (file:start[-end][@side])`,
    });
  }
  const start = Number(match.groups.start);
  const end = match.groups.end === undefined ? start : Number(match.groups.end);
  return { file, lines: [start, end], side };
}

// A `WxH` viewport/dimensions token, e.g. `1280x800`.
const DIMENSIONS = /^(?<width>\d+)x(?<height>\d+)$/;

/** Parse a `WxH` flag (`--viewport` / `--dims`) into `[width, height]`, or a usage error. */
export function parseDimensions(flag: string, value: string): [number, number] {
  const match = DIMENSIONS.exec(value.trim());
  if (match?.groups === undefined) {
    throw new CliUsageError({
      reason: `bad --${flag}: ${value} (WxH, e.g. 1280x800)`,
    });
  }
  return [Number(match.groups.width), Number(match.groups.height)];
}

/** Parse `--duration-ms` as a non-negative integer, or a usage error. */
export function parseDurationMs(value: string): number {
  const millis = Number(value.trim());
  if (!Number.isInteger(millis) || millis < 0) {
    throw new CliUsageError({
      reason: `bad --duration-ms: ${value} (a non-negative integer)`,
    });
  }
  return millis;
}
