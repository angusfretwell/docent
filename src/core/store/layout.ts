/**
 * The `.docent/` filesystem layout: the state-root directory name, where a
 * branch's Review lives under it, and the repo-root commit policy that keeps
 * `.docent/` machine-local (data-model.md §1).
 */

import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

/** The directory under a repo root that holds all of docent's machine-local state. */
export const STATE_ROOT = ".docent";

/**
 * The `.docent/.gitignore` commit policy (data-model.md §1): everything under
 * `.docent/` is machine-local working state, so only the capture runbook —
 * earned setup knowledge — and this policy file itself travel with the repo.
 * The `!.gitignore` line is what lets the policy be committed rather than
 * ignoring itself.
 */
const STATE_ROOT_GITIGNORE = "*\n!capture.md\n!.gitignore\n";

/** Directory name for a branch's Review: the branch name, slashes → dashes. */
export function branchSlug(branch: string): string {
  return branch.replaceAll("/", "-");
}

/** The absolute directory of a branch's Review under `<root>/.docent/`. */
export function reviewDirPath(root: string, branch: string): string {
  return `${root}/${STATE_ROOT}/reviews/${branchSlug(branch)}`;
}

/**
 * Seed `<root>/.docent/.gitignore` with the commit policy when it is absent —
 * the single home for the policy, run by every path that lazily creates
 * `.docent` (data-model.md §1). Idempotent: an existing file is left untouched,
 * so a re-run never duplicates a line. Best-effort at every call site.
 */
export const ensureStateRootGitignore = Effect.fn("ensureStateRootGitignore")(
  function* ensureStateRootGitignore(root: string) {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const dir = path.join(root, STATE_ROOT);
    const file = path.join(dir, ".gitignore");

    const present = yield* fs
      .exists(file)
      .pipe(Effect.orElseSucceed(() => false));
    if (present) {
      return;
    }

    yield* fs.makeDirectory(dir, { recursive: true });
    yield* fs.writeFileString(file, STATE_ROOT_GITIGNORE);
  }
);
