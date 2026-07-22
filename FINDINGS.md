# Findings

Record-only output artifact for the `src/client` improvement run (see `PLAN.md`). Each package agent appends under its own `## <package-id>` heading: one bullet per finding, with `file:line`, a short description, and why it was out of scope. **Do not fix recorded items.**

## P0-foundation

- `components/diff/code-view.tsx:125` (deps array) — the reveal `useEffect` is intentionally keyed to `target` only but reads `isCollapsed`, tripping `react-hooks/exhaustive-deps`. This was **pre-existing red on the baseline** (`bun run check` fails on the base commit) and blocks the per-package preflight gate, so it was suppressed with an `oxlint-disable-next-line` to unblock all packages. Whether `isCollapsed` should be a dependency (it is derived from `collapsedOverrides`, so adding it would re-run the reveal on every collapse toggle) is a behavior question for P1-codeview, which owns this file after the 0.4 move — not fixed here.
- Phase 0.4 move-map gap: `lib/walkthrough.test.ts` is not listed in the move map (neither under a destination nor under "stays put"), yet it tests `lib/walkthrough.ts`, which the map moves to `features/walkthrough/walkthrough.ts`. To keep the test resolving its subject via a same-dir `./walkthrough` import (mirroring the explicit `walkthrough-pins.test.ts` → `features/product-walkthrough/pins.test.ts` move), it was `git mv`'d to `features/walkthrough/walkthrough.test.ts`. Behavior-preserving; recorded because it is not spelled out in the map.

## P1-diff

- Shared filter-trigger button styling is duplicated across packages: `features/diff/change-picker.tsx` (the range-picker trigger) and `features/findings/filter.tsx` both use the same ghost button (`variant="ghost" size="sm"` + `font-normal text-[13px]!`). Not extracted — a shared class constant would need a home outside both disjoint file sets. Candidate for a shared `components/` home in a follow-up (also raised by P1-findings).

## P1-codeview

- `features/diff/code-view.tsx:113` — the reveal `useEffect` retains its `oxlint-disable-next-line react-hooks/exhaustive-deps` (inherited from P0). Adding `isCollapsed` (derived from `collapsedOverrides`) to the dep array would re-run the reveal on every collapse toggle — a behavior change — so the suppression was kept rather than "resolved". Open behavior question, not lint debt.
- `features/code-walkthrough/diff-panel.tsx:131` — `enableGutterUtility` is commented out while `onGutterUtilityClick` (line 134) is still passed to the same code view. Intent unclear (should the gutter action be live or dormant?); recorded, not changed, per plan.

## P1-product

- Orchestration note (deviation resolved, not a defect): the `capture.tsx` split required a new `features/product-walkthrough/capture-frame.tsx`. The plan kept the shared primitives (`CaptureFrame`/`CaptureStage`/`CaptureCaption`/`useRefit`/`CaptureProps`) in `capture.tsx`, but `capture.tsx`'s `CaptureView` also imports the two split files (`capture-screenshot`, `capture-recording`) that consume those primitives — an unavoidable cycle under `import/no-cycle`. Resolved by extracting the shared primitives into `capture-frame.tsx`; `capture.tsx` now holds only the `CaptureView` dispatcher. Behavior-preserving.

## P1-findings

- `features/findings/panel.tsx` — the findings list renders every visible finding via `.map()` with no virtualization (R4); a review can exceed ~50 findings. Not fixed: virtualizing is a user-visible change beyond behavior-preserving scope.
- Shared filter-trigger button styling — same duplicated ghost button as `features/diff/change-picker.tsx` (see P1-diff).

## P1-shell

- `components/theme-provider.tsx` — the theme toggle moved from a hand-rolled `keydown` handler to `useHotkeys("d", …, { enableOnFormTags: false })` per plan. The old handler explicitly guarded `event.repeat` and `event.metaKey/ctrlKey/altKey`; the QA pass should confirm `useHotkeys` preserves that (no toggle on held-key repeat, no fire under modifier combos). Behavior-adjacent, flagged for verification.

## Phase 2 (browser QA)

- `features/product-walkthrough/capture-recording.tsx:109` — the recording scrubber renders `<Slider min={0} max={durationMs}>`, but `durationMs` is `0` until the rrweb replayer reports the recording's duration, so on first mount `max === min` and Base UI logs `Slider: max must be greater than min`. **Pre-existing** — byte-identical at `d590a5a`, before Phase 1 — surfaced during the QA pass, not introduced by the capture split. Fix candidate: guard the slider (or default `max` to `Math.max(durationMs, 1)`) until the duration is known. Recorded, not fixed (behavior-adjacent, out of the refactor's scope).
- Verified live on the dev fixture (`/`, `/code`, `/product`): file tree + virtualization, diff finding links, findings panel/filters, walkthrough section reveals (the `createRevealTarget` factory), product screenshot + recording captures (the `capture-frame`/`capture-screenshot`/`capture-recording` split), pin callouts, and the `d` theme toggle (the `useHotkeys` migration) all work; console is otherwise clean; a11y labels (Search files, Filter files, Toggle file tree, Diff settings, Comment on file, Previous/Next capture, Zoom/Fit) render as accessible names.

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
