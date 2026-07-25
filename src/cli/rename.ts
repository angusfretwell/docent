import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { setReviewTitle } from "../core/review";
import { resolveChangeScope } from "../core/write-context";
import { WorkingDirectory, printJson, requireText } from "./usage";

export const renameCommand = Command.make(
  "rename",
  {
    title: Flag.string("title").pipe(
      Flag.withDescription("A short name for the change under review")
    ),
  },
  (config) =>
    Effect.gen(function* runRename() {
      const cwd = yield* WorkingDirectory;
      const title = yield* requireText("title", config.title);
      const scope = yield* resolveChangeScope(cwd);

      return yield* printJson(
        yield* setReviewTitle({
          base: scope.base,
          branch: scope.branch,
          root: scope.root,
          title,
        })
      );
    })
).pipe(
  Command.withDescription("Rename the change under review, keeping its id")
);
