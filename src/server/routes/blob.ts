/**
 * `GET /api/blob/:sha` and `GET /api/blob/:sha/size` — raw bytes (and byte
 * size) of a git blob, resolved via pure local `git cat-file` (no network).
 * Content-addressed, so responses cache forever. The Diff tab fetches the
 * bytes lazily to feed the renderer full file blobs for context expansion —
 * both the base and head sides go through here (diff-review.md §4,
 * architecture.md §2) — and shows the size as the size-delta row on binary
 * files (diff-review.md §5), read from the object header via `git cat-file -s`
 * (never streaming the bytes). A malformed id 400s; an id absent from the repo
 * 404s.
 */

import { Effect } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { resolveBlob, resolveBlobSize } from "../services/git";
import {
  apiRoute,
  IMMUTABLE_CACHE_CONTROL,
  immutableBytes,
  OCTET_STREAM,
} from "./api-route";

export function blobRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/blob/:sha",
    Effect.gen(function* serveBlob() {
      const params = yield* HttpRouter.params;
      const bytes = yield* resolveBlob(cwd, params.sha ?? "");
      return immutableBytes(bytes, OCTET_STREAM);
    }),
    { badRequest: "InvalidObjectId", notFound: true }
  );
}

export function blobSizeRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/blob/:sha/size",
    Effect.gen(function* serveBlobSize() {
      const params = yield* HttpRouter.params;
      const size = yield* resolveBlobSize(cwd, params.sha ?? "");
      return yield* HttpServerResponse.json(
        { size },
        { headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } }
      );
    }),
    { badRequest: "InvalidObjectId", notFound: true }
  );
}
