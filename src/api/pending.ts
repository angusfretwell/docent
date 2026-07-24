import type { PendingRange } from "@shared/enums/pending-range";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolvePending } from "../core/git";
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
