/**
 * The `docent serve` app shell: a Bun-native local server that serves the built
 * browser UI, the live branch diff (`GET /api/diff`), the active Dossier
 * snapshot (`GET /api/dossier`), and the SSE live-reload stream
 * (`GET /api/events`) fed by a `.docent/` watch. Exposed as an Effect `Layer`;
 * runtime boundaries (bin.ts, tests) build it and keep it alive for the
 * server's lifetime.
 */

import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer, Stream } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/unstable/http";
import { readDossierSnapshot } from "./dossier.ts";
import { resolveChange, resolveRepo } from "./git.ts";
import { DocentWatch, layer as watchLayer } from "./watch.ts";

export interface ServeOptions {
  /** Directory of built client assets (Vite output). */
  clientDir: string;
  /** Directory to resolve the git repo from (any path inside the repo). */
  cwd: string;
}

/** The running server's base URL (with trailing slash), e.g. for printing. */
export const serverUrl: Effect.Effect<string, never, HttpServer.HttpServer> =
  Effect.map(
    Effect.service(HttpServer.HttpServer),
    (server) => new URL(HttpServer.formatAddress(server.address)).href,
  );

const diffRoute = (cwd: string) =>
  HttpRouter.add(
    "GET",
    "/api/diff",
    resolveChange(cwd).pipe(
      Effect.flatMap((change) => HttpServerResponse.json(change)),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 },
          ),
        ),
      ),
    ),
  );

/**
 * `GET /api/dossier` — the JSON snapshot of the active Dossier (the one for the
 * checked-out branch), walked live off `.docent/` on every request (uncached).
 * The Dossier auto-creates on first use; the branch/base come from git.
 */
const dossierRoute = (cwd: string) =>
  HttpRouter.add(
    "GET",
    "/api/dossier",
    resolveRepo(cwd).pipe(
      Effect.flatMap((repo) =>
        readDossierSnapshot({
          root: repo.root,
          branch: repo.branch,
          base: repo.defaultBranch.name,
        }),
      ),
      Effect.flatMap((snapshot) => HttpServerResponse.json(snapshot)),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 },
          ),
        ),
      ),
    ),
  );

// SSE frames: an opening comment on connect, then a coarse change event per push.
const encoder = new TextEncoder();
const sseFrame = (payload: string) => encoder.encode(payload);
const SSE_OPEN = sseFrame(": connected\n\n");
const SSE_CHANGED = sseFrame("event: dossier-changed\ndata: {}\n\n");

/**
 * `GET /api/events` — the one-way SSE live-reload stream. Emits an opening
 * comment, then a `dossier-changed` frame each time the `.docent/` watch fires;
 * the browser re-fetches `GET /api/dossier` on receipt (architecture.md §2).
 */
const eventsRoute = HttpRouter.add(
  "GET",
  "/api/events",
  Effect.map(Effect.service(DocentWatch), (watch) =>
    HttpServerResponse.stream(
      Stream.concat(
        Stream.make(SSE_OPEN),
        Stream.map(Stream.fromPubSub(watch.events), () => SSE_CHANGED),
      ),
      {
        headers: {
          "cache-control": "no-cache",
          connection: "keep-alive",
          "content-type": "text/event-stream",
        },
      },
    ),
  ),
);

/**
 * The full server as a layer: building it binds the port and serves until the
 * layer's scope closes. Exposes `HttpServer` so callers can read `serverUrl`.
 */
export const layer = (options: ServeOptions) => {
  const routes = Layer.mergeAll(
    diffRoute(options.cwd),
    dossierRoute(options.cwd),
    eventsRoute,
    HttpStaticServer.layer({ root: options.clientDir }),
  );
  return HttpRouter.serve(routes, {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    // The SSE route reads the `.docent/` watch; the watch reads git + fs, which
    // BunHttpServer's BunServices supply below.
    Layer.provide(watchLayer(options.cwd)),
    Layer.provideMerge(
      // Port 0: the OS picks an ephemeral port; read it back via `serverUrl`.
      // idleTimeout 0: never drop the long-lived SSE connection for being idle.
      BunHttpServer.layer({ hostname: "localhost", idleTimeout: 0, port: 0 }),
    ),
  );
};
