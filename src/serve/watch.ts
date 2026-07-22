/**
 * The live-reload watch: debounced file watches that broadcast a coarse
 * "something changed" signal over a PubSub. The SSE route fans that signal out
 * to every connected browser, which re-fetches `GET /api/review` and
 * `GET /api/pending` (architecture.md §2). Coarse by design in v1 — one event,
 * the client re-reads what it needs.
 *
 * Three watch surfaces feed the one PubSub:
 *  1. `.docent/` — an external agent (or the UI) dropping a record file trips
 *     the review refresh, exactly as before.
 *  2. The **repo root** (gitignore-aware, so `node_modules`/`dist` don't drown
 *     it) — an agent editing the working tree recomputes the Pending diff live.
 *  3. The **git directory** (`HEAD`/`index` moves) — a commit empties the
 *     incremental Pending diff, so the entry auto-hides without any polling.
 *
 * The channel carries `void`: the event says only *that* something changed, not
 * *what*. Every git read runs with `GIT_OPTIONAL_LOCKS=0` (core/git/exec.ts),
 * so a recompute can't rewrite `.git/index` and feed surface 3 into a loop.
 *
 * Surfaces 1 and 2 use Effect's `FileSystem.watch` (a `Stream<WatchEvent>`);
 * surface 3 stays on `node:fs.watch` — see `watchGitDir` for why. All three
 * merge into one `Stream.debounce`d pipeline whose only output is the coarse
 * push, so a burst of writes coalesces into a single event.
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

/** Collapse a burst of file writes (agents write in bursts) into one push. */
const DEBOUNCE_MS = 40;

/** The broadcast channel for change events. */
export class DocentWatch extends Context.Service<
  DocentWatch,
  { readonly events: PubSub.PubSub<void> }
>()("docent/DocentWatch") {}

/** Read a gitignore-style file's text, or "" when it does not exist. */
const readIgnoreText = Effect.fn("readIgnoreText")(function* readIgnoreText(
  file: string
) {
  const fs = yield* FileSystem;
  return yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
});

/** Build the ignore matcher from the repo's `.gitignore` and `.git/info/exclude`. */
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
 * A recursive `FileSystem.watch` on `dir`, as a `Stream` of change events. A
 * missing directory yields an empty stream — so a not-yet-existing state dir
 * never stops the server booting — and a watcher error ends that one surface
 * rather than tearing the whole pipeline down.
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
 * Surface 3: a **flat** `node:fs.watch` on the git dir, acquired **eagerly** in
 * the build fiber and bridged to the pipeline through an unbounded queue.
 *
 * Kept on `node:fs.watch` deliberately. Effect's `FileSystem.watch` takes no
 * options and its Node/Bun backend hardcodes `fs.watch(path, { recursive: true
 * })` (NodeFileSystem `watchNode`), so it cannot express a flat watch — a
 * recursive watch on `.git/` would flood events from `objects/`. The git-dir
 * watch must stay flat: a non-recursive directory watch catches git's
 * atomic-rename replacement of the top-level `HEAD`/`index`/`COMMIT_EDITMSG` on
 * commit/checkout (which per-file watches miss once the inode is swapped)
 * without descending into `objects/`.
 *
 * Eager acquisition matters: `Stream.debounce`/`Stream.mergeAll` subscribe
 * lazily on a forked fiber, so folding the watch into that stream would defer
 * its creation past the layer build — and a `git commit` (a loop-blocking
 * `execFileSync`) can then fire and finish before the watch exists, dropping
 * the event. Creating the watch synchronously here (in `makeWatch`'s fiber)
 * guarantees it is live before the server serves a request; the unbounded queue
 * buffers anything it captures until the debounce fiber drains it.
 */
const watchGitDir = Effect.fn("watchGitDir")(function* watchGitDir(
  gitDir: string
) {
  // The queue carries `void` by design (see the module comment); the `void`
  // generic argument is valid here despite the rule flagging it.
  // oxlint-disable-next-line no-invalid-void-type
  const events = yield* Queue.unbounded<void>();

  yield* Effect.acquireRelease(
    Effect.sync(() =>
      watch(gitDir, { recursive: false }, () => {
        // The `undefined` is the void payload the queue carries; it selects
        // `offerUnsafe`'s data-first overload, so the signal actually enqueues.
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

  // Watch the repo-root; non-git dirs fall back to cwd so the server still boots
  // (its /api routes surface the git error per request instead).
  const root = yield* resolveRepo(cwd).pipe(
    Effect.map((repo) => repo.root),
    Effect.orElseSucceed(() => cwd)
  );
  const gitDir = Option.getOrUndefined(
    yield* resolveGitDir(cwd).pipe(Effect.option)
  );
  const stateRoot = path.join(root, ".docent");

  // The watch target must exist, and `.docent/` must carry its commit policy
  // (data-model.md §1). Both are best-effort — a failure here must not stop the
  // server from booting.
  yield* fs.makeDirectory(stateRoot, { recursive: true }).pipe(Effect.ignore);
  yield* ensureStateRootGitignore(root).pipe(Effect.ignore);

  // The matcher keeps `node_modules`/`dist` churn off the repo-root watch; it
  // always excludes `.docent/` too (the dedicated `.docent/` watch owns it),
  // independent of the repo's `.gitignore`.
  const matcher: IgnoreMatcher = yield* buildMatcher(root, gitDir);

  // The channel carries `void` by design (see the module comment); `void` here
  // is a generic type argument, which this rule flags despite being valid.
  // oxlint-disable-next-line no-invalid-void-type
  const events = yield* PubSub.unbounded<void>();

  // Surface 1: `.docent/` — review writes (external agents and the UI alike);
  // every event counts, so no filter.
  const stateChanges = (yield* watchDir(stateRoot)).pipe(
    Stream.map((): void => undefined)
  );
  // Surface 2: repo root — working-tree edits, minus gitignored/`.git`/`.docent`
  // churn, so the Pending diff recomputes live as an agent edits. `event.path`
  // is repo-relative (any OS separator); the matcher normalizes separators.
  const rootChanges = (yield* watchDir(root)).pipe(
    Stream.filter((event: WatchEvent) => !matcher.ignores(event.path)),
    Stream.map((): void => undefined)
  );
  // Surface 3: the git dir — flat HEAD/index/COMMIT_EDITMSG moves (commit,
  // checkout) so the incremental Pending diff empties and the entry auto-hides.
  // Acquired eagerly here (see `watchGitDir`) so a commit right after boot is
  // never missed.
  const gitExists =
    gitDir === undefined
      ? false
      : yield* fs.exists(gitDir).pipe(Effect.orElseSucceed(() => false));
  const gitChanges =
    gitDir !== undefined && gitExists
      ? yield* watchGitDir(gitDir)
      : Stream.empty;

  // One shared debounce across all three surfaces: any burst coalesces into a
  // single coarse push.
  const changes = Stream.mergeAll([stateChanges, rootChanges, gitChanges], {
    concurrency: "unbounded",
  }).pipe(Stream.debounce(Duration.millis(DEBOUNCE_MS)));

  // Drive the pipeline in a scoped fiber: the fs watches (and surface 3's
  // `node:fs.watch`) tear down when the layer's scope ends.
  yield* Stream.runForEach(changes, () =>
    // The `undefined` value is the void payload the SSE route fans out; the
    // event carries no data, so an explicit `undefined` is required here.
    // oxlint-disable-next-line no-useless-undefined
    PubSub.publish(events, undefined)
  ).pipe(Effect.forkScoped);

  return { events };
});

/** Scoped layer: starts the watches on build, closes them when the scope ends. */
export function layer(cwd: string) {
  return Layer.effect(DocentWatch, makeWatch(cwd));
}
