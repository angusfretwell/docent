# Findings

Record-only output artifact for the `src/client` improvement run (see `PLAN.md`). Each package agent appends under its own `## <package-id>` heading: one bullet per finding, with `file:line`, a short description, and why it was out of scope. **Do not fix recorded items.**

## P0-foundation

- `components/diff/code-view.tsx:125` (deps array) — the reveal `useEffect` is intentionally keyed to `target` only but reads `isCollapsed`, tripping `react-hooks/exhaustive-deps`. This was **pre-existing red on the baseline** (`bun run check` fails on the base commit) and blocks the per-package preflight gate, so it was suppressed with an `oxlint-disable-next-line` to unblock all packages. Whether `isCollapsed` should be a dependency (it is derived from `collapsedOverrides`, so adding it would re-run the reveal on every collapse toggle) is a behavior question for P1-codeview, which owns this file after the 0.4 move — not fixed here.

## Seed (record-only)

- Migrate the server to Effect `HttpApi` and derive the typed client via `HttpApiClient` — would replace the hand-written `api/` SDK wholesale.
- Mixed `useQuery`/`useSuspenseQuery` against the same queryOptions across consumers.
- `composer.tsx` `autoFocus` fires on every mount, including nested reply/resolve composers — confirm intended focus policy (V4).
- No `color-scheme` CSS / `theme-color` meta despite dark mode (V8).
- `use-key-pressed.ts`: held-state can stick if the window blurs mid-hold (no `blur`/`visibilitychange` reset).
- Three divergent scrollbar treatments (diffs.css `scrollbar-color`, file-tree `--trees-scrollbar-thumb`, Base UI `scroll-area` overlay) — no shared treatment.
- Toast keyframes in the protected theme block are duplicated odd/even byte-for-byte (and may be fully orphaned after `toast.tsx` deletion).
- Repeated focus-ring utility strings across vendored `ui/` components — candidate `@utility focus-ring`, but vendored, so record-only.
- `--panel: #f8f8f8` in the protected `:root` block is referenced nowhere.
- radashi barrel imports (`diff/tree.tsx:4`, `lib/walkthrough.ts:27`) — fine (tree-shakeable), noted per R6.
- `drift.ts` blob fetches bypass TanStack Query (bespoke dedup in `lib/blobs.ts`, no AbortSignal from drift) — unifying onto `queryClient.fetchQuery` is a behavior-adjacent change; deliberate design per file header.
- SSE stream error handling beyond browser auto-reconnect (user-visible "connection lost" affordance) — product decision.
