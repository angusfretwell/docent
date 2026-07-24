/**
 * The `docent status` subcommand — the "is a docent server already up for this
 * repo?" detection `/docent`'s serve-and-open act calls before it starts one
 * (agent-integration.md §3.1). It resolves the recorded `.docent/serve.json`
 * address, probes it for liveness against this repo, and prints the result as
 * `{ serving, url? }` so the skill can branch on it (serve/address.ts).
 */

import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { resolveServeStatus } from "../serve/address";
import { WorkingDirectory, printJson } from "./usage";

/** The `docent status` subcommand — is a docent server live for this repo? */
export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* runStatus() {
    const cwd = yield* WorkingDirectory;

    return yield* printJson(yield* resolveServeStatus(cwd));
  })
).pipe(
  Command.withDescription("Report whether a docent server is serving this repo")
);
