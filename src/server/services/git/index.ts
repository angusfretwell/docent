/**
 * The public interface for git resolution: repo/branch/Change identity, blob
 * reads, author identity, and the Pending/worktree read path — everything
 * `docent serve`, the CLI, and the routes resolve straight from local git.
 * Every consumer outside `services/git/` imports from here.
 */

export { GitCommandFailed } from "./exec";
export { makeMatcher, parseGitignore } from "./gitignore";
export type { IgnoreMatcher } from "./gitignore";
export {
  resolvePending,
  resolveWorktreeFile,
  InvalidWorktreePath,
} from "./pending";
export {
  resolveAuthor,
  resolveBlob,
  resolveBlobShaAt,
  resolveBlobSize,
  resolveChange,
  resolveChangeRefs,
  resolveGitDir,
  resolveRepo,
  DefaultBranchNotFound,
  InvalidObjectId,
  NotAGitRepository,
} from "./resolve";
