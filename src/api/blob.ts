import { Effect } from "effect";
import { HttpRouter } from "effect/unstable/http";

import { resolveBlob } from "../core/git";
import {
  apiRoute,
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
