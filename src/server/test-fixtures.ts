/**
 * Shared scratch-repo fixtures for the server test suites. Every temp dir is
 * registered here; each suite calls `cleanupScratchDirs` in its `afterAll`.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const NOT_A_GIT_REPO = /not a git repository/i;

const scratchDirs: string[] = [];

/** A fresh temp dir, removed by `cleanupScratchDirs`. */
export function scratchDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  scratchDirs.push(dir);
  return dir;
}

export function cleanupScratchDirs(): void {
  for (const dir of scratchDirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
}

/** Run a git command, throwing on failure, succeeding with trimmed stdout. */
export function git(cwd: string, ...args: string[]): string {
  const result = Bun.spawnSync(["git", ...args], { cwd });
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${result.stderr.toString()}${result.stdout.toString()}`,
    );
  }
  return result.stdout.toString().trim();
}

/** A scratch repo with one commit on `main`. */
export function scratchRepo(prefix: string): string {
  const dir = scratchDir(prefix);
  git(dir, "init", "-b", "main");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  writeFileSync(path.join(dir, "hello.txt"), "hello\n");
  git(dir, "add", ".");
  git(dir, "commit", "-m", "initial");
  return dir;
}
