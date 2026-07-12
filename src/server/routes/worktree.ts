/**
 * `GET /api/worktree?path=…` — the live bytes of a working-tree file, read off
 * disk on every request and explicitly uncached. This is the Pending diff's
 * head side, which has no committed SHA to address (diff-review.md §6). A path
 * that escapes the repo root 400s; a path that does not exist 404s.
 */

import { Effect } from "effect";

import { resolveWorktreeFile } from "../services/git";
import {
  apiRoute,
  OCTET_STREAM,
  searchParams,
  uncachedBytes,
} from "./api-route";

export function worktreeRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/worktree",
    (request) =>
      Effect.gen(function* serveWorktree() {
        const bytes = yield* resolveWorktreeFile(
          cwd,
          searchParams(request).get("path") ?? ""
        );
        return uncachedBytes(bytes, OCTET_STREAM);
      }),
    { badRequest: "InvalidWorktreePath", notFound: true }
  );
}
