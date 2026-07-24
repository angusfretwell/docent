import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { readReviewSnapshot } from "../core/review";
import { apiRoute, readScope } from "./api-route";

export function reviewRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/review",
    readScope(cwd).pipe(
      Effect.flatMap((scope) => readReviewSnapshot(scope)),
      Effect.flatMap((snapshot) => HttpServerResponse.json(snapshot))
    )
  );
}
