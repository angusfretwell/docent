/**
 * The `docent serve` boot, parameterised by the bundled client so the entry
 * (`src/docent.ts` — the `bun build --compile` target and the `bun --watch`
 * dev entry alike) hands it what Bun's fullstack bundler produced: the
 * client's `index.html` and the pre-bundled diff worker.
 *
 * Boots one plain `Bun.serve` process for the repo containing the current
 * directory: Bun's HTML-bundle route serves the UI (as an SPA catch-all, so
 * the client router's paths survive a hard refresh), the pre-bundled worker
 * is served at `/diff-worker.js`, and the Effect `/api/*` routes run one
 * level down behind `webHandler`'s handler.
 */

import { BunServices } from "@effect/platform-bun";
import type { HTMLBundle } from "bun";
import { Console, Effect } from "effect";
import open from "open";

import { webHandler } from "../api/index";
import { resolveChange } from "../core/git";
import { removeServeAddress, writeServeAddress } from "./address";

/** What the entry point hands `runMain`: the bundled client and dev/prod knobs. */
export interface EntryOptions {
  /** `Bun.serve` development mode: `false` in the compiled binary, HMR in dev. */
  development: boolean | { console?: boolean; hmr?: boolean };
  /** The client bundle (`import index from "./src/client/index.html"`). */
  index: HTMLBundle;
  /** TCP port; `0` lets the OS pick (prod), a fixed port survives dev reloads. */
  port: number;
  /** `Bun.file` path to the pre-bundled diff worker (disk in dev, embedded in prod). */
  workerBundle: string;
}

// Best-effort browser open, only for interactive runs — piped/headless
// callers get just the printed URL.
const openBrowser = Effect.fn("openBrowser")(
  (url: string) => Effect.tryPromise(() => open(url)),
  // No opener available — the URL is printed above.
  (effect) => Effect.ignore(effect)
);

/**
 * Boot the fullstack server: Bun's HTML-bundle route serves the client for
 * every non-API path (the client router owns the paths), the pre-bundled diff
 * worker is served at `/diff-worker.js`, and the Effect handler owns `/api/*`
 * (and stays wired as the `fetch` fallback for anything the routes miss).
 */
export function serve(entry: EntryOptions, target: string) {
  return Effect.gen(function* serveApp() {
    // Fail fast (and get the log line) before binding the port; requests still
    // re-resolve the diff live from git on every load.
    const change = yield* resolveChange(target);

    // Built once; `Bun.serve` calls `fetch(request, server)`, but the Effect
    // handler reads only the request, so wrap it to drop Bun's second argument.
    const { handler } = webHandler({ cwd: target });

    const server = yield* Effect.sync(() =>
      Bun.serve({
        development: entry.development,
        fetch: (request) => handler(request),
        // Loopback only, IPv4: `127.0.0.1` (not `localhost`) so the printed URL
        // is reachable on hosts where `localhost` resolves to IPv6-only.
        // hostname: "127.0.0.1",
        // Never drop the long-lived SSE connection (`/api/events`) for being idle.
        idleTimeout: 0,
        port: entry.port,
        routes: {
          // SPA fallback: the client router owns the paths (/diff,
          // /walkthrough, /product), so any request the more specific routes
          // below don't win serves the client and lets it route — Bun matches
          // by specificity (exact > wildcard > catch-all), not key order.
          "/*": entry.index,
          "/api/*": (request) => handler(request),
          // The pre-bundled diff worker (scripts/build-worker.ts); the client's
          // `workerFactory` in code-view.ts loads it from this exact path.
          "/diff-worker.js": () =>
            new Response(Bun.file(entry.workerBundle), {
              headers: { "content-type": "text/javascript; charset=utf-8" },
            }),
        },
      })
    );
    const url = server.url.href;

    // Record the live URL so `docent status` (and `/docent`) can detect and
    // reuse this server instead of starting a second one; cleared on shutdown.
    // Best-effort — a serve that cannot write its address still serves.
    yield* writeServeAddress(change.root, url).pipe(Effect.ignore);

    yield* Console.log(
      `Docent: ${change.branch} → ${change.defaultBranch} @ ${change.root}`
    );
    yield* Console.log(`Listening on ${url}`);

    if (process.stdout.isTTY && process.env.NODE_ENV === "production") {
      yield* openBrowser(url);
    }

    // Serve until interrupted (Ctrl+C); Bun keeps the server alive meanwhile.
    // `ensuring` runs on interruption too, so the address file is cleared when
    // the process is stopped.
    return yield* Effect.never.pipe(
      Effect.ensuring(removeServeAddress(change.root).pipe(Effect.ignore))
    );
  }).pipe(Effect.provide(BunServices.layer));
}
