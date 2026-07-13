import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { queryClient } from "./data/query-client";
import { router } from "./routes";
import { ThemeProvider } from "./theme-provider";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("missing #root element");
}

const root = (import.meta.hot.data.root ??= createRoot(container));

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
