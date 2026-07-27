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
- **Say the decision the moment you have it** (§3) — which walkthroughs you are writing, which you are leaving alone, and any this run cannot capture for — before any of the work starts, never held back for the close.
- **Announce each expensive phase as you enter it** — writing a walkthrough (§4, §5), and above all capture (§5), which launches Chrome and drives your served app.
- **Close** with the tour's table of contents and what you left alone (§6).

**Say it in their words, not this file's.** The names in here — capability gate, preflight, head read, receipt, subagent, §4 — are how this file talks to _you_, and they mean nothing to a human who has never opened it. Narrate the outcome, never the step: "checking docent can run here" rather than "running the capability gate"; "reading what's on your branch" rather than "the head read". Never number a section at them, and never open by listing the steps you are about to walk — a plan of internal phases is the one opening that tells them nothing about what they are getting.

Every piece of the work runs in a subagent (§4, §5), and a subagent's work does not scroll past the human — no tool calls, no half-written prose, nothing at all until it returns. Between your announcement and its receipt there is silence, so the announcement has to carry the phase on its own.

**First run — orient before you ask.** No `.docent/` directory at the repo root means this human has never seen docent. Open by naming that, and by naming the checking as checking — "Looks like this is docent's first run here, so let me make sure I've got what I need" — which is both what is true and what buys the pause the checks below take. Then, before anything long-running — and ahead of the preflight's one-time setup prompt (§1) where there is one — spend a short paragraph on what they are about to get: two walkthroughs of this branch — a **code** tour through the diff and a **product** tour through the running app — served as a browser tour a reviewer walks. Say that the product tour drives the app the way a user would and leaves it untouched, and that the setup you are about to ask for is recorded to `.docent/capture.md`, so it is asked once and later runs go unattended unless something about serving the app changes. Then ask.

**Capability gate — run this before any branch.** All three invocations shell out to the `docent` CLI, so first confirm the CLI can run at all:

```bash
npx -y @angusfretwell/docent@latest --version
```

On a non-zero exit the CLI could not bootstrap. Relay the command's own stderr — it is the authority on why (`unsupported platform: …`, `download failed (NNN): …`, or Node/npx missing) — wrapped in an actionable line, e.g. `` `npx @angusfretwell/docent@latest` couldn't run — <stderr>; ensure Node ≥18 and network access, then re-run /docent ``, and **hard-stop**. Nothing runs on a failed gate. The check is stateless — it runs every invocation, because machine capability can regress (evicted cache, Node change) and a cached "passed" would skip a check that should now fail — and cheap once the binary is cached; the `-y` also warms that cache up front, where the human is watching, rather than mid-capture.

The rest of this file is the default branch: "type `/docent`, get a browser tab with the tour." The tool never writes a walkthrough on its own — the human running `/docent` is what starts one. For the code walkthrough and the product walkthrough alike, you read the head Change and the newest walkthrough of that kind, ask the one question in §3, and write a fresh one wherever the answer is no. Your job is that decision, the human contact around it, and the report at the end; four subagents own the work, each reading its own brief:

| Walkthrough | Written by |
| --- | --- |
| **Code** | one subagent: [reference/code-walkthrough.md](reference/code-walkthrough.md) — §4 |
| **Product** | three, in a line: [reference/capture-plan.md](reference/capture-plan.md) (choose the screens) → [reference/capture.md](reference/capture.md) (drive the app) → [reference/product-walkthrough.md](reference/product-walkthrough.md) (write the prose) — §4, §5 |

## 1. Preflight — settle how the app is served

The product walkthrough drives the served app in a browser, so before any authoring, front-load the one human-in-the-loop moment — settling how this app is served — to where the human is still present, rather than stalling mid-capture. This is the run's **only** contact with the human: every question the run ever asks is step 1 below, including the one the ladder at the end of this section falls back to. The agent that drives the app cannot ask anything, so what you settle here is everything it will ever know about serving this app.

**Defined here, taken in §3.** All three steps run at one point — the moment §3's decision names the product walkthrough as one you are writing, and while nothing has been dispatched yet. A product walkthrough already on this head means §5 never opens a browser, so a run with nothing to capture has no business demanding a dev server, a runbook, or a Chrome; and a run that will capture learns it cannot before the code walkthrough or the plan has been paid for. Where the human scoped the run to the **code walkthrough alone**, the preflight never runs at all — code has no capture phase, so it needs no app.

Three steps, in the order §3 takes them:

1. **Source the setup** — existing codebase context (README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs), then **ask the human** (a single, one-time prompt) for whatever is left. You need the base URL / port and any login/seed steps. **The viewport is not one of the questions** — write the template's `1280 x 1280` and move on. It is the one field nothing in the repo answers, so asking it always lands on the human, and it is also the one they have no stake in: a shot needing a different frame overrides it per-capture anyway. Ask only where the repo itself says otherwise — a mobile-first app, a viewport pinned in a test config.
2. **Author `.docent/capture.md`** from what you learned — follow [reference/runbook-template.md](reference/runbook-template.md) — so this run's capture, and every later run, goes unattended.
3. **The capture gate** — with the runbook's base URL in hand, establish that there is a browser to drive and that something answers on that URL. Serving the app is the human's job: either it is already up, or the runbook's start command brings it up in their session. An agent-launched server stays up and is reused by the capture in §5.

**A non-empty `.docent/capture.md` skips steps 1 and 2** — the runbook is the "we know how to drive the app" signal, so where it exists and is non-empty, read it and skip both the ask and the write. That is the cheap, common case, and it is what makes later runs unattended.

**The exception is a runbook the human tells you is wrong** — a login that stopped working, a seed step that moved, whatever a previous run's closing report carried back as an obstacle. Then take steps 1 and 2 for what they name, and only that. Obstacles are never written to `.docent/`, so a runbook a capture found wrong is corrected here or not at all.

**The gate runs on every run that is going to capture**, not only the first: §5's executor is dispatched on the strength of it, so the runbook being already on disk excuses steps 1 and 2 but never this one.

The base URL comes free — it is in the file steps 1–2 just read or wrote — so what is left is one call, which runs both checks and **opens no browser.** Driving the app is §5's executor's job, in a session of its own; all you establish here is that there is something for it to drive.

```bash
sh <base>/scripts/capture-gate.sh "<base-url>"
#   → {"browser":"ok|missing","url":"up|down","detail":"…"}
```

`<base>` is this skill's absolute base directory — the directory this file was loaded from, the same one every subagent is passed (§4).

- **The JSON is the answer, not the exit code.** A gate that did not pass still exits zero: which of the two checks failed is what picks the rung below, so it has to be read rather than branched on.
- **`detail` is why each failing check failed**, written to be read aloud — it is what §3's narration table relays for a browser it could not get.
- **`url: up` is deliberately lenient: any HTTP status counts.** A 404 or a 500 still means a server answered, and only a refused connection is not-up. Whether the app is any good is §5's to establish, not yours.
- **A missing Chrome fails the browser check rather than triggering a download here.** Installing one is minutes of silence, and the ladder below is where the slow rungs belong.

**Whether the app renders is not settled here, and it is not yours to settle.** A client-rendered app answers with an empty shell, so proving real DOM needs the browser you deliberately do not have. §5's executor opens the base URL and reads the page back before it captures anything ([reference/capture.md](reference/capture.md), "Reach the app") — a server that answers but serves an error page is caught there, once, by the agent already holding a browser.

**Where the gate does not pass, send the code author out before you work the ladder.** Both checks are bounded and quick, but the rungs below are not: starting a dev server, asking the human what changed, or downloading a Chrome each cost minutes, and the code walkthrough has no stake in any of them. Where the run is writing one, dispatch it now — §4's first row, on its own — and work the ladder while it runs. The planner still waits for the outcome, so nothing is spent on a shot list a failed gate would strand.

Then **work up from the cheapest cause** — the ordinary one is a dev server that is simply not running, with the runbook telling the truth:

- **First, start what the runbook says to start.** Where it records a **Start command**, run it in the human's session and take the gate again. Its poll is what makes this rung work: a server told to start a second ago is usually still booting, and re-checking it once, immediately, reads a refused connection as an app that is down.
- **Then ask.** Where there is no start command, or the app is still not there, ask the human what changed (step 1) — and rewrite `.docent/capture.md` (step 2) **only where what they say differs from what it records**. Then check again. The preflight is the only place a wrong runbook can be corrected: a capture reports one as an obstacle and carries on, so unless a preflight rewrites it the same obstacle rides back on every run forever.
- **A base URL the human confirms is still right with nothing answering on it is a dev server that is down.** Say that, and leave the runbook alone — overwriting a correct file loses a working setup.
- **A missing browser has its own rung, and the runbook is not on it.** `browser: missing` is about this machine, so `install` is the answer and `install` is agent-browser's documented setup step. Say you are running it — it is slow and silent — then take the gate again, and only where that fails relay its `detail` and go on. Never rewrite the runbook over a browser problem.

  ```bash
  npx -y agent-browser@latest install
  ```

**A gate that never passes drops the product walkthrough from this run's scope; it does not end the run.** Say so in §3's narration, then carry on to §4 and §6 — the code walkthrough has no stake in the app or the browser, and a run that lands one tour beats a run that lands none. **Hard stop only where the product walkthrough was all the run had**: the human scoped it to that alone, so there is nothing else to land. Then say which check failed — `app not reachable at <url> — is your dev server up?`, or the gate's `detail` — and write nothing.

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

`empty` is a run that stopped before its prose landed (see Stop conditions), and a shell with no narration is not a tour — that state is what makes re-running `/docent` fill it.

**`current`, leave it alone; anything else, write one.** That is the whole decision, and there is no second filter: write every kind whose state is not `current`. What differs between the states is only how you say it, and the reason belongs in the narration, not in the decision:

| What came back | What you say |
| --- | --- |
| Both `absent` | "Writing the code and product walkthroughs for this branch." |
| `code` is `stale` | "The code walkthrough was written N changes back — writing a fresh one." |
| `product` is `current` | "The product walkthrough is up to date — leaving it." |
| `product` is `empty` | "The product walkthrough has its screens but no narration — writing a fresh one." |
| `code` is `empty` | "The code walkthrough was started but its sections never landed — writing a fresh one." |
| The app is not reachable, so the product walkthrough leaves scope (§1) | "Your dev server isn't answering at `<url>`, so this run writes the code walkthrough only." |
| No browser and none installable, so the product walkthrough leaves scope (§1) | "I couldn't get a browser for the product tour to drive — `<the gate's detail>` — so this run writes the code walkthrough only." |

For a `stale` row, say `changesBehind` rather than making the human infer the gap — it counts in **Changes**, the same unit the tour's own "N changes behind" badge counts, so the session and the screen say one number for one fact.

Say nothing about a first run being missing or empty — a branch with no walkthrough yet is simply a clean start.

**Take the preflight before you speak.** Where the answer names the product walkthrough as one you are writing, this is where all three of §1's steps run — the last moment before §4 spends anything on a run that cannot capture, and work worth nothing where §5 is already going to be skipped. Its outcome is part of the decision: an app nothing answers on, or a machine with no browser, drops the product walkthrough from scope, which is the last two rows of the table.

Say one clause before you take it — "checking your dev server is answering at `<url>`" — so the run's first touch of the app the human is serving is not a silent one. It is a `curl` and a `doctor` probe, not a browser: the announcement that matters, ahead of Chrome opening on their machine, is still §5's.

**Say it before any of the work starts**, in one breath covering both kinds. It is the human's only signal that the run is under way: §4's agents work out of sight and say nothing until they return, and §5 can drive a browser for minutes before there is a tour to show. Where a failed check sends you down §1's ladder, that one breath splits in two — the code walkthrough's half is said as its author goes out, and the product half follows when the ladder settles. Nothing is dispatched ahead of its own half; the human never learns from a receipt that a subagent was already running.

**Judged per kind**: a code walkthrough written against an earlier commit is rewritten while a product walkthrough already on the head is left alone — never rewrite one because the other fell behind, never skip one that did. Writing always produces a **new** walkthrough with a fresh `wlk_` id; the earlier one stays exactly as it was. Never edit an earlier walkthrough in place to bring it up to the head.

## 4. Dispatch the code author and the capture planner — together

§3 named the kinds you are writing. Whichever it named, their first agents go out here, in **one message**, in parallel — unless §1's ladder already sent the code author ahead of a slow gate, in which case only the planner is left to send and the two still overlap:

| Dispatch | Sent when | Brief |
| --- | --- | --- |
| **Code-walkthrough author** | there is no code walkthrough for this head | `reference/code-walkthrough.md` |
| **Capture planner** | there is no product walkthrough for this head **and** §3's capture gate passed | `reference/capture-plan.md` |

They run concurrently because each needs only the change and nothing from the other — at different depths, the author the hunks and the planner the file names — and because neither can collide with the other's writes: the Change is recorded once for one base-and-head pair however many agents ask for it, walkthrough ids are ULIDs, and the clone's refs are nobody's to touch — §2's `git fetch` is the run's only one. Sequencing them would put the human's whole wait on one queue and buy nothing.

You write no walkthrough yourself and you read no diff: the hunks are the one artifact that must stay out of your context, because everything left in this file — the decision, the announcements, the report, the browser at the end — is work you cannot do well from a context spent on someone else's diff.

**Every dispatch in this run — here and in §5 — is a general-purpose subagent whose prompt carries this and nothing else:**

- **Where the brief lives** — this skill's own **absolute base directory**: the directory this `SKILL.md` was loaded from, which you take from the path you loaded it by. It is not your cwd — that is the repository under review — and the skill can sit in a plugin directory, `~/.claude/skills/`, or a checkout, so anything relative resolves against the wrong place. Pass the directory, not one file path: each brief reaches the shared voice guide and its siblings through it. Then name the one file under `reference/` to read and follow. **Never paste a brief into the prompt**: inlining it means you pay for every token of it too, which is the cost this split exists to remove.
- **Where the repository is** — its absolute root, so git and the CLI run against the branch under review.
- **The focus**, if the human gave one (§2), passed through in the human's own words.
- **This run's handoffs**, where §5 has them — a shot list, a walkthrough id, an intent brief. Those do travel in the prompt, because they were produced this run and written down nowhere else; a brief, which is on disk under the base directory, never does.

Two receipts come back:

- **The code author** reads the Change via git in its own context, selects and orders high-signal diff ranges, writes a fresh `walkthroughs/code/wlk_*/` bound to the head, and hands back the walkthrough id, its section titles in tour order, and any obstacle it hit. Hold it for §6 and do not paraphrase it on the way there.
- **The planner** hands back three things — a short intent brief, a shot list of states to reach (never click steps), and any obstacle it hit — and writes nothing at all. The brief and the shots are passed on **verbatim** in §5: the shots to the executor, the intent brief to the author. They are short by design, and a paraphrase is how the run loses the one thing they carry. Its obstacles are held for §6 like the code author's, unparaphrased. The plan lives in your context until then and nowhere else; nothing about it is written to `.docent/`.

## 5. Write the product walkthrough — capture, then author

Skip this section where §3 left the product walkthrough out of scope — one already written for this head, or a capture gate that did not pass. Capture is the run's most expensive phase, which is exactly why it is separable.

Otherwise the shot list from §4 is driven, then narrated — two dispatches, in that order, because the executor creates the shell the author writes into.

**Say it before you dispatch the executor.** This is the phase that opens Chrome and drives the app the human is serving on their own machine, so it is announced rather than slipped in: name what is about to happen and how many screens it is walking. Minutes of silence while their browser moves on its own is the one place a working run reads as a runaway one.

1. **The executor** — `reference/capture.md`, plus the shot list verbatim. It walks the app to each state and registers the captures onto a new product `wlk_*/` shell whose `sections` stay empty, then hands back the shell's id, each capture's id and title, and any shot it could not reach. It consumes the app §3's gate found answering and runs against the `.docent/capture.md` the preflight (§1) left in place, so there is nothing here for the human to answer. It proves the app actually renders itself, in its own session, before it captures anything — the gate established that a server is up, not that the page is good.

   - **The cheapest capable model.** Dispatch it on the least expensive model your harness offers that can still follow a brief and drive a CLI — the work is mechanical and its token volume is the highest in the run, so this is the one phase where the model choice pays for itself. Choose by capability and never by naming a model: names date faster than anything else in this file. Where your dispatch surface offers no model choice, let it inherit and carry on — the phase still works, it just costs more.
   - **Exactly one executor, no fan-out.** One agent walks every shot. Browser sessions are isolated but the app's backend is not, so two executors racing one dev server capture a race rather than a product — and each would re-pay the login and seeding. It takes a browser session of its own, named for this worktree, so it cannot land in the human's other browser work or in a run driving another worktree.
   - Individual earlier captures are not reused, but content-addressing dedups byte-identical screens for free — an unchanged screen hashes to the same blob, so re-capturing costs nothing on disk.

2. **The author** — `reference/product-walkthrough.md`, plus the walkthrough id from the executor's receipt and the planner's intent brief verbatim. It reads the captures, drops the sections (prose, `{{capture:i}}` interleave, pinned callouts), titles the shell through the CLI, and hands back its section titles in tour order plus any obstacle it hit — a capture of an error state it had to narrate around is the ordinary one. It touches no browser, and every write it makes goes through the `docent` CLI — so where your dispatch surface can withhold file writes, withhold them.

   **It gets no diff — not from you, not from git.** The captures plus two or three sentences of intent are the whole input, and that is the design: the prose comes out product-shaped, and the material that turns an author into a reviewer never reaches it. Passing "just the stat, for context" spends the phase.

The result is one fresh product walkthrough for the head.

## 6. Serve and open — put the tour on screen

First **read each tour back as a table of contents** — its section titles, in tour order, so the human knows what the tour covers before they open it. A count is not a table of contents: "wrote 5 sections" tells them nothing they can act on, and it is the one thing they could have guessed. Both sets of titles are on receipts — the code author's from §4, the product author's from §5 — so read them as they were written rather than summarising them. Then name what you left alone because it was already up to date, in the words of §3, and pass on every obstacle a receipt carried: something that made the tour less truthful, such as a state nothing could reach, or a screen that errored so its capture is of the error state. Ids stay out of it — the human reads the tour, not the file tree.

Then ensure a docent server is running for this repo and open the browser. `docent serve` renders `.docent/` live and re-renders each write over SSE, so a freshly written tour lands on screen the moment it exists. Check first, reuse if you can:

```bash
npx -y @angusfretwell/docent@latest status   # → { "serving": true, "url": "http://127.0.0.1:…/" }; non-zero when nothing is serving
```

- **Already serving** → reuse it; open its `url`. Never start a second server.
- **Not serving** → start one in the background (it runs until the human stops it), poll until it answers, then open the browser. **Bound the poll** — on timeout hard stop with an actionable message:

  ```bash
  npx -y @angusfretwell/docent@latest serve >/dev/null 2>&1 &   # backgrounded; leave it running
  attempt=0
  until npx -y @angusfretwell/docent@latest status >/dev/null 2>&1 || [ "$attempt" -ge 50 ]; do
    attempt=$((attempt + 1))       # `docent serve` records its address on boot; poll for it, bounded (~10s)
    sleep 0.2
  done
  npx -y @angusfretwell/docent@latest status || {
    echo "docent serve did not come up within ~10s — run 'npx -y @angusfretwell/docent@latest serve' in this repo to see the boot error, then re-run /docent" >&2
    exit 1
  }
  ```

  The last `status` is both the timeout check and where the `url` to open comes from.

Open the browser at the served `url`; the tour you just wrote is on its walkthrough tab. Starting `docent serve` is docent's own process — distinct from the app under review, which you never spawn; the no-spawn rule is about the app being reviewed, not about docent itself.

## Boundaries

- **You decide and dispatch; the subagents author.** Their briefs own the file writes and the editorial judgment; the `docent walkthrough` / `docent capture` write path owns ids and content-addressing. Never hand-author a walkthrough file to shortcut them.
- **Never read the diff.** `git log` is the most you ever see of the change; the hunks belong to §4's code author, in its own context. A `git diff` in this session puts the run's largest cost back in the one place the split took it out of, and an agent holding the whole diff starts grading the change instead of running the tour.
- **A subagent reads its own brief.** You pass this skill's base directory, a repository root, and this run's handoffs — never a brief's text and never the diff. A subagent has no human, so nothing that needs asking is ever inside one: every question for the human is settled in the preflight (§1), where the human is still there.
- **The shot list is ephemeral.** It exists on the planner's receipt and in the executor's prompt, and then it is gone. Nothing writes it to `.docent/`, and a later run plans afresh.
- **Opinions about the code are not part of a tour.** What an author noticed about the change stays with the author. Only obstacles — things that made the tour less truthful — reach the human, through your closing report (§6), and none of them reach `.docent/`.
- **A fresh `wlk_` every time — never edit one in place.** Writing produces a new immutable walkthrough bound to the head; the earlier one stays as it was.
- **Walkthroughs and Comments are separate flows.** This flow produces tours; the review → Comments loop is `--read` / `--write`.
- **Human-invoked only.** The tool never writes a walkthrough on its own — it only shows how far behind the newest one is. A walkthrough is written exactly when the human runs `/docent`.
- **Serving the app under review is the human's workflow** — you consume it. The one exception is the rung §1's ladder stands on: where the runbook records a **Start command** and nothing is answering, you run that command, in the human's session, and the server it brings up stays up for §5. What you never do is improvise one — a start command you inferred, a port you picked, a second server beside the one already running. Serving docent itself (§6) is different again: that is docent's own process, which you may start in the background.
- **Commit / push are the human's workflow** — out of scope.

## Stop conditions

- **The capture gate does not pass (§1, taken in §3)** — nothing answering on the base URL, or no browser to drive. Not a stop where anything else is still in play: the product walkthrough leaves the run's scope, §4's code author carries on alone, and §6 still serves and opens the tour. Hard stop only where the human scoped the run to the product walkthrough alone — then nothing is written, and they re-run once the dev server is up or the browser is installed.
- **The app answers the gate but the executor finds no app (§5).** The gate is deliberately lenient — any HTTP status counts — so a server serving an error page reaches the executor's own reach check and stops there. Report which walkthrough could not be written and why; the code walkthrough written this run still stands.
- **The app drops mid-capture.** The executor stops rather than emitting a broken capture, and comes back with whatever it landed. Author over those captures if there are any; otherwise report which walkthrough could not be written and why. A code walkthrough written this run still stands.
- **The code walkthrough's author comes back with no receipt (§4).** Say the code walkthrough was not written, and what came back instead. Do not read the diff and write it yourself — carry on to §5, since the two walkthroughs do not depend on each other and a run that lands one tour beats a run that lands none.
- **The planner comes back with no shot list (§4).** There is nothing for the executor to walk, so the product walkthrough is not written this run. Say so and carry on to §6 — planning it yourself means reading the change in this context, which costs more than the tour it would save.
- **The executor lands no captures (§5).** Do not dispatch the author: a tour of nothing is worse than no tour. Report the screens it could not reach, in the executor's own words. The empty shell it left behind has no sections, so §3 reads it as `empty` rather than as a walkthrough for this head, and the next run plans and drives afresh.
- **The product author comes back with no receipt (§5).** The shell and its captures are on disk with no prose over them. Say the product tour has its screens but no narration, and that re-running `/docent` writes a fresh one — §3's `empty` state is what makes that true. Never narrate it yourself from the captures, and never append onto that shell later.
- **`docent serve` never comes up (§6).** The serve-boot poll is bounded; on timeout, hard stop with an actionable message rather than spinning forever. The walkthroughs are already written and on disk — re-run `/docent` once the server starts, or open the tour manually.
