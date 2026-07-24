/**
 * The `docent review` subcommand — the CLI face of the Review's own identity
 * record. A Review auto-creates on first use with everything git can resolve
 * (branch, base); its **title** is the one field git cannot infer, so it is
 * captured here, by the run that generates the walkthroughs.
 *
 * As with `docent finding` and `docent walkthrough`, this is non-gating: it
 * writes the identical `review.json` an agent could hand-author, and a running
 * `docent serve` turns the write into an SSE refresh via the `.docent/` watch.
 */

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

/** The `docent review` subcommand tree — the Review's identity record. */
export const reviewCommand = Command.make("review").pipe(
  Command.withDescription("Read and write the Review's own identity record"),
  Command.withSubcommands([set])
);
