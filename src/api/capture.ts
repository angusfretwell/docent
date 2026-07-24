/**
 * `GET /api/capture/:walkthrough/:file` — the raw bytes of a product-walkthrough
 * capture blob, read off `.docent/reviews/<slug>/walkthroughs/product/<wlk>/
 * captures/<file>` (walkthroughs.md §3, §6). Unlike code ranges, capture media
 * is **not a git blob** — it lives in the gitignored Review, born with its
 * immutable walkthrough — so `git cat-file` (`/api/blob/:sha`) cannot serve it.
 * The `<file>` is `<media-sha>.rrweb.json` for either capture kind — a still
 * frame is an rrweb `[Meta, FullSnapshot]` pair and a recording the whole stream
 * — served `application/json` for the rrweb replayer. Content-addressed, so
 * responses cache forever. A malformed id/filename 400s; an absent file 404s.
 */

import { WalkthroughId } from "@shared/schemas/ids";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";
import { HttpRouter } from "effect/unstable/http";

import { resolveRepo } from "../core/git";
import { safeJoin } from "../core/safe-join";
import { reviewDirPath } from "../core/store/layout";
import {
  apiRoute,
  badRequest,
  immutableBytes,
  OCTET_STREAM,
  requiredParam,
} from "./api-route";

// What a walkthrough id *is* belongs to its brand — which admits any
// non-whitespace tail, including one carrying a path separator. All this route
// adds is that both segments name a single directory entry, so neither can
// climb out of the captures directory before `safeJoin`'s containment check.
const isWalkthroughId = Schema.is(WalkthroughId);
const PATH_SEGMENT = /^[^/\\]+$/;
const CAPTURE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The content-type for a capture media file, keyed off its extension. */
function captureContentType(file: string): string {
  if (file.endsWith(".json")) {
    return "application/json";
  }
  return OCTET_STREAM;
}

export function captureRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/capture/:walkthrough/:file",
    Effect.gen(function* serveCapture() {
      const params = yield* HttpRouter.params;
      const walkthrough = requiredParam(params.walkthrough);
      const file = requiredParam(params.file);
      const addressable =
        isWalkthroughId(walkthrough) &&
        PATH_SEGMENT.test(walkthrough) &&
        CAPTURE_FILE.test(file);
      if (!addressable) {
        return badRequest("invalid capture path");
      }
      const repo = yield* resolveRepo(cwd);
      const fs = yield* FileSystem;
      const filePath = safeJoin(
        reviewDirPath(repo.root, repo.branch),
        "walkthroughs",
        "product",
        walkthrough,
        "captures",
        file
      );
      if (filePath === null) {
        return badRequest("invalid capture path");
      }
      const bytes = yield* fs.readFile(filePath);
      return immutableBytes(bytes, captureContentType(file));
    }),
    { notFound: true }
  );
}
