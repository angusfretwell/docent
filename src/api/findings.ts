/**
 * `POST /api/findings` — append one Finding record (new Finding, reply, resolve,
 * reopen, or edit) as a file drop into `.docent/`, the identical shape an agent writes
 * directly (architecture.md §2). Writing mints-or-reuses the live head's Change
 * and stamps its `changeId`; attribution is the human resolved from git config.
 * A malformed body 400s; a git/write failure 500s. The `.docent/` watch turns
 * the drop into an SSE push, so the UI refreshes without this response.
 */

import { FindingWrite } from "@shared/schemas/finding-write";
import { Effect } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";

import { writeFindingRecord } from "../core/findings-write";
import { resolveAuthor, resolveChangeRefs } from "../core/git";
import { apiRoute } from "./api-route";

export function findingsRoute(cwd: string) {
  return apiRoute(
    "POST",
    "/api/findings",
    Effect.gen(function* postFinding() {
      const write = yield* HttpServerRequest.schemaBodyJson(FindingWrite);
      const refs = yield* resolveChangeRefs(cwd);
      const author = yield* resolveAuthor(refs.root);
      const result = yield* writeFindingRecord({
        author,
        base: refs.defaultBranch.name,
        branch: refs.branch,
        refs: {
          baseRef: refs.defaultBranch.name,
          baseSha: refs.baseSha,
          headRef: refs.branch,
          headSha: refs.headSha,
        },
        root: refs.root,
        write,
      });
      return yield* HttpServerResponse.json(result);
    }),
    { badRequest: "SchemaError" }
  );
}
