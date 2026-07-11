import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./components/app";

const root = document.querySelector("#root");
if (root === null) {
  throw new Error("missing #root element");
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
