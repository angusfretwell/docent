---
name: docent
description: Docent review companion for the branch under review. Use when the human asks to write, refresh, or update a branch's walkthroughs or bring a tour up to date with newer commits (`/docent`), pull or fetch docent review comments into the session (`/docent --read`), or write review outcomes back to docent (`/docent --write`).
---

# docent

The session-side companion to the `docent` tool — a docent gives the guided tour. It assumes only a git repository and the tool's `.docent/` state directory at the repo root (auto-created on first write). The `docent` CLI is reached through `npx @angusfretwell/docent@latest`, which self-bootstraps its per-platform binary on first run — no global install needed.

Dispatch on the invocation:

| Invocation | Branch |
| --- | --- |
| `/docent` (optionally a focus, or one kind of walkthrough) | **Write the walkthroughs** — the rest of this file. |
| `/docent --read [filters]` | **Pull Comments** into the session — take the capability gate below, then load [reference/comments.md](reference/comments.md), "Reading the queue". **Nothing else in this file applies.** |
| `/docent --write` | **Record outcomes** back to the Review — take the capability gate below, then load [reference/comments.md](reference/comments.md), "Writing outcomes". **Nothing else in this file applies.** |

**Capability gate.** Say one line first — what this invocation does and what lands at the end — so the bootstrap is not the run's silent opening. All three invocations shell out to the `docent` CLI, so confirm it can run at all:

```bash
npx -y @angusfretwell/docent@latest --version
```

On a non-zero exit the CLI could not bootstrap. Relay the command's own stderr — it is the authority on why (`unsupported platform: …`, `download failed (NNN): …`, or Node/npx missing) — wrapped in an actionable line, e.g. `` `npx @angusfretwell/docent@latest` couldn't run — <stderr>; ensure Node ≥18 and network access, then re-run /docent ``, and **hard-stop**. Nothing runs on a failed gate. It runs on every invocation.

## Narrate the run

You are the docent for the run itself, not only for the tour it produces. `/docent` is often a human's first contact with docent, and the run is long and largely autonomous — narrate it so a working agent reads as a working one.

**No `.docent/` at the repo root** — this human has never seen docent; read [reference/narration.md](reference/narration.md), "First run", before your first line to them.

- **Open** with **one line and nothing more** — what this invocation does and what lands at the end — e.g. "Writing the code and product walkthroughs for your head commit, then opening the tour in a browser." On a first run, narration.md's orientation follows that line.
- **Then narrate as a docent does** — the decision the moment you have it (§3), each expensive phase as you enter it (§4, §5, and above all capture, which launches Chrome and drives your served app), and the tour's table of contents at the close (§6). A subagent's work never scrolls past the human, so each announcement carries its phase on its own.

**Say it in their words, not this file's.** The names in here — capability gate, preflight, receipt, subagent, §4 — are how this file talks to _you_, and they mean nothing to a human who has never opened it. Narrate the outcome, never the step, and never a section number: "checking docent can run here" rather than "running the capability gate"; "reading what's on your branch" rather than naming the phase.

The rest of this file is the default branch: "type `/docent`, get a browser tab with the tour." The tool never writes a walkthrough on its own — the human running `/docent` is what starts one. For the code walkthrough and the product walkthrough alike, you read the head Change and the newest walkthrough of that kind, ask the one question in §3, and write a fresh one wherever the answer is no. Your job is that decision, the human contact around it, and the report at the end; four subagents own the work, each reading its own brief:

| Walkthrough | Written by |
| --- | --- |
| **Code** | one subagent: [reference/code-walkthrough.md](reference/code-walkthrough.md) — §4 |
| **Product** | three, in a line: [reference/capture-plan.md](reference/capture-plan.md) (choose the screens) → [reference/capture.md](reference/capture.md) (drive the app) → [reference/product-walkthrough.md](reference/product-walkthrough.md) (write the prose) — §4, §5 |

## 1. Preflight — settle how the app is served

The product walkthrough drives the served app, so settle how it is served here, while the human is still present. **This is the run's only contact with the human**: every question the run ever asks is step 1 below. The agent that drives the app cannot ask anything, so what you settle here is everything it will ever know about serving this app.

**Defined here, taken in §3** — all three steps run the moment §3's decision names the product walkthrough as one you are writing, before anything is dispatched. Where the human scoped the run to the **code walkthrough alone**, the preflight never runs at all.

Three steps, in the order §3 takes them:

1. **Source the setup** — existing codebase context (README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs), then **ask the human** (a single, one-time prompt) for whatever is left. You need the base URL / port and any login/seed steps. **The viewport is never one of the questions** — write the template's `1280 x 1280` unless the repo itself says otherwise (a mobile-first app, a viewport pinned in a test config).
2. **Author `.docent/capture.md`** from what you learned — follow [reference/serving.md](reference/serving.md), "Template" — so this run's capture, and every later run, goes unattended.
3. **The capture gate** — with the runbook's base URL in hand, establish that there is a browser to drive and that something answers on that URL. Serving the app is the human's job: either it is already up, or the runbook's start command brings it up in their session. An agent-launched server stays up and is reused by the capture in §5.

**A non-empty `.docent/capture.md` skips steps 1 and 2** — the runbook is the "we know how to drive the app" signal, so where it exists and is non-empty, read it and skip both the ask and the write — never step 3, which every capturing run takes because §5's executor is dispatched on its outcome.

**The exception is a runbook the human tells you is wrong** — a login that stopped working, a seed step that moved, whatever a previous run's closing report carried back as an obstacle. Then take steps 1 and 2 for what they name, and only that. Obstacles are never written to `.docent/`, so a runbook a capture found wrong is corrected here or not at all.

The base URL comes free — it is in the file steps 1–2 just read or wrote — so what is left is one call, which runs both checks and **opens no browser.**

```bash
sh <base>/scripts/capture-gate.sh "<base-url>"
#   → {"browser":"ok|missing","url":"up|down","detail":"…"}
```

`<base>` is this skill's absolute base directory — the directory this file was loaded from (§4). The JSON is the answer, not the exit code: a gate that did not pass still exits zero. What each field means, and how lenient `url` is: [reference/serving.md](reference/serving.md), "Reading the gate".

**Where it does not pass**, dispatch the code author now — §4's first row, on its own — and work the ladder in [reference/serving.md](reference/serving.md), "When the gate does not pass"; its rungs cost minutes and the code walkthrough has no stake in any of them.

**A gate that never passes drops the product walkthrough from this run's scope; it does not end the run.** Say so in §3's narration and carry on to §4 and §6. **Hard stop only where the product walkthrough was all the run had** — then say which check failed, or relay the gate's `detail`, and write nothing.

## 2. Read the head

Read the Change under review with plain `git`, straight from the local clone. The head is what every walkthrough is measured against:

```bash
git fetch
git rev-parse HEAD                     # the current head SHA — what every walkthrough is measured against
git log --oneline origin/HEAD..HEAD    # what this branch adds (fall back to origin/<default-branch> if origin/HEAD is unset)
```

**That `git fetch` is the run's only one.** Every subagent reads the clone as you leave it here — none of them fetches again, so two agents dispatched together (§4) never contend on the clone's refs.

- **Name the change.** Reading the head is also where you learn what this branch _is_, so record it as the Review's title — the headline the UI renders:

  ```bash
  npx -y @angusfretwell/docent@latest rename --title "Palette panel"
  ```

  Keep it **short** — a few words naming the change the way a PR title does, drawn from the branch's commits, not a summary of them. Re-set it on every run: the title tracks the head, and renaming keeps the Review's id.

- **Optional focus or scope.** The human may scope the run — a focus ("security") that steers each tour you write, or a single kind ("just the product walkthrough"). With no scope, cover **both**. Scope is what the preflight (§1) reads to decide whether the product walkthrough is in play. A focus is passed straight through to the authoring; it does not change the decision in §3.

## 3. Decide — is there a walkthrough for this head?

One command answers it for both kinds, against the newest walkthrough of each:

```bash
npx -y @angusfretwell/docent@latest walkthrough status
#   → { "head": "<sha>", "code": { "state": …, "changesBehind": N }, "product": { … } }
```

Each kind comes back in one of four states:

| State | What it means |
| --- | --- |
| `absent` | no walkthrough of that kind on this branch |
| `stale` | the newest one was written against an earlier commit, `changesBehind` Changes ago |
| `empty` | written against this head, but its `sections` never landed |
| `current` | written against this head, with narration in it |

**`current`, leave it alone; anything else, write one.** What differs between the states is only how you say it:

Say it in their words — "The code walkthrough was written 3 changes back, so I'm writing a fresh one; the product walkthrough is up to date and I'm leaving it." For a `stale` kind say `changesBehind` — it counts in **Changes**, the same unit the tour's own "N changes behind" badge counts, so the session and the screen say one number for one fact. Where §1's gate dropped the product walkthrough, say that too: the dev server not answering at `<url>`, or the gate's `detail` for a browser you could not get. Say nothing about a first run being missing or empty — a branch with no walkthrough yet is a clean start. Per-state phrasings: [reference/narration.md](reference/narration.md), "Saying the decision".

**Take the preflight (§1) before you speak**, wherever the answer names the product walkthrough as one you are writing. Its outcome is part of the decision: an app nothing answers on, or a machine with no browser, drops the product walkthrough from scope.

Say one clause before you take it — "checking your dev server is answering at `<url>`" — so the run's first touch of the app the human is serving is not a silent one.

**Say it before any of the work starts**, in one breath covering both kinds. Where a failed check sends you down §1's ladder, that one breath splits in two — the code walkthrough's half is said as its author goes out, and the product half follows when the ladder settles. Nothing is dispatched ahead of its own half; the human never learns from a receipt that a subagent was already running.

**Judged per kind**: a code walkthrough written against an earlier commit is rewritten while a product walkthrough already on the head is left alone — never rewrite one because the other fell behind, never skip one that did. Writing always produces a **new** walkthrough with a fresh `wlk_` id; the earlier one stays exactly as it was. Never edit an earlier walkthrough in place to bring it up to the head.

## 4. Dispatch the code author and the capture planner — together

§3 named the kinds you are writing. Whichever it named, their first agents go out here, in **one message**, in parallel — unless §1's ladder already sent the code author ahead of a slow gate, in which case only the planner is left to send and the two still overlap:

| Dispatch | Sent when | Brief |
| --- | --- | --- |
| **Code-walkthrough author** | there is no code walkthrough for this head | `reference/code-walkthrough.md` |
| **Capture planner** | there is no product walkthrough for this head **and** §3's capture gate passed | `reference/capture-plan.md` |

You write no walkthrough yourself and you read no diff — `git log` is the most you ever see of the change; the hunks belong to the code author, in its own context — and you never hand-author a walkthrough file to shortcut a brief.

**Every dispatch in this run — here and in §5 — is a general-purpose subagent whose prompt carries this and nothing else:**

- **Where the brief lives** — this skill's **absolute base directory** (`<base>`, §1): the path you loaded this file by, not your cwd. Pass the directory, not one file path, so each brief reaches the voice guide and its siblings; then name the one file under `reference/` to read and follow. **Never paste a brief into the prompt** — you pay for every token you inline.
- **Where the repository is** — its absolute root, so git and the CLI run against the branch under review.
- **The focus**, if the human gave one (§2), passed through in the human's own words.
- **This run's handoffs**, where §5 has them — a shot list, a walkthrough id, an intent brief. Those do travel in the prompt, because they were produced this run and written down nowhere else; a brief, which is on disk under the base directory, never does.

Two receipts come back:

- **The code author** reads the Change via git in its own context, selects and orders high-signal diff ranges, writes a fresh `walkthroughs/code/wlk_*/` bound to the head, and hands back the walkthrough id, its section titles in tour order, and any obstacle it hit. Hold it for §6 and do not paraphrase it on the way there.
- **The planner** hands back three things — a short intent brief, a shot list of states to reach (never click steps), and any obstacle it hit — and writes nothing at all. The brief and the shots are passed on **verbatim** in §5: the shots to the executor, the intent brief to the author. Its obstacles are held for §6 like the code author's, unparaphrased. The plan lives in your context until then and nowhere else; nothing about it is written to `.docent/`.

## 5. Write the product walkthrough — capture, then author

Skip this section where §3 left the product walkthrough out of scope — one already written for this head, or a capture gate that did not pass. Capture is the run's most expensive phase, which is exactly why it is separable.

Otherwise the shot list from §4 is driven, then narrated — two dispatches, in that order, because the executor creates the shell the author writes into.

**Say it before you dispatch the executor.** This is the phase that opens Chrome and drives the app the human is serving on their own machine, so it is announced rather than slipped in: name what is about to happen and how many screens it is walking. Minutes of silence while their browser moves on its own is the one place a working run reads as a runaway one.

1. **The executor** — `reference/capture.md`, plus the shot list verbatim. It walks the app to each state and registers the captures onto a new product `wlk_*/` shell whose `sections` stay empty, then hands back the shell's id, each capture's id and title, and any shot it could not reach. It proves the app renders itself, in its own session, before it captures anything ([reference/capture.md](reference/capture.md), "Reach the app") — the gate established that a server is up, not that the page is good.

   - **The cheapest capable model.** Dispatch it on the least expensive model your harness offers that can still follow a brief and drive a CLI — the work is mechanical and its token volume is the highest in the run. Where your dispatch surface offers no model choice, let it inherit and carry on.
   - **Exactly one executor, no fan-out.** One agent walks every shot — two racing one dev server capture a race rather than a product.

2. **The author** — `reference/product-walkthrough.md`, plus the walkthrough id from the executor's receipt and the planner's intent brief verbatim. It reads the captures, drops the sections (prose, `{{capture:i}}` interleave, pinned callouts), titles the shell through the CLI, and hands back its section titles in tour order plus any obstacle it hit — a capture of an error state it had to narrate around is the ordinary one. It touches no browser, and every write it makes goes through the `docent` CLI — so where your dispatch surface can withhold file writes, withhold them.

   **It gets no diff — not from you, not from git.** Passing "just the stat, for context" spends the phase; [reference/product-walkthrough.md](reference/product-walkthrough.md) carries why.

The result is one fresh product walkthrough for the head.

## 6. Serve and open — put the tour on screen

First **read each tour back as a table of contents** — its section titles, in tour order, so the human knows what the tour covers before they open it. Both sets of titles are on receipts — the code author's from §4, the product author's from §5 — so read them as they were written rather than summarising them. Then name what you left alone because it was already up to date, in the words of §3, and pass on every obstacle a receipt carried, in the words it carried them: something that made the tour less truthful, such as a state nothing could reach, or a screen that errored so its capture is of the error state. Only obstacles reach the human, and none of them reach `.docent/`. Ids stay out of it — the human reads the tour, not the file tree.

Then ensure a docent server is running for this repo and open the browser. `docent serve` renders `.docent/` live and re-renders each write over SSE, so a freshly written tour lands on screen the moment it exists.

```bash
sh <base>/scripts/serve-up.sh
#   → {"serving":true,"url":"http://127.0.0.1:…/"}; non-zero with an actionable message if it never comes up
```

It reuses a server already answering and never starts a second one. On a non-zero exit, hard stop and relay its message: the walkthroughs are already written and on disk.

Open the browser at the served `url`; the tour you just wrote is on its walkthrough tab. Starting `docent serve` is docent's own process — distinct from the app under review, which you never spawn. Committing and pushing stay the human's workflow, here as everywhere in this run.

## Stop conditions

Every phase can fail alone; a run that lands one tour beats a run that lands none, and you never do a subagent's work yourself to cover for it.

| What happened | What you do |
| --- | --- |
| **The capture gate never passes** (§1, taken in §3) | The product walkthrough leaves scope; the code author carries on alone and §6 still serves. Hard stop only where the run was scoped to the product walkthrough alone — then write nothing. |
| **The executor finds no app, or the app drops mid-capture** (§5) | Author over whatever captures came back; with none, report which walkthrough could not be written and why. |
| **The code author comes back with no receipt** (§4) | Say the code walkthrough was not written, and what came back instead. Carry on to §5. |
| **The planner comes back with no shot list** (§4) | Nothing for the executor to walk, so no product walkthrough this run. Say so and carry on to §6. |
| **The executor lands no captures** (§5) | Do not dispatch the author. Report the screens it could not reach, in the executor's own words; §3 reads the shell it left as `empty`, so the next run drives afresh. |
| **The product author comes back with no receipt** (§5) | Say the tour has its screens but no narration, and that re-running `/docent` writes a fresh one. Never narrate it yourself, and never append onto that shell later. |
