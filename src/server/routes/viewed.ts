/**
 * `POST /api/viewed` — append one mark-as-viewed toggle to the active Review's
 * `viewed/` log (diff-review.md §3). The body is `{ path, blobSha }`; the server
 * stamps the timestamp and writes the event, then the `.docent/` watch re-pushes
 * the snapshot over SSE so every client's progress refreshes. A malformed body
 * 400s; a git/write failure 500s. Returns the stored event.
 */

import { ViewedRequest } from "@shared/schemas/review";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { resolveRepo } from "../services/git";
import { appendViewedEvent } from "../services/review";
import { apiRoute } from "./api-route";

export function viewedRoute(cwd: string) {
  return apiRoute(
    "POST",
    "/api/viewed",
    Effect.gen(function* postViewed() {
      const request = yield* HttpServerRequest.schemaBodyJson(ViewedRequest);
      const repo = yield* resolveRepo(cwd);
      const event = yield* appendViewedEvent({
        base: repo.defaultBranch.name,
        branch: repo.branch,
        request,
        root: repo.root,
      });
      return yield* HttpServerResponse.json(event);
    }),
    { badRequest: "SchemaError" }
  );
}
