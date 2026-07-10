import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BunServices } from "@effect/platform-bun";
import { ManagedRuntime } from "effect";
import { resolveRepoDiff } from "./git.ts";

const runtime = ManagedRuntime.make(BunServices.layer);
const scratchDirs: string[] = [];

afterAll(async () => {
  await runtime.dispose();
  for (const dir of scratchDirs) {
    rmSync(dir, { force: true, recursive: true });
  }
});

const resolve = (cwd: string) => runtime.runPromise(resolveRepoDiff(cwd));

const NOT_A_GIT_REPO = /not a git repository/i;

function sh(cwd: string, ...cmd: string[]): string {
  const result = Bun.spawnSync(cmd, { cwd });
  if (result.exitCode !== 0) {
    throw new Error(
      `${cmd.join(" ")} failed: ${result.stderr.toString()}${result.stdout.toString()}`
    );
  }
  return result.stdout.toString().trim();
}

function git(cwd: string, ...args: string[]): string {
  return sh(cwd, "git", ...args);
}

/** A scratch repo with one commit on `main`. */
function scratchRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "docent-git-test-"));
  scratchDirs.push(dir);
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(join(dir, "hello.txt"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "initial");
  return dir;
}

describe("resolveRepoDiff", () => {
  test("renders the merge-base..head diff of a feature branch", async () => {
    const repo = scratchRepo();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(join(repo, "feature.txt"), "new file\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "add feature file");

    const diff = await resolve(repo);

    expect(diff.branch).toBe("feature");
    expect(diff.defaultBranch).toBe("main");
    expect(diff.headSha).toBe(git(repo, "rev-parse", "HEAD"));
    expect(diff.baseSha).toBe(git(repo, "rev-parse", "main"));
    expect(diff.patch).toContain("feature.txt");
    expect(diff.patch).toContain("+new file");
  });

  test("uses the merge-base, not the default branch tip (three-dot semantics)", async () => {
    const repo = scratchRepo();
    const branchPoint = git(repo, "rev-parse", "HEAD");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(join(repo, "feature.txt"), "on feature\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "feature work");
    // main moves on after the branch point — its changes must NOT show up.
    git(repo, "checkout", "main");
    writeFileSync(join(repo, "main-only.txt"), "on main\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "main work");
    git(repo, "checkout", "feature");

    const diff = await resolve(repo);

    expect(diff.baseSha).toBe(branchPoint);
    expect(diff.patch).toContain("feature.txt");
    expect(diff.patch).not.toContain("main-only.txt");
  });

  test("resolves the repo root from a subdirectory", async () => {
    const repo = scratchRepo();
    git(repo, "checkout", "-b", "feature");
    writeFileSync(join(repo, "change.txt"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "change");
    const sub = join(repo, "nested", "deep");
    mkdirSync(sub, { recursive: true });

    const diff = await resolve(sub);

    // macOS tmpdir is a symlink (/tmp → /private/tmp); compare resolved paths.
    expect(git(diff.root, "rev-parse", "--show-toplevel")).toBe(
      git(repo, "rev-parse", "--show-toplevel")
    );
    expect(diff.patch).toContain("change.txt");
  });

  test("prefers origin/HEAD's branch as the default branch", async () => {
    const upstream = scratchRepo();
    git(upstream, "branch", "-m", "main", "trunk");
    const dir = mkdtempSync(join(tmpdir(), "docent-git-test-"));
    scratchDirs.push(dir);
    git(dir, "clone", upstream, "clone");
    const repo = join(dir, "clone");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    git(repo, "checkout", "-b", "feature");
    writeFileSync(join(repo, "feature.txt"), "x\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "feature work");

    const diff = await resolve(repo);

    expect(diff.defaultBranch).toBe("trunk");
    expect(diff.baseSha).toBe(git(repo, "rev-parse", "origin/trunk"));
  });

  test("falls back to master when there is no origin and no main", async () => {
    const repo = mkdtempSync(join(tmpdir(), "docent-git-test-"));
    scratchDirs.push(repo);
    git(repo, "init", "-b", "master");
    git(repo, "config", "user.email", "test@example.com");
    git(repo, "config", "user.name", "Test");
    writeFileSync(join(repo, "hello.txt"), "hello\n");
    git(repo, "add", ".");
    git(repo, "commit", "-m", "initial");
    git(repo, "checkout", "-b", "feature");

    const diff = await resolve(repo);

    expect(diff.defaultBranch).toBe("master");
  });

  test("returns an empty patch when checked out on the default branch", async () => {
    const repo = scratchRepo();

    const diff = await resolve(repo);

    expect(diff.branch).toBe("main");
    expect(diff.baseSha).toBe(diff.headSha);
    expect(diff.patch).toBe("");
  });

  test("rejects a directory that is not a git repo", async () => {
    const dir = mkdtempSync(join(tmpdir(), "docent-git-test-"));
    scratchDirs.push(dir);

    await expect(resolve(dir)).rejects.toThrow(NOT_A_GIT_REPO);
  });
});
