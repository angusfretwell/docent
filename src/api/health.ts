import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolveRepo } from "../core/git";
import { apiRoute } from "./api-route";

export function healthRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/health",
    resolveRepo(cwd).pipe(
      Effect.flatMap((repo) => HttpServerResponse.json({ root: repo.root }))
    )
  );
}
