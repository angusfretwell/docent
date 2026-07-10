import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";
import { resolveBlob, resolveChange } from "./git.ts";
import { cleanupScratchDirs, git, scratchDir, scratchRepo } from "./test-fixtures.ts";

const runtime = ManagedRuntime.make(BunServices.layer);

afterAll(async () => {
  await runtime.dispose();
  cleanupScratchDirs();
});

function resolve(cwd: string) {
  return runtime.runPromise(resolveChange(cwd));
}

function repoWithOneCommit() {
  return scratchRepo("docent-git-test-");
}

describe("resolveChange", () => {
  test("renders the merge-base..head diff of a feature branch", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "new file\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add feature file");

    const change = await resolve(repo);

    expect(change.branch).toBe("feature");
    expect(change.defaultBranch).toBe("main");
    expect(change.headSha).toBe(git(repo, "rev-parse", "HEAD"));
    expect(change.baseSha).toBe(git(repo, "rev-parse", "main"));
    expect(change.patch).toContain("feature.txt");
    expect(change.patch).toContain("+new file");
  });

  test("uses the merge-base, not the default branch tip (three-dot semantics)", async () => {
    const repo = repoWithOneCommit();
    const branchPoint = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "on feature\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "feature work");
    // main moves on after the branch point — its changes must NOT show up.
    git(repo, "checkout", "main");
    writeFileSync(path.join(repo, "main-only.txt"), "on main\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "main work");
    git(repo, "checkout", "feature");

    const change = await resolve(repo);

    expect(change.baseSha).toBe(branchPoint);
    expect(change.patch).toContain("feature.txt");
    expect(change.patch).not.toContain("main-only.txt");
  });

  test("resolves the repo root from a subdirectory", async () => {
    const repo = repoWithOneCommit();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "change.txt"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "change");
    const sub = path.join(repo, "nested", "deep");
    mkdirSync(sub, { recursive: true });

    const change = await resolve(sub);

    // macOS tmpdir is a symlink (/tmp → /private/tmp); compare resolved paths.
    expect(git(change.root, "rev-parse", "--show-toplevel")).toBe(
      git(repo, "rev-parse", "--show-toplevel"),
    );
    expect(change.patch).toContain("change.txt");
  });

  test("prefers origin/HEAD's branch as the default branch", async () => {
    const upstream = repoWithOneCommit();
    git(upstream, "branch", "-m", "main", "trunk");
    const dir = scratchDir("docent-git-test-");
    git(dir, "clone", upstream, "clone");
    const repo = path.join(dir, "clone");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(path.join(repo, "feature.txt"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "feature work");

    const change = await resolve(repo);

    expect(change.defaultBranch).toBe("trunk");
    expect(change.baseSha).toBe(git(repo, "rev-parse", "origin/trunk"));
  });

  test("falls back to master when there is no origin and no main", async () => {
    const repo = scratchDir("docent-git-test-");
    git(repo, "init", "-b", "master");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    writeFileSync(path.join(repo, "hello.txt"), "hello\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "initial");
    git(repo, "checkout", "-b", "feature");

    const change = await resolve(repo);

    expect(change.defaultBranch).toBe("master");
  });

  test("returns an empty patch when checked out on the default branch", async () => {
    const repo = repoWithOneCommit();

    const change = await resolve(repo);

    expect(change.branch).toBe("main");
    expect(change.baseSha).toBe(change.headSha);
    expect(change.patch).toBe("");
  });

  test("rejects a directory that is not a git repo", async () => {
    const dir = scratchDir("docent-git-test-");

    await expect(resolve(dir)).rejects.toThrow(/not a git repository/i);
  });
});

describe("resolveBlob", () => {
  function blob(cwd: string, sha: string) {
    return runtime.runPromise(resolveBlob(cwd, sha));
  }

  test("returns the raw bytes of a blob addressed by its object id", async () => {
    const repo = repoWithOneCommit();
    const sha = git(repo, "rev-parse", "HEAD:hello.txt");

    const bytes = await blob(repo, sha);

    expect(new TextDecoder().decode(bytes)).toBe("hello\n");
  });

  test("resolves an abbreviated object id", async () => {
    const repo = repoWithOneCommit();
    const sha = git(repo, "rev-parse", "HEAD:hello.txt").slice(0, 8);

    const bytes = await blob(repo, sha);

    expect(new TextDecoder().decode(bytes)).toBe("hello\n");
  });

  test("preserves binary bytes verbatim (no text decode, no newline trim)", async () => {
    const repo = repoWithOneCommit();
    const raw = new Uint8Array([0x00, 0xff, 0x0a, 0x42, 0x0a]);
    writeFileSync(path.join(repo, "blob.bin"), raw);
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add binary");
    const sha = git(repo, "rev-parse", "HEAD:blob.bin");

    const bytes = await blob(repo, sha);

    expect([...bytes]).toEqual([...raw]);
  });

  test("rejects a sha that is not a valid git object", async () => {
    const repo = repoWithOneCommit();

    await expect(blob(repo, "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef")).rejects.toThrow();
  });

  test("rejects a malformed (non-hex) object id", async () => {
    const repo = repoWithOneCommit();

    await expect(blob(repo, "../../etc/passwd")).rejects.toThrow(/object id/i);
  });
});
