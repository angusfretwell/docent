---
name: docent
description: Docent review companion for the branch under review. `/docent` writes the code and product walkthroughs for the head commit and serves the tour; `/docent --read` pulls the Review's Comments into the session to work on; `/docent --write` records the session's review outcomes back to the Review. Use when the human asks to write, refresh, or update walkthroughs, bring a tour up to date with newer commits, pull or fetch docent review comments, or write review outcomes back to docent.
---

# docent

The session-side companion to the `docent` tool — a docent gives the guided tour. It assumes only a git repository and the tool's `.docent/` state directory at the repo root (auto-created on first write). The `docent` CLI is reached through `npx @angusfretwell/docent@latest`, which self-bootstraps its per-platform binary on first run — no global install needed.

Dispatch on the invocation:

| Invocation | Branch |
| --- | --- |
| `/docent` (optionally a focus, or one kind of walkthrough) | **Write the walkthroughs** — this file, §1–§6. |
| `/docent --read [filters]` | **Pull Comments** into the session — load [reference/comments.md](reference/comments.md), "Reading the queue". |
| `/docent --write` | **Record outcomes** back to the Review — load [reference/comments.md](reference/comments.md), "Writing outcomes". |

## Signpost the run

You are the docent for the run itself, not only for the tour it produces. `/docent` is often a human's first contact with docent, and the run is long and largely autonomous — narrate it so a working agent reads as a working one.

- **Open**, before the capability gate below, with one line naming what this invocation does and what lands at the end — e.g. "Writing the code and product walkthroughs for your head commit, then opening the tour in a browser."
- **Announce each expensive phase as you enter it** — writing a walkthrough (§4, §5), and above all capture (§5), which launches Chrome and drives your served app.
- **Close** with what you wrote and what you left alone (§6).

**First run — orient before you ask.** No `.docent/` directory at the repo root means this human has never seen docent, so before anything long-running — and ahead of the preflight's one-time setup prompt (§1) where there is one — spend a short paragraph on what they are about to get: two walkthroughs of this branch — a **code** tour through the diff and a **product** tour through the running app — served as a browser tour a reviewer walks. Say that the product tour drives the app the way a user would and leaves it untouched, and that the setup you are about to ask for is recorded to `.docent/capture.md`, so it is asked once and later runs go unattended. Then ask.

**Capability gate — run this before any branch.** All three invocations shell out to the `docent` CLI, so first confirm the CLI can run at all:

```bash
npx -y @angusfretwell/docent@latest --version
```

On a non-zero exit the CLI could not bootstrap. Relay the command's own stderr — it is the authority on why (`unsupported platform: …`, `download failed (NNN): …`, or Node/npx missing) — wrapped in an actionable line, e.g. `` `npx @angusfretwell/docent@latest` couldn't run — <stderr>; ensure Node ≥18 and network access, then re-run /docent ``, and **hard-stop**. Nothing runs on a failed gate. The check is stateless — it runs every invocation, because machine capability can regress (evicted cache, Node change) and a cached "passed" would skip a check that should now fail — and cheap once the binary is cached; the `-y` also warms that cache up front, where the human is watching, rather than mid-capture.

The rest of this file is the default branch: "type `/docent`, get a browser tab with the tour." The tool never writes a walkthrough on its own — the human running `/docent` is what starts one. For the code walkthrough and the product walkthrough alike, you read the head Change and the newest walkthrough of that kind, ask the one question in §3, and write a fresh one wherever the answer is no. Your job is that decision; the reference files own the authoring:

| Walkthrough | Written by following |
| --- | --- |
| **Code** | [reference/code-walkthrough.md](reference/code-walkthrough.md) |
| **Product** | [reference/capture.md](reference/capture.md) (drive the app again, wholesale) → [reference/product-walkthrough.md](reference/product-walkthrough.md) |

## 1. Preflight — make sure you can drive the app

The product walkthrough drives the served app in a browser, so before any authoring, front-load the one human-in-the-loop moment — establishing that the app can be driven — to the start of the run, where the human is present, rather than stalling mid-capture. Run the preflight whenever the product walkthrough is in scope (the default); skip it only when the human scoped the run to the **code walkthrough alone** (code has no capture phase, so it needs no app).

**A non-empty `.docent/capture.md` short-circuits the preflight** — the runbook is the "we know how to drive the app" signal. If it exists and is non-empty, proceed straight to §2 without re-asking. This is the cheap, common case.

Otherwise establish drivability now:

1. **Source the setup** — existing codebase context (README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs), then **ask the human** (a single, one-time prompt) for whatever is left. You need the base URL / port, the viewport default, and any login/seed steps.
2. **Verify the app actually renders** — reach the served app and confirm **real DOM**, not a connection-refused or error page. Serving the app is the human's job: either it is already up, or the human gives you the command and you run it in their session. An agent-launched server stays up and is reused by the capture in §5.
3. **Author `.docent/capture.md`** from what you learned — follow [reference/runbook-template.md](reference/runbook-template.md) — so this run's capture, and every later run, goes AFK.

**If the app cannot be reached → hard stop, early**, with an actionable message (e.g. `app not reachable at <url> — is your dev server up?`), before any expensive authoring. Nothing is written on a failed preflight.

## 2. Read the head

Read the Change under review with plain `git`, straight from the local clone. The head is what every walkthrough is measured against:

```bash
git fetch
git rev-parse HEAD                     # the current head SHA — what every walkthrough is measured against
git log --oneline origin/HEAD..HEAD    # what this branch adds (fall back to origin/<default-branch> if origin/HEAD is unset)
```

- **Name the change.** Reading the head is also where you learn what this branch _is_, so record it as the Review's title — the headline the UI renders:

  ```bash
  npx -y @angusfretwell/docent@latest rename --title "Palette panel"
  ```

  Keep it **short** — a few words naming the change the way a PR title does, drawn from the branch's commits, not a summary of them. Re-set it on every run: the title tracks the head, and renaming keeps the Review's id.

- **Optional focus or scope.** The human may scope the run — a focus ("security") that steers each tour you write, or a single kind ("just the product walkthrough"). With no scope, cover **both**. Scope is what the preflight (§1) reads to decide whether the product walkthrough is in play. A focus is passed straight through to the authoring; it does not change the decision in §3.

## 3. Decide — is there a walkthrough for this head?

The Review for the current branch holds both kinds of walkthrough under:

```
.docent/reviews/<branch-slug>/
  changes/                       # the append-only Change log — chg_NNN.json, each with a frozen headSha
  walkthroughs/
    code/    wlk_<ulid>/manifest.json
    product/ wlk_<ulid>/manifest.json
```

`<branch-slug>` is the current branch name with slashes → dashes; glob it if unsure. Ask the question once per kind:

1. **Find the newest walkthrough** — the greatest `wlk_` ULID (ULIDs sort lexicographically by creation time):

   ```bash
   ls -d .docent/reviews/<branch-slug>/walkthroughs/code/wlk_*/ 2>/dev/null | sort | tail -1
   ```

   Nothing back → there is no walkthrough for this head; the rest of this section has nothing to read, so go straight to §4/§5.

2. **Read its `bornChangeId`** from that walkthrough's `manifest.json`, and resolve the Change it names to a head SHA:

   ```bash
   cat .docent/reviews/<branch-slug>/walkthroughs/code/wlk_<ulid>/manifest.json   # → bornChangeId
   cat .docent/reviews/<branch-slug>/changes/<bornChangeId>.json                  # → headSha
   ```

3. **Compare that `headSha` to the current head.** Equal → there is a walkthrough for this head. No walkthrough at all, or one written against an earlier commit → there is not.

**Yes, leave it alone; no, write one.** That is the whole decision, and there is no second filter: write every kind whose answer is no. What differs between the answers is only how you say it, and the reason belongs in the narration, not in the decision:

| What you found | What you say |
| --- | --- |
| Nothing on this branch yet | "Writing the code and product walkthroughs for this branch." |
| Written against an earlier commit | "The code walkthrough was written 3 changes back — writing a fresh one." |
| Written against this head | "The product walkthrough is up to date — leaving it." |

For the earlier-commit row, count the gap rather than making the human infer it — in **Changes**, the same unit the tour's own "N changes behind" badge counts, so the session and the screen say one number for one fact. The Changes are already on disk beside the walkthrough; count the ones recorded after its `bornChangeId`:

```bash
ls .docent/reviews/<branch-slug>/changes/ | awk -v born='<born-change-id>.json' '$0 > born' | wc -l
```

Say nothing about a first run being missing or empty — a branch with no walkthrough yet is simply a clean start.

**Judged per kind**: a code walkthrough written against an earlier commit is rewritten while a product walkthrough already on the head is left alone — never rewrite one because the other fell behind, never skip one that did. Writing always produces a **new** walkthrough with a fresh `wlk_` id; the earlier one stays exactly as it was. Never edit an earlier walkthrough in place to bring it up to the head.

## 4. Write the code walkthrough

If there is no code walkthrough for this head, follow [reference/code-walkthrough.md](reference/code-walkthrough.md) with any focus the human gave. It reads the Change via git, selects and orders high-signal diff ranges, and writes a fresh `walkthroughs/code/wlk_*/` bound to the head. Code has no capture phase, so this single reference is the whole code walkthrough.

If there is already one for this head, skip it.

## 5. Write the product walkthrough

If there is no product walkthrough for this head, run the two product halves **in order** — capture first (it creates the shell), then author into it:

1. **[reference/capture.md](reference/capture.md)** — drive capture **wholesale**: walk the served app fresh and write a new product `wlk_*/` shell with its `captures[]` populated and `sections` empty. Individual earlier captures are not reused, but content-addressing dedups byte-identical screens for free — an unchanged screen hashes to the same blob, so re-capturing costs nothing on disk. Capture consumes the app the preflight (§1) already reached, and runs AFK against the `.docent/capture.md` the preflight recorded.
2. **[reference/product-walkthrough.md](reference/product-walkthrough.md)** — the editorial half. It reads the captures-only shell just written, drops the sections (prose, `{{capture:i}}` interleave, pinned callouts), then sets the shell's title. It touches no browser.

The result is one fresh product walkthrough for the head. If there is already one for this head, skip both — capture is expensive and deliberately separable.

## 6. Serve and open — put the tour on screen

First **report where things stand**, in the words of §3: which walkthroughs you wrote and why, and which you left alone because they were already up to date. Ids stay out of it — the human reads the tour, not the file tree.

Then ensure a docent server is running for this repo and open the browser. `docent serve` renders `.docent/` live and re-renders each write over SSE, so a freshly written tour lands on screen the moment it exists. Check first, reuse if you can:

```bash
npx -y @angusfretwell/docent@latest status          # → { "serving": true, "url": "http://127.0.0.1:…/" }  or  { "serving": false }
```

- **Already serving** → reuse it; open its `url`. Never start a second server.
- **Not serving** → start one in the background (it runs until the human stops it), poll until it answers, then open the browser. **Bound the poll** — on timeout hard stop with an actionable message:

  ```bash
  npx -y @angusfretwell/docent@latest serve >/dev/null 2>&1 &   # backgrounded; leave it running
  for _ in $(seq 50); do           # `docent serve` records its address on boot; poll it, bounded (~10s)
    npx -y @angusfretwell/docent@latest status | grep -q '"serving": true' && break
    sleep 0.2
  done
  npx -y @angusfretwell/docent@latest status | grep -q '"serving": true' || {
    echo "docent serve did not come up within ~10s — run 'npx -y @angusfretwell/docent@latest serve' in this repo to see the boot error, then re-run /docent" >&2
    exit 1
  }
  ```

Open the browser at the served `url`; the tour you just wrote is on its walkthrough tab. Starting `docent serve` is docent's own process — distinct from the app under review, which you never spawn; the no-spawn rule is about the app being reviewed, not about docent itself.

## Boundaries

- **You decide and dispatch; the reference files author.** The reference files own the file writes and the editorial judgment; the `docent walkthrough` / `docent capture` write path owns ids and content-addressing. Never hand-author a walkthrough file to shortcut them.
- **A fresh `wlk_` every time — never edit one in place.** Writing produces a new immutable walkthrough bound to the head; the earlier one stays as it was.
- **Walkthroughs and Comments are separate flows.** This flow produces tours; the review → Comments loop is `--read` / `--write`.
- **Human-invoked only.** The tool never writes a walkthrough on its own — it only shows how far behind the newest one is. A walkthrough is written exactly when the human runs `/docent`.
- **Serving the app under review is the human's workflow** — you consume it, never spawn it. Serving docent itself (§6) is different: that is docent's own process, which you may start in the background.
- **Commit / push are the human's workflow** — out of scope.

## Stop conditions

- **App not reachable at preflight (§1).** Hard stop early, before any authoring, with an actionable message. Nothing is written. Re-run once the human has the dev server up.
- **The app drops mid-capture.** Capture hard-stops when the served app can't be reached — never a silent broken capture. Report which walkthrough could not be written and why; a code walkthrough written this run still stands.
- **`docent serve` never comes up (§6).** The serve-boot poll is bounded; on timeout, hard stop with an actionable message rather than spinning forever. The walkthroughs are already written and on disk — re-run `/docent` once the server starts, or open the tour manually.
