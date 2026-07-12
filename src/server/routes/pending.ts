/**
 * `GET /api/pending?range=incremental|cumulative` — the read-only preview of
 * the dirty working tree that backs the Diff tab's Pending entry
 * (diff-review.md §6). Resolved live from git per request (uncached; the client
 * re-fetches on every SSE change). An unknown/absent `range` defaults to the
 * primary `incremental` view. A git failure 500s with the message.
 */

import type { PendingRange } from "@shared/schemas/pending";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolvePending } from "../services/git";
import { apiRoute, searchParams } from "./api-route";

export function pendingRoute(cwd: string) {
  return apiRoute("GET", "/api/pending", (request) =>
    Effect.gen(function* servePending() {
      const range: PendingRange =
        searchParams(request).get("range") === "cumulative"
          ? "cumulative"
          : "incremental";
      const pending = yield* resolvePending(cwd, range);
      return yield* HttpServerResponse.json(pending);
    })
  );
}
