import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";
import { Console, Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { readReviewSnapshot } from "../core/review";
import { renameCommand } from "./rename";
import { WorkingDirectory } from "./usage";

const runtime = makeTestRuntime();
const run = runtime.runPromise;

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function rename(cwd: string, argv: readonly string[]) {
  return Command.runWith(renameCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

async function printedJson(
  command: ReturnType<typeof rename>
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

function featureRepo(): string {
  const dir = scratchRepo("docent-rename-cli-");
  git(dir, "checkout", "-b", "feature");
  writeFileSync(path.join(dir, "feature.ts"), "export const x = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "add feature");
  return dir;
}

async function currentReview(root: string) {
  const snapshot = await run(
    readReviewSnapshot({ base: "main", branch: "feature", root })
  );
  return snapshot.review;
}

describe("docent rename — end to end through git + fs", () => {
  test("names the change, and the Review reads back with that title", async () => {
    const repo = featureRepo();

    await run(rename(repo, ["--title", "Palette panel"]));

    const named = await currentReview(repo);
    expect(named.title).toBe("Palette panel");
  });

  test("prints the named Review as machine-readable JSON", async () => {
    const repo = featureRepo();

    const printed = await printedJson(
      rename(repo, ["--title", "Palette panel"])
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
    await run(rename(repo, ["--title", "First name"]));
    const minted = await currentReview(repo);

    await run(rename(repo, ["--title", "Second name"]));

    expect(await currentReview(repo)).toMatchObject({
      id: minted.id,
      title: "Second name",
    });
  });

  test("a missing --title is a usage error", async () => {
    const repo = featureRepo();

    const exit = await runtime.runPromiseExit(rename(repo, []));

    expect(exit._tag).toBe("Failure");
  });

  test("a blank --title is a usage error, never a nameless rename", async () => {
    const repo = featureRepo();

    const error = await run(rename(repo, ["--title", "   "]).pipe(Effect.flip));

    expect(error.message).toBe("--title <value> is required");
  });
});
