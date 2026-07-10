/**
 * Live git resolution for `docent serve` — repo root, checked-out branch,
 * default branch, merge-base, and the merge-base..head patch. Everything
 * resolves from local git alone (offline; no network, no GitHub).
 */

import { Effect, Schema, Stream } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ChildProcess } from "effect/unstable/process";
import { Change } from "../shared/change.ts";
import type { PendingRange } from "../shared/pending.ts";
import { Pending } from "../shared/pending.ts";

const TRAILING_NEWLINE = /\n$/;

// A NUL-separated `git status --porcelain -z` record, plus the marker for an
// untracked entry (its two-char status + a space).
const NUL = "\0";
const UNTRACKED = "?? ";

// Keep every git read inert: `GIT_OPTIONAL_LOCKS=0` stops git from taking the
// index lock to refresh cached stat info, so a `git status`/`git diff` never
// writes `.git/index`. The repo-rooted watch (watch.ts) would otherwise see its
// own recompute rewrite the index and feed itself into a loop.
const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0" } as const;

// A git object id: 4–64 lowercase/uppercase hex chars (abbreviated through full
// SHA-1 or SHA-256). Anything else can't name a blob, so it never reaches git.
const OBJECT_ID = /^[0-9a-f]{4,64}$/i;

export class GitCommandFailed extends Schema.TaggedErrorClass<GitCommandFailed>()(
  "GitCommandFailed",
  {
    args: Schema.Array(Schema.String),
    exitCode: Schema.Number,
    stderr: Schema.String,
  },
) {
  override get message(): string {
    return `git ${this.args.join(" ")} failed: ${this.stderr.trim()}`;
  }
}

export class NotAGitRepository extends Schema.TaggedErrorClass<NotAGitRepository>()(
  "NotAGitRepository",
  { path: Schema.String },
) {
  override get message(): string {
    return `not a git repository: ${this.path}`;
  }
}

export class DefaultBranchNotFound extends Schema.TaggedErrorClass<DefaultBranchNotFound>()(
  "DefaultBranchNotFound",
  {},
) {
  override get message(): string {
    return "could not resolve the default branch: no origin/HEAD, main, or master";
  }
}

export class InvalidObjectId extends Schema.TaggedErrorClass<InvalidObjectId>()("InvalidObjectId", {
  sha: Schema.String,
}) {
  override get message(): string {
    return `not a valid git object id: ${this.sha}`;
  }
}

export class InvalidWorktreePath extends Schema.TaggedErrorClass<InvalidWorktreePath>()(
  "InvalidWorktreePath",
  { path: Schema.String },
) {
  override get message(): string {
    return `not a valid working-tree path: ${this.path}`;
  }
}

function streamText<E, R>(stream: Stream.Stream<Uint8Array, E, R>) {
  return Stream.mkString(Stream.decodeText(stream));
}

/** Concatenate the stream's byte chunks into a single `Uint8Array`. */
function streamBytes<E, R>(stream: Stream.Stream<Uint8Array, E, R>) {
  return Effect.map(Stream.runCollect(stream), (parts) => {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  });
}

/** Run a git command, succeeding with its trimmed stdout. */
const git = Effect.fn("git")(function* git(cwd: string, args: readonly string[]) {
  const handle = yield* ChildProcess.make("git", args, { cwd, env: GIT_ENV, extendEnv: true });
  // Drain stdout/stderr concurrently with the exit wait so a large diff
  // can't deadlock the pipe.
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [streamText(handle.stdout), streamText(handle.stderr), handle.exitCode],
    { concurrency: "unbounded" },
  );
  if (exitCode !== 0) {
    return yield* Effect.fail(GitCommandFailed.make({ args, exitCode, stderr }));
  }
  return stdout.replace(TRAILING_NEWLINE, "");
}, Effect.scoped);

/**
 * Run `git diff --no-index`, which is git's way to diff arbitrary files and
 * exits **1** (not 0) whenever the two differ — the normal case here, since we
 * feed it `/dev/null` against a real untracked file to render it as an add. A
 * genuine failure (exit ≥ 2) still fails. stdout is returned trimmed.
 */
const gitDiffNoIndex = Effect.fn("gitDiffNoIndex")(function* gitDiffNoIndex(
  cwd: string,
  args: readonly string[],
) {
  const handle = yield* ChildProcess.make("git", args, { cwd, env: GIT_ENV, extendEnv: true });
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [streamText(handle.stdout), streamText(handle.stderr), handle.exitCode],
    { concurrency: "unbounded" },
  );
  if (exitCode > 1) {
    return yield* Effect.fail(GitCommandFailed.make({ args, exitCode, stderr }));
  }
  return stdout.replace(TRAILING_NEWLINE, "");
}, Effect.scoped);

/**
 * Run a git command, succeeding with its raw stdout bytes — verbatim, with no
 * text decode and no newline trim, so binary blobs survive intact. stderr is
 * still decoded for the error message.
 */
const gitBytes = Effect.fn("gitBytes")(function* gitBytes(cwd: string, args: readonly string[]) {
  const handle = yield* ChildProcess.make("git", args, { cwd, env: GIT_ENV, extendEnv: true });
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [streamBytes(handle.stdout), streamText(handle.stderr), handle.exitCode],
    { concurrency: "unbounded" },
  );
  if (exitCode !== 0) {
    return yield* Effect.fail(GitCommandFailed.make({ args, exitCode, stderr }));
  }
  return stdout;
}, Effect.scoped);

/**
 * The default branch, as { name, ref }: origin's HEAD branch when the repo
 * has an origin, else the local `main`/`master` branch.
 */
const resolveDefaultBranch = Effect.fn("resolveDefaultBranch")(function* resolveDefaultBranch(
  root: string,
) {
  const originHead = yield* git(root, ["symbolic-ref", "refs/remotes/origin/HEAD"]).pipe(
    Effect.catchTag("GitCommandFailed", () => Effect.succeed(null)),
  );
  if (originHead !== null) {
    const name = originHead.replace("refs/remotes/origin/", "");
    return { name, ref: `origin/${name}` };
  }
  for (const name of ["main", "master"]) {
    const sha = yield* git(root, ["rev-parse", "--verify", `refs/heads/${name}`]).pipe(
      Effect.catchTag("GitCommandFailed", () => Effect.succeed(null)),
    );
    if (sha !== null) {
      return { name, ref: name };
    }
  }
  return yield* Effect.fail(DefaultBranchNotFound.make({}));
});

/**
 * Resolve the repo root, checked-out branch, and default branch — the light
 * identity the Dossier store keys on, without minting the (expensive) diff.
 */
export const resolveRepo = Effect.fn("resolveRepo")(function* resolveRepo(cwd: string) {
  const root = yield* git(cwd, ["rev-parse", "--show-toplevel"]).pipe(
    Effect.catchTag("GitCommandFailed", () => Effect.fail(NotAGitRepository.make({ path: cwd }))),
  );
  const [branch, defaultBranch] = yield* Effect.all(
    [git(root, ["rev-parse", "--abbrev-ref", "HEAD"]), resolveDefaultBranch(root)],
    { concurrency: "unbounded" },
  );
  return { branch, defaultBranch, root };
});

/** Resolve the checked-out branch's live Change against the default branch. */
export const resolveChange = Effect.fn("resolveChange")(function* resolveChange(cwd: string) {
  const { root, branch, defaultBranch } = yield* resolveRepo(cwd);
  const headSha = yield* git(root, ["rev-parse", "HEAD"]);
  const baseSha = yield* git(root, ["merge-base", defaultBranch.ref, "HEAD"]);
  const patch =
    baseSha === headSha
      ? ""
      : yield* git(root, ["diff", "--no-color", "--find-renames", baseSha, headSha]);
  return Change.make({
    baseSha,
    branch,
    defaultBranch: defaultBranch.name,
    headSha,
    patch,
    root,
  });
});

/**
 * Raw bytes of a git blob addressed by its object id — pure local `git
 * cat-file`, offline, no network. The id is content-addressed and immutable, so
 * the byte stream never changes; `cat-file blob` resolves any abbreviated id
 * while still failing on a non-blob object (a commit/tree id 404s, not
 * misreads). A malformed id short-circuits before git ever runs.
 */
export const resolveBlob = Effect.fn("resolveBlob")(function* resolveBlob(
  cwd: string,
  sha: string,
) {
  if (!OBJECT_ID.test(sha)) {
    return yield* Effect.fail(InvalidObjectId.make({ sha }));
  }
  const { root } = yield* resolveRepo(cwd);
  return yield* gitBytes(root, ["cat-file", "blob", sha]);
});

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
export const resolvePending = Effect.fn("resolvePending")(function* resolvePending(
  cwd: string,
  range: PendingRange,
) {
  const { root, branch, defaultBranch } = yield* resolveRepo(cwd);
  const [headSha, baseSha, status] = yield* Effect.all(
    [
      git(root, ["rev-parse", "HEAD"]),
      git(root, ["merge-base", defaultBranch.ref, "HEAD"]),
      git(root, ["status", "--porcelain", "-z", "--untracked-files=all"]),
    ],
    { concurrency: "unbounded" },
  );
  const dirty = status.length > 0;

  // A clean tree diffs to nothing — skip the work and return the empty preview.
  const patch = dirty
    ? yield* Effect.gen(function* buildPatch() {
        const diffBase = range === "incremental" ? "HEAD" : baseSha;
        const tracked = yield* git(root, ["diff", "--no-color", "--find-renames", diffBase]);
        // Render each untracked file as an add: /dev/null → the working file.
        const adds = yield* Effect.forEach(
          untrackedPaths(status),
          (file) =>
            gitDiffNoIndex(root, ["diff", "--no-color", "--no-index", "--", "/dev/null", file]),
          { concurrency: "unbounded" },
        );
        return joinPatches([tracked, ...adds]);
      })
    : "";

  return Pending.make({ baseSha, branch, dirty, headSha, patch, range, root });
});

/**
 * Read a working-tree file's live bytes off disk by its repo-relative path —
 * the Pending diff's head side, which has no committed SHA to address
 * (diff-review.md §6, architecture.md §2). Path-safety is enforced against the
 * resolved repo root: absolute paths and any `..` escape are rejected before a
 * byte is read, so a crafted `path` can never leave the repo.
 */
export const resolveWorktreeFile = Effect.fn("resolveWorktreeFile")(function* resolveWorktreeFile(
  cwd: string,
  relPath: string,
) {
  const fs = yield* FileSystem;
  const path = yield* Path;
  const { root } = yield* resolveRepo(cwd);

  const resolved = path.resolve(root, relPath);
  const prefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (path.isAbsolute(relPath) || !resolved.startsWith(prefix)) {
    return yield* Effect.fail(InvalidWorktreePath.make({ path: relPath }));
  }
  return yield* fs.readFile(resolved);
});
