import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";

import { resolveChange } from "../core/git";
import { apiRoute } from "./api-route";

export function diffRoute(cwd: string) {
  return apiRoute(
    "GET",
    "/api/diff",
    resolveChange(cwd).pipe(
      Effect.flatMap((change) => HttpServerResponse.json(change))
    )
  );
}
