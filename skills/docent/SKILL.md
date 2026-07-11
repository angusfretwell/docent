---
name: docent
description: Reconcile a branch's walkthroughs against its head Change — per pillar, regenerate only the stale or missing tours, minting a fresh immutable wlk_. Use when the human asks to (re)generate, refresh, or reconcile the code and/or product walkthroughs after a change, or bring a stale tour up to date.
---

# docent

The **walkthrough reconciler** — a docent gives the guided tour. This is the answer to "how and when is a walkthrough regenerated" (agent-integration.md §3.1, walkthroughs.md §8): **the human runs `/docent`**. The tool only ever _surfaces_ staleness (the `bornChangeId`-vs-head badge); it never auto-regenerates. You are that trigger, invoked in the human's own session — docent-the-tool never invokes you.

Per pillar (**code**, **product**) you read the head Change and the pillar's latest walkthrough's `bornChangeId`, and decide from **existence + drift** what to do. You regenerate **only the pillars the diff actually affects** — a fresh pillar is left untouched — and each regenerated pillar mints a **fresh immutable `wlk_`**; you never edit a prior walkthrough in place (walkthroughs.md §2). You **compose the reference skills**; you reimplement none of them:

| Pillar      | Regeneration composes                                                                           |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **code**    | `/author-code-walkthrough`                                                                      |
| **product** | `/capture-product-walkthrough` (re-drive capture **wholesale**) → `/author-product-walkthrough` |

You author no walkthrough files yourself — the reference skills and the `docent walkthrough` / `docent capture` write path do that (load **`/docent-cli`** for the command surface: `wlk_`/`sec_` minting, lazy `bornChangeId`, git-resolved `blobSha`, content-addressing). Your job is the **reconcile decision** — which pillars are stale, which are missing, which are fresh — and then dispatching the composed skills at the ones that need it.

## 1. Read the head — plain git, your own session

Read the Change under review with **plain `git`** in your own session, straight from the local clone (agent-integration.md §1, walkthroughs.md §10). The head is the reconcile target every pillar is measured against:

```bash
git fetch
git rev-parse HEAD                     # the current head SHA — what every walkthrough is measured against
git log --oneline origin/HEAD..HEAD    # what this branch adds
```

- **Optional focus / pillar scope.** The human may scope the run — a focus ("security") that steers each regenerated tour, or a single pillar ("just the product walkthrough"). With no scope, reconcile **both** pillars. A focus is passed straight through to the composed authoring skill; it does not change the staleness decision.

## 2. Decide per pillar — existence + drift

The Dossier for the current branch holds each pillar's walkthroughs under its canonical tree (data-model.md §2, walkthroughs.md §3):

```
.docent/dossiers/<branch-slug>/
  changes/                       # the append-only Change log — chg_NNN.json, each with a frozen headSha
  walkthroughs/
    code/    wlk_<ulid>/manifest.json
    product/ wlk_<ulid>/manifest.json
```

`<branch-slug>` is the current branch name with slashes → dashes (data-model.md §3); glob it if unsure. For **each** pillar, resolve its state:

1. **Find the latest walkthrough.** The pillar's newest tour is the greatest `wlk_` ULID (ULIDs sort lexicographically by mint time):

   ```bash
   ls -d .docent/dossiers/<branch-slug>/walkthroughs/code/wlk_*/ 2>/dev/null | sort | tail -1
   ```

   **No directory / no `wlk_`** → the pillar is **missing**.

2. **Read its `bornChangeId`.** From that walkthrough's `manifest.json` (walkthroughs.md §4). Resolve the Change it names to a head SHA:

   ```bash
   cat .docent/dossiers/<branch-slug>/walkthroughs/code/wlk_<ulid>/manifest.json   # → bornChangeId
   cat .docent/dossiers/<branch-slug>/changes/<bornChangeId>.json                  # → headSha
   ```

3. **Compare to head.** Walkthrough staleness is `bornChangeId`'s `headSha` vs the current head (walkthroughs.md §8):
   - **`headSha` == current head** → the pillar is **live** (its Change _is_ the head). Leave it untouched.
   - **`headSha` != current head** → the pillar is **stale**. Read the drift diff and judge whether it touches this pillar's surface (below).

The per-pillar decision:

| State                                 | Do                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------------------------ |
| **Missing** (no walkthrough)          | **Regenerate** — the pillar has no tour.                                                         |
| **Live** (`bornChangeId` is the head) | **Leave untouched** — a fresh tour is not re-minted.                                             |
| **Stale + drift affects this pillar** | **Regenerate** — mint a fresh `wlk_` bound to the head.                                          |
| **Stale + drift does not affect it**  | **Leave untouched** — the tour still depicts head faithfully (staleness is surfaced, not fixed). |

**"The diff actually affects" — the selective-on-pillars judgment.** Read what changed since the born head and decide per pillar whether the tour would now mislead:

```bash
git diff <bornHeadSha>..HEAD --stat     # what drifted since this pillar's tour was written
```

- **Code pillar** — affected when the drift touches source the tour walks (a section's ranges, or code near them). A drift that is pure docs / captures / config with no source change leaves the code tour faithful.
- **Product pillar** — affected when the drift touches the **user-facing surface** the captures depict: routes, components, templates, styles — anything that changes what the app renders. A backend-only or comment-only drift leaves the product tour's screens faithful, so it need not re-capture.

When genuinely unsure whether a stale pillar is affected, **regenerate** — it is the safe default: a fresh `wlk_` is minted, the prior tour persists immutable and greppable (walkthroughs.md §2), and nothing is lost. Never edit a prior walkthrough in place to "patch" drift.

## 3. Regenerate the code pillar — compose `/author-code-walkthrough`

If the code pillar needs regeneration (missing, or stale-and-affected), hand off to **`/author-code-walkthrough`** with any focus the human gave. It reads the Change via git, selects and orders high-signal ranges, and mints a **fresh** `walkthroughs/code/wlk_*/` bound to the live head via `docent walkthrough create --kind code` — a new tour, never an edit of the prior one. Code has no capture phase, so this single skill is the whole code pillar.

If the code pillar is live, or stale-but-unaffected, **skip it** — do not re-mint.

## 4. Regenerate the product pillar — capture wholesale, then author

If the product pillar needs regeneration, run the two product reference skills **in order** — capture first (it mints the shell), then author into it:

1. **`/capture-product-walkthrough`** — **re-drive capture wholesale** (walkthroughs.md §11, agent-integration.md §3.1). v1 does **not** reuse individual prior captures; capture drives the served app fresh and mints a new product `wlk_*/` shell with its `captures[]` populated and `sections` empty. **Content-addressing dedups byte-identical screens for free** — a screen unchanged since the last tour hashes to the same `<sha>` blob, so re-capturing costs nothing on disk (the per-capture `route` seam preserves selective reuse as a future optimization, walkthroughs.md §11). Serving the app is the human's job; capture consumes it and sources setup in its own precedence order (agent-integration.md §4).
2. **`/author-product-walkthrough`** — the editorial half. It reads the captures-only shell capture just minted and drops the sections (prose, `{{capture:i}}` interleave, pinned annotations), then sets the shell's title. It touches no browser.

The result is one fresh immutable product `wlk_` for the head. If the product pillar is live, or stale-but-unaffected, **skip both** — do not re-capture (capture is expensive and deliberately separable, which is the whole point of the split).

## 5. Confirm — report what reconciled and what was left

The run is done when every in-scope pillar has been reconciled. Report the decision so the human sees why:

- Which pillars **regenerated** (missing or stale-and-affected) — and the fresh `wlk_` each minted.
- Which pillars were **left untouched** (live, or stale-but-unaffected) — and why.

If `docent serve` is running, each regenerated tour appears live in its walkthrough tab as the composed skills write it (agent-integration.md §1); a left-untouched stale pillar keeps its existing `bornChangeId`-vs-head staleness badge, now a deliberate, reported outcome rather than a missed one.

## Boundaries

- **You reconcile and dispatch; you do not author.** The three reference skills own the file writes and the editorial judgment; the `docent walkthrough` / `docent capture` write path owns id minting and content-addressing (`/docent-cli`). Your only writes are the composed skills' — you never hand-author a walkthrough file to shortcut them.
- **A fresh `wlk_` per regenerated pillar — never edit in place.** Regeneration mints a new immutable walkthrough bound to the head; the prior one persists (walkthroughs.md §2). Patching an existing tour's files to "update" it is never correct.
- **Selective on pillars, selective on staleness.** A live pillar is left untouched; a stale-but-unaffected pillar is left untouched and its staleness reported. Never blindly regenerate both pillars, and never re-capture a product tour whose screens the drift didn't touch.
- **Walkthroughs only, never Findings.** Reconciliation produces tours; the review → Findings loop is `/review` and `/address`, separate flows (agent-integration.md §3.1).
- **Human-invoked only.** docent-the-tool never triggers you — it can only surface staleness. Regeneration happens exactly when the human runs `/docent` (walkthroughs.md §8, agent-integration.md §3.1).
- **Commit / push and serving the app are the human's workflow** — out of scope (agent-integration.md §3.4, §4).

## Stop conditions

- **Product pillar needs regeneration but the app is not reachable.** `/capture-product-walkthrough` hard-stops when the served app can't be reached (agent-integration.md §4.4) — never a silent broken capture. Report which pillar could not reconcile and why; a reconciled code pillar (if any) still stands. Re-run once the human has the dev server up.
