#!/usr/bin/env bun

/**
 * The `bun run dev:website` runner: serves the marketing website's two pages with
 * hot reload, routed the way the deploy routes them — the landing page at `/`,
 * the demo's SPA under `/demo`.
 *
 * The demo also needs the two files the website build copies rather than bundles:
 * the pre-bundled diff worker, and the captured snapshot it replays. Both are
 * served off `dist/`, so previewing the demo means having run
 * `bun run build:worker` and `bun run build:snapshot` — without the snapshot
 * the demo boots to a blank page and says what to record in the console.
 *
 * @see scripts/assemble-vercel-output.ts for the routing this mirrors.
 */

import path from "node:path";

import demo from "../src/website/demo/index.html";
import landing from "../src/website/index.html";

const root = path.join(import.meta.dir, "..");
const port = Number(process.env.PORT ?? 8038);

function fileRoute(file: string, contentType: string) {
  return async () => {
    const source = Bun.file(file);

    if (!(await source.exists())) {
      return new Response(`missing ${path.relative(root, file)}`, {
        status: 404,
      });
    }

    return new Response(source, { headers: { "content-type": contentType } });
  };
}

const server = Bun.serve({
  development: { hmr: true },
  port,
  routes: {
    "/": landing,
    "/demo": demo,
    "/demo/*": demo,
    "/demo/demo-snapshot.json": fileRoute(
      path.join(root, "dist", "demo-snapshot.json"),
      "application/json"
    ),
    "/demo/diff-worker.js": fileRoute(
      path.join(root, "dist", "worker", "diff-worker.js"),
      "text/javascript; charset=utf-8"
    ),
  },
});

console.log(`Serving the website on ${server.url}`);
