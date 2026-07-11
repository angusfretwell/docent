/**
 * The live-reload watch: debounced `node:fs` watches that broadcast a coarse
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
 * *what*. Every git read runs with `GIT_OPTIONAL_LOCKS=0` (git.ts), so a
 * recompute can't rewrite `.git/index` and feed surface 3 into a loop.
 */

import { watch } from "node:fs";
import { Context, Effect, Layer, Option, PubSub } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ensureGitignore } from "../services/review";
import { resolveGitDir, resolveRepo } from "../services/git";
import { makeMatcher, parseGitignore } from "./gitignore";
import type { IgnoreMatcher } from "./gitignore";

/** Collapse a burst of file writes (agents write in bursts) into one push. */
const DEBOUNCE_MS = 40;

/** The broadcast channel for change events. */
export class DocentWatch extends Context.Service<
  DocentWatch,
  { readonly events: PubSub.PubSub<void> }
>()("docent/DocentWatch") {}

/** Read a gitignore-style file's text, or "" when it does not exist. */
const readIgnoreText = Effect.fn("readIgnoreText")(function* readIgnoreText(file: string) {
  const fs = yield* FileSystem;
  return yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => ""));
});

/** Build the ignore matcher from the repo's `.gitignore` and `.git/info/exclude`. */
const buildMatcher = Effect.fn("buildMatcher")(function* buildMatcher(
  root: string,
  gitDir?: string,
) {
  const path = yield* Path;
  const rootIgnore = yield* readIgnoreText(path.join(root, ".gitignore"));
  const exclude =
    gitDir === undefined ? "" : yield* readIgnoreText(path.join(gitDir, "info", "exclude"));
  return makeMatcher(parseGitignore(`${rootIgnore}\n${exclude}`));
});

/**
 * A scoped recursive/flat `node:fs` watch on `dir` that calls `onChange` when a
 * reported change passes `accept` (always, if omitted). Closing the scope tears
 * the watcher down. Missing directories are skipped, so a not-yet-existing
 * `.git/info` or state dir never stops the server booting.
 */
const watchDir = Effect.fn("watchDir")(function* watchDir(
  dir: string,
  options: { recursive: boolean; accept?: (relPath: string) => boolean },
  onChange: () => void,
) {
  const fs = yield* FileSystem;
  const exists = yield* fs.exists(dir).pipe(Effect.orElseSucceed(() => false));
  if (!exists) {
    return;
  }
  yield* Effect.acquireRelease(
    Effect.sync(() =>
      watch(dir, { recursive: options.recursive }, (_event, filename) => {
        // A `null` filename (some platforms) is a change we can't classify —
        // accept it rather than miss it.
        if (options.accept === undefined || filename === null || options.accept(filename)) {
          onChange();
        }
      }),
    ),
    (watcher) => Effect.sync(() => watcher.close()),
  );
});

const makeWatch = Effect.fn("makeWatch")(function* makeWatch(cwd: string) {
  const fs = yield* FileSystem;
  const path = yield* Path;

  // Watch the repo-root; non-git dirs fall back to cwd so the server still boots
  // (its /api routes surface the git error per request instead).
  const root = yield* resolveRepo(cwd).pipe(
    Effect.map((repo) => repo.root),
    Effect.orElseSucceed(() => cwd),
  );
  const gitDir = Option.getOrUndefined(yield* resolveGitDir(cwd).pipe(Effect.option));
  const stateRoot = path.join(root, ".docent");

  // The watch target must exist, and `.docent/` must stay out of git history.
  // Both are best-effort — a failure here must not stop the server from booting.
  yield* fs.makeDirectory(stateRoot, { recursive: true }).pipe(Effect.ignore);
  yield* ensureGitignore(root).pipe(Effect.ignore);

  // Built after ensureGitignore so `.docent/` is in `.gitignore` and the repo
  // watch treats it as ignored (the dedicated `.docent/` watch handles it).
  const matcher: IgnoreMatcher = yield* buildMatcher(root, gitDir);

  // The channel carries `void` by design (see the module comment); `void` here
  // is a generic type argument, which this rule flags despite being valid.
  // oxlint-disable-next-line no-invalid-void-type
  const events = yield* PubSub.unbounded<void>();

  // One shared debounce across all three surfaces: any burst coalesces into a
  // single coarse push.
  let timer: ReturnType<typeof setTimeout> | undefined;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      // The `undefined` value is required: it selects `publishUnsafe`'s
      // data-first overload, so the void message actually publishes.
      // oxlint-disable-next-line no-useless-undefined
      PubSub.publishUnsafe(events, undefined);
    }, DEBOUNCE_MS);
  }
  yield* Effect.addFinalizer(() => Effect.sync(() => clearTimeout(timer)));

  // Surface 1: `.docent/` — review writes (external agents and the UI alike).
  yield* watchDir(stateRoot, { recursive: true }, schedule);
  // Surface 2: repo root — working-tree edits, minus gitignored/`.git`/`.docent`
  // churn, so the Pending diff recomputes live as an agent edits.
  yield* watchDir(root, { accept: (rel) => !matcher.ignores(rel), recursive: true }, schedule);
  // Surface 3: the git dir — HEAD/index moves (commit, checkout) so the
  // incremental Pending diff empties and the entry auto-hides.
  if (gitDir !== undefined) {
    yield* watchDir(gitDir, { recursive: false }, schedule);
  }

  return { events };
});

/** Scoped layer: starts the watches on build, closes them when the scope ends. */
export function layer(cwd: string) {
  return Layer.effect(DocentWatch, makeWatch(cwd));
}
