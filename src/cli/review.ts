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

import { setReviewTitle } from "../core/review";
import {
  attempt,
  CliUsageError,
  parseArgs,
  printJson,
  requireFlag,
} from "./args";
import type { ParsedArgs } from "./args";
import { writeContext } from "./finding";

/** `review set` — name the change under review, keeping the Review's id. */
const runSet = Effect.fn("runSet")(function* runSet(
  cwd: string,
  args: ParsedArgs
) {
  const title = yield* attempt(() => requireFlag(args, "title"));
  const context = yield* writeContext(cwd);

  return yield* setReviewTitle({
    base: context.base,
    branch: context.branch,
    root: context.root,
    title,
  });
});

/** Run one `docent review <op> …` invocation and print its JSON result. */
export const runReview = Effect.fn("runReview")(function* runReview(
  cwd: string,
  argv: readonly string[]
) {
  const [op, ...rest] = argv;
  if (op === "set") {
    const args = yield* attempt(() => parseArgs(rest, new Set()));
    return yield* printJson(yield* runSet(cwd, args));
  }
  return yield* Effect.fail(
    new CliUsageError({
      reason: `unknown review subcommand: ${op ?? "(none)"} (set)`,
    })
  );
});
