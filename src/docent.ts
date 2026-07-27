#!/usr/bin/env bun

import recorderBundle from "../dist/recorder/rrweb-recorder.js" with { type: "file" };
import workerBundle from "../dist/worker/diff-worker.js" with { type: "file" };
import { runMain } from "./cli/main";
import index from "./client/index.html";
import { DEFAULT_PORT } from "./serve/port";

const port = Number(process.env.PORT) || DEFAULT_PORT;
const isDevelopment = process.env.NODE_ENV !== "production";

runMain({
  development: isDevelopment ? { console: true, hmr: true } : false,
  index,
  port,
  recorderBundle,
  workerBundle,
});
