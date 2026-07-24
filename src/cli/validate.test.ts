import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { cleanupScratchDirs, scratchDir } from "@test-support/fixtures";
import { makeTestRuntime } from "@test-support/runtime";
import { Effect } from "effect";
import { Command } from "effect/unstable/cli";

import { WorkingDirectory } from "./usage";
import { validateCommand } from "./validate";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function validate(cwd: string, argv: readonly string[]) {
  return Command.runWith(validateCommand, { version: "test" })(argv).pipe(
    Effect.provideService(WorkingDirectory, cwd)
  );
}

function seedReview(root: string, body: string): void {
  const dir = path.join(root, ".docent", "reviews", "feature");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "review.json"), body);
}

const VALID_REVIEW = JSON.stringify({
  base: "main",
  branch: "feature",
  id: "rev_x",
  schema: "docent/review",
  title: "A feature",
});

describe("docent validate", () => {
  test("a second positional is refused, never silently dropped", async () => {
    const root = scratchDir("docent-validate-cli-");
    seedReview(root, VALID_REVIEW);

    const error = await runtime.runPromise(
      Effect.flip(validate(root, [".", "."]))
    );

    expect(error.message).toBe("validate takes at most one path (got 2)");
  });

  test("exits zero on a well-formed tree", async () => {
    const root = scratchDir("docent-validate-cli-");
    seedReview(root, VALID_REVIEW);

    const exit = await runtime.runPromiseExit(validate(root, []));

    expect(exit._tag).toBe("Success");
  });

  test("validates the tree named by the lone positional", async () => {
    const root = scratchDir("docent-validate-cli-");
    seedReview(root, VALID_REVIEW);

    const exit = await runtime.runPromiseExit(validate(root, ["."]));

    expect(exit._tag).toBe("Success");
  });

  test("fails (exits non-zero) when a record is invalid", async () => {
    const root = scratchDir("docent-validate-cli-");
    seedReview(root, "{ not valid json");

    const exit = await runtime.runPromiseExit(validate(root, []));

    expect(exit._tag).toBe("Failure");
  });
});
