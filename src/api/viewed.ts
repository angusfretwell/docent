/**
 * `POST /api/viewed` — append one mark-as-viewed toggle to the active Review's
 * `viewed/` log (diff-review.md §3). The body is `{ path, blobSha }`; the server
 * stamps the timestamp and writes the event, then the `.docent/` watch re-pushes
 * the snapshot over SSE so every client's progress refreshes. A malformed body
 * 400s; a git/write failure 500s. Returns the stored event.
 */

import { ViewedRequest } from "@shared/schemas/review";
import { Effect } from "effect";

import { appendViewedEvent } from "../core/review";
import { postWriteRoute, readScope } from "./api-route";

export function viewedRoute(cwd: string) {
  return postWriteRoute("/api/viewed", ViewedRequest, (request) =>
    Effect.gen(function* postViewed() {
      const scope = yield* readScope(cwd);
      return yield* appendViewedEvent({ ...scope, request });
    })
  );
}
