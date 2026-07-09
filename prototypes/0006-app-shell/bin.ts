#!/usr/bin/env bun
// PROTOTYPE — the `review-tool` entry point. Resolves the review root, starts the
// Bun server, and opens the browser. In distribution this file is the bin that
// `bun build --compile` turns into a standalone per-platform executable (#6).

import { resolve } from "node:path";
import { startServer } from "./server.ts";

const root = resolve(process.argv[2] ?? process.cwd());
const { url } = startServer({ root });

console.log(`docent  ·  reviewing ${root}/.review`);
console.log(`         ·  ${url}`);

// Best-effort browser open — noop in headless envs (the URL is printed above).
const opener =
  process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
try {
  Bun.spawn([opener, url], { stdout: "ignore", stderr: "ignore" });
} catch {
  /* headless — ignore */
}
