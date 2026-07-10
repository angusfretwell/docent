/**
 * The `.docent/` live-reload watch: a debounced recursive `node:fs` watch that
 * broadcasts a coarse "the Dossier changed" signal over a PubSub. The SSE route
 * fans that signal out to every connected browser, which re-fetches
 * `GET /api/dossier` (architecture.md §2). Coarse by design in v1 — one event,
 * the client re-reads the whole snapshot.
 *
 * The channel carries `void`: the event says only *that* something changed, not
 * *what*. An external agent dropping a record file into `.docent/` trips this
 * exactly like the UI's own writes do.
 */

import { watch } from "node:fs";
import { Context, Effect, Layer, PubSub } from "effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import { ensureGitignore } from "./dossier.ts";
import { resolveRepo } from "./git.ts";

/** Collapse a burst of file writes (agents write records in bursts) into one push. */
const DEBOUNCE_MS = 40;

/** The broadcast channel for `.docent/`-changed events. */
export class DocentWatch extends Context.Service<
  DocentWatch,
  { readonly events: PubSub.PubSub<void> }
>()("docent/DocentWatch") {}

const makeWatch = Effect.fn("makeWatch")(function* (cwd: string) {
  const fs = yield* FileSystem;
  const path = yield* Path;

  // Watch the repo-root `.docent/`. Non-git dirs fall back to cwd so the server
  // still boots (its /api routes surface the git error per request instead).
  const root = yield* resolveRepo(cwd).pipe(
    Effect.map((repo) => repo.root),
    Effect.orElseSucceed(() => cwd),
  );
  const stateRoot = path.join(root, ".docent");

  // The watch target must exist, and `.docent/` must stay out of git history.
  // Both are best-effort — a failure here must not stop the server from booting.
  yield* fs.makeDirectory(stateRoot, { recursive: true }).pipe(Effect.ignore);
  yield* ensureGitignore(root).pipe(Effect.ignore);

  const events = yield* PubSub.unbounded<void>();
  const exists = yield* fs
    .exists(stateRoot)
    .pipe(Effect.orElseSucceed(() => false));
  if (exists) {
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const watcher = watch(stateRoot, { recursive: true }, () => {
          clearTimeout(timer);
          timer = setTimeout(() => {
            PubSub.publishUnsafe(events, undefined);
          }, DEBOUNCE_MS);
        });
        return { watcher, cancel: () => clearTimeout(timer) };
      }),
      ({ watcher, cancel }) =>
        Effect.sync(() => {
          cancel();
          watcher.close();
        }),
    );
  }

  return { events };
});

/** Scoped layer: starts the watch on build, closes it when the scope ends. */
export const layer = (cwd: string) => Layer.effect(DocentWatch, makeWatch(cwd));
