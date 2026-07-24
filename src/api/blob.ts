import { Effect } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";

import { resolveBlob, resolveBlobSize } from "../core/git";
import {
  apiRoute,
  IMMUTABLE_CACHE_CONTROL,
  immutableBytes,
  OCTET_STREAM,
  requiredParam,
} from "./api-route";

export function blobRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/blob/:sha",
    Effect.gen(function* serveBlob() {
      const params = yield* HttpRouter.params;
      const bytes = yield* resolveBlob(cwd, requiredParam(params.sha));
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
      const size = yield* resolveBlobSize(cwd, requiredParam(params.sha));
      return yield* HttpServerResponse.json(
        { size },
        { headers: { "cache-control": IMMUTABLE_CACHE_CONTROL } }
      );
    }),
    { badRequest: "InvalidObjectId", notFound: true }
  );
}
