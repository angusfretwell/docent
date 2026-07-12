import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";

import { cleanupScratchDirs, scratchDir } from "../core/test-fixtures";
import { CliUsageError } from "./args";
import { parseValidateArgs, runValidate } from "./validate";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

/** Write `<root>/.docent/reviews/feature/review.json` with `body`. */
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
});

describe("parseValidateArgs", () => {
  test("returns the lone positional path", () => {
    expect(parseValidateArgs(["./fixtures/docent"])).toBe("./fixtures/docent");
  });

  test("no argument means the current directory (undefined)", () => {
    expect(parseValidateArgs([])).toBeUndefined();
  });

  test("rejects a flag", () => {
    expect(() => parseValidateArgs(["--json"])).toThrow(CliUsageError);
  });

  test("rejects a second positional", () => {
    expect(() => parseValidateArgs(["a", "b"])).toThrow(CliUsageError);
  });
});

describe("runValidate", () => {
  test("exits zero on a well-formed tree", async () => {
    const root = scratchDir("docent-validate-cli-");
    seedReview(root, VALID_REVIEW);

    const exit = await runtime.runPromiseExit(runValidate(root, []));

    expect(exit._tag).toBe("Success");
  });

  test("fails (exits non-zero) when a record is invalid", async () => {
    const root = scratchDir("docent-validate-cli-");
    seedReview(root, "{ not valid json");

    const exit = await runtime.runPromiseExit(runValidate(root, []));

    expect(exit._tag).toBe("Failure");
  });
});
