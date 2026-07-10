/**
 * Live git resolution for `docent serve` — repo root, checked-out branch,
 * default branch, merge-base, and the merge-base..head patch. Everything
 * resolves from local git alone (offline; no network, no GitHub).
 */

import { Effect, Schema, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";
import { Change } from "../shared/change.ts";

const TRAILING_NEWLINE = /\n$/;

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
 * Run a git command, succeeding with its raw stdout bytes — verbatim, with no
 * text decode and no newline trim, so binary blobs survive intact. stderr is
 * still decoded for the error message.
 */
const gitBytes = Effect.fn("gitBytes")(function* gitBytes(cwd: string, args: readonly string[]) {
  const handle = yield* ChildProcess.make("git", args, { cwd });
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
  // `--full-index` emits the full blob object ids on each index line. The Diff
  // tab keys mark-as-viewed on the head-blob SHA (diff-review.md §3); an
  // abbreviated id's length grows with the repo, so a full id is what stays
  // byte-comparable across Changes.
  const patch =
    baseSha === headSha
      ? ""
      : yield* git(root, [
          "diff",
          "--no-color",
          "--full-index",
          "--find-renames",
          baseSha,
          headSha,
        ]);
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
