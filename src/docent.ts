#!/usr/bin/env bun

import workerBundle from "../dist/worker/diff-worker.js" with { type: "file" };
import index from "./client/index.html";
import { runMain } from "./server/main.js";

const port = Number(process.env.PORT) || 0;
const isDevelopment = process.env.NODE_ENV !== "production";

runMain({
  development: isDevelopment ? { console: true, hmr: true } : false,
  index,
  port,
  workerBundle,
});
