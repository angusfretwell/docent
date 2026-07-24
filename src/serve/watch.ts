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
 * All three surfaces use `node:fs.watch`, acquired **eagerly** in the build
 * fiber (see `watchEager`), and merge into one `Stream.debounce`d pipeline whose
 * only output is the coarse push, so a burst of writes coalesces into a single
 * event.
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
 * Watch `dir` with `node:fs.watch`, acquired **eagerly** in the build fiber and
 * bridged to the pipeline through an unbounded queue. A missing directory yields
 * an empty stream, so a not-yet-existing dir never stops the server booting.
 *
 * Eager acquisition is the whole point. `Stream.debounce`/`Stream.mergeAll`
 * subscribe lazily on a forked fiber, so folding the watch into that stream
 * would defer its creation past the layer build — and a loop-blocking write (a
 * `git commit`'s `execFileSync`, or an agent's `writeFileSync`) can then fire
 * and finish before the watch exists. On Linux inotify never replays that
 * missed event (macOS FSEvents is lenient, hiding the bug), so the change is
 * lost. Creating the watch synchronously here guarantees it is live before the
 * server serves a request; the unbounded queue buffers until the debounce fiber
 * drains it.
 *
 * `node:fs.watch` over Effect's `FileSystem.watch`: the latter is lazy (no way
 * to force eager subscription) and hardcodes `{ recursive: true }`, while the
 * git-dir surface needs a **flat** watch — a recursive watch on `.git/` floods
 * events from `objects/`, and a flat one still catches git's atomic-rename
 * replacement of top-level `HEAD`/`index`/`COMMIT_EDITMSG` that per-file watches
 * miss once the inode is swapped. `ignore` drops changes to gitignored paths in
 * the watcher callback, before they ever enqueue; `filename` is relative to
 * `dir` (any OS separator — the matcher normalizes).
 */
const watchEager = Effect.fn("watchEager")(function* watchEager(
  dir: string,
  options: {
    readonly recursive: boolean;
    readonly ignore?: (relPath: string) => boolean;
  }
) {
  const fs = yield* FileSystem;
  const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return Stream.empty;
  }

  // The queue carries `void` by design (see the module comment); the `void`
  // generic argument is valid here despite the rule flagging it.
  // oxlint-disable-next-line no-invalid-void-type
  const events = yield* Queue.unbounded<void>();

  yield* Effect.acquireRelease(
    Effect.sync(() =>
      watch(dir, { recursive: options.recursive }, (_event, filename) => {
        if (options.ignore && filename !== null && options.ignore(filename)) {
          return;
        }
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
  const stateChanges = yield* watchEager(stateRoot, { recursive: true });
  // Surface 2: repo root — working-tree edits, minus gitignored/`.git`/`.docent`
  // churn, so the Pending diff recomputes live as an agent edits.
  const rootChanges = yield* watchEager(root, {
    ignore: (relPath) => matcher.ignores(relPath),
    recursive: true,
  });
  // Surface 3: the git dir — flat HEAD/index/COMMIT_EDITMSG moves (commit,
  // checkout) so the incremental Pending diff empties and the entry auto-hides.
  const gitChanges =
    gitDir === undefined
      ? Stream.empty
      : yield* watchEager(gitDir, { recursive: false });

  // One shared debounce across all three surfaces: any burst coalesces into a
  // single coarse push.
  const changes = Stream.mergeAll([stateChanges, rootChanges, gitChanges], {
    concurrency: "unbounded",
  }).pipe(Stream.debounce(Duration.millis(DEBOUNCE_MS)));

  // Drive the pipeline in a scoped fiber: the `node:fs.watch` handles tear down
  // when the layer's scope ends.
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
