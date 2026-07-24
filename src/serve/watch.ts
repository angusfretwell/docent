/**
 * Debounced file watches broadcast a coarse "something changed" signal over a
 * PubSub; the SSE route fans it to browsers, which re-fetch (architecture.md §2).
 *
 * Every git read runs with `GIT_OPTIONAL_LOCKS=0` (core/git/exec.ts) so a
 * recompute can't rewrite `.git/index` and feed the git-dir watch into a loop.
 */

import { watch } from "node:fs";

import {
  Context,
  Duration,
  Effect,
  Layer,
  Option,
  PubSub,
  Queue,
  Stream,
} from "effect";
import { FileSystem } from "effect/FileSystem";
import type { WatchEvent } from "effect/FileSystem";
import { Path } from "effect/Path";

import {
  makeMatcher,
  parseGitignore,
  resolveGitDir,
  resolveRepo,
} from "../core/git";
import type { IgnoreMatcher } from "../core/git";
import { ensureStateRootGitignore } from "../core/store/layout";

const DEBOUNCE_MS = 40;

export class DocentWatch extends Context.Service<
  DocentWatch,
  { readonly events: PubSub.PubSub<void> }
>()("docent/DocentWatch") {}

const readIgnoreText = Effect.fn("readIgnoreText")(function* readIgnoreText(
  file: string
) {
  const fs = yield* FileSystem;
  return yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
});

const buildMatcher = Effect.fn("buildMatcher")(function* buildMatcher(
  root: string,
  gitDir?: string
) {
  const path = yield* Path;
  const rootIgnore = yield* readIgnoreText(path.join(root, ".gitignore"));
  const exclude =
    gitDir === undefined
      ? ""
      : yield* readIgnoreText(path.join(gitDir, "info", "exclude"));
  return makeMatcher(parseGitignore(`${rootIgnore}\n${exclude}`));
});

/**
 * A missing directory yields an empty stream (a not-yet-existing state dir must
 * not stop the server booting); a watcher error ends only that surface rather
 * than tearing down the whole pipeline.
 */
const watchDir = Effect.fn("watchDir")(function* watchDir(dir: string) {
  const fs = yield* FileSystem;
  const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return Stream.empty;
  }

  return fs.watch(dir).pipe(Stream.catchCause(() => Stream.empty));
});

/**
 * Flat and on `node:fs.watch` deliberately: Effect's `FileSystem.watch`
 * hardcodes `recursive: true`, which on `.git/` floods events from `objects/`.
 * A non-recursive watch catches git's atomic-rename of the top-level
 * `HEAD`/`index`/`COMMIT_EDITMSG` (which per-file watches miss once the inode is
 * swapped) without descending into `objects/`.
 *
 * Eager, because `Stream.debounce`/`mergeAll` subscribe lazily on a forked
 * fiber: deferring the watch's creation past the layer build lets a `git commit`
 * fire and finish before the watch exists, dropping the event. Creating it
 * synchronously here guarantees it is live before the first request.
 */
const watchGitDir = Effect.fn("watchGitDir")(function* watchGitDir(
  gitDir: string
) {
  // oxlint-disable-next-line no-invalid-void-type
  const events = yield* Queue.unbounded<void>();

  yield* Effect.acquireRelease(
    Effect.sync(() =>
      watch(gitDir, { recursive: false }, () => {
        // The `undefined` selects `offerUnsafe`'s data-first overload, so the
        // signal actually enqueues.
        // oxlint-disable-next-line no-useless-undefined
        Queue.offerUnsafe(events, undefined);
      })
    ),
    (watcher) => Effect.sync(() => watcher.close())
  );

  return Stream.fromQueue(events);
});

const makeWatch = Effect.fn("makeWatch")(function* makeWatch(cwd: string) {
  const fs = yield* FileSystem;
  const path = yield* Path;

  // Non-git dirs fall back to cwd so the server still boots; its /api routes
  // surface the git error per request.
  const root = yield* resolveRepo(cwd).pipe(
    Effect.map((repo) => repo.root),
    Effect.orElseSucceed(() => cwd)
  );
  const gitDir = Option.getOrUndefined(
    yield* resolveGitDir(cwd).pipe(Effect.option)
  );
  const stateRoot = path.join(root, ".docent");

  // Best-effort — a failure here must not stop the server booting.
  yield* fs.makeDirectory(stateRoot, { recursive: true }).pipe(Effect.ignore);
  yield* ensureStateRootGitignore(root).pipe(Effect.ignore);

  // The matcher excludes `.docent/` (its dedicated watch owns it) and gitignored churn.
  const matcher: IgnoreMatcher = yield* buildMatcher(root, gitDir);

  // oxlint-disable-next-line no-invalid-void-type
  const events = yield* PubSub.unbounded<void>();

  const stateChanges = (yield* watchDir(stateRoot)).pipe(
    Stream.map((): void => undefined)
  );
  const rootChanges = (yield* watchDir(root)).pipe(
    Stream.filter((event: WatchEvent) => !matcher.ignores(event.path)),
    Stream.map((): void => undefined)
  );
  const gitExists =
    gitDir === undefined
      ? false
      : yield* fs.exists(gitDir).pipe(Effect.orElseSucceed(() => false));
  const gitChanges =
    gitDir !== undefined && gitExists
      ? yield* watchGitDir(gitDir)
      : Stream.empty;

  const changes = Stream.mergeAll([stateChanges, rootChanges, gitChanges], {
    concurrency: "unbounded",
  }).pipe(Stream.debounce(Duration.millis(DEBOUNCE_MS)));

  yield* Stream.runForEach(changes, () =>
    // The explicit `undefined` is the void payload; required despite looking useless.
    // oxlint-disable-next-line no-useless-undefined
    PubSub.publish(events, undefined)
  ).pipe(Effect.forkScoped);

  return { events };
});

export function layer(cwd: string) {
  return Layer.effect(DocentWatch, makeWatch(cwd));
}
