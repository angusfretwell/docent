/**
 * `GET /api/health` — the repo root this server serves, as `{ root }`. A cheap
 * liveness-and-identity probe (no diff, no `.docent/` walk) that `docent status`
 * uses to confirm a recorded `serve.json` address is a live docent server for
 * *this* repo before `/docent` reuses it: identity is the root alone, which is
 * all `resolveServeStatus` matches on (serve-address.ts). A git failure 500s.
 */

import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolveRepo } from "../services/git";
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
