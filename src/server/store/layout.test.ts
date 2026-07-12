import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";

import { cleanupScratchDirs, scratchDir } from "../lib/test-fixtures";
import { branchSlug, ensureStateRootGitignore, reviewDirPath } from "./layout";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

describe("branchSlug", () => {
  test("maps slashes to dashes", () => {
    expect(branchSlug("feat/stream")).toBe("feat-stream");
    expect(branchSlug("a/b/c")).toBe("a-b-c");
    expect(branchSlug("main")).toBe("main");
  });
});

describe("reviewDirPath", () => {
  test("locates the branch's Review dir under <root>/.docent/reviews/<slug>", () => {
    expect(reviewDirPath("/repo", "feat/stream")).toBe(
      "/repo/.docent/reviews/feat-stream"
    );
  });
});

describe("ensureStateRootGitignore", () => {
  test("seeds .docent/.gitignore with the commit policy", async () => {
    const root = scratchDir("docent-layout-");

    await runtime.runPromise(ensureStateRootGitignore(root));

    const body = readFileSync(
      path.join(root, ".docent", ".gitignore"),
      "utf-8"
    );
    expect(body).toBe("*\n!capture.md\n!.gitignore\n");
  });

  test("leaves an existing .docent/.gitignore untouched", async () => {
    const root = scratchDir("docent-layout-");
    mkdirSync(path.join(root, ".docent"), { recursive: true });
    writeFileSync(path.join(root, ".docent", ".gitignore"), "custom\n");

    await runtime.runPromise(ensureStateRootGitignore(root));

    expect(
      readFileSync(path.join(root, ".docent", ".gitignore"), "utf-8")
    ).toBe("custom\n");
  });
});
