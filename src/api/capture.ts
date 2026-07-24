/**
 * Capture media lives in the gitignored Review, not as a git blob, so
 * `/api/blob/:sha` (`git cat-file`) cannot serve it (walkthroughs.md §3, §6).
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

// The walkthrough-id brand admits a path separator, so each segment is also
// checked to be a single directory entry before `safeJoin`'s containment check.
const isWalkthroughId = Schema.is(WalkthroughId);
const PATH_SEGMENT = /^[^/\\]+$/;
const CAPTURE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

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
