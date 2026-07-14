/**
 * Live git resolution for `docent serve` — repo root, checked-out branch,
 * default branch, merge-base, and the merge-base..head patch; plus blob reads
 * and the human author identity. Everything resolves from local git alone
 * (offline; no network, no GitHub).
 */

import { Change } from "@shared/schemas/change";
import { Effect, Schema } from "effect";

import {
  DIFF,
  FIND_RENAMES,
  FULL_INDEX,
  gitRunner,
  NO_COLOR,
  NUL,
} from "./exec";

const { bytes: gitBytes, text: git } = gitRunner;

// A git object id: 4–64 lowercase/uppercase hex chars (abbreviated through full
// SHA-1 or SHA-256). Anything else can't name a blob, so it never reaches git.
const OBJECT_ID = /^[0-9a-f]{4,64}$/i;

export class NotAGitRepository extends Schema.TaggedErrorClass<NotAGitRepository>()(
  "NotAGitRepository",
  { path: Schema.String }
) {
  override get message(): string {
    return `not a git repository: ${this.path}`;
  }
}

export class DefaultBranchNotFound extends Schema.TaggedErrorClass<DefaultBranchNotFound>()(
  "DefaultBranchNotFound",
  {}
) {
  override get message(): string {
    return "could not resolve the default branch: no origin/HEAD, main, or master";
  }
}

export class InvalidObjectId extends Schema.TaggedErrorClass<InvalidObjectId>()(
  "InvalidObjectId",
  {
    sha: Schema.String,
  }
) {
  override get message(): string {
    return `not a valid git object id: ${this.sha}`;
  }
}

/**
 * The default branch, as { name, ref }: origin's HEAD branch when the repo
 * has an origin, else the local `main`/`master` branch.
 */
const resolveDefaultBranch = Effect.fn("resolveDefaultBranch")(
  function* resolveDefaultBranch(root: string) {
    const originHead = yield* git(root, [
      "symbolic-ref",
      "refs/remotes/origin/HEAD",
    ]).pipe(Effect.catchTag("GitCommandFailed", () => Effect.succeed(null)));
    if (originHead !== null) {
      const name = originHead.replace("refs/remotes/origin/", "");
      return { name, ref: `origin/${name}` };
    }
    for (const name of ["main", "master"]) {
      const sha = yield* git(root, [
        "rev-parse",
        "--verify",
        `refs/heads/${name}`,
      ]).pipe(Effect.catchTag("GitCommandFailed", () => Effect.succeed(null)));
      if (sha !== null) {
        return { name, ref: name };
      }
    }
    return yield* Effect.fail(DefaultBranchNotFound.make({}));
  }
);

/**
 * Resolve the repo root, checked-out branch, and default branch — the light
 * identity the Review store keys on, without minting the (expensive) diff.
 */
export const resolveRepo = Effect.fn("resolveRepo")(function* resolveRepo(
  cwd: string
) {
  const root = yield* git(cwd, ["rev-parse", "--show-toplevel"]).pipe(
    Effect.catchTag("GitCommandFailed", () =>
      Effect.fail(NotAGitRepository.make({ path: cwd }))
    )
  );
  const [branch, defaultBranch] = yield* Effect.all(
    [
      git(root, ["rev-parse", "--abbrev-ref", "HEAD"]),
      resolveDefaultBranch(root),
    ],
    { concurrency: "unbounded" }
  );
  return { branch, defaultBranch, root };
});

/**
 * The repo's absolute git directory — `<root>/.git` for a normal checkout, or
 * the linked path under `.git/worktrees/<name>` for a git worktree. The watch
 * (watch.ts) watches this for HEAD/index moves so Pending hides live on commit.
 */
export const resolveGitDir = Effect.fn("resolveGitDir")(function* resolveGitDir(
  cwd: string
) {
  return yield* git(cwd, ["rev-parse", "--absolute-git-dir"]);
});

// A `.gitattributes` value counts a path as generated when the attribute is set
// (bare `linguist-generated`) or explicitly true (`=true`) — not "unspecified",
// "unset", or "false".
function isGeneratedValue(value: string): boolean {
  return value === "set" || value === "true";
}

/**
 * The changed paths that `.gitattributes` marks `linguist-generated` or
 * `linguist-vendored` (diff-review.md §5). `git check-attr` reads the same
 * attribute stack Linguist does; the client folds these into its default glob
 * set. Best-effort: any failure (or no changed paths) yields none, so a repo
 * without attributes still renders.
 */
const resolveGeneratedPaths = Effect.fn("resolveGeneratedPaths")(
  function* resolveGeneratedPaths(
    root: string,
    baseSha: string,
    headSha: string
  ) {
    const names = yield* git(root, [
      DIFF,
      NO_COLOR,
      "--name-only",
      FIND_RENAMES,
      baseSha,
      headSha,
    ]);
    const paths = names.split("\n").filter((line) => line !== "");
    if (paths.length === 0) {
      return [];
    }
    const attrs = ["linguist-generated", "linguist-vendored"];
    const output = yield* git(root, [
      "check-attr",
      "-z",
      ...attrs,
      "--",
      ...paths,
    ]).pipe(Effect.catchTag("GitCommandFailed", () => Effect.succeed("")));
    // `check-attr -z` emits NUL-separated (path, attr, value) triples. Collect any
    // path whose generated/vendored value is set — de-duplicated across attrs.
    const records = output.split(NUL);
    const generated = new Set<string>();
    for (let i = 0; i + 2 < records.length; i += 3) {
      if (isGeneratedValue(records[i + 2] ?? "")) {
        generated.add(records[i] ?? "");
      }
    }
    return [...generated];
  }
);

/**
 * Resolve the checked-out branch's Change identity — its `(baseSha, headSha)`
 * against the default branch, plus the ref labels — without minting the
 * (expensive) diff. This is what lazy Change minting keys on: a Finding write
 * resolves these refs, then mints or idempotently reuses the Change for the
 * live head (data-model.md §4).
 */
export const resolveChangeRefs = Effect.fn("resolveChangeRefs")(
  function* resolveChangeRefs(cwd: string) {
    const { root, branch, defaultBranch } = yield* resolveRepo(cwd);
    const headSha = yield* git(root, ["rev-parse", "HEAD"]);
    const baseSha = yield* git(root, ["merge-base", defaultBranch.ref, "HEAD"]);
    return { baseSha, branch, defaultBranch, headSha, root };
  }
);

/**
 * Normalize a git remote URL to a browsable https URL: `ssh://`/`git://`
 * schemes and scp-like `git@host:path` forms become `https://host/path`,
 * credentials and ports drop, and a trailing `.git` strips. A remote that is
 * not URL-shaped (e.g. a local path) passes through unchanged.
 */
function normalizeRemoteUrl(remote: string): string {
  const stripped = remote
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");

  const schemed =
    /^(?:git\+)?(?:ssh|git|https?):\/\/(?:[^@/]+@)?(?<host>[^/:]+)(?::\d+)?\/(?<path>.+)$/.exec(
      stripped
    );
  if (schemed?.groups) {
    return `https://${schemed.groups.host}/${schemed.groups.path}`;
  }

  const scpLike = /^(?:[^@/]+@)?(?<host>[^/:]+):(?<path>.+)$/.exec(stripped);
  if (scpLike?.groups) {
    return `https://${scpLike.groups.host}/${scpLike.groups.path}`;
  }

  return stripped;
}

/**
 * The `origin` remote as a normalized https URL, or null when the repo has no
 * origin — the client renders a plain (non-linked) branch label then.
 */
const resolveRemoteUrl = Effect.fn("resolveRemoteUrl")(
  function* resolveRemoteUrl(root: string) {
    const remote = yield* git(root, ["remote", "get-url", "origin"]).pipe(
      Effect.catchTag("GitCommandFailed", () => Effect.succeed(null))
    );
    return remote === null ? null : normalizeRemoteUrl(remote);
  }
);

/** Resolve the checked-out branch's live Change against the default branch. */
export const resolveChange = Effect.fn("resolveChange")(function* resolveChange(
  cwd: string
) {
  const { root, branch, baseSha, headSha, defaultBranch } =
    yield* resolveChangeRefs(cwd);
  const remoteUrl = yield* resolveRemoteUrl(root);
  // `--full-index` emits the full blob object ids on each index line. The Diff
  // tab keys mark-as-viewed on the head-blob SHA (diff-review.md §3); an
  // abbreviated id's length grows with the repo, so a full id is what stays
  // byte-comparable across Changes.
  const [patch, generated] =
    baseSha === headSha
      ? ["", []]
      : yield* Effect.all(
          [
            git(root, [
              DIFF,
              NO_COLOR,
              FULL_INDEX,
              FIND_RENAMES,
              baseSha,
              headSha,
            ]),
            resolveGeneratedPaths(root, baseSha, headSha),
          ],
          { concurrency: "unbounded" }
        );
  return Change.make({
    baseSha,
    branch,
    defaultBranch: defaultBranch.name,
    generated,
    headSha,
    patch,
    remoteUrl,
    root,
  });
});

/**
 * The human author for a UI-authored record, read from local git config. The
 * browser UI is definitionally the human, so attribution comes from
 * `user.email`/`user.name` — never gating anything, just recorded
 * (data-model.md §5.4). A missing config degrades to a usable placeholder
 * rather than failing the write.
 */
export const resolveAuthor = Effect.fn("resolveAuthor")(function* resolveAuthor(
  root: string
) {
  const email = yield* git(root, ["config", "user.email"]).pipe(
    Effect.catchTag("GitCommandFailed", () => Effect.succeed(""))
  );
  const name = yield* git(root, ["config", "user.name"]).pipe(
    Effect.catchTag("GitCommandFailed", () => Effect.succeed(""))
  );
  let display = "You";
  if (name !== "") {
    display = name;
  } else if (email !== "") {
    display = email;
  }
  return {
    display,
    id: email === "" ? "unknown" : email,
    kind: "human" as const,
  };
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
  sha: string
) {
  if (!OBJECT_ID.test(sha)) {
    return yield* Effect.fail(InvalidObjectId.make({ sha }));
  }
  const { root } = yield* resolveRepo(cwd);
  return yield* gitBytes(root, ["cat-file", "blob", sha]);
});

/**
 * The byte size of a git blob by its object id — `git cat-file -s`, which reads
 * only the object header, so it never streams a large binary. The Diff tab shows
 * this as the size-delta row on binary files (diff-review.md §5) without
 * fetching the blob. A malformed id short-circuits; an absent id fails.
 */
export const resolveBlobSize = Effect.fn("resolveBlobSize")(
  function* resolveBlobSize(cwd: string, sha: string) {
    if (!OBJECT_ID.test(sha)) {
      return yield* Effect.fail(InvalidObjectId.make({ sha }));
    }
    const { root } = yield* resolveRepo(cwd);
    const size = yield* git(root, ["cat-file", "-s", sha]);
    return Math.trunc(Number(size));
  }
);

/**
 * The blob object id of a file at a committed ref — `git rev-parse <ref>:<path>`.
 * This is the content-addressed `blobSha` a Finding's code anchor freezes at
 * birth (data-model.md §5.3): the exact file bytes on the anchored side, which
 * `line`/`file` arms index into and drift is later computed against. The CLI's
 * `finding add` resolves it so anchor construction has one home, matching the
 * UI's write path. A path absent at that ref fails.
 */
export const resolveBlobShaAt = Effect.fn("resolveBlobShaAt")(
  function* resolveBlobShaAt(root: string, ref: string, file: string) {
    return yield* git(root, ["rev-parse", `${ref}:${file}`]);
  }
);
