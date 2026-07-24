import { Effect, Schema, Stream } from "effect";
import { ChildProcess } from "effect/unstable/process";

const TRAILING_NEWLINE = /\n$/;

// `GIT_OPTIONAL_LOCKS=0` stops git taking the index lock to refresh cached stat
// info, so a `git status`/`git diff` never writes `.git/index` — otherwise the
// repo-rooted watch (serve/watch.ts) sees its own recompute and loops.
const GIT_ENV = { GIT_OPTIONAL_LOCKS: "0" } as const;

export const NUL = "\0";

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
  // Drain concurrently with the exit wait so a large diff can't deadlock the pipe.
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

export function git(cwd: string, args: readonly string[]) {
  return gitText(cwd, args, (exitCode) => exitCode === 0);
}

/** `git diff --no-index` exits 1 (not 0) when the files differ — the normal case here; exit ≥ 2 is a genuine failure. */
export function gitDiffNoIndex(cwd: string, args: readonly string[]) {
  return gitText(cwd, args, (exitCode) => exitCode <= 1);
}

export const gitBytes = Effect.fn("gitBytes")(function* gitBytes(
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
