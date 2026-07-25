import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./app";

const rootElement = document.querySelector("#root");

if (rootElement === null) {
  throw new Error("missing #root element");
}

const root = createRoot(rootElement);

root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
