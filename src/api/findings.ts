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

import { writeFindingRecord } from "../core/findings-write";
import { resolveAuthor } from "../core/git";
import { postWriteRoute, readChangeScope } from "./api-route";

export function findingsRoute(cwd: string) {
  return postWriteRoute("/api/findings", FindingWrite, (write) =>
    Effect.gen(function* postFinding() {
      const scope = yield* readChangeScope(cwd);
      const author = yield* resolveAuthor(scope.root);
      return yield* writeFindingRecord({ ...scope, author, write });
    })
  );
}
