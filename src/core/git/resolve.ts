import { Change } from "@shared/schemas/change";
import { Author } from "@shared/schemas/finding";
import { Effect, Schema } from "effect";
import { unique } from "radashi";

import {
  DIFF,
  FIND_RENAMES,
  FULL_INDEX,
  git,
  gitBytes,
  NO_COLOR,
  NUL,
} from "./exec";

// A git object id: 4–64 hex chars. Anything else can't name a blob, so it never reaches git.
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

export const resolveGitDir = Effect.fn("resolveGitDir")(function* resolveGitDir(
  cwd: string
) {
  return yield* git(cwd, ["rev-parse", "--absolute-git-dir"]);
});

// `git check-attr` reports `set`/`true` for a set attribute, else `unspecified`/`unset`/`false`.
function isGeneratedValue(value: string): boolean {
  return value === "set" || value === "true";
}

/** Best-effort: any failure (or no changed paths) yields none. */
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
    // `check-attr -z` emits NUL-separated (path, attr, value) triples.
    const records = output.split(NUL);
    const generated: string[] = [];
    for (let i = 0; i + 2 < records.length; i += 3) {
      if (isGeneratedValue(records[i + 2] ?? "")) {
        generated.push(records[i] ?? "");
      }
    }
    return unique(generated);
  }
);

export const resolveChangeRefs = Effect.fn("resolveChangeRefs")(
  function* resolveChangeRefs(cwd: string) {
    const { root, branch, defaultBranch } = yield* resolveRepo(cwd);
    const headSha = yield* git(root, ["rev-parse", "HEAD"]);
    const baseSha = yield* git(root, ["merge-base", defaultBranch.ref, "HEAD"]);
    return { baseSha, branch, defaultBranch, headSha, root };
  }
);

/** A remote that is not URL-shaped (e.g. a local path) passes through unchanged. */
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

const resolveRemoteUrl = Effect.fn("resolveRemoteUrl")(
  function* resolveRemoteUrl(root: string) {
    const remote = yield* git(root, ["remote", "get-url", "origin"]).pipe(
      Effect.catchTag("GitCommandFailed", () => Effect.succeed(null))
    );
    return remote === null ? null : normalizeRemoteUrl(remote);
  }
);

export const resolveChange = Effect.fn("resolveChange")(function* resolveChange(
  cwd: string
) {
  const { root, branch, baseSha, headSha, defaultBranch } =
    yield* resolveChangeRefs(cwd);
  const remoteUrl = yield* resolveRemoteUrl(root);
  // `--full-index` emits full blob ids; mark-as-viewed keys on the head-blob
  // SHA, and an abbreviated id's length grows with the repo, so only a full id
  // stays byte-comparable across Changes.
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

/** A missing git config degrades to a placeholder rather than failing the write. */
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
  return Author.make({
    display,
    id: email === "" ? "unknown" : email,
    kind: "human",
  });
});

/** `cat-file blob` resolves any abbreviated id but fails on a non-blob object; a malformed id short-circuits before git runs. */
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

/** `git cat-file -s` reads only the object header, so it never streams a large binary. A malformed id short-circuits before git runs. */
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

export const resolveBlobShaAt = Effect.fn("resolveBlobShaAt")(
  function* resolveBlobShaAt(root: string, ref: string, file: string) {
    return yield* git(root, ["rev-parse", `${ref}:${file}`]);
  }
);
