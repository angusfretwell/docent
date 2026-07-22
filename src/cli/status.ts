/**
 * The `docent status` subcommand — the "is a docent server already up for this
 * repo?" detection `/docent`'s serve-and-open act calls before it starts one
 * (agent-integration.md §3.1). It resolves the recorded `.docent/serve.json`
 * address, probes it for liveness against this repo, and prints the result as
 * `{ serving, url? }` so the skill can branch on it (serve/address.ts).
 */

import { Effect } from "effect";

import { resolveServeStatus } from "../serve/address";
import { printJson } from "./args";

/** Run `docent status`: print whether a docent server is live for this repo. */
export const runStatus = Effect.fn("runStatus")(function* runStatus(
  cwd: string
) {
  const status = yield* resolveServeStatus(cwd);
  return yield* printJson(status);
});
