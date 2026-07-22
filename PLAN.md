# Client Improvement Plan

Improvement pass over `src/client`, optimizing for readability/navigability, library best practices, and consistency. Produced from a six-stream audit (skill distillation, structure, API surface, composition, library leverage, CSS) on 2026-07-22.

## Ground rules

- **Baseline:** the `client-refactor` worktree, branched from `main` (post `new-frontend` merge). `client-refactor` is the integration branch.
- **Behavior-preserving** overall. Minor a11y/focus/markup fixes (aria-labels, focus states, placeholder text) are allowed inline. Anything user-visible beyond that, and any bug discovered, is **recorded in `FINDINGS.md`, not fixed**.
- **Vendored code — do not refactor:** `src/client/components/ui/**` (deleting unused primitives IS allowed), `src/client/styles/typeset.css`, the theme-variable blocks (`@theme`, `:root`, `.dark`) in `styles/index.css`, `routeTree.gen.ts` (generated).
- **No new dependencies** beyond the pre-approved `ky`, `plur`, `pretty-ms`. Removing newly-unused deps is encouraged.
- **Per-package bar:** `bun run preflight` green, then commit (Conventional Commits). No new tests for pure refactors; extracted helpers with real logic get unit tests; existing tests move with their code.
- **Execution:** Phase 0 runs serially inside `client-refactor`. Each Phase 1 package runs in its own worktree branched from `client-refactor` (`wt` / worktrunk), merged back on green preflight. Package file sets are disjoint by construction — an agent must not edit files outside its package's set (record cross-package observations in `FINDINGS.md` instead). Phase 2 runs in `client-refactor` after all merges.

## Findings protocol

`FINDINGS.md` at the repo root is the run's output artifact. Each agent appends under its own `## <package-id>` heading: one bullet per finding, with `file:line`, a short description, and why it was out of scope. Do not fix recorded items. The file is seeded with the audit's record-only items (bottom of this plan).

---

## Conventions

Distilled from `/vercel-react-best-practices`, `/vercel-composition-patterns`, and `/web-design-guidelines`, filtered to what applies to this codebase (React 19 SPA on Bun — all Next.js/RSC/SSR/hydration rules discarded). Every Phase 1 package applies these to its files.

### Composition (vercel-composition-patterns)

- C1. No boolean-prop proliferation — model variants by composing subcomponents or separate variant components, not mode flags.
- C2. Compound components + context over monolith props; compose Base UI overlay triggers via `render={...}` (existing pattern — keep to it).
- C3. Prefer `children` over `renderX` props.
- C4. Lift state shared by siblings into a provider, not prop-drilling.
- C5. React 19: no `forwardRef` — `ref` is a plain prop (codebase is clean; keep it so).
- C6. React 19: `use(Context)`, not `useContext(Context)`.

### React (vercel-react-best-practices, client subset)

- R1. Derive state during render; never sync derived state via `useEffect`.
- R2. No component definitions inside components.
- R3. Use ternaries, not `&&`, when the left operand can be `0`.
- R4. Virtualize lists that can exceed ~50 rows (file-tree already is).
- R5. Global event listeners live in shared hooks, passive and deduped.
- R6. Deep imports over barrels where practical.
- R7. `tabular-nums` for numeric columns.

### UI / a11y (web-design-guidelines)

- U1. Icon-only buttons require `aria-label` — a tooltip is not an accessible name.
- U2. Custom interactives (`role="button"` on a div) need `tabIndex`, `onKeyDown`, and a label (model: `capture.tsx` region overlay).
- U3. `<button>` for actions, `Link` for navigation (via `Button render={<Link/>}`).
- U4. Every form control gets a label or `aria-label`; a placeholder is not a label.
- U5. Placeholders end with `…`.
- U6. Honor `prefers-reduced-motion` on transitions/animations.
- U7. Never remove focus outlines without a `focus-visible` replacement; never `transition-all`.
- U8. Truncating flex children need `min-w-0`; headings use `text-wrap` balance/pretty.
- U9. Markdown-rendered external links get `rel="noreferrer"` (+ agreed `target` policy).

### House rules (repo standards, applied during every touch)

- H1. No single-letter variables; event params named `event`.
- H2. Blank lines between logical paragraphs; early returns over nesting.
- H3. Imports two+ levels up use `@client/...`; normalize mixed alias/relative styles within a file.
- H4. Comments only for the non-obvious "why"; JSDoc format; `@see` for docs/ADRs.
- H5. Reach for radashi/date-fns/plur/pretty-ms before hand-rolling; inline prop types unless reused.
- H6. All HTTP goes through `src/client/api/` — no `fetch`/`ky` anywhere else (`EventSource` only via the api layer's subscribe helper).

---

## Phase 0 — foundation (serial, one agent, in `client-refactor`)

Commit after each numbered step; preflight must be green at each commit.

### 0.1 Deletions

- Delete unused vendored primitives from `components/ui/` (zero importers, verified): `accordion, alert, alert-dialog, avatar, checkbox-group, combobox, command, context-menu, dialog, field, fieldset, form, frame, meter, number-field, pagination, preview-card, progress, radio-group, select, sheet, skeleton, switch, table, toast, toggle-group, toolbar` — then `autocomplete` and `label` (only importers were `command`/`number-field`).
- Delete `src/client/router.tsx` (never imported; `main.tsx` builds the router and carries the module augmentation).
- Delete dead exports: `useIsMobile` (`hooks/use-media-query.ts`), `findingsExpandedAtom` (`lib/preferences.ts`).
- CSS: delete `.root` rule (`index.css:300-302` — mount node is `#root`, selector can never match), the empty commented scrollbar blocks (`diffs.css:39-61`), the three dead `@fontsource/geist-mono` imports (`diffs.css:9-11` — font referenced nowhere; the dep isn't even declared), and the duplicate `tailwindcss`/fontsource imports in `diffs.css` already imported by `index.css`.
- Remove deps with zero imports: `overtype`, `tw-animate-css`, `type-fest`, `@tanstack/zod-adapter`.
- Remove toast-related keyframes only if `toast.tsx` deletion orphans them **outside** the protected theme block; otherwise record.

### 0.2 API layer

Add `ky`. Create `src/client/api/` — the only place HTTP appears (H6):

- `api/client.ts`: single `ky.create` instance (`/api` base), with hooks providing the one shared error shape (decode the server's `{error}` body when present, else `HTTP <status>`), replacing today's four inconsistent hand-rolled formats.
- Domain modules aggregated into one `api` object (dot-discoverable):
  - `api.diff.get(signal?)` → `Change` (preserve `DiffError` message decoding).
  - `api.pending.get(range, signal?)` → `Pending`.
  - `api.review.get(signal?)` → `ReviewSnapshot`.
  - `api.findings.write(body: FindingWrite)` → `FindingWriteResult` — **decode** with the shared schema instead of the current `as` cast (`use-finding-write.ts:26`).
  - `api.viewed.toggle(body: ViewedRequest)` → `ViewedEvent` (decoded; currently the response is discarded).
  - `api.blob.text(sha, signal?)` → `string` (`.text()`, not JSON). The in-flight dedup Map stays above the transport (in `lib/blobs.ts`).
  - `api.captures.events(walkthroughId, file, signal?)` → `unknown[]` (rrweb arrays — no schema decode; takes ids, builds the path internally, replacing `captureUrl` plumbing).
  - `api.events.subscribe(onReviewChanged)` → unsubscribe fn. `EventSource` wrapper (not ky); add the currently-missing `onerror` handling (log/reconnect is fine — anything beyond that is a finding).
- Migrate all 8 transport sites (`queries/diff.ts`, `queries/pending.ts`, `queries/review.ts`, `lib/captures.ts`, `lib/blobs.ts`, `hooks/use-finding-write.ts`, `hooks/use-viewed.ts`, `hooks/use-review-stream.ts`) onto the SDK. Query/mutation definitions keep their homes until 0.4; only the transport moves.
- `use-review-stream.ts`: import query keys from the query modules instead of the hardcoded `LIVE_KEYS` literals.

### 0.3 Shared presentational extractions

- **`Surface`** (app-owned, e.g. `components/surface.tsx`): carries `card.tsx`'s base surface styles (`bg-card`, border, shadow, the inset `before:` highlight) with a cva `radius: "lg" | "2xl"` variant that sets `rounded-*` and the coupled `before:rounded-[calc(var(--radius-*)-1px)]` together. Migrate the three Card-as-surface sites (`pane.tsx:19`, `walkthrough/section-findings.tsx:46`, `diff/annotation.tsx:18`), then delete `components/ui/card.tsx`.
- **`IconEmpty`** — `{ icon, children, className? }` wrapping the repeated `Empty > EmptyHeader > EmptyMedia[icon] + EmptyDescription` shape. Migrate the five identical sites (`walkthrough/empty.tsx`, `product-walkthrough/empty.tsx`, `findings/panel.tsx`, `diff/code-view.tsx:129`, `code-walkthrough/diff-panel.tsx:139`); leave the richer `error.tsx` on raw parts.
- **`KbdHint`** — `{ shortcut, active, children }` rendering `<Kbd>` while active, else the icon. Migrate the six Alt-hint ternaries (`navigation.tsx:39,47,55`, `diff/view.tsx:152`, `findings/toggle.tsx:36,49`).

### 0.4 Feature-first reorg

Apply the move map below with `git mv` (history-preserving), updating imports and normalizing to H3 as files are touched. Two mechanical splits happen during the move (they gate correct placement); all other splits belong to Phase 1 packages.

Feature homes: `features/diff/`, `features/code-walkthrough/`, `features/product-walkthrough/`, `features/walkthrough/` (shared by both pillars), `features/findings/` (cross-cutting). Shared layer: `components/` (app shell + shared code-view pieces), `components/ui/`, `hooks/`, `lib/`, `queries/` (cross-feature queries), `api/`.

| From | To |
| --- | --- |
| `components/diff/view.tsx`, `diff/tree.tsx`, `diff/filter.tsx` | `features/diff/` (filter.tsx → `change-picker.tsx`; rename in P1-diff) |
| `components/diff/code-view.tsx` | `features/diff/code-view.tsx` |
| `components/file-tree.tsx`, `file-tree-filter.tsx`, `file-tree-search.tsx` | `features/diff/` |
| `lib/filters.ts`, `lib/generated.ts`, `lib/viewed.ts`, `hooks/use-viewed.ts`, `queries/pending.ts` | `features/diff/` |
| `components/code-walkthrough/*` | `features/code-walkthrough/` |
| `components/product-walkthrough/*` | `features/product-walkthrough/` |
| `hooks/use-inner-zoom.ts`, `use-rrweb-replayer.ts`, `use-rrweb-snapshot.ts` | `features/product-walkthrough/` |
| `lib/captures.ts`, `queries/captures.ts` | `features/product-walkthrough/` |
| `lib/walkthrough-pins.ts` (+ test) | `features/product-walkthrough/pins.ts` — export the `Callout` type from `features/walkthrough/` instead (it leaks into shared prose) |
| `components/walkthrough/{layout,prose,empty,staleness,section-findings}.tsx` | `features/walkthrough/` |
| **Split** `components/walkthrough/callouts.tsx` | `features/walkthrough/callout-list.tsx` (`CalloutList`, `PinChip`) + `features/product-walkthrough/pin-hover.tsx` (`PinHoverProvider`, `usePinFocus`, `usePinHovered`, `usePinHover` — only mounted by the product view) |
| `hooks/use-active-target.ts`, `lib/walkthrough.ts`, `lib/walkthrough-target.ts` | `features/walkthrough/` (`walkthrough-target.ts` → `target.ts`) |
| `components/findings/*` | `features/findings/` |
| `components/comment.tsx`, `components/composer.tsx` | `features/findings/` |
| `hooks/use-findings.ts`, `use-finding-write.ts`, `use-finding-compose.ts` | `features/findings/` |
| `lib/finding-filters.ts` | `features/findings/filters.ts` |
| **Extract** `FindingSection` type out of `findings/section-link.tsx` | `features/findings/types.ts` (fixes the hook→component type import in `use-findings.ts:9`) |
| `components/diff/annotation.tsx` | `components/code-view-annotation.tsx` (shared: used by diff + code-walkthrough) |
| `components/code-view.tsx`, `code-view-header-prefix.tsx`, `code-view-header-metadata.tsx` | stay in `components/` (shared; renames in P1-codeview) |
| `lib/section-findings.ts` | `lib/finding-sections.ts` (resolves the name collision with the component) |
| `lib/diff.ts`, `diff-annotations.ts`, `diff-target.ts`, `drift.ts` (+ test), `blobs.ts`, `worker-factory.ts`, `utils.ts`, `preferences.ts`, `query-client.ts` | stay in `lib/` (2+ feature consumers) |
| `queries/diff.ts`, `queries/review.ts` | stay in `queries/` |
| `hooks/use-code-theme.ts`, `use-key-pressed.ts`, `use-media-query.ts`, `use-review-stream.ts` | stay in `hooks/` |
| `routes/*`, `main.tsx`, `env.d.ts` | stay |

Add a `@client` path note to `CONTEXT.md`/docs only if one already documents the old layout (do not write new docs for this).

---

## Phase 1 — convention application (parallel, worktree per package)

Every package: apply the Conventions section to its files, fix listed items, record everything else. File sets are disjoint — do not touch files outside your set.

### P1-diff — `features/diff/**`

- Rename `DiffFilter` → `ChangeRangePicker` (it selects the Change/range; it does not filter) in `change-picker.tsx`.
- `aria-label`s (U1): `view.tsx` code-tree toggle (`:147`) and settings menu trigger (`:161`), `file-tree-filter.tsx:36`.
- `file-tree-search.tsx`: placeholder → `"Search files…"` (U5).
- Shared filter-trigger styling: `change-picker` uses the same `variant="ghost" size="sm" font-normal text-[13px]!` button as `findings/filter.tsx` — extract the class constant only if it can live in this package's files; otherwise record.

### P1-codeview — `components/code-view*.tsx`, `components/code-view-annotation.tsx`, `features/diff/code-view.tsx`, `features/code-walkthrough/**`

- Rename `CodeView` → `AnnotatedCodeView` (it is hard-bound to the findings `Annotation` type; the current name shadows the vendored `BaseCodeView`). Rename `HeaderPrefix`/`HeaderMetadata` → `CodeViewHeaderPrefix`/`CodeViewHeaderMetadata`.
- Extract the duplicated items-construction (`features/diff/code-view.tsx:55-73` vs `features/code-walkthrough/diff-panel.tsx:73-90`): a shared `useDiffItems({ files, findings, driftFor, composing })` (or `CodeFindingsView`) next to `AnnotatedCodeView`; callers keep only their divergent collapse/viewed vs active-range wiring. This is the `DiffCodeView`/`WalkthroughDiffPanel` blur — after extraction, each wrapper should read as "shared core + its route's concerns".
- `aria-label`s: `code-view-header-prefix.tsx:22` (collapse chevron), `code-view-header-metadata.tsx:20` (comment button).
- `diff-panel.tsx:154`: commented-out `enableGutterUtility` while the click handler is still passed — record intent question in `FINDINGS.md`, do not change.
- Add a cross-link comment between the inline `DIFFS_CSS` in the code-view and `styles/diffs.css` (both theme @pierre DOM; the split is otherwise undiscoverable).

### P1-product — `features/product-walkthrough/**`

- Split `capture.tsx` (752 lines) along the capture-kind seam: keep `CaptureView`/`CaptureFrame`/`CaptureStage`/`CaptureCaption`/`useRefit` in `capture.tsx`; `ScreenshotCapture` + `RegionOverlay` → `capture-screenshot.tsx`; `RecordingCapture` + `RecordingControls` → `capture-recording.tsx`; `useRecordingPeek` (~130 lines, pure transport-borrowing logic) → `use-recording-peek.ts`.
- `pretty-ms`: replace hand-rolled `formatOffset` (`m:ss` math) with `prettyMilliseconds(ms, { colonNotation: true })` and the `(duration/1000).toFixed(1)`s`site with`prettyMilliseconds(duration, { secondsDecimalDigits: 1 })`.
- Optional (do only if clean): extract the pure geometry of `use-inner-zoom.ts` (`measure`, `clampAxis`, `wheelPixels`, tuning constants) to `inner-zoom-geometry.ts` with unit tests, mirroring `drift.ts`'s pure seam. The hook is otherwise coherent — do not restructure it.

### P1-findings — `features/findings/**`

- Merge `FindingDiffLink`/`FindingSectionLink` (explicit TODO at `item.tsx:60`) into one `FindingLink` — `{ icon, to, label, onReveal }` wrapping the identical Tooltip + Button + Link + `stopPropagation` structure; add `aria-label` (U1 — the tooltip is not an accessible name); drop the stray trailing space in the `diff-link` className.
- `plur`: `filter.tsx:52` comment count.
- `composer.tsx`: `aria-label` on the textarea (U4 — the `label` prop is the submit text, not a field label).
- `filters.ts`: replace the local `toggled` helper with radashi's `toggle`.
- `toggle.tsx`: `aria-label`s on both icon buttons; normalize the mixed `@client`/relative ui imports (H3).

### P1-walkthrough — `features/walkthrough/**`, `lib/finding-sections.ts`, `lib/diff-target.ts`

- `plur`: `staleness.tsx:19`.
- `prose.tsx`: `use()` instead of `useContext` (C6); markdown `a` renderer gets `rel="noreferrer"` (U9). Same C6 sweep in `callout-list.tsx`.
- Reveal-target duplication: `lib/diff-target.ts` and `features/walkthrough/target.ts` both hand-roll the atom + token-bump + scroll-on-token pattern. Extract a shared `createRevealTarget()` factory (in `lib/`), keeping both public APIs unchanged so no other package's files are touched.

### P1-shell — `components/{layout,header,navigation,review-meta,theme-provider,providers,error,pane}.tsx`, `hooks/**`, `routes/**`, `styles/index.css` (non-protected parts)

- `theme-provider.tsx`: replace the hand-rolled global keydown (repeat guard, modifier guard, `isEditableTarget` helper) with `useHotkeys("d", …, { enableOnFormTags: false })` — delete the helper; leave the storage-sync and media-query effects alone. `use()` instead of `useContext` (C6).
- `hooks/use-review-stream.ts`: already on the api layer after 0.2 — verify only.
- Conventions sweep over shell components and remaining hooks; trim `use-media-query.ts`'s dead surface if 0.1 left any.

---

## Phase 2 — verification (serial, in `client-refactor`, after all merges)

- `bun run preflight` green on the integration branch.
- Browser pass via the dev server: load `/`, `/code`, `/product`; interact with the main surfaces (file tree, diff annotations/composer, walkthrough navigation, product capture playback/zoom, findings panel + filters, theme toggle `d`, Alt-hint kbd overlays); console free of errors/warnings; SSE invalidation still refreshes after a `.docent/` change.
- Screenshots for the intentionally-visible changes (a11y/focus/placeholder fixes) attached to the run summary.
- Consolidate `FINDINGS.md`: dedupe, drop anything fixed en route, hand back as the run's output.

---

## Seed findings (pre-recorded, do not fix)

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
