import { QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./components/app";
import { ThemeProvider } from "./components/theme-provider";
import { queryClient } from "./data/query-client";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("missing #root element");
}

const root = (import.meta.hot.data.root ??= createRoot(container));

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <NuqsAdapter defaultOptions={{ history: "push" }}>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  </StrictMode>
);
