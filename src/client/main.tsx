import { NuqsAdapter } from "nuqs/adapters/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./components/app";
import { ThemeProvider } from "./components/theme-provider";

const container = document.querySelector("#root");

if (container === null) {
  throw new Error("missing #root element");
}

const root = (import.meta.hot.data.root ??= createRoot(container));

root.render(
  <StrictMode>
    <NuqsAdapter defaultOptions={{ history: "push" }}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </NuqsAdapter>
  </StrictMode>
);
