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
