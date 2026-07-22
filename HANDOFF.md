# Handoff — client refactor, Phase 0 complete

You are taking over orchestration of `PLAN.md` (repo root) mid-run. **Read `PLAN.md` in full first** — it is the complete spec; its Ground rules and Conventions bind every agent you spawn. This file records exactly where the previous session stopped and the traps it already hit so you don't re-hit them.

## Where things stand

- Branch: **`client-refactor`** (the integration branch), worktree at `/Users/angus/Code/docent.client-refactor`.
- **Phase 0 is DONE and committed**, each step on green `bun run preflight`. Commits (newest first):
  - `67fd43f` refactor(client): reorganize src/client into feature-first layout (0.4)
  - `9658ed0` refactor(client): extract Surface, IconEmpty, and KbdHint (0.3)
  - `6752b8b` refactor(client): route all HTTP through a ky-based api layer (0.2)
  - `3b4e343` chore(client): delete dead primitives, exports, css, and deps (0.1)
  - `ae70647` chore(client): add refactor plan and findings scaffold
- `bun run preflight` is **GREEN** right now (check ✓, typecheck ✓, 397 tests pass, build ✓).
- `FINDINGS.md` exists with `## P0-foundation` and `## Seed` sections. Package agents append under their own `## <package-id>` heading. **Never fix recorded items.**

## What remains

- **Phase 1 — the only parallel phase: six packages, concurrent, one worktree + one subagent each**, branched off `client-refactor`, merged back on green preflight. Roster and disjoint file sets:

  | Package | File set |
  | --- | --- |
  | P1-diff | `features/diff/**` **except `features/diff/code-view.tsx`** (see carve-out) |
  | P1-codeview | `components/code-view*.tsx`, `components/code-view-annotation.tsx`, `features/diff/code-view.tsx`, `features/code-walkthrough/**` |
  | P1-product | `features/product-walkthrough/**` |
  | P1-findings | `features/findings/**` |
  | P1-walkthrough | `features/walkthrough/**`, `lib/finding-sections.ts`, `lib/diff-target.ts` |
  | P1-shell | `components/{layout,header,navigation,review-meta,theme-provider,providers,error,pane}.tsx`, `hooks/**`, `routes/**`, `styles/index.css` (non-protected parts) |

  Give each agent: its PLAN.md Phase 1 package section **verbatim**, the Conventions section, the Ground rules section, and the findings protocol. Enforce disjoint sets — an agent must not edit files outside its set; cross-package observations go to `FINDINGS.md`, not fixes.

- **Phase 2 — serial, in `client-refactor` after all six merges**: `bun run preflight` green; browser pass via dev server on `/`, `/code`, `/product` (file tree, diff annotations/composer, walkthrough nav, product capture playback/zoom, findings panel + filters, theme toggle `d`, Alt-hint kbd overlays); console clean; SSE invalidation still refreshes after a `.docent/` change; screenshots of the visible a11y/placeholder fixes; consolidate `FINDINGS.md`.

## Carve-out you MUST enforce

The plan's sets are disjoint **except** that P1-codeview claims `features/diff/code-view.tsx`, which is inside P1-diff's `features/diff/**`. **Tell the P1-diff agent explicitly: do not touch `features/diff/code-view.tsx` — it belongs to P1-codeview.** Otherwise every other boundary is clean and all six can run at once.

## Naming note for P1-diff (0.4 deferred this)

`features/diff/filter.tsx` still has its old name and its `DiffFilter` symbol. P1-diff renames **both** the file → `features/diff/change-picker.tsx` **and** the symbol `DiffFilter` → `ChangeRangePicker`, updating the one importer (`features/diff/view.tsx`, in its own set). PLAN.md's P1-diff section is written as if the file is already `change-picker.tsx`; it is not — the rename is P1-diff's job.

## Traps already hit — do not re-trip

1. **`ky` is v2.0.2**, not v1. It uses `baseUrl` (not `prefixUrl`); the `beforeError` hook takes a `BeforeErrorState` and the parsed body is on `error.data` (not `error.response.json()`). The api layer (`src/client/api/`) is already built and correct — don't rewrite it. **H6: no `fetch`/`ky` anywhere outside `api/`; `EventSource` only via `api.events.subscribe`.**
2. **Tailwind v4 auto-scans the whole repo, including root `.md` files and `.tsx` comments.** Any literal Tailwind-class-like token — especially an arbitrary value with a `*` wildcard like `before:rounded-[calc(var(--radius-*)-1px)]` — will be compiled and **break `bun run build` (`build:docent`)** with `Unexpected token: *`. `PLAN.md`, `FINDINGS.md`, `HANDOFF.md` are excluded via `@source not` in `styles/index.css`. If you add another root doc, exclude it too; and never write a literal `--radius-*`-style class token into a code comment (describe it in words instead).
3. **The baseline was already lint-red.** Two pre-existing errors were neutralized in 0.1 to make the per-package gate usable: a reworded TODO in `features/findings/item.tsx`, and an `oxlint-disable-next-line react-hooks/exhaustive-deps` on the reveal effect in `features/diff/code-view.tsx` (recorded in FINDINGS `## P0-foundation`). P1-codeview owns that deps question. Don't be surprised the suppression is there.
4. **`preflight`'s `check` step is `ultracite` = format + lint**, and it gates on lint errors. `bun run fix` sometimes needs **two passes** to converge (oxlint splits type-imports / flips quotes, then oxfmt re-normalizes). Run `fix`, run it again, then `check`.
5. **`lib/captures.ts` was deleted in 0.2** (absorbed into `api/captures.ts`), so the 0.4 move map entry for it was a no-op. `queries/captures.ts` did move to `features/product-walkthrough/captures.ts`.

## Dependencies

Pre-approved: `ky` (installed), **`plur` and `pretty-ms` (NOT yet installed)**. P1-findings and P1-walkthrough need `plur`; P1-product needs `plur` and `pretty-ms`. Those agents add them (in their own worktree). **No other new deps.**

## Worktrees / mechanics

Project convention is worktrunk: `/wt-switch-create <branch>` creates a branch + worktree off the current branch and installs deps via hooks. For six parallel package agents, either (a) create six worktrees and run one subagent in each, or (b) spawn each package agent with the Agent tool's `isolation: "worktree"` — but note worktrunk's hooks are what install deps, so if you use raw git worktrees make sure `bun install` runs. Merge each package back into `client-refactor` on green preflight (fast-forward or `--no-ff`, your call). **Do not push or open PRs.** Commits follow `/commit` (Conventional Commits).

## Known cross-package thread to watch

Both P1-diff (`change-picker`) and P1-findings (`findings/filter.tsx`) use the same ghost filter-trigger button styling (`variant="ghost" size="sm"` + `font-normal text-[13px]!`). Each package may extract the class constant only if it can live inside its own file set; otherwise record it in FINDINGS. They cannot share a new file without breaking disjointness — if a shared home is warranted, that's a Phase 2 / follow-up observation, not a Phase 1 fix.
