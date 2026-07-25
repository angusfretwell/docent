import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import path from "node:path";

import type { PendingRange } from "@shared/enums/pending-range";
import { cleanupScratchDirs, git, scratchRepo } from "@test/fixtures";
import { makeTestRuntime } from "@test/runtime";

import { resolvePending } from "./pending";
import { resolveChange } from "./resolve";

const runtime = makeTestRuntime();

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function repoWithOneCommit() {
  return scratchRepo("docent-git-test-");
}

describe("resolvePending", () => {
  function pending(cwd: string, range: PendingRange = "incremental") {
    return runtime.runPromise(resolvePending(cwd, range));
  }

  test("is not dirty and has an empty patch on a clean working tree", async () => {
    const repo = repoWithOneCommit();

    const result = await pending(repo);

    expect(result.dirty).toBe(false);
    expect(result.patch).toBe("");
  });

  test("combines staged and unstaged edits into one delta since HEAD", async () => {
    const repo = repoWithOneCommit();
    writeFileSync(path.join(repo, "hello.txt"), "hello\nstaged\n");
    git(repo, "add", "hello.txt");
    writeFileSync(path.join(repo, "hello.txt"), "hello\nstaged\nunstaged\n");

    const result = await pending(repo);

    expect(result.dirty).toBe(true);
    expect(result.patch).toContain("hello.txt");
    expect(result.patch).toContain("+staged");
    expect(result.patch).toContain("+unstaged");
  });

  test("includes untracked files as full-file adds, respecting .gitignore", async () => {
    const repo = repoWithOneCommit();
    writeFileSync(path.join(repo, ".gitignore"), "ignored.txt\n");
    git(repo, "add", ".gitignore");
    git(repo, "commit", "-m", "add gitignore");
    writeFileSync(path.join(repo, "fresh.txt"), "brand\nnew\n");
    writeFileSync(path.join(repo, "ignored.txt"), "do not show\n");

    const result = await pending(repo);

    expect(result.patch).toContain("fresh.txt");
    expect(result.patch).toContain("+brand");
    expect(result.patch).toContain("new file mode");
    expect(result.patch).not.toContain("ignored.txt");
  });

  test("renders an untracked binary file as a no-preview add", async () => {
    const repo = repoWithOneCommit();
    const bytes = new Uint8Array([
      0x00, 0xff, 0x0a, 0x42, 0x89, 0x50, 0x4e, 0x47,
    ]);
    writeFileSync(path.join(repo, "asset.bin"), bytes);

    const result = await pending(repo);

    expect(result.dirty).toBe(true);
    expect(result.patch).toContain("asset.bin");
    expect(result.patch).toContain("new file mode");
    expect(result.patch).toContain("Binary files");
  });

  test("incremental empties the moment HEAD moves (commit hides Pending)", async () => {
    const repo = repoWithOneCommit();
    writeFileSync(path.join(repo, "hello.txt"), "hello\nedit\n");

    const before = await pending(repo);
    expect(before.dirty).toBe(true);

    git(repo, "add", ".");
    git(repo, "commit", "-m", "commit the edit");
    const after = await pending(repo);

    expect(after.dirty).toBe(false);
    expect(after.patch).toBe("");
  });

  test("cumulative previews base..worktree — committed change plus uncommitted edits", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "committed.txt"), "committed on feature\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "committed feature work");
    writeFileSync(path.join(repo, "working.txt"), "uncommitted\n");

    const incremental = await pending(repo, "incremental");
    const cumulative = await pending(repo, "cumulative");

    expect(incremental.patch).toContain("working.txt");
    expect(incremental.patch).not.toContain("committed.txt");
    expect(cumulative.patch).toContain("committed.txt");
    expect(cumulative.patch).toContain("working.txt");
  });

  test("keys the head side on the full content SHA, carried into the Change on commit", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "hello.txt"), "hello\nedited\n");

    const result = await pending(repo, "incremental");

    const blobSha = git(repo, "hash-object", path.join(repo, "hello.txt"));
    expect(blobSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.patch).toContain(blobSha);
    git(repo, "add", ".");
    git(repo, "commit", "-m", "commit the edit");
    const change = await runtime.runPromise(resolveChange(repo));
    expect(change.patch).toContain(blobSha);
  });

  test("keys an untracked add on the full content SHA", async () => {
    const repo = repoWithOneCommit();
    writeFileSync(path.join(repo, "fresh.txt"), "brand\nnew\n");

    const result = await pending(repo);

    const blobSha = git(repo, "hash-object", path.join(repo, "fresh.txt"));
    expect(blobSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.patch).toContain(blobSha);
  });
});
