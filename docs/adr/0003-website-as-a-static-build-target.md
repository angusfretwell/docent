---
status: accepted
---

# The marketing website is a second browser surface at `src/website`, built to static output

The website that ships to `docent.website` lives in-repo as `src/website` — a sixth directory alongside `cli`, `api`, `core`, `shared`, and `client` — and builds to `dist/website` as plain static files with no server of its own. It sits at the same level as `client` in the layering of [0002](0002-src-layering.md): browser-only code that may import `client` and `shared`, never the Bun-side layers.

## Context

[#113](https://github.com/angusfretwell/docent/issues/113) puts two things on that domain: a landing page, and a `/demo` route that is _the real review client_ replaying a captured snapshot with no backend. The demo only works if the website can import the client's code, and the landing page is only worth maintaining if it inherits the product's design tokens rather than growing a parallel design system.

The binary's serving shape ([0001](0001-serve-via-bun-fullstack.md)) is the wrong host for it: that server exists to serve one local repo's review over `/api/*`, and the website has no API at all. What the website needs is the other half of the same toolchain — Bun's bundler with `bun-plugin-tailwind` — pointed at an HTML entry point and emitting files a static host can publish as-is.

## Decision

- **`src/website` is a peer of `src/client`, not a child of it.** Both are browser surfaces; they differ in what they render, not in what they may reach for. The import edge is `website → client → shared`, enforced by the same `no-restricted-imports` override pattern as the other layers: `website` may not import `cli`, `api`, or `core`, because those are Bun-side.
- **Design tokens are a shared stylesheet, not a copy.** The client's token layer — `@theme inline`, the `:root` custom properties with their `prefers-color-scheme: dark` overrides, and the base layer — lives in `src/client/styles/theme.css`, which both entry stylesheets import alongside `fonts.css`. A token added there themes the product and the website at once; there is no second palette to keep in sync.
- **Dev is Bun's HTML dev server.** `bun run dev:website` serves the HTML entries with hot reload; the bunfig `[serve.static]` plugin registration is what compiles Tailwind there. Once the website grew its second page it stopped being a bare `bun src/website/index.html`: the demo is an SPA, so `scripts/dev-website.ts` routes `/demo/*` to its entry and serves the two files the build copies rather than bundles (the diff worker and the captured snapshot) at the paths the demo fetches them from.
- **The build goes through `Bun.build`, not the CLI.** Same reason as `build-docent.ts`: the stylesheet needs `bun-plugin-tailwind` and the `bun build` CLI takes no plugins. `scripts/build-website.ts` emits `dist/website`, and `bun run build` runs it alongside the binary so preflight covers it.

## Considered options

- **A separate repo or workspace package for the website** — rejected for the same reason [0002](0002-src-layering.md) rejected per-layer packages: nothing here is published independently, and the demo's whole premise is importing the client directly, which a package boundary would only tax.
- **Serve the website from the existing `Bun.serve` boot** — rejected: that server is the local review tool, keyed to one repo's `.docent/`. The website is static and hosted; folding it in would put a marketing route inside the binary.
- **Copy the tokens into a website-local stylesheet** — rejected: two palettes drift, and the demo would then render the product in the wrong one.

## Consequences

- The website inherits theming for free, including dark mode, and carries no runtime to get it: `theme.css` answers `prefers-color-scheme` in CSS, so both surfaces follow the OS with nothing to mount, persist, or resolve before first paint.
- Anyone editing `src/client/styles/theme.css` is editing both surfaces.
- `dist/website` is the deploy artifact — a static publish, with no build step running on the host.
