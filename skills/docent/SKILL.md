---
name: docent
description: Docent review companion for the branch under review. `/docent` reconciles the code and product walkthroughs against the head change and serves the tour; `/docent --read` pulls the Review's Comments into the session to work on; `/docent --write` records the session's review outcomes back to the Review. Use when the human asks to (re)generate, refresh, or reconcile walkthroughs, bring a stale tour up to date, pull or fetch docent review comments, or write review outcomes back to docent.
---

# docent

The session-side companion to the `docent` tool — a docent gives the guided tour. It assumes only a git repository and the tool's `.docent/` state directory at the repo root (auto-created on first write). The `docent` CLI is reached through `npx @angusfretwell/docent`, which self-bootstraps its per-platform binary on first run — no global install needed.

Dispatch on the invocation:

| Invocation | Branch |
| --- | --- |
| `/docent` (optionally a focus or pillar scope) | **Reconcile walkthroughs** — this file, §1–§6. |
| `/docent --read [filters]` | **Pull Comments** into the session — load [reference/comments.md](reference/comments.md), "Reading the queue". |
| `/docent --write` | **Record outcomes** back to the Review — load [reference/comments.md](reference/comments.md), "Writing outcomes". |

**Capability gate — run this before any branch.** All three invocations shell out to the `docent` CLI, so first confirm the CLI can run at all:

```bash
npx -y @angusfretwell/docent --version
```

On a non-zero exit the CLI could not bootstrap. Relay the command's own stderr — it is the authority on why (`unsupported platform: …`, `download failed (NNN): …`, or Node/npx missing) — wrapped in an actionable line, e.g. `` `npx @angusfretwell/docent` couldn't run — <stderr>; ensure Node ≥18 and network access, then re-run /docent ``, and **hard-stop**. Nothing runs on a failed gate. The check is stateless — it runs every invocation, because machine capability can regress (evicted cache, Node change) and a cached "passed" would skip a check that should now fail — and cheap once the binary is cached; the `-y` also warms that cache up front, where the human is watching, rather than mid-capture.

The rest of this file is the default branch: "type `/docent`, get a browser tab with the tour." The tool only ever _surfaces_ walkthrough staleness; it never auto-regenerates — the human running `/docent` is the regeneration trigger. Per pillar (**code**, **product**) you read the head Change and the pillar's latest walkthrough, decide from **existence + drift** what to do, and regenerate **only the stale or missing pillars**, each minting a fresh immutable `wlk_`. Your job is the reconcile decision; the reference files own the authoring:

| Pillar | Regeneration follows |
| --- | --- |
| **code** | [reference/code-walkthrough.md](reference/code-walkthrough.md) |
| **product** | [reference/capture.md](reference/capture.md) (re-drive capture wholesale) → [reference/product-walkthrough.md](reference/product-walkthrough.md) |

## 1. Preflight — make sure you can drive the app

The product pillar drives the served app in a browser, so before any authoring, front-load the one human-in-the-loop moment — establishing that the app can be driven — to the start of the run, where the human is present, rather than stalling mid-capture. Run the preflight whenever the product pillar is in scope (the default); skip it only when the human scoped the run to **code alone** (code has no capture phase, so it needs no app).

**A non-empty `.docent/capture.md` short-circuits the preflight** — the runbook is the "we know how to drive the app" signal. If it exists and is non-empty, proceed straight to reconcile (§2) without re-asking. This is the cheap, common case.

Otherwise establish drivability now:

1. **Source the setup** — existing codebase context (README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs), then **ask the human** (a single, one-time prompt) for whatever is left. You need the base URL / port, the viewport default, and any login/seed steps.
2. **Verify the app actually renders** — reach the served app and confirm **real DOM**, not a connection-refused or error page. Serving the app is the human's job: either it is already up, or the human gives you the command and you run it in their session. An agent-launched server stays up and is reused by the capture in §5.
3. **Author `.docent/capture.md`** from what you learned — follow [reference/runbook-template.md](reference/runbook-template.md) — so this run's capture, and every later run, goes AFK.

**If the app cannot be reached → hard stop, early**, with an actionable message (e.g. `app not reachable at <url> — is your dev server up?`), before any expensive authoring. Nothing is reconciled on a failed preflight.

## 2. Read the head

Read the Change under review with plain `git`, straight from the local clone. The head is the reconcile target every pillar is measured against:

```bash
git fetch
git rev-parse HEAD                     # the current head SHA — what every walkthrough is measured against
git log --oneline origin/HEAD..HEAD    # what this branch adds (fall back to origin/<default-branch> if origin/HEAD is unset)
```

- **Name the change.** Reading the head is also where you learn what this branch _is_, so record it as the Review's title — the headline the UI renders:

  ```bash
  npx -y @angusfretwell/docent review set --title "Palette panel"
  ```

  Keep it **short** — a few words naming the change the way a PR title does, drawn from the branch's commits, not a summary of them. Re-set it on every run: the title tracks the head, and renaming keeps the Review's id.

- **Optional focus / pillar scope.** The human may scope the run — a focus ("security") that steers each regenerated tour, or a single pillar ("just the product walkthrough"). With no scope, reconcile **both** pillars. Scope is what the preflight (§1) reads to decide whether the product pillar is in play. A focus is passed straight through to the authoring; it does not change the staleness decision.

## 3. Decide per pillar — existence + drift

The Review for the current branch holds each pillar's walkthroughs under:

```
.docent/reviews/<branch-slug>/
  changes/                       # the append-only Change log — chg_NNN.json, each with a frozen headSha
  walkthroughs/
    code/    wlk_<ulid>/manifest.json
    product/ wlk_<ulid>/manifest.json
```

`<branch-slug>` is the current branch name with slashes → dashes; glob it if unsure. For **each** pillar, resolve its state:

1. **Find the latest walkthrough** — the greatest `wlk_` ULID (ULIDs sort lexicographically by mint time):

   ```bash
   ls -d .docent/reviews/<branch-slug>/walkthroughs/code/wlk_*/ 2>/dev/null | sort | tail -1
   ```

   No directory / no `wlk_` → the pillar is **missing**.

2. **Read its `bornChangeId`** from that walkthrough's `manifest.json`, and resolve the Change it names to a head SHA:

   ```bash
   cat .docent/reviews/<branch-slug>/walkthroughs/code/wlk_<ulid>/manifest.json   # → bornChangeId
   cat .docent/reviews/<branch-slug>/changes/<bornChangeId>.json                  # → headSha
   ```

3. **Compare to head** — `headSha` == current head → the pillar is **live**; otherwise **stale**.

| State | Do |
| --- | --- |
| **Missing** (no walkthrough) | **Regenerate** — the pillar has no tour. |
| **Stale** (`bornChangeId` behind head) | **Regenerate** — mint a fresh `wlk_` bound to the head. |
| **Live** (`bornChangeId` is the head) | **Leave untouched** — a live tour is never re-minted. |

**Selective on pillars**: each pillar is judged on its **own** walkthrough's `bornChangeId`, so a stale pillar is regenerated while its live sibling is left untouched — never re-mint a live pillar because the other drifted, and never skip a stale one. There is no second within-pillar filter: regenerate **every** stale or missing pillar. A regenerated pillar always mints a **fresh** `wlk_`; the prior tour persists immutable. Never edit a prior walkthrough in place to "patch" drift.

## 4. Regenerate the code pillar

If the code pillar is missing or stale, follow [reference/code-walkthrough.md](reference/code-walkthrough.md) with any focus the human gave. It reads the Change via git, selects and orders high-signal diff ranges, and mints a fresh `walkthroughs/code/wlk_*/` bound to the live head. Code has no capture phase, so this single reference is the whole code pillar.

If the code pillar is live, skip it.

## 5. Regenerate the product pillar

If the product pillar is missing or stale, run the two product halves **in order** — capture first (it mints the shell), then author into it:

1. **[reference/capture.md](reference/capture.md)** — re-drive capture **wholesale**: drive the served app fresh and mint a new product `wlk_*/` shell with its `captures[]` populated and `sections` empty. Individual prior captures are not reused, but content-addressing dedups byte-identical screens for free — an unchanged screen hashes to the same blob, so re-capturing costs nothing on disk. Capture consumes the app the preflight (§1) already reached, and runs AFK against the `.docent/capture.md` the preflight recorded.
2. **[reference/product-walkthrough.md](reference/product-walkthrough.md)** — the editorial half. It reads the captures-only shell just minted, drops the sections (prose, `{{capture:i}}` interleave, pinned callouts), then sets the shell's title. It touches no browser.

The result is one fresh immutable product `wlk_` for the head. If the product pillar is live, skip both — capture is expensive and deliberately separable.

## 6. Serve and open — put the tour on screen

First **report the reconcile decision** so the human sees why: which pillars regenerated (missing or stale) and the fresh `wlk_` each minted; which were left untouched (live) and why.

Then ensure a docent server is running for this repo and open the browser. `docent serve` renders `.docent/` live and re-renders each write over SSE, so a freshly reconciled tour lands on screen the moment it exists. Check first, reuse if you can:

```bash
npx -y @angusfretwell/docent status          # → { "serving": true, "url": "http://127.0.0.1:…/" }  or  { "serving": false }
```

- **Already serving** → reuse it; open its `url`. Never start a second server.
- **Not serving** → start one in the background (it runs until the human stops it), poll until it answers, then open the browser. **Bound the poll** — on timeout hard stop with an actionable message:

  ```bash
  npx -y @angusfretwell/docent serve >/dev/null 2>&1 &   # backgrounded; leave it running
  for _ in $(seq 50); do           # `docent serve` records its address on boot; poll it, bounded (~10s)
    npx -y @angusfretwell/docent status | grep -q '"serving": true' && break
    sleep 0.2
  done
  npx -y @angusfretwell/docent status | grep -q '"serving": true' || {
    echo "docent serve did not come up within ~10s — run 'npx -y @angusfretwell/docent serve' in this repo to see the boot error, then re-run /docent" >&2
    exit 1
  }
  ```

Open the browser at the served `url`; the reconciled pillar's tour is on its walkthrough tab. Starting `docent serve` is docent's own process — distinct from the app under review, which you never spawn; the no-spawn rule is about the app being reviewed, not about docent itself.

## Boundaries

- **You reconcile and dispatch; the reference files author.** The reference files own the file writes and the editorial judgment; the `docent walkthrough` / `docent capture` write path owns id minting and content-addressing. Never hand-author a walkthrough file to shortcut them.
- **A fresh `wlk_` per regenerated pillar — never edit in place.** Regeneration mints a new immutable walkthrough bound to the head; the prior one persists.
- **Walkthroughs and Comments are separate flows.** Reconciliation produces tours; the review → Comments loop is `--read` / `--write`.
- **Human-invoked only.** The tool never triggers regeneration — it only surfaces staleness. Regeneration happens exactly when the human runs `/docent`.
- **Serving the app under review is the human's workflow** — you consume it, never spawn it. Serving docent itself (§6) is different: that is docent's own process, which you may start in the background.
- **Commit / push are the human's workflow** — out of scope.

## Stop conditions

- **App not reachable at preflight (§1).** Hard stop early, before any authoring, with an actionable message. Nothing is reconciled. Re-run once the human has the dev server up.
- **The app drops mid-capture.** Capture hard-stops when the served app can't be reached — never a silent broken capture. Report which pillar could not reconcile and why; a reconciled code pillar (if any) still stands.
- **`docent serve` never comes up (§6).** The serve-boot poll is bounded; on timeout, hard stop with an actionable message rather than spinning forever. The pillars are already reconciled and on disk — re-run `/docent` once the server starts, or open the tour manually.
