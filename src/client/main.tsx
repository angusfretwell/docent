import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Providers } from "./components/providers";
import { Spinner } from "./components/ui/spinner";
import { routeTree } from "./routeTree.gen";

const router = createRouter({
  defaultPendingComponent: () => (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-4" />
    </div>
  ),
  defaultPreload: "intent",
  routeTree,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.querySelector("#root");

if (rootElement === null) {
  throw new Error("missing #root element");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>
);
