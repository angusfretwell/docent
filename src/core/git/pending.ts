/**
 * The Pending preview of the dirty working tree, and a raw read of a
 * working-tree file's live bytes — the two operations that read the live
 * worktree rather than a committed git object.
 */

import type { PendingRange } from "@shared/schemas/pending";
import { Pending } from "@shared/schemas/pending";
import { Effect, Schema } from "effect";
import { FileSystem } from "effect/FileSystem";

import { isContained, safeJoin } from "../safe-join";
import {
  DIFF,
  FIND_RENAMES,
  FULL_INDEX,
  gitRunner,
  NO_COLOR,
  NUL,
} from "./exec";
import { resolveRepo } from "./resolve";

const { diffNoIndex: gitDiffNoIndex, text: git } = gitRunner;

// The marker for an untracked entry in a `git status --porcelain -z` record:
// its two-char status, then a space.
const UNTRACKED = "?? ";

export class InvalidWorktreePath extends Schema.TaggedErrorClass<InvalidWorktreePath>()(
  "InvalidWorktreePath",
  { path: Schema.String }
) {
  override get message(): string {
    return `not a valid working-tree path: ${this.path}`;
  }
}

/** The untracked (`??`) paths of a `git status --porcelain -z -uall` dump. */
function untrackedPaths(status: string): string[] {
  return status
    .split(NUL)
    .filter((record) => record.startsWith(UNTRACKED))
    .map((record) => record.slice(UNTRACKED.length));
}

/** Join file-diff segments into one patch, each newline-terminated for the parser. */
function joinPatches(segments: readonly string[]): string {
  const parts = segments.filter((segment) => segment !== "");
  return parts.length === 0 ? "" : `${parts.join("\n")}\n`;
}

/**
 * Resolve the Pending preview of the dirty working tree for a `range`
 * (diff-review.md §6). The head side is the live working tree, so this is a
 * Change-shaped view, not a Change — resolved fresh per request, nothing minted.
 *
 * - **Staged + unstaged combined**: `git diff <base>` compares `<base>` to the
 *   working tree, so the index (the human's staging) is invisible — the
 *   reviewer sees everything since the last commit as one delta.
 * - **`incremental`** diffs against `HEAD` (just the pending edit);
 *   **`cumulative`** against the merge-base (the whole next Change).
 * - **Untracked files** (`git status --porcelain`, so `.gitignore` is honored)
 *   are appended as full-file adds via `git diff --no-index`, which `git diff`
 *   alone omits — agents routinely *create* files as part of a fix.
 *
 * On commit `HEAD` moves, the incremental diff empties, and `dirty` goes false:
 * Pending owns no lifecycle logic of its own.
 */
export const resolvePending = Effect.fn("resolvePending")(
  function* resolvePending(cwd: string, range: PendingRange) {
    const { root, branch, defaultBranch } = yield* resolveRepo(cwd);
    const [headSha, baseSha, status] = yield* Effect.all(
      [
        git(root, ["rev-parse", "HEAD"]),
        git(root, ["merge-base", defaultBranch.ref, "HEAD"]),
        git(root, ["status", "--porcelain", "-z", "--untracked-files=all"]),
      ],
      { concurrency: "unbounded" }
    );
    const dirty = status.length > 0;

    // A clean tree diffs to nothing — skip the work and return the empty preview.
    // `--full-index` on both invocations emits full head-blob SHAs, so viewed
    // marks key on the working file's content SHA (diff-review.md §6): editing a
    // file auto-clears its mark, and committing unchanged bytes carries the mark
    // into the minted Change (same content-addressed SHA). git hashes worktree
    // files even under `--no-index`, so the untracked-add path keys too.
    const patch = dirty
      ? yield* Effect.gen(function* buildPatch() {
          const diffBase = range === "incremental" ? "HEAD" : baseSha;
          const tracked = yield* git(root, [
            DIFF,
            NO_COLOR,
            FULL_INDEX,
            FIND_RENAMES,
            diffBase,
          ]);
          // Render each untracked file as an add: /dev/null → the working file.
          const adds = yield* Effect.forEach(
            untrackedPaths(status),
            (file) =>
              gitDiffNoIndex(root, [
                DIFF,
                NO_COLOR,
                FULL_INDEX,
                "--no-index",
                "--",
                "/dev/null",
                file,
              ]),
            { concurrency: "unbounded" }
          );
          return joinPatches([tracked, ...adds]);
        })
      : "";

    return Pending.make({
      baseSha,
      branch,
      dirty,
      headSha,
      patch,
      range,
      root,
    });
  }
);

/**
 * Read a working-tree file's live bytes off disk by its repo-relative path —
 * the Pending diff's head side, which has no committed SHA to address
 * (diff-review.md §6, architecture.md §2). Path-safety is enforced against the
 * resolved repo root: absolute paths and any `..` escape are rejected before a
 * byte is read, so a crafted `path` can never leave the repo.
 */
export const resolveWorktreeFile = Effect.fn("resolveWorktreeFile")(
  function* resolveWorktreeFile(cwd: string, relPath: string) {
    const fs = yield* FileSystem;
    const { root } = yield* resolveRepo(cwd);

    const resolved = safeJoin(root, relPath);
    if (resolved === null) {
      return yield* Effect.fail(InvalidWorktreePath.make({ path: relPath }));
    }
    // Follow symlinks before trusting containment: a symlink inside the repo can
    // still point outside it, which the lexical check above cannot catch. A
    // missing file has no real path and falls through to a 404 at the read.
    const real = yield* fs
      .realPath(resolved)
      .pipe(Effect.orElseSucceed(() => resolved));
    if (!isContained(root, real)) {
      return yield* Effect.fail(InvalidWorktreePath.make({ path: relPath }));
    }
    return yield* fs.readFile(resolved);
  }
);
