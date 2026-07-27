import { captureKinds } from "@shared/enums/capture-kind";
import { WalkthroughId } from "@shared/schemas/ids";
import { Effect, Option } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { Command, Flag } from "effect/unstable/cli";

import { inlineCaptureAssets } from "../core/capture-assets";
import { addWalkthroughCapture } from "../core/walkthrough-write";
import { resolveChangeScope } from "../core/write-context";
import { parseDimensions, parseDurationMs, parseRecordId } from "./specs";
import {
  CliUsageError,
  WorkingDirectory,
  printJson,
  requireText,
} from "./usage";

const add = Command.make(
  "add",
  {
    dims: Flag.string("dims").pipe(
      Flag.optional,
      Flag.withDescription("A screenshot's full-page pixels (WxH)")
    ),
    durationMs: Flag.string("duration-ms").pipe(
      Flag.optional,
      Flag.withDescription("A recording's length (ms)")
    ),
    kind: Flag.choice("kind", captureKinds).pipe(
      Flag.withDescription("The capture kind")
    ),
    media: Flag.string("media").pipe(
      Flag.withDescription("Path to the file, relative to this directory")
    ),
    route: Flag.string("route").pipe(
      Flag.withDescription("The application route the capture was taken on")
    ),
    title: Flag.string("title").pipe(
      Flag.optional,
      Flag.withDescription("A short name for the capture")
    ),
    viewport: Flag.string("viewport").pipe(
      Flag.withDescription(
        "The browser viewport the capture was taken at (WxH)"
      )
    ),
    walkthrough: Flag.string("walkthrough").pipe(
      Flag.withDescription(
        "The product walkthrough to register against (wlk_…)"
      )
    ),
  },
  (config) =>
    Effect.gen(function* runCaptureAdd() {
      const fs = yield* FileSystem;
      const path = yield* Path;
      const cwd = yield* WorkingDirectory;

      const walkthroughId = yield* parseRecordId(
        "walkthrough",
        WalkthroughId,
        config.walkthrough
      );
      const mediaPath = yield* requireText("media", config.media);
      const route = yield* requireText("route", config.route);
      const title = Option.getOrUndefined(config.title)?.trim();
      const viewport = yield* requireText("viewport", config.viewport).pipe(
        Effect.flatMap((value) => parseDimensions("viewport", value))
      );

      const dimsFlag = Option.getOrUndefined(config.dims);
      const durationFlag = Option.getOrUndefined(config.durationMs);
      if (config.kind === "recording" && dimsFlag !== undefined) {
        return yield* Effect.fail(
          new CliUsageError({
            reason:
              "--dims is for screenshots; a recording takes --duration-ms",
          })
        );
      }
      if (config.kind === "screenshot" && durationFlag !== undefined) {
        return yield* Effect.fail(
          new CliUsageError({
            reason:
              "--duration-ms is for recordings; a screenshot takes --dims",
          })
        );
      }
      const dims =
        dimsFlag === undefined
          ? undefined
          : yield* parseDimensions("dims", dimsFlag);
      const durationMs =
        durationFlag === undefined
          ? undefined
          : yield* parseDurationMs(durationFlag);

      const media = yield* fs
        .readFile(path.resolve(cwd, mediaPath))
        .pipe(
          Effect.mapError(
            () =>
              new CliUsageError({ reason: `cannot read --media: ${mediaPath}` })
          )
        );
      const scope = yield* resolveChangeScope(cwd);

      /* Before the sha is taken, so the blob docent freezes is the self-contained
         one — an asset fetched later would be a different capture. */
      const inlined = yield* inlineCaptureAssets(media);

      const registered = yield* addWalkthroughCapture({
        base: scope.base,
        branch: scope.branch,
        kind: config.kind,
        media: inlined.media,
        root: scope.root,
        route,
        viewport,
        walkthroughId,
        ...(title === undefined || title === "" ? {} : { title }),
        ...(dims === undefined ? {} : { dims }),
        ...(durationMs === undefined ? {} : { durationMs }),
      });

      return yield* printJson({ ...registered, assets: inlined.report });
    })
).pipe(Command.withDescription("Register a capture for a product walkthrough"));

export const captureCommand = Command.make("capture").pipe(
  Command.withDescription("Register screenshots and recordings"),
  Command.withSubcommands([add])
);
