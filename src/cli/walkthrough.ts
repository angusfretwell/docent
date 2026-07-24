/**
 * The `docent walkthrough` command tree — the CLI face of the walkthrough write
 * path (agent-integration.md §3.3, walkthroughs.md §4–6). `create` mints a
 * validated `docent/walkthrough` manifest bound to the live head;
 * `add-section` appends a `docent/walkthrough-section`, resolving each
 * `--range`'s content-addressed `blobSha` from git so the range freezes the
 * exact bytes on its side. Both go through the shared `walkthrough-write.ts`
 * implementation — one write implementation, no divergence.
 *
 * As with `docent finding`, the CLI is non-gating: it writes the identical
 * files an agent could hand-author, and a running `docent serve` turns the drop
 * into an SSE refresh via the `.docent/` watch. The registering half of the
 * product arm — content-addressing capture media — is `./capture`.
 */

import { walkthroughKinds } from "@shared/enums/walkthrough-kind";
import {
  WalkthroughAnnotation,
  WalkthroughRange,
} from "@shared/schemas/walkthrough";
import { Effect, Option, Schema } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { resolveBlobShaAt } from "../core/git";
import {
  addWalkthroughSection,
  writeWalkthrough,
} from "../core/walkthrough-write";
import type { ChangeRefs } from "../core/write-context";
import { resolveChangeScope } from "../core/write-context";
import { parseRangeSpec } from "./specs";
import type { RangeSpec } from "./specs";
import {
  attempt,
  CliUsageError,
  commaSeparated,
  WorkingDirectory,
  printJson,
  requireText,
  resolveBody,
} from "./usage";

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

const create = Command.make(
  "create",
  {
    kind: Flag.choice("kind", walkthroughKinds).pipe(
      Flag.withDescription("Which pillar this tour is: code or product")
    ),
    title: Flag.string("title").pipe(
      Flag.optional,
      Flag.withDescription("The tour's title — editorial, so optional")
    ),
  },
  (config) =>
    Effect.gen(function* runCreate() {
      const cwd = yield* WorkingDirectory;
      const scope = yield* resolveChangeScope(cwd);

      return yield* printJson(
        yield* writeWalkthrough({
          base: scope.base,
          branch: scope.branch,
          kind: config.kind,
          refs: scope.refs,
          root: scope.root,
          title: Option.getOrUndefined(config.title)?.trim() ?? "",
        })
      );
    })
).pipe(
  Command.withDescription("Mint a walkthrough shell bound to the live head")
);

const addSection = Command.make(
  "add-section",
  {
    // Annotations are JSON, which embeds commas — so this one repeats without
    // the comma-splitting every other repeatable flag gets.
    annotation: Flag.string("annotation").pipe(
      Flag.atLeast(0),
      Flag.withDescription("One JSON callout — repeat the flag per annotation")
    ),
    body: Flag.string("body").pipe(
      Flag.optional,
      Flag.withDescription("Section prose (omit to read it from piped stdin)")
    ),
    capture: commaSeparated(
      Flag.string("capture").pipe(
        Flag.withDescription(
          "A cap_ id on this tour — repeatable or comma-joined"
        )
      )
    ),
    range: commaSeparated(
      Flag.string("range").pipe(
        Flag.withDescription(
          "file:start[-end][@side] — repeatable or comma-joined"
        )
      )
    ),
    title: Flag.string("title").pipe(
      Flag.withDescription("The section's title")
    ),
    walkthrough: Flag.string("walkthrough").pipe(
      Flag.withDescription("The wlk_ id to append to")
    ),
  },
  (config) =>
    Effect.gen(function* runAddSection() {
      const cwd = yield* WorkingDirectory;
      const walkthroughId = yield* attempt(() =>
        requireText("walkthrough", config.walkthrough)
      );
      const title = yield* attempt(() => requireText("title", config.title));
      const specs = yield* attempt(() => config.range.map(parseRangeSpec));
      const annotations = yield* parseAnnotations(config.annotation);
      const body = yield* resolveBody(config.body, false);

      const scope = yield* resolveChangeScope(cwd);
      const ranges = yield* buildRanges(scope.root, scope.refs, specs);

      return yield* printJson(
        yield* addWalkthroughSection({
          base: scope.base,
          body,
          branch: scope.branch,
          root: scope.root,
          title,
          walkthroughId,
          ...(ranges.length === 0 ? {} : { ranges }),
          ...(config.capture.length === 0
            ? {}
            : { captureIds: config.capture }),
          ...(annotations.length === 0 ? {} : { annotations }),
        })
      );
    })
).pipe(
  Command.withDescription("Validate and append one section, in tour order")
);

/** The `docent walkthrough` subcommand tree — mint a shell, then grow it. */
export const walkthroughCommand = Command.make("walkthrough").pipe(
  Command.withDescription("Mint and grow the Review's walkthroughs"),
  Command.withSubcommands([create, addSection])
);
