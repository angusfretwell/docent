import { Effect } from "effect";

import { resolveWorktreeFile } from "../core/git";
import {
  apiRoute,
  OCTET_STREAM,
  requiredParam,
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
          requiredParam(searchParams(request).get("path"))
        );
        return uncachedBytes(bytes, OCTET_STREAM);
      }),
    { badRequest: "InvalidWorktreePath", notFound: true }
  );
}
