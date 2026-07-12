/**
 * `GET /api/diff` — the live branch diff as JSON, resolved fresh from git on
 * every request (diff-review.md §1, architecture.md §2). A git failure 500s
 * with the message.
 */

import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolveChange } from "../core/git";
import { apiRoute } from "./api-route";

export function diffRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/diff",
    resolveChange(cwd).pipe(
      Effect.flatMap((change) => HttpServerResponse.json(change))
    )
  );
}
