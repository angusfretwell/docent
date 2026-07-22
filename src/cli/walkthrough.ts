/**
 * The `docent walkthrough` and `docent capture` subcommands — the CLI face of
 * the walkthrough write path (agent-integration.md §3.3, walkthroughs.md §4–6).
 * They mint validated `docent/walkthrough` manifests, `docent/walkthrough-
 * section` sections, and content-addressed captures through the shared
 * `walkthrough-write.ts` implementation, reusing the finding CLI's argv parsing,
 * git-ref resolution (`writeContext`), and JSON result printing — one CLI
 * substrate, no divergence.
 *
 * As with `docent finding`, the CLI is non-gating: it writes the identical files
 * an agent could hand-author, and a running `docent serve` turns the drop into
 * an SSE refresh via the `.docent/` watch. The compact `--range` / `--viewport`
 * parsers are pure (unit-tested directly); the effectful layer resolves git + fs.
 */

import { captureKinds } from "@shared/enums/capture-kind";
import { sides } from "@shared/enums/side";
import type { Side } from "@shared/enums/side";
import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import {
  WalkthroughAnnotation,
  WalkthroughRange,
} from "@shared/schemas/walkthrough";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

import type { ChangeRefs } from "../core/findings-write";
import { resolveBlobShaAt } from "../core/git";
import {
  addWalkthroughCapture,
  addWalkthroughSection,
  writeWalkthrough,
} from "../core/walkthrough-write";
import {
  attempt,
  CliUsageError,
  many,
  one,
  parseArgs,
  parseEnum,
  printJson,
  requireFlag,
  resolveBody,
} from "./args";
import type { ParsedArgs } from "./args";
import { writeContext } from "./finding";

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

/** Resolve each `--range` spec's content-addressed `blobSha` from git. */
const buildRanges = Effect.fn("buildRanges")(function* buildRanges(
  root: string,
  refs: Pick<ChangeRefs, "baseSha" | "headSha">,
  specs: readonly RangeSpec[]
) {
  return yield* Effect.forEach(
    specs,
    (spec) =>
      Effect.gen(function* build() {
        const ref = spec.side === "head" ? refs.headSha : refs.baseSha;
        const blobSha = yield* resolveBlobShaAt(root, ref, spec.file);
        return WalkthroughRange.make({
          blobSha,
          file: spec.file,
          lines: spec.lines,
          side: spec.side,
        });
      }),
    { concurrency: "unbounded" }
  );
});

/** Decode each `--annotation <json>` against the schema, or fail as a usage error. */
const parseAnnotations = Effect.fn("parseAnnotations")(
  function* parseAnnotations(raws: readonly string[]) {
    return yield* Effect.forEach(
      raws,
      (raw) =>
        Effect.gen(function* decode() {
          const json = yield* Effect.try({
            catch: () =>
              new CliUsageError({
                reason: `--annotation is not valid JSON: ${raw}`,
              }),
            try: () => JSON.parse(raw) as unknown,
          });
          return yield* Schema.decodeUnknownEffect(WalkthroughAnnotation)(
            json
          ).pipe(
            Effect.mapError(
              (error) =>
                new CliUsageError({ reason: `invalid --annotation: ${error}` })
            )
          );
        }),
      { concurrency: "unbounded" }
    );
  }
);

/**
 * `walkthrough create` — mint a walkthrough shell bound to the live head.
 * `--title` is optional: the capture flow mints a title-less product shell
 * (a title is editorial, filled in by `/author-product-walkthrough` later).
 */
const runCreate = Effect.fn("runCreate")(function* runCreate(
  cwd: string,
  args: ParsedArgs
) {
  const kind = yield* attempt(() =>
    parseEnum("kind", requireFlag(args, "kind"), walkthroughKinds)
  );
  const title = one(args, "title")?.trim() ?? "";
  const context = yield* writeContext(cwd);
  return yield* writeWalkthrough({
    base: context.base,
    branch: context.branch,
    kind,
    refs: context.refs,
    root: context.root,
    title,
  });
});

/** `walkthrough add-section` — validate + append a section (code or product arm). */
const runAddSection = Effect.fn("runAddSection")(function* runAddSection(
  cwd: string,
  args: ParsedArgs
) {
  const walkthroughId = yield* attempt(() => requireFlag(args, "walkthrough"));
  const title = yield* attempt(() => requireFlag(args, "title"));
  const specs = yield* attempt(() => many(args, "range").map(parseRangeSpec));
  const captureIds = many(args, "capture");
  // Annotations are JSON, which embeds commas — so take the raw repeated
  // `--annotation` values, never the comma-splitting `many`.
  const annotations = yield* parseAnnotations(
    args.values.get("annotation") ?? []
  );
  const body = yield* resolveBody(args, false);
  const context = yield* writeContext(cwd);
  const ranges = yield* buildRanges(context.root, context.refs, specs);
  return yield* addWalkthroughSection({
    base: context.base,
    body,
    branch: context.branch,
    root: context.root,
    title,
    walkthroughId,
    ...(ranges.length === 0 ? {} : { ranges }),
    ...(captureIds.length === 0 ? {} : { captureIds }),
    ...(annotations.length === 0 ? {} : { annotations }),
  });
});

/**
 * Run one `docent walkthrough <op> …` invocation: parse, execute against git +
 * fs, and print the machine-readable JSON result an agent consumes directly.
 */
export const runWalkthrough = Effect.fn("runWalkthrough")(
  function* runWalkthrough(cwd: string, argv: readonly string[]) {
    const [op, ...rest] = argv;
    if (op === "create") {
      const args = yield* attempt(() => parseArgs(rest, new Set()));
      return yield* printJson(yield* runCreate(cwd, args));
    }
    if (op === "add-section") {
      const args = yield* attempt(() => parseArgs(rest, new Set()));
      return yield* printJson(yield* runAddSection(cwd, args));
    }
    return yield* Effect.fail(
      new CliUsageError({
        reason: `unknown walkthrough subcommand: ${op ?? "(none)"} (create | add-section)`,
      })
    );
  }
);

/** `capture add` — content-address a media file and register it on a product tour. */
const runCaptureAdd = Effect.fn("runCaptureAdd")(function* runCaptureAdd(
  cwd: string,
  args: ParsedArgs
) {
  const fs = yield* FileSystem;
  const path = yield* Path;

  const walkthroughId = yield* attempt(() => requireFlag(args, "walkthrough"));
  const kind = yield* attempt(() =>
    parseEnum("kind", requireFlag(args, "kind"), captureKinds)
  );
  const mediaPath = yield* attempt(() => requireFlag(args, "media"));
  const route = yield* attempt(() => requireFlag(args, "route"));
  const title = one(args, "title")?.trim();
  const viewport = yield* attempt(() =>
    parseDimensions("viewport", requireFlag(args, "viewport"))
  );

  // The metadata arms are kind-specific (walkthroughs.md §6): `dims` (full-page
  // pixels) rides a screenshot, `durationMs` a recording. Refuse the mismatch
  // rather than write a nonsensical registry entry.
  const dimsFlag = one(args, "dims");
  const durationFlag = one(args, "duration-ms");
  if (kind === "recording" && dimsFlag !== undefined) {
    return yield* Effect.fail(
      new CliUsageError({
        reason: "--dims is for screenshots; a recording takes --duration-ms",
      })
    );
  }
  if (kind === "screenshot" && durationFlag !== undefined) {
    return yield* Effect.fail(
      new CliUsageError({
        reason: "--duration-ms is for recordings; a screenshot takes --dims",
      })
    );
  }
  const dims =
    dimsFlag === undefined
      ? undefined
      : yield* attempt(() => parseDimensions("dims", dimsFlag));
  const durationMs =
    durationFlag === undefined
      ? undefined
      : yield* attempt(() => parseDurationMs(durationFlag));

  const media = yield* fs
    .readFile(path.resolve(cwd, mediaPath))
    .pipe(
      Effect.mapError(
        () => new CliUsageError({ reason: `cannot read --media: ${mediaPath}` })
      )
    );
  const context = yield* writeContext(cwd);
  return yield* addWalkthroughCapture({
    base: context.base,
    branch: context.branch,
    kind,
    media,
    root: context.root,
    route,
    viewport,
    walkthroughId,
    ...(title === undefined || title === "" ? {} : { title }),
    ...(dims === undefined ? {} : { dims }),
    ...(durationMs === undefined ? {} : { durationMs }),
  });
});

/** Run one `docent capture <op> …` invocation and print its JSON result. */
export const runCapture = Effect.fn("runCapture")(function* runCapture(
  cwd: string,
  argv: readonly string[]
) {
  const [op, ...rest] = argv;
  if (op === "add") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    return yield* printJson(yield* runCaptureAdd(cwd, args));
  }
  return yield* Effect.fail(
    new CliUsageError({
      reason: `unknown capture subcommand: ${op ?? "(none)"} (add)`,
    })
  );
});
