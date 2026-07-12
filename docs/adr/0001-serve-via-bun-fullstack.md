---
status: accepted
---

# Serve the app via Bun's fullstack server, dropping Vite and embed-assets

One plain `Bun.serve` process serves the client and the Effect `/api/*` routes together, on one port, in dev **and** prod — replacing the Vite build + embed-assets pipeline entirely. Prod is `bun build --compile` of the same serving shape, so "works in dev" predicts "works in the compiled binary." This was grilled and ratified over two rounds and verified by a spike (browser HMR and the compiled binary both exercised); the surprising constraints it forced are recorded below so they aren't re-litigated or accidentally reverted.

## Context

The original shape ran **two build pipelines**. Vite built the React client to static assets; a separate `embed-assets` script inlined those assets into a generated manifest (`import … with { type: "text" }`, the `ClientAssets` machinery) so `bun build --compile` could bake them into the single distributable binary. The server and binary were Bun; the client was Vite.

That split hurt:

- **No hot reload of the running app.** Seeing any UI change in the browser meant a full `vite build` + embed-assets + serve round trip. The feedback loop was a build cycle, not seconds.
- **Two pipelines to keep aligned.** Vite's dev output and the embedded-assets prod output were different code paths, so "works in dev" did not reliably predict "works in the binary." Every Vite/React-plugin/babel devDependency was carried only to feed the client half.

Bun's fullstack server can serve an HTML bundle (its scripts and styles bundled on the fly) with HMR in dev, fall through unmatched requests to a `fetch` handler for the API, and `bun build --compile` the identical shape into the binary with the client embedded automatically. That collapses both pipelines into one.

## Decision

- **One `Bun.serve`, one port, dev and prod.** In dev the HTML-bundle route is served with `development: { hmr: true, console: true }` (client HMR plus browser-console forwarding); `bun --watch` restarts the process on server-code edits. Prod passes `development: false` and an OS-picked port. There is no Vite, no dev proxy, no second server.
- **Prod is the same shape compiled.** `bun build --compile` of the entry point embeds the client bundle (via the `index.html` import) into the binary automatically, so distribution stays a single self-contained file with nothing read off disk.

### Forced findings

The spike surfaced four constraints that are non-obvious from the code and drove the shape:

1. **Entry points are plain Bun; Effect lives one level down.** The entry points (`bin.ts` for `bun build --compile`, `dev.ts` for `bun --watch`) call `Bun.serve` directly and own the HTML-bundle route (`routes: { "/": index }`). Effect's `@effect/platform-bun` server layer swaps its handler by calling `server.reload({ fetch })`, which **wipes Bun's `routes` table** — so the HTML-bundle route cannot be owned by the Effect server layer or it would be erased on reload. The Effect `/api/*` routes therefore run one level down as the plain server's `fetch` fallback, behind `HttpRouter.toWebHandler`, seeing only the requests Bun does not match. This inversion (plain Bun on top, Effect underneath) is deliberate, not an oversight.

2. **Route layers are `Layer.provideMerge`d, not `provide`d.** The route handlers read `FileSystem` / `Path` / the git spawner and the `.docent/` watch **per request**, so those services must remain in the web handler's output context. `HttpRouter.toWebHandler` builds the request handler from the layer's _output_, excluding request-time requirements a plain `Layer.provide` would satisfy-and-remove. `provideMerge` satisfies the routes' requirements **and keeps the services in the output**, so the per-request handlers can still reach them.

3. **The diff worker is pre-bundled (the one wart).** Bun's bundler cannot yet bundle a browser Web Worker referenced via `new Worker(new URL(…, import.meta.url))` ([oven-sh/bun#29478](https://github.com/oven-sh/bun/issues/29478)). The `@pierre/diffs` Shiki-tokenizing worker is therefore pre-bundled standalone (`scripts/bundle-worker.ts` → `dist/worker/diff-worker.js`), served at a fixed `/diff-worker.js` route (off disk in dev via `Bun.file`, embedded in the compiled binary via `with { type: "file" }`), and the client's `workerFactory` points a plain `new Worker("/diff-worker.js")` at that route — identical in dev and prod. The bundle step is folded into the build/serve/compile/dev flows and re-runs only when `@pierre/diffs` bumps.

4. **React Compiler is dropped.** It came with the Vite React plugin; leaving Vite drops it (and the babel toolchain) with it. Accepted: components that relied on its auto-memoization fall back to plain re-render, and any hot path can reach for manual `useMemo`/`useCallback` if a measurement ever demands it.

## Consequences

- **One pipeline, dev/prod parity.** The serving shape a developer exercises with HMR is byte-for-byte the shape `bun build --compile` ships, so a dev-verified change is a binary-verified change.
- **Fewer dependencies.** Vite, its React plugin, babel, the `embed-assets` script, the generated asset manifest, and the `ClientAssets` machinery are all deleted.
- **The worker wart persists** until [oven-sh/bun#29478](https://github.com/oven-sh/bun/issues/29478) lands: the diff worker must be pre-bundled and served at a fixed route rather than imported inline.
- **No React Compiler.** Memoization is manual where it matters.
- **Serving lives in an inverted stack.** Anyone touching the entry points or the web handler must keep the plain-Bun-on-top / Effect-underneath split intact and use `provideMerge` for request-time services — see finding 1 and 2 above.

Serving details are specified in [architecture.md](../spec/architecture.md) §§1, 4, 5; the web handler and its wiring live in `src/server/routes/` (`index.ts`) and the entry points in `bin.ts` / `dev.ts`.
