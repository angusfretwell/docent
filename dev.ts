#!/usr/bin/env bun

/**
 * The `docent` dev entry: one `bun --watch dev.ts` process serving the client
 * (HMR + browser-console forwarding via `development`) and the Effect `/api/*`
 * routes on one fixed port, against the current working directory. Run via
 * `bun run dev`, which pre-bundles the worker first.
 *
 * `bun --watch` restarts the process on server-code edits; `development.hmr`
 * hot-reloads client edits without a restart. The port is fixed (not the prod
 * ephemeral `0`) so the browser tab survives a server restart. Excluded from
 * `tsc` — the same bundler-magic imports as `bin.ts`; the typed logic is in
 * main.ts.
 */

import workerBundle from "./dist/worker/diff-worker.js" with { type: "file" };
import index from "./src/client/index.html";
import { runMain } from "./src/server/main";

runMain({
  development: { console: true, hmr: true },
  index,
  port: Number(process.env.PORT) || 4801,
  workerBundle,
});
