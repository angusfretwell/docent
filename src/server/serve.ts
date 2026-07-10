/**
 * The `docent serve` app shell: a Bun-native local server that serves the
 * built browser UI and the live branch diff over `GET /api/diff`, resolved
 * from git on every request. Exposed as an Effect `Layer`; runtime boundaries
 * (bin.ts, tests) build it and keep it alive for the server's lifetime.
 *
 * The UI is served from an in-memory `ClientAssets` map, not an on-disk root,
 * so the identical code path serves the `dist/client/` build in dev and the
 * assets embedded into the compiled binary (docs/spec/architecture.md §5).
 */

import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerResponse,
} from "effect/unstable/http";
import { type ClientAssets, lookupAsset } from "../client/assets.ts";
import { resolveChange } from "./git.ts";

export interface ServeOptions {
  /** Built browser UI, keyed by request path (dev disk or embedded binary). */
  assets: ClientAssets;
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
 * Serve the built UI from the in-memory asset map. A `*` wildcard falls in
 * behind the explicit `/api/*` routes, so it only sees UI requests. Unmapped
 * paths 404 — which also closes off path traversal, since only keys that were
 * put in the map can ever be served.
 */
const assetRoute = (assets: ClientAssets) =>
  HttpRouter.add("GET", "*", (request) =>
    Effect.gen(function* () {
      const pathname = new URL(request.url, "http://localhost").pathname;
      const asset = lookupAsset(assets, pathname);
      if (asset === undefined) {
        return HttpServerResponse.empty({ status: 404 });
      }
      const bytes = yield* Effect.promise(() =>
        Bun.file(asset.filePath).bytes(),
      );
      return HttpServerResponse.uint8Array(bytes, {
        contentType: asset.contentType,
      });
    }),
  );

/**
 * The full server as a layer: building it binds the port and serves until the
 * layer's scope closes. Exposes `HttpServer` so callers can read `serverUrl`.
 */
export const layer = (options: ServeOptions) => {
  const routes = Layer.mergeAll(
    diffRoute(options.cwd),
    assetRoute(options.assets),
  );
  return HttpRouter.serve(routes, {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    Layer.provideMerge(
      // Loopback only, IPv4: `127.0.0.1` (not `localhost`) so the printed URL
      // is reachable on hosts where `localhost` resolves to IPv6-only.
      // Port 0: the OS picks an ephemeral port; read it back via `serverUrl`.
      BunHttpServer.layer({ hostname: "127.0.0.1", port: 0 }),
    ),
  );
};
