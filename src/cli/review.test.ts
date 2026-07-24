import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, git, scratchRepo } from "@test-support/fixtures";
import { makeTestRuntime } from "@test-support/runtime";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { readReviewSnapshot } from "../core/review";
import { reviewCommand } from "./review";
import { WorkingDirectory } from "./usage";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

/** Run `docent review <argv>` the way the binary does, against `cwd`. */
function review(cwd: string, argv: readonly string[]) {
  return Command.runWith(reviewCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

/** Run a subcommand and parse the machine-readable JSON it printed on stdout. */
async function printedJson(
  command: ReturnType<typeof review>
): Promise<unknown> {
  const printed: string[] = [];

  await run(
    command.pipe(
      Effect.provideService(Console.Console, {
        ...globalThis.console,
        log: (...args: unknown[]) => {
          printed.push(args.join(" "));
        },
      })
    )
  );

  return JSON.parse(printed.join("\n"));
}

/** A scratch repo on `feature`, one file changed off `main`. */
function featureRepo(): string {
  const dir = scratchRepo("docent-review-cli-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");
  return dir;
}

/** The Review the repo's active branch reads back as, through the read path. */
async function currentReview(root: string) {
  const snapshot = await run(
    readReviewSnapshot({ base: "main", branch: "feature", root })
  );
  return snapshot.review;
}

describe("docent review set — end to end through git + fs", () => {
  test("names the change, and the Review reads back with that title", async () => {
    const repo = featureRepo();

    await run(review(repo, ["set", "--title", "Palette panel"]));

    const named = await currentReview(repo);
    expect(named.title).toBe("Palette panel");
  });

  test("prints the named Review as machine-readable JSON", async () => {
    const repo = featureRepo();

    const printed = await printedJson(
      review(repo, ["set", "--title", "Palette panel"])
    );

    expect(printed).toMatchObject({
      base: "main",
      branch: "feature",
      schema: "docent/review",
      title: "Palette panel",
    });
  });

  test("renaming rewrites the title in place, keeping the Review's id", async () => {
    const repo = featureRepo();
    await run(review(repo, ["set", "--title", "First name"]));
    const minted = await currentReview(repo);

    await run(review(repo, ["set", "--title", "Second name"]));

    expect(await currentReview(repo)).toMatchObject({
      id: minted.id,
      title: "Second name",
    });
  });

  test("a missing --title is a usage error", async () => {
    const repo = featureRepo();

    const exit = await runtime.runPromiseExit(review(repo, ["set"]));

    expect(exit._tag).toBe("Failure");
  });

  test("a blank --title is a usage error, never a nameless rename", async () => {
    const repo = featureRepo();

    const error = await run(
      review(repo, ["set", "--title", "   "]).pipe(Effect.flip)
    );

    expect(error.message).toBe("--title <value> is required");
  });
});
