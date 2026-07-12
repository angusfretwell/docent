---
status: accepted
---

# Layer `src/` as cli → api → core → shared, split by runtime capability

`src/` is restructured from a `server/`-vs-`client/` split into capability layers: `src/cli` (argv parsing and subcommand dispatch), `src/api` (the HTTP surface: routes, the `.docent/` watch, the serve boot), `src/core` (the operations both surfaces delegate to: git resolution, `.docent/` store I/O, the record-write services), `src/shared` (isomorphic schemas and pure logic), and `src/client` (the browser UI). `src/docent.ts` stays the single bundling shim — the `bun build --compile` target and the `bun --watch` dev entry alike (outside tsconfig, since it imports the HTML bundle).

## Context

An investigation confirmed the HTTP API and the CLI do not duplicate operations: both are thin wrappers over one services layer (`POST /api/findings` and `docent finding …` decode the same `FindingWrite` schema and call the same `writeFindingRecord`), and the CLI never talks to the server — it drops the same `.docent/` records, which a running `docent serve` picks up via fs watch → SSE. The old `src/server` name lumped those two surfaces and their shared substance into one directory, hiding the boundary that actually matters and leaving no home for a rule like "the client must never pull in Bun-side code."

## Decision

- **core vs. shared is a runtime-capability split, not a topical one.** `shared` may end up in the client bundle and must work in a browser; `core` is Bun-side — it spawns git and touches the filesystem. A module moves from core to shared only by shedding those capabilities.
- **Import edges point one way:** `docent.ts → cli → api → core → shared`, and `client → shared` only. `client` and `shared` never import `core`. Enforced by tsconfig aliases (`@cli` / `@api` / `@core` / `@client` / `@shared`, replacing `@server`) plus `no-restricted-imports` overrides in `oxlint.config.ts`. Tests are exempt from the lint edge: an integration test may boot a higher layer to exercise its subject (e.g. core's `serve-address` test boots the real web handler).
- **Surfaces stay thin.** cli and api validate at the boundary with schemas defined in `shared` and delegate to core. The one-write-implementation invariant for finding records holds: both surfaces call the same core write. Operation logic found living in a surface moves down — e.g. `buildAnchor` (resolving a code anchor's content-addressed `blobSha` from git) moved from the finding CLI to `core/git/anchor.ts`.
- **The serve boot lives in api, not cli.** Its substance is HTTP wiring (`Bun.serve`, the HTML-bundle route, the serve-address record); placing it in `api/serve.ts` keeps cli free of `Bun.serve` knowledge. cli retains only dispatch: `runMain` runs `serve` for the default subcommand and the argv runners for the rest.

## Considered options

- **Keep `src/server` and sort internally** — rejected: the cli/api boundary stays invisible, and nothing stops a future client → server import.
- **Put the serve boot in cli (it's "the serve subcommand")** — rejected: the code is HTTP wiring, not argv handling; cli would import `Bun.serve`.
- **Workspaces / packages per layer** — rejected earlier for the same reasons as the `server/client/shared` split ([architecture.md](../spec/architecture.md) §"Source layout"): a single-binary v1 never needs independent publishing.
