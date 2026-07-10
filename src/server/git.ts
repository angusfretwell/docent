/**
 * Live git resolution for `docent serve` — repo root, checked-out branch,
 * default branch, merge-base, and the merge-base..head patch. Everything
 * resolves from local git alone (offline; no network, no GitHub).
 */

import { Effect, Schema, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { Change } from "../shared/change.ts";

const TRAILING_NEWLINE = /\n$/;

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

function streamText<E, R>(stream: Stream.Stream<Uint8Array, E, R>) {
  return Stream.mkString(Stream.decodeText(stream));
}

/** Run a git command, succeeding with its trimmed stdout. */
const git = Effect.fn("git")(function* git(cwd: string, args: readonly string[]) {
  const handle = yield* ChildProcess.make("git", args, { cwd });
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
