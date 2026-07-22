import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { PendingRange } from "@shared/enums/pending-range";
import {
  cleanupScratchDirs,
  git,
  scratchDir,
  scratchRepo,
} from "@test-support/fixtures";
import { makeTestRuntime } from "@test-support/runtime";

import { resolvePending, resolveWorktreeFile } from "./pending";
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
    // Stage one edit, then make a further unstaged edit on top.
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
    // A parseable add: /dev/null → new file.
    expect(result.patch).toContain("new file mode");
    expect(result.patch).not.toContain("ignored.txt");
  });

  test("renders an untracked binary file as a no-preview add", async () => {
    const repo = repoWithOneCommit();
    // A NUL byte makes git classify the file as binary, so the add is emitted
    // as the "Binary files differ" marker — the same no-preview presentation as
    // a tracked binary change — rather than a textual hunk. `git diff
    // --no-index` exits 1 on this ("files differ"), which must not read as a
    // failure and 500 the whole Pending view.
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
    // An uncommitted edit on top of the committed feature work.
    writeFileSync(path.join(repo, "working.txt"), "uncommitted\n");

    const incremental = await pending(repo, "incremental");
    const cumulative = await pending(repo, "cumulative");

    // Incremental is only the uncommitted delta since HEAD.
    expect(incremental.patch).toContain("working.txt");
    expect(incremental.patch).not.toContain("committed.txt");
    // Cumulative is the whole Change (base..HEAD) plus the uncommitted edit.
    expect(cumulative.patch).toContain("committed.txt");
    expect(cumulative.patch).toContain("working.txt");
  });

  test("keys the head side on the full content SHA, carried into the Change on commit", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "hello.txt"), "hello\nedited\n");

    const result = await pending(repo, "incremental");

    // The full 40-char blob id git assigns this working-tree content — the key
    // mark-as-viewed asserts against. Committing the identical bytes mints a
    // Change whose head blob is the same content-addressed SHA, so a Pending
    // viewed mark carries over rather than reading as changed-since-viewed.
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

    // The untracked add goes through `git diff --no-index`, which still hashes
    // the worktree file for its index line — full-length under `--full-index`.
    const blobSha = git(repo, "hash-object", path.join(repo, "fresh.txt"));
    expect(blobSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.patch).toContain(blobSha);
  });
});

describe("resolveWorktreeFile", () => {
  function worktree(cwd: string, relPath: string) {
    return runtime.runPromise(resolveWorktreeFile(cwd, relPath));
  }

  test("reads the live working-tree bytes for a path (uncommitted content)", async () => {
    const repo = repoWithOneCommit();
    writeFileSync(
      path.join(repo, "hello.txt"),
      "live edit not yet committed\n"
    );

    const bytes = await worktree(repo, "hello.txt");

    expect(new TextDecoder().decode(bytes)).toBe(
      "live edit not yet committed\n"
    );
  });

  test("reads a nested path", async () => {
    const repo = repoWithOneCommit();
    mkdirSync(path.join(repo, "src"), { recursive: true });
    writeFileSync(path.join(repo, "src", "app.ts"), "export const x = 1;\n");

    const bytes = await worktree(repo, "src/app.ts");

    expect(new TextDecoder().decode(bytes)).toBe("export const x = 1;\n");
  });

  test("rejects a path that escapes the repo root", async () => {
    const repo = repoWithOneCommit();

    await expect(worktree(repo, "../../../etc/passwd")).rejects.toThrow(
      /path/i
    );
  });

  test("rejects an absolute path", async () => {
    const repo = repoWithOneCommit();

    await expect(worktree(repo, "/etc/passwd")).rejects.toThrow(/path/i);
  });

  test("rejects a symlink inside the repo that points outside it", async () => {
    const repo = repoWithOneCommit();
    const outside = scratchDir("docent-outside-");
    writeFileSync(path.join(outside, "secret.txt"), "top secret\n");
    // A symlink that lives in the repo but resolves outside — the lexical guard
    // passes, so only following the link catches the escape.
    symlinkSync(path.join(outside, "secret.txt"), path.join(repo, "link.txt"));

    await expect(worktree(repo, "link.txt")).rejects.toThrow(/path/i);
  });
});
