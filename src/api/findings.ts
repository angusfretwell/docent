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
