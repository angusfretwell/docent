import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { resolveServeStatus } from "../serve/address";
import { WorkingDirectory, printJson } from "./usage";

export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* runStatus() {
    const cwd = yield* WorkingDirectory;

    return yield* printJson(yield* resolveServeStatus(cwd));
  })
).pipe(
  Command.withDescription("Report whether a docent server is serving this repo")
);
