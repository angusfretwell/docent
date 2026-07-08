# 0006 — App shell architecture

**Wayfinder ticket:** [App shell architecture (#6)](https://github.com/angusfretwell/docent/issues/6)
**Type:** prototype (HITL) · **Status:** resolved

> Throwaway skeleton. It answers *how `review-tool` boots and how the browser
> reads/writes `.review/` state* — not what the UI looks like. Delete or absorb
> once the shell is built for real.

## Question

How does `npx review-tool` boot and run: the local server, the browser-UI
framework, how the browser app reads/writes review state (over the
filesystem-is-the-interface decision, [#2](https://github.com/angusfretwell/docent/issues/2)),
and packaging/distribution.

## Decision

The app shell is a **Bun-native local server that serves a static browser UI and
bridges it to `.review/` over an HTTP file API + SSE live-reload**, shipped as a
**standalone compiled binary** delivered via **GitHub Releases behind a thin npm
shim**.

| Concern | Decision |
| --- | --- |
| **Runtime & server** | Bun-native — `Bun.serve`, `Bun.Glob`, `Bun.file`, `node:fs` recursive watch. Zero runtime dependencies. |
| **Boot** | `review-tool [dir]` resolves the review root, starts `Bun.serve` on an ephemeral port, prints + opens the browser. `bin.ts` is the compile entry. |
| **UI framework** | **React + Vite** in production (forced by `@pierre/diffs`, the [#4](https://github.com/angusfretwell/docent/issues/4) renderer). The prototype uses hand-rolled DOM so it stays about the bridge, not the UI. The client is **prebuilt static assets embedded into the binary** (`import … with { type: "text" }`). |
| **Browser ↔ `.review/` (read)** | `GET /api/review` walks `.review/reviews/*/` and returns a plain-JSON snapshot (review + changes + comments). |
| **Browser ↔ `.review/` (write)** | `POST /api/reviews/:key/comments` drops a new **append-only** `comments/cmt_*.md` — the same file shape an agent writes directly ([#2](https://github.com/angusfretwell/docent/issues/2)). No locks, no read-modify-write. |
| **Live-reload** | `node:fs` recursive watch on `.review/`, debounced, broadcast over **SSE** (`GET /api/events` → `review-changed`); the client re-fetches. This is [#2](https://github.com/angusfretwell/docent/issues/2)'s "server watches `.review/`, UI re-renders live." SSE over WebSocket because the channel is one-way (server → client). |
| **Context-expansion seam** | `GET /api/blob?sha=` is stubbed. Real impl shells `git cat-file` — the [#4](https://github.com/angusfretwell/docent/issues/4) finding that patch-only diffs are `isPartial`, so "expand unchanged context" needs full blobs (fetchable from the [#3](https://github.com/angusfretwell/docent/issues/3) Change's `baseSha`/`headSha`). |
| **Distribution** | `bun build --compile` → a standalone per-platform executable; the user needs **no runtime installed** (chosen over Node+npx and a Bun+npx shim). |
| **Delivery** | Per-platform binaries published as **GitHub Release assets**; `npx review-tool` installs a tiny (~KB) npm shim that downloads + execs the matching binary on first run. Keeps the npm tarball small; one network fetch on first use. |

### Refinement to the destination

The map's destination says `npx review-tool`. The chosen model keeps that entry
point (the npm shim), but the thing it runs is a **compiled Bun binary**, not a
Node script — so "`npx review-tool`" resolves to "download-and-exec a standalone
executable," not "run source on the user's Node."

## What the skeleton proved (all verified end-to-end)

- **Boots** with one command and serves the embedded UI.
- **Read** — `/api/review` renders the sample `.review/` tree.
- **Live-reload** — an *external* agent writing a comment file directly into
  `.review/` tripped the watcher → SSE push → UI re-fetch. This is the
  agent-review loop, not just the UI's own writes.
- **Write** — the UI `POST` created an append-only comment file.
- **Compiles** — `bun build --compile` produced a standalone binary (~95 MB;
  the Bun runtime is embedded) that serves the embedded client + full API with
  no runtime on `PATH`. The 95 MB size is what drove the delivery decision.

## Open / deferred (not blocking the shell)

- **Live-reload granularity** — the server sends a coarse `review-changed` and
  the client re-fetches everything. Fine at this scale; finer per-file events
  are a later optimisation.
- **Multi-review UI** — `/api/review` returns *all* reviews under `.review/`;
  how the UI picks/switches the active Review is UX, owned by the diff-viewer /
  walkthrough tickets.
- **Comment envelope** stays thin here — [#7](https://github.com/angusfretwell/docent/issues/7) owns the authoritative schema, anchor semantics, and drift.

## Run it

```sh
cd prototypes/0006-app-shell
bun run dev              # serves ./sample/.review, opens the browser
# or the distribution path:
bun run compile && ./review-tool sample
```
