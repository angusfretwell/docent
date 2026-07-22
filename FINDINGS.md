# Findings

Record-only output artifact for the `src/client` improvement run (see `PLAN.md`). Each package agent appends under its own `## <package-id>` heading: one bullet per finding, with `file:line`, a short description, and why it was out of scope. **Do not fix recorded items.**

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
