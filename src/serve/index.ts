import type { HTMLBundle } from "bun";
import { Config, Console, Effect } from "effect";
import open from "open";
import pc from "picocolors";

import { webHandler } from "../api/index";
import { resolveChange } from "../core/git";
import { VERSION } from "../version";
import { removeServeAddress, writeServeAddress } from "./address";
import { resolvePort } from "./port";

export interface EntryOptions {
  development: boolean | { console?: boolean; hmr?: boolean };
  index: HTMLBundle;
  /** The preferred port; serving climbs past it when it is already taken. */
  port: number;
  workerBundle: string;
}

// Only the compiled binary should pop a browser; the dev entry reloads often
// under `bun --watch`.
const isProduction = Config.string("NODE_ENV").pipe(
  Config.withDefault("development"),
  Config.map((nodeEnv) => nodeEnv === "production")
);

// Best-effort browser open; a failure is ignored (the URL is already printed).
const openBrowser = Effect.fn("openBrowser")(
  (url: string) => Effect.tryPromise(() => open(url)),
  (effect) => Effect.ignore(effect)
);

export const serve = Effect.fn("serve")(function* serve(
  entry: EntryOptions,
  target: string
) {
  // Fail fast before binding the port; requests still re-resolve the diff live.
  const change = yield* resolveChange(target);

  // `Bun.serve` calls `fetch(request, server)`; the handler reads only the
  // request, so wrap to drop the second argument.
  const { handler } = webHandler({ cwd: target });

  const port = yield* resolvePort(entry.port);

  const server = yield* Effect.sync(() =>
    Bun.serve({
      development: entry.development,
      fetch: (request) => handler(request),
      // Never drop the long-lived SSE connection for being idle.
      idleTimeout: 0,
      port,
      routes: {
        // SPA catch-all: Bun matches routes by specificity (exact > wildcard >
        // catch-all), not key order, so the more specific routes below still win.
        "/*": entry.index,
        "/api/*": (request) => handler(request),
        // The client's `workerFactory` (code-view.ts) loads the worker from this exact path.
        "/diff-worker.js": () =>
          new Response(Bun.file(entry.workerBundle), {
            headers: { "content-type": "text/javascript; charset=utf-8" },
          }),
      },
    })
  );
  const url = server.url.href;

  // Record the live URL so `docent status` can detect and reuse this server.
  // Best-effort — a serve that cannot write its address still serves.
  yield* writeServeAddress(change.root, url).pipe(Effect.ignore);

  const root = pc.dim(`(${change.root})`);
  yield* Console.log(pc.bold(pc.yellow(`Docent ${VERSION}`)));
  yield* Console.log(`${change.branch} → ${change.defaultBranch} ${root}`);
  yield* Console.log(`${pc.green("✓")} Serving on ${url}`);

  // Effect's `Stdio` service exposes the streams but not their TTY-ness, so the
  // interactive check reads `process` directly.
  if (process.stdout.isTTY && (yield* isProduction)) {
    yield* openBrowser(url);
  }

  // `ensuring` runs on interruption too, so the address file is always cleared.
  return yield* Effect.never.pipe(
    Effect.ensuring(removeServeAddress(change.root).pipe(Effect.ignore))
  );
});
