/**
 * `GET /api/review` — the JSON snapshot of the active Review (the one for the
 * checked-out branch), walked live off `.docent/` on every request (uncached).
 * The Review auto-creates on first use; the branch/base come from git.
 */

import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolveRepo } from "../services/git";
import { readReviewSnapshot } from "../services/review";
import { apiRoute } from "./api-route";

export function reviewRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/review",
    resolveRepo(cwd).pipe(
      Effect.flatMap((repo) =>
        readReviewSnapshot({
          base: repo.defaultBranch.name,
          branch: repo.branch,
          root: repo.root,
        })
      ),
      Effect.flatMap((snapshot) => HttpServerResponse.json(snapshot))
    )
  );
}
