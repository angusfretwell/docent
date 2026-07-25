---
status: accepted
---

# The marketing site is a second browser surface at `src/site`, built to static output

The site that ships to `docent.website` lives in-repo as `src/site` — a sixth directory alongside `cli`, `api`, `core`, `shared`, and `client` — and builds to `dist/site` as plain static files with no server of its own. It sits at the same level as `client` in the layering of [0002](0002-src-layering.md): browser-only code that may import `client` and `shared`, never the Bun-side layers.

## Context

[#113](https://github.com/angusfretwell/docent/issues/113) puts two things on that domain: a landing page, and a `/demo` route that is _the real review client_ replaying a captured snapshot with no backend. The demo only works if the site can import the client's code, and the landing page is only worth maintaining if it inherits the product's design tokens rather than growing a parallel design system.

The binary's serving shape ([0001](0001-serve-via-bun-fullstack.md)) is the wrong host for it: that server exists to serve one local repo's review over `/api/*`, and the site has no API at all. What the site needs is the other half of the same toolchain — Bun's bundler with `bun-plugin-tailwind` — pointed at an HTML entry point and emitting files a static host can publish as-is.

## Decision

- **`src/site` is a peer of `src/client`, not a child of it.** Both are browser surfaces; they differ in what they render, not in what they may reach for. The import edge is `site → client → shared`, enforced by the same `no-restricted-imports` override pattern as the other layers: `site` may not import `cli`, `api`, or `core`, because those are Bun-side.
- **Design tokens are a shared stylesheet, not a copy.** The token layer of the client's `index.css` — fonts, the `dark` variant, `@theme inline`, the `:root`/`.dark` custom properties, and the base layer — moved to `src/client/styles/theme.css`, which both entry stylesheets import. A token added there themes the product and the site at once; there is no second palette to keep in sync.
- **Dev is Bun's HTML dev server, verbatim.** `bun run dev:site` runs `bun src/site/index.html`, which bundles and hot-reloads on edit; the bunfig `[serve.static]` plugin registration is what compiles Tailwind there.
- **The build goes through `Bun.build`, not the CLI.** Same reason as `build-docent.ts`: the stylesheet needs `bun-plugin-tailwind` and the `bun build` CLI takes no plugins. `scripts/build-site.ts` emits `dist/site`, and `bun run build` runs it alongside the binary so preflight covers it.

## Considered options

- **A separate repo or workspace package for the site** — rejected for the same reason [0002](0002-src-layering.md) rejected per-layer packages: nothing here is published independently, and the demo's whole premise is importing the client directly, which a package boundary would only tax.
- **Serve the site from the existing `Bun.serve` boot** — rejected: that server is the local review tool, keyed to one repo's `.docent/`. The site is static and hosted; folding it in would put a marketing route inside the binary.
- **Copy the tokens into a site-local stylesheet** — rejected: two palettes drift, and the demo would then render the product in the wrong one.

## Consequences

- The site inherits theming for free, including dark mode: `src/site/main.tsx` wraps the page in the client's `ThemeProvider`, which is what puts the `light`/`dark` class on the root. It is the same component, not the same state — theme choice persists per origin, so the site remembers its own.
- Anyone editing `src/client/styles/theme.css` is editing both surfaces.
- `dist/site` is the deploy artifact — a static publish, with no build step running on the host.
