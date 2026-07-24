import type { PendingRange } from "@shared/enums/pending-range";
import { Pending } from "@shared/schemas/pending";
import { Effect } from "effect";

import {
  DIFF,
  FIND_RENAMES,
  FULL_INDEX,
  git,
  gitDiffNoIndex,
  NO_COLOR,
  NUL,
} from "./exec";
import { resolveRepo } from "./resolve";

// A `git status --porcelain -z` untracked entry: `??` then a space.
const UNTRACKED = "?? ";

function untrackedPaths(status: string): string[] {
  return status
    .split(NUL)
    .filter((record) => record.startsWith(UNTRACKED))
    .map((record) => record.slice(UNTRACKED.length));
}

function joinPatches(segments: readonly string[]): string {
  const parts = segments.filter((segment) => segment !== "");
  return parts.length === 0 ? "" : `${parts.join("\n")}\n`;
}

/**
 * Pending preview of the dirty working tree for a `range`; the head side is the
 * live working tree, so nothing is minted. `git diff <base>` compares base to
 * the working tree, so the index (staging) is invisible — the reviewer sees
 * everything since the last commit as one delta. Untracked files are appended as
 * full-file adds via `git diff --no-index`, which `git diff` alone omits.
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

    // `--full-index` emits full head-blob SHAs, so viewed marks key on the
    // working file's content SHA and carry into the minted Change on commit (same
    // content-addressed SHA).
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
