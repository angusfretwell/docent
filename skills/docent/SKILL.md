---
name: docent
description: Take a branch's walkthroughs end-to-end — preflight app drivability, reconcile each pillar against the head Change (regenerating only stale or missing tours as fresh immutable wlk_), then serve and open the tour in the browser. Use when the human asks to (re)generate, refresh, or reconcile the code and/or product walkthroughs after a change, bring a stale tour up to date, or "run /docent".
---

# docent

The **walkthrough reconciler**, end-to-end — a docent gives the guided tour. "Type `/docent`, get a browser tab with the tour." This is the answer to "how and when is a walkthrough regenerated" (agent-integration.md §3.1, walkthroughs.md §8): **the human runs `/docent`**. The tool only ever _surfaces_ staleness (the `bornChangeId`-vs-head badge); it never auto-regenerates. You are that trigger, invoked in the human's own session — docent-the-tool never invokes you.

The run is three acts:

1. **Preflight** (§1) — before any authoring, make sure you can drive the app, front-loading the one human-in-the-loop moment to the start of the run.
2. **Reconcile** (§2–§5) — per pillar, regenerate only what drifted, minting fresh immutable walkthroughs.
3. **Serve and open** (§6) — ensure a docent server is up and put the tour on screen.

Per pillar (**code**, **product**) you read the head Change and the pillar's latest walkthrough's `bornChangeId`, and decide from **existence + drift** what to do. You regenerate **only the stale or missing pillars** — a live pillar is left untouched (**selective on pillars**, agent-integration.md §3.1) — and each regenerated pillar mints a **fresh immutable `wlk_`**; you never edit a prior walkthrough in place (walkthroughs.md §2). You **compose the reference skills**; you reimplement none of them:

| Pillar | Regeneration composes |
| --- | --- |
| **code** | `/author-code-walkthrough` |
| **product** | `/capture-product-walkthrough` (re-drive capture **wholesale**) → `/author-product-walkthrough` |

You author no walkthrough files yourself — the reference skills and the `docent walkthrough` / `docent capture` write path do that (load **`/docent-cli`** for the command surface: `wlk_`/`sec_` minting, lazy `bornChangeId`, git-resolved `blobSha`, content-addressing). Your job is the **reconcile decision** — which pillars are stale, which are missing, which are fresh — and then dispatching the composed skills at the ones that need it.

## 1. Preflight — make sure you can drive the app

The product pillar is a **browser/user-facing** review, so before any authoring the run **front-loads the one human-in-the-loop moment** — establishing that the app can be driven — to the start, where the human is present, rather than stalling mid-capture (agent-integration.md §4.2). Run the preflight whenever the **product pillar is in scope** (the default); skip it only when the human scoped the run to **code alone** (code has no capture phase, so it needs no app).

**A non-empty `.docent/capture.md` short-circuits the preflight** — the runbook is the **"we know how to drive the app" signal** (agent-integration.md §4.2). If it exists and is non-empty, drivability is already recorded: proceed straight to reconcile (§2) without re-asking. This is the cheap, common case.

Otherwise nothing is recorded yet, so establish drivability now — the discovery precedence with the runbook as its gate (agent-integration.md §4.2):

1. **Source the setup** — existing codebase context (README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs), then **ask the human** (a single, one-time prompt) for whatever is left. You need the base URL / port, the viewport default, and any login/seed steps.
2. **Verify the app actually renders** — reach the served app and confirm **real DOM**, not a connection-refused or error page (the readiness gate, agent-integration.md §4.4). Serving is the human's job: either it is already up, or the human gives you the command and you run it **in their session** (§4.1). An agent-launched server stays up and is reused by the capture in §5 (§4.5).
3. **Author `.docent/capture.md`** from what you learned — follow [runbook-template.md](../capture-product-walkthrough/runbook-template.md) — so this run's capture, and every later run, goes AFK.

**If the app cannot be reached → hard stop, early**, with an actionable message (e.g. `app not reachable at <url> — is your dev server up?`), **before any expensive authoring**. Nothing is reconciled on a failed preflight — no partial walkthrough (agent-integration.md §4.4).

Setup is folded into this preflight: there is no separate `/docent-setup` skill (agent-integration.md §3.1).

## 2. Reconcile — read the head

Read the Change under review with **plain `git`** in your own session, straight from the local clone (agent-integration.md §1, walkthroughs.md §10). The head is the reconcile target every pillar is measured against:

```bash
git fetch
git rev-parse HEAD                     # the current head SHA — what every walkthrough is measured against
git log --oneline origin/HEAD..HEAD    # what this branch adds
```

- **Optional focus / pillar scope.** The human may scope the run — a focus ("security") that steers each regenerated tour, or a single pillar ("just the product walkthrough"). With no scope, reconcile **both** pillars. Scope is what the preflight (§1) reads to decide whether the product pillar is in play: a code-only run skips the app-drivability check entirely. A focus is passed straight through to the composed authoring skill; it does not change the staleness decision.

## 3. Decide per pillar — existence + drift

The Review for the current branch holds each pillar's walkthroughs under its canonical tree (data-model.md §2, walkthroughs.md §3):

```
.docent/reviews/<branch-slug>/
  changes/                       # the append-only Change log — chg_NNN.json, each with a frozen headSha
  walkthroughs/
    code/    wlk_<ulid>/manifest.json
    product/ wlk_<ulid>/manifest.json
```

`<branch-slug>` is the current branch name with slashes → dashes (data-model.md §3); glob it if unsure. For **each** pillar, resolve its state:

1. **Find the latest walkthrough.** The pillar's newest tour is the greatest `wlk_` ULID (ULIDs sort lexicographically by mint time):

   ```bash
   ls -d .docent/reviews/<branch-slug>/walkthroughs/code/wlk_*/ 2>/dev/null | sort | tail -1
   ```

   **No directory / no `wlk_`** → the pillar is **missing**.

2. **Read its `bornChangeId`.** From that walkthrough's `manifest.json` (walkthroughs.md §4). Resolve the Change it names to a head SHA:

   ```bash
   cat .docent/reviews/<branch-slug>/walkthroughs/code/wlk_<ulid>/manifest.json   # → bornChangeId
   cat .docent/reviews/<branch-slug>/changes/<bornChangeId>.json                  # → headSha
   ```

3. **Compare to head.** Walkthrough staleness is `bornChangeId`'s `headSha` vs the current head (walkthroughs.md §8):
   - **`headSha` == current head** → the pillar is **live** (its Change _is_ the head).
   - **`headSha` != current head** → the pillar is **stale** (its tour depicts the product as of an earlier Change).

The per-pillar decision — **existence + drift**, nothing else (walkthroughs.md §8, agent-integration.md §3.1):

| State | Do |
| --- | --- |
| **Missing** (no walkthrough) | **Regenerate** — the pillar has no tour. |
| **Stale** (`bornChangeId` behind head) | **Regenerate** — mint a fresh `wlk_` bound to the head. |
| **Live** (`bornChangeId` is the head) | **Leave untouched** — a live tour is never re-minted. |

**Selective on pillars** means exactly this per-pillar independence (agent-integration.md §3.1): each pillar is judged on its **own** walkthrough's `bornChangeId`, so a stale pillar is regenerated while its **live** sibling is left untouched — you never re-mint a live pillar just because the other drifted, and you never skip a stale one. "The diff actually affects the pillar" **is** its staleness: a stale pillar's `bornChangeId` sits behind head, so the diff since it was born is what makes it stale. There is no second within-pillar filter — v1 regenerates **every** stale or missing pillar (walkthroughs.md §8: "mints a fresh immutable `wlk_` for stale or missing pillars only"); a finer "does this specific drift touch the tour" test is a deferred optimization, not a v1 gate.

A regenerated pillar always mints a **fresh** `wlk_`; the prior tour persists immutable and greppable (walkthroughs.md §2). Never edit a prior walkthrough in place to "patch" drift.

## 4. Regenerate the code pillar — compose `/author-code-walkthrough`

If the code pillar is **missing or stale** (§3), hand off to **`/author-code-walkthrough`** with any focus the human gave. It reads the Change via git, selects and orders high-signal ranges, and mints a **fresh** `walkthroughs/code/wlk_*/` bound to the live head via `docent walkthrough create --kind code` — a new tour, never an edit of the prior one. Code has no capture phase, so this single skill is the whole code pillar.

If the code pillar is **live**, **skip it** — do not re-mint.

## 5. Regenerate the product pillar — capture wholesale, then author

If the product pillar is **missing or stale** (§3), run the two product reference skills **in order** — capture first (it mints the shell), then author into it:

1. **`/capture-product-walkthrough`** — **re-drive capture wholesale** (walkthroughs.md §11, agent-integration.md §3.1). v1 does **not** reuse individual prior captures; capture drives the served app fresh and mints a new product `wlk_*/` shell with its `captures[]` populated and `sections` empty. **Content-addressing dedups byte-identical screens for free** — a screen unchanged since the last tour hashes to the same `<sha>` blob, so re-capturing costs nothing on disk (the per-capture `route` seam preserves selective reuse as a future optimization, walkthroughs.md §11). Capture consumes the app the **preflight (§1) already reached**, and runs AFK against the `.docent/capture.md` the preflight recorded — no re-asking, no stall (agent-integration.md §4).
2. **`/author-product-walkthrough`** — the editorial half. It reads the captures-only shell just minted and drops the sections (prose, `{{capture:i}}` interleave, pinned annotations), then sets the shell's title. It touches no browser.

The result is one fresh immutable product `wlk_` for the head. If the product pillar is **live**, **skip both** — do not re-capture (capture is expensive and deliberately separable, which is the whole point of the split).

## 6. Serve and open — put the tour on screen

The run ends by surfacing the tour in the browser — "get a browser tab with the tour." First **report the reconcile decision** so the human sees why:

- Which pillars **regenerated** (missing or stale) — and the fresh `wlk_` each minted.
- Which pillars were **left untouched** (live) — and why.

Then **ensure a docent server is running for this repo and open the browser.** `docent serve` renders `.docent/` live and re-renders each write over SSE (agent-integration.md §1), so a freshly reconciled tour lands on screen the moment it exists. Check first, reuse if you can:

```bash
docent status          # → { "serving": true, "url": "http://127.0.0.1:…/" }  or  { "serving": false }
```

- **Already serving** (`serving: true`) → reuse it; open its `url`. Never start a second server.
- **Not serving** (`serving: false`) → start one **in the background** (it runs until the human stops it), poll until it answers, then open the browser. **Bound the poll** — never hang `/docent` on a serve that won't boot; on timeout **hard stop** with an actionable message (the same "early, actionable" principle as the preflight, §1):

  ```bash
  docent serve >/dev/null 2>&1 &   # backgrounded; leave it running
  for _ in $(seq 50); do           # `docent serve` records its address on boot; poll it, bounded (~10s)
    docent status | grep -q '"serving": true' && break
    sleep 0.2
  done
  docent status | grep -q '"serving": true' || {
    echo "docent serve did not come up within ~10s — run 'docent serve' in this repo to see the boot error, then re-run /docent" >&2
    exit 1
  }
  ```

Open the browser at the served `url`; the reconciled pillar's tour is on its walkthrough tab. Starting `docent serve` is **docent's own process** — distinct from the app under review, which docent never spawns (agent-integration.md §3.4, §4); the no-spawn rule is about the app being reviewed, not about docent itself.

## Boundaries

- **You reconcile and dispatch; you do not author.** The three reference skills own the file writes and the editorial judgment; the `docent walkthrough` / `docent capture` write path owns id minting and content-addressing (`/docent-cli`). Your only writes are the composed skills' — you never hand-author a walkthrough file to shortcut them.
- **A fresh `wlk_` per regenerated pillar — never edit in place.** Regeneration mints a new immutable walkthrough bound to the head; the prior one persists (walkthroughs.md §2). Patching an existing tour's files to "update" it is never correct.
- **Selective on pillars.** Each pillar is judged on its own `bornChangeId`: a stale or missing pillar is regenerated, a **live** pillar is left untouched. Never re-mint a live pillar because its sibling drifted, and never skip a stale one — v1 regenerates every stale or missing pillar (walkthroughs.md §8).
- **Walkthroughs only, never Findings.** Reconciliation produces tours; the review → Findings loop is `/to-docent` and `/address`, separate flows (agent-integration.md §3.1).
- **Human-invoked only.** docent-the-tool never triggers you — it can only surface staleness. Regeneration happens exactly when the human runs `/docent` (walkthroughs.md §8, agent-integration.md §3.1).
- **Serving the _app under review_ is the human's workflow** — you consume it, never spawn it (agent-integration.md §4). Serving **docent itself** in §6 is different: that is docent's own process, which you may start in the background so the tour has somewhere to render.
- **Commit / push are the human's workflow** — out of scope (agent-integration.md §3.4).

## Stop conditions

- **App not reachable at preflight (§1).** Hard stop **early**, before any authoring, with an actionable message (`app not reachable at <url> — is your dev server up?`). Nothing is reconciled and no walkthrough is authored (agent-integration.md §4.4). Re-run once the human has the dev server up.
- **The app drops mid-capture.** `/capture-product-walkthrough` hard-stops when the served app can't be reached (agent-integration.md §4.4) — never a silent broken capture. Report which pillar could not reconcile and why; a reconciled code pillar (if any) still stands.
- **`docent serve` never comes up (§6).** The serve-boot poll is bounded; on timeout, hard stop with an actionable message (`run 'docent serve' to see the boot error`) rather than spinning forever. The pillars are already reconciled and on disk — re-run `/docent` once the server starts, or open the tour manually.
