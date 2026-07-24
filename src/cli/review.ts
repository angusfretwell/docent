import { Effect } from "effect";
import { Command, Flag } from "effect/unstable/cli";

import { setReviewTitle } from "../core/review";
import { resolveChangeScope } from "../core/write-context";
import { WorkingDirectory, printJson, requireText } from "./usage";

const set = Command.make(
  "set",
  {
    title: Flag.string("title").pipe(
      Flag.withDescription("A short human name for the change under review")
    ),
  },
  (config) =>
    Effect.gen(function* runSet() {
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
).pipe(Command.withDescription("Name the change under review, keeping its id"));

export const reviewCommand = Command.make("review").pipe(
  Command.withDescription("Write the Review's own identity record"),
  Command.withSubcommands([set])
);
