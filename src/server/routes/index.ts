/**
 * The `docent serve` API surface: the Effect routes behind the local server —
 * the live branch diff (`GET /api/diff`), raw git blobs for context expansion
 * (`GET /api/blob/:sha`), the active Review snapshot (`GET /api/review`), the
 * append-write endpoints (`POST /api/viewed`, `POST /api/findings`), and the
 * SSE live-reload stream (`GET /api/events`) fed by a `.docent/` watch — one
 * file per route, sharing the `apiRoute()` error tail (`./api-route`).
 *
 * The browser UI itself is served by Bun's fullstack bundler at the entry
 * points (`bin.ts`, `dev.ts`), not by these routes: Bun's HTML-bundle route
 * owns `/` and the client assets, while these routes run one level down behind
 * `HttpRouter.toWebHandler` and see only the `/api/*` requests Bun falls
 * through. `webHandler` builds that handler with the watch and Bun services
 * merged in, so the entry points and `index.test.ts` share one wiring.
 */

import { BunServices } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";

import { layer as watchLayer } from "../lib/watch";
import { blobRoute, blobSizeRoute } from "./blob";
import { captureRoute } from "./capture";
import { diffRoute } from "./diff";
import { eventsRoute } from "./events";
import { findingsRoute } from "./findings";
import { healthRoute } from "./health";
import { pendingRoute } from "./pending";
import { reviewRoute } from "./review";
import { viewedRoute } from "./viewed";
import { worktreeRoute } from "./worktree";

export interface ServeOptions {
  /** Directory to resolve the git repo from (any path inside the repo). */
  cwd: string;
}

/**
 * Every `/api/*` route as one layer — the app behind the entry points' web
 * handler and driven directly by the serve tests (`index.test.ts`). The
 * browser UI is not here: Bun's HTML-bundle route serves it at the entry
 * level, and these routes see only the requests Bun falls through to `fetch`.
 */
export function routes(options: ServeOptions) {
  return Layer.mergeAll(
    diffRoute(options.cwd),
    blobSizeRoute(options.cwd),
    blobRoute(options.cwd),
    captureRoute(options.cwd),
    pendingRoute(options.cwd),
    worktreeRoute(options.cwd),
    healthRoute(options.cwd),
    reviewRoute(options.cwd),
    viewedRoute(options.cwd),
    findingsRoute(options.cwd),
    eventsRoute
  );
}

/**
 * Build the `request → Promise<Response>` handler the entry points hand to
 * `Bun.serve`'s `fetch` and the serve tests call directly. Effect lives one
 * level down here (the entry points are plain Bun) because Effect's Bun server
 * swaps handlers via `server.reload`, which wipes Bun's HTML-bundle `routes`
 * table (@see docs/adr/0001-serve-via-bun-fullstack.md).
 *
 * The watch and Bun-services layers are `provideMerge`d, not `provide`d: the
 * route handlers read `FileSystem` / `Path` / the git spawner and the
 * `.docent/` watch per request, so those services must stay in the handler's
 * output context (`toWebHandler` excludes what a plain `provide` hides).
 */
export function webHandler(options: ServeOptions) {
  return HttpRouter.toWebHandler(
    routes(options).pipe(
      Layer.provideMerge(watchLayer(options.cwd)),
      Layer.provideMerge(BunServices.layer)
    ),
    { disableLogger: true }
  );
}
