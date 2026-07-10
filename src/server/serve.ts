/**
 * The `docent serve` app shell: a Bun-native local server that serves the
 * built browser UI and the live branch diff over `GET /api/diff`, resolved
 * from git on every request. Exposed as an Effect `Layer`; runtime boundaries
 * (bin.ts, tests) build it and keep it alive for the server's lifetime.
 */

import { BunHttpServer } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import {
  HttpRouter,
  HttpServer,
  HttpServerResponse,
  HttpStaticServer,
} from "effect/unstable/http";
import { resolveRepoDiff } from "./git.ts";

export interface ServeOptions {
  /** Directory of built client assets (Vite output). */
  clientDir: string;
  /** Directory to resolve the git repo from (any path inside the repo). */
  cwd: string;
  /** 0 (default) picks an ephemeral port. */
  port?: number;
}

/** The running server's base URL (with trailing slash), e.g. for printing. */
export const serverUrl: Effect.Effect<string, never, HttpServer.HttpServer> =
  Effect.map(
    Effect.service(HttpServer.HttpServer),
    (server) => new URL(HttpServer.formatAddress(server.address)).href
  );

const diffRoute = (cwd: string) =>
  HttpRouter.add(
    "GET",
    "/api/diff",
    resolveRepoDiff(cwd).pipe(
      Effect.flatMap((diff) => HttpServerResponse.json(diff)),
      Effect.catch((error) =>
        Effect.succeed(
          HttpServerResponse.jsonUnsafe(
            { error: error.message },
            { status: 500 }
          )
        )
      )
    )
  );

/**
 * The full server as a layer: building it binds the port and serves until the
 * layer's scope closes. Exposes `HttpServer` so callers can read `serverUrl`.
 */
export const layer = (options: ServeOptions) => {
  const routes = Layer.mergeAll(
    diffRoute(options.cwd),
    HttpStaticServer.layer({ root: options.clientDir })
  );
  return HttpRouter.serve(routes, {
    disableListenLog: true,
    disableLogger: true,
  }).pipe(
    Layer.provideMerge(
      BunHttpServer.layer({ hostname: "localhost", port: options.port ?? 0 })
    )
  );
};
