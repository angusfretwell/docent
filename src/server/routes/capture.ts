/**
 * `GET /api/capture/:walkthrough/:file` — the raw bytes of a product-walkthrough
 * capture blob, read off `.docent/reviews/<slug>/walkthroughs/product/<wlk>/
 * captures/<file>` (walkthroughs.md §3, §6). Unlike code ranges, capture media
 * is **not a git blob** — it lives in the gitignored Review, born with its
 * immutable walkthrough — so `git cat-file` (`/api/blob/:sha`) cannot serve it.
 * The `<file>` is `<media-sha>.png` (screenshots, served `image/png` for a bare
 * `<img src>`) or `<media-sha>.rrweb.json` (recordings, served `application/json`
 * for the rrweb replayer). Content-addressed, so responses cache forever. A
 * malformed id/filename 400s; an absent file 404s.
 */

import { safeJoin } from "@server/lib/safe-join";
import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { resolveRepo } from "../services/git";
import { reviewDirPath } from "../store/layout";
import { apiRoute, immutableBytes, OCTET_STREAM } from "./api-route";

// A walkthrough id and a capture filename must be plain, single-segment names —
// no slashes — before either reaches the `safeJoin` containment check below.
const WALKTHROUGH_ID = /^wlk_[A-Za-z0-9]+$/;
const CAPTURE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** The content-type for a capture media file, keyed off its extension. */
function captureContentType(file: string): string {
  if (file.endsWith(".png")) {
    return "image/png";
  }
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
      const walkthrough = params.walkthrough ?? "";
      const file = params.file ?? "";
      if (!(WALKTHROUGH_ID.test(walkthrough) && CAPTURE_FILE.test(file))) {
        return HttpServerResponse.jsonUnsafe(
          { error: "invalid capture path" },
          { status: 400 }
        );
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
        return HttpServerResponse.jsonUnsafe(
          { error: "invalid capture path" },
          { status: 400 }
        );
      }
      const bytes = yield* fs.readFile(filePath);
      return immutableBytes(bytes, captureContentType(file));
    }),
    { notFound: true }
  );
}
