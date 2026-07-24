import { BunServices } from "@effect/platform-bun";
import { Layer } from "effect";
import { HttpRouter } from "effect/unstable/http";

import { layer as watchLayer } from "../serve/watch";
import { blobRoute } from "./blob";
import { captureRoute } from "./capture";
import { diffRoute } from "./diff";
import { eventsRoute } from "./events";
import { findingsRoute } from "./findings";
import { healthRoute } from "./health";
import { pendingRoute } from "./pending";
import { reviewRoute } from "./review";
import { viewedRoute } from "./viewed";

export interface ServeOptions {
  /** Any path inside the repo; the git root is resolved from it. */
  cwd: string;
}

export function routes(options: ServeOptions) {
  return Layer.mergeAll(
    diffRoute(options.cwd),
    blobRoute(options.cwd),
    captureRoute(options.cwd),
    pendingRoute(options.cwd),
    healthRoute(options.cwd),
    reviewRoute(options.cwd),
    viewedRoute(options.cwd),
    findingsRoute(options.cwd),
    eventsRoute
  );
}

/**
 * Effect lives one level down from Bun's HTML-bundle routes because Effect's Bun
 * server swaps handlers via `server.reload`, which wipes Bun's `routes` table
 * (@see docs/adr/0001-serve-via-bun-fullstack.md).
 *
 * The watch and Bun-services layers are `provideMerge`d, not `provide`d: the
 * handlers read those services per request, so they must stay in the handler's
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
