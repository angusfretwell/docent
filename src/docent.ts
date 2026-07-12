#!/usr/bin/env bun

import workerBundle from "../dist/worker/diff-worker.js" with { type: "file" };
import { runMain } from "./cli/main.js";
import index from "./client/index.html";

const port = Number(process.env.PORT) || 0;
const isDevelopment = process.env.NODE_ENV !== "production";

runMain({
  development: isDevelopment ? { console: true, hmr: true } : false,
  index,
  port,
  workerBundle,
});
