/**
 * `GET /api/review` — the JSON snapshot of the active Review (the one for the
 * checked-out branch), walked live off `.docent/` on every request (uncached).
 * The Review auto-creates on first use; the branch/base come from git.
 */

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
