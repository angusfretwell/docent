/**
 * The code-based route tree: one path per view mode (walkthroughs.md §1) under
 * the `App` shell, with the URL-state schema from `url/params.ts` attached as
 * each route's `validateSearch`. Code-based (not file-based) routing is
 * deliberate — Bun's fullstack bundler has no TanStack Router plugin, and three
 * leaf routes don't justify a codegen watcher.
 */

import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";

import { App, DiffRoute, ProductRoute, WalkthroughRoute } from "./app";
import {
  DIFF_SEARCH_DEFAULTS,
  ROOT_SEARCH_DEFAULTS,
  validateDiffSearch,
  validateRootSearch,
} from "./url/params";

const rootRoute = createRootRoute({
  component: App,
  search: { middlewares: [stripSearchParams(ROOT_SEARCH_DEFAULTS)] },
  validateSearch: validateRootSearch,
});

function redirectToDiff(): never {
  // oxlint-disable-next-line only-throw-error -- thrown redirects are TanStack Router's documented control flow
  throw redirect({ to: "/diff" });
}

const indexRoute = createRoute({
  beforeLoad: redirectToDiff,
  getParentRoute: () => rootRoute,
  path: "/",
});

const diffRoute = createRoute({
  component: DiffRoute,
  getParentRoute: () => rootRoute,
  path: "/diff",
  search: { middlewares: [stripSearchParams(DIFF_SEARCH_DEFAULTS)] },
  validateSearch: validateDiffSearch,
});

const walkthroughRoute = createRoute({
  component: WalkthroughRoute,
  getParentRoute: () => rootRoute,
  path: "/walkthrough",
});

const productRoute = createRoute({
  component: ProductRoute,
  getParentRoute: () => rootRoute,
  path: "/product",
});

// Unknown paths land on the default view instead of a dead-end Not Found —
// the tab strip already reads any unmatched path as Diff, so make it true.
const catchAllRoute = createRoute({
  beforeLoad: redirectToDiff,
  getParentRoute: () => rootRoute,
  path: "$",
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  diffRoute,
  walkthroughRoute,
  productRoute,
  catchAllRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
