import { Data, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { resolveServeStatus } from "../serve/address";
import { WorkingDirectory, printJson } from "./usage";

/**
 * The JSON still prints before this fails, so the exit code is the only thing
 * it adds — enough for a caller to poll with `until docent status`, rather than
 * matching a substring against the printed record.
 */
class NotServing extends Data.TaggedError("NotServing") {
  override get message(): string {
    return "no docent server is running for this repo — start one with `docent serve`";
  }
}

export const statusCommand = Command.make("status", {}, () =>
  Effect.gen(function* runStatus() {
    const cwd = yield* WorkingDirectory;
    const status = yield* resolveServeStatus(cwd);

    yield* printJson(status);

    return status.serving ? status : yield* Effect.fail(new NotServing());
  })
).pipe(
  Command.withDescription(
    "Check whether a docent server is running for this repo (exits non-zero when none is)"
  )
);
