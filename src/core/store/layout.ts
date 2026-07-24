import { Effect } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";

export const STATE_ROOT = ".docent";

// The `!.gitignore` line lets the policy file be committed rather than ignoring
// itself; only `capture.md` travels with the repo besides it.
const STATE_ROOT_GITIGNORE = "*\n!capture.md\n!.gitignore\n";

export function branchSlug(branch: string): string {
  return branch.replaceAll("/", "-");
}

export function reviewDirPath(root: string, branch: string): string {
  return `${root}/${STATE_ROOT}/reviews/${branchSlug(branch)}`;
}

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
