/**
 * The low-level git process runner: spawn `git`, drain stdout/stderr
 * concurrently with the exit wait (so a large diff can't deadlock the pipe),
 * and turn a rejected exit code into `GitCommandFailed`. Every read runs
 * inert (`GIT_OPTIONAL_LOCKS=0`): git never takes the index lock to refresh
 * cached stat info, so a `git status`/`git diff` never writes `.git/index` —
 * the repo-rooted watch (lib/watch.ts) would otherwise see its own recompute
 * rewrite the index and feed itself into a loop.
 *
 * Exposed as the `GitRunner` interface (not bare functions), so a resolver
 * could run against a fake git in a test without spawning a real process.
 */

import { Effect, Schema, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";

const TRAILING_NEWLINE = /\n$/;

// Keep every git read inert: `GIT_OPTIONAL_LOCKS=0` stops git from taking the
// index lock to refresh cached stat info, so a `git status`/`git diff` never
// writes `.git/index`. The repo-rooted watch (watch.ts) would otherwise see its
// own recompute rewrite the index and feed itself into a loop.
const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0" } as const;

// A NUL-separated `git status --porcelain -z` (or `check-attr -z`) record
// separator — shared by the status/untracked-file parsing (pending.ts) and the
// check-attr parsing (resolve.ts).
export const NUL = "\0";

// Shared `git diff` argv fragments, extracted so the diff call sites across
// resolve.ts and pending.ts agree (and don't trip the no-duplicate-string lint).
export const DIFF = "diff";
export const NO_COLOR = "--no-color";
export const FULL_INDEX = "--full-index";
export const FIND_RENAMES = "--find-renames";

export class GitCommandFailed extends Schema.TaggedErrorClass<GitCommandFailed>()(
  "GitCommandFailed",
  {
    args: Schema.Array(Schema.String),
    exitCode: Schema.Number,
    stderr: Schema.String,
  }
) {
  override get message(): string {
    return `git ${this.args.join(" ")} failed: ${this.stderr.trim()}`;
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

/**
 * Run a git command and succeed with its trimmed stdout when `accepts` approves
 * the exit code; otherwise fail with the stderr. The exit predicate is the only
 * thing that varies across call sites — a plain command wants exactly 0, while
 * `git diff --no-index` reports a difference with exit 1.
 */
const gitText = Effect.fn("gitText")(function* gitText(
  cwd: string,
  args: readonly string[],
  accepts: (exitCode: number) => boolean
) {
  const handle = yield* ChildProcess.make("git", args, {
    cwd,
    env: GIT_ENV,
    extendEnv: true,
  });
  // Drain stdout/stderr concurrently with the exit wait so a large diff
  // can't deadlock the pipe.
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [streamText(handle.stdout), streamText(handle.stderr), handle.exitCode],
    { concurrency: "unbounded" }
  );
  if (!accepts(exitCode)) {
    return yield* Effect.fail(
      GitCommandFailed.make({ args, exitCode, stderr })
    );
  }
  return stdout.replace(TRAILING_NEWLINE, "");
}, Effect.scoped);

/** Run a git command, succeeding with its trimmed stdout (exit 0 only). */
function git(cwd: string, args: readonly string[]) {
  return gitText(cwd, args, (exitCode) => exitCode === 0);
}

/**
 * Run `git diff --no-index`, which is git's way to diff arbitrary files and
 * exits **1** (not 0) whenever the two differ — the normal case here, since we
 * feed it `/dev/null` against a real untracked file to render it as an add. A
 * genuine failure (exit ≥ 2) still fails. stdout is returned trimmed.
 */
function gitDiffNoIndex(cwd: string, args: readonly string[]) {
  return gitText(cwd, args, (exitCode) => exitCode <= 1);
}

/**
 * Run a git command, succeeding with its raw stdout bytes — verbatim, with no
 * text decode and no newline trim, so binary blobs survive intact. stderr is
 * still decoded for the error message.
 */
const gitBytes = Effect.fn("gitBytes")(function* gitBytes(
  cwd: string,
  args: readonly string[]
) {
  const handle = yield* ChildProcess.make("git", args, {
    cwd,
    env: GIT_ENV,
    extendEnv: true,
  });
  const [stdout, stderr, exitCode] = yield* Effect.all(
    [streamBytes(handle.stdout), streamText(handle.stderr), handle.exitCode],
    { concurrency: "unbounded" }
  );
  if (exitCode !== 0) {
    return yield* Effect.fail(
      GitCommandFailed.make({ args, exitCode, stderr })
    );
  }
  return stdout;
}, Effect.scoped);

/**
 * The real `GitRunner`: spawns the system `git` binary. Its shape — `text` /
 * `diffNoIndex` / `bytes`, each `(cwd, args) => Effect<...>` — is the seam a
 * resolver depends on; a test can swap in an object of the same shape that
 * never spawns a process.
 */
export const gitRunner = {
  bytes: gitBytes,
  diffNoIndex: gitDiffNoIndex,
  text: git,
};

/** The git operations a resolver needs — swappable for a fake in a test. */
export type GitRunner = typeof gitRunner;
