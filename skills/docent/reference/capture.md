# Driving the product walkthrough's captures

Walks a **served, reachable** app to each state on a shot list and records it — the capture half of the product walkthrough. You are the executor: the shots were chosen for you ([capture-plan.md](capture-plan.md)) and the prose is written after you ([product-walkthrough.md](product-walkthrough.md)). You **drive**, not author — you produce captures only.

The work here is deliberately mechanical: every judgment call about what is worth showing was made before you were dispatched. Reaching a named state is the one thing you decide, and you decide it from the page in front of you.

Two invariants hold for every capture:

- **Zero changes to the app under review.** rrweb is driver-injected at capture time; the app takes no code change and no runtime dependency on docent — it only has to be served and reachable.
- **You consume a served app; you never spawn it and never stop it.** Serving is the human's dev workflow, settled before you were dispatched.

The driver is **agent-browser** — system Chrome over CDP, out-of-process (you shell out to the CLI), no bundled browser. Before driving, load its own reference — the command shapes shown here are illustrative; the loaded reference is authoritative and version-matched:

```bash
agent-browser skills get core          # authoritative command reference (matches installed version)
```

Bring-your-own-Chrome: agent-browser drives a findable system Chrome/Chromium — docent ships no browser. With no findable Chrome, hard-stop reporting the requirement.

## What you are given

- **The skill's absolute base directory** — where this brief lives: it is `<base>/reference/capture.md`, and every file it links to is a sibling under `<base>/reference/`. Resolve them there. Your cwd is the repository under review, so a bare relative path looks inside somebody else's tree and comes back empty.
- **The repository's absolute root** — run the CLI there, and find the runbook at `.docent/capture.md` under it.
- **The shot list** — an ordered set of states to reach, each with a title, a kind (screenshot or recording), and sometimes a hint. It arrives in your prompt because it was produced this run and written down nowhere else.

## What you return

A receipt, not prose. It names the shell you filled and every capture in it, and it is what tells the run which shots the tour is missing:

```text
walkthrough: wlk_01J…
captures:
  1. cap_01J… — Export before the dialog (screenshot)
  2. cap_01J… — Naming the export (recording)
obstacles:
  - "Export with an invalid name" was unreachable — the dialog accepted every name I tried
```

An **obstacle** is anything that made the tour less truthful: a shot you could not reach, a screen that errored so its capture is of the error state, a runbook claim that turned out wrong. Say each one the way it will be read aloud to the human, because it is passed on verbatim. `obstacles: none` is the ordinary answer. What you think of the app or the code is not an obstacle and is not reported.

## 1. Read the runbook — your setup, already settled

`.docent/capture.md` at the repository root is the serving runbook: base URL, viewport default, and the login or seeding steps that reach a usable state (see [runbook-template.md](runbook-template.md) for its shape). It was authored by the run before you were dispatched, so treat it as **input** — you neither add to it nor correct it.

**Done when** you hold the base URL, the viewport default, and the steps to a usable app state.

If the runbook contradicts the app — a port that has moved, a login that no longer works — that is an obstacle you report, not a puzzle you solve: you have no human to ask and no mandate to guess a replacement.

## 2. Take your own browser session

Every `agent-browser` call carries `--session <name>`, so the run cannot land in the human's own browser work or in a session another worktree is driving. `agent-browser` derives a stable name for you — run it from the repository root, whose worktree is the scope:

```bash
session="$(agent-browser session id --scope worktree --prefix docent)"   # → docent-<hash of this worktree>
agent-browser --session "$session" open        # about:blank first, so the viewport applies to the first paint
agent-browser --session "$session" set viewport <w> <h>    # e.g. 1280 800
```

Pass the flag on every call — shell state does not reliably survive between commands, so an exported `AGENT_BROWSER_SESSION` can quietly stop applying halfway through a run.

Set the viewport **before** navigating, so the app's first paint is already at the frame you capture: the runbook's default, overridden only where a shot asks for a different frame.

## 3. Reach the app — the readiness gate

Get the app to a verified-rendered state before capturing. **Never emit a broken capture silently** — a connection-refused or error page must fail loudly, not become a screenshot.

- Navigate to the base URL and verify **real DOM** rendered: `agent-browser --session "$session" snapshot -i` shows the app's actual elements, not an error page.
- **On failure** → **hard stop** and report `app not reachable at <url>`. Do not capture anything, and do not go looking for the app on another port.

## 4. Inject rrweb

**Both** capture kinds are rrweb event streams — a screenshot is a DOM snapshot, not a raster, so it stays sharp at any zoom when the Review renders it. Inject rrweb by driver eval, after each page load:

```bash
# rrweb's exports map does not expose the UMD build, so resolve the package
# entry and take its sibling rather than asking for the subpath directly.
cat "$(node -e 'const p=require("node:path");process.stdout.write(p.join(p.dirname(require.resolve("rrweb")),"rrweb.umd.min.cjs"))')" | agent-browser --session "$session" eval --stdin
```

This resolves rrweb from wherever node can find it; if nothing resolves, install it somewhere disposable (e.g. `npm i --prefix <scratch-dir> rrweb`) and resolve from there — never add it to the app under review.

rrweb takes a full snapshot on `record()`, so inject-after-load is sufficient. Record with assets inlined, so a capture stays readable after the dev server is gone:

```js
rrweb.record({ collectFonts: true, emit, inlineImages: true });
```

Stylesheets are inlined by default; images and fonts are **not** — without those two options a replay months later shows holes where the app's assets used to be. The cost is blob size, which is the right trade for an immutable artifact.

## 5. Create the walkthrough shell

Captures register onto a **product walkthrough**, so establish which `wlk_` you are capturing into before the first shot. Nobody hands you one — you create it, and its id is the first line of your receipt:

```bash
npx -y @angusfretwell/docent@latest walkthrough create --kind product
#   → { "changeId": "chg_…", "walkthroughId": "wlk_…" }
```

Omit `--title`: the shell lands with an empty `title` and empty `sections` — both are editorial, which the authoring half fills — you author nothing. The CLI binds `bornChangeId` to the live head's Change, recording the Change lazily if the head has none.

## 6. Walk the shot list — in order, bounded

Take the shots in the order given, one at a time, and register each (§7) before moving on, so a shot you cannot reach costs only itself.

For each shot: navigate to where you think the state lives, then drive the way you already work — `snapshot -i` to read the page live (accessibility tree, element refs, disabled states visible), act on what you see, re-snapshot after any DOM change. Refs expire on navigation; re-snapshot. A shot's hint is a lead, not an instruction — the page overrules it.

- **Three attempts per shot, then record it unreachable and move to the next.** An attempt is one honest run at the state: navigate, drive, look. On the third failure, name that shot in `obstacles` and go on to the next one. The budget is the point — grinding on a state the app will not produce burns the run on full accessibility trees and lands no tour at all, and the shot list has other shots that will work.
- **Reach the state you were given, or report it missing.** Where two paths lead to the same state, take either. Where the state itself is not there, that is the finding — never substitute a different screen that looks similar, and never invent a shot the plan did not ask for. A capture that is not the state it claims to be is worse than a shot the tour is honestly missing, because the author cannot tell.
- **Screenshot** — once the page is in the state you want, take the snapshot pair. `record()` emits `Meta` then `FullSnapshot` synchronously and returns its own stop function, so starting and immediately stopping yields exactly the still frame:

  ```bash
  agent-browser --session "$session" eval "window.__evt=[]; rrweb.record({collectFonts:true,emit:e=>window.__evt.push(e),inlineImages:true})(); JSON.stringify(window.__evt.slice(0,2))" --json
  ```

  Write those two events to a `<tmp>.rrweb.json` file. Note `dims` — the **full document** size in CSS pixels, which is what the Review sizes the still to, not the viewport:

  ```bash
  agent-browser --session "$session" eval "[document.documentElement.scrollWidth,document.documentElement.scrollHeight]" --json
  ```

- **Recording** — start recording before driving the flow, then pull the raw rrweb event stream: `agent-browser --session "$session" eval "JSON.stringify(window.__evt)" --json` → write the events array verbatim to a `<tmp>.rrweb.json` file. Note `durationMs` (last event ts − first).

## 7. Register the capture

Register each temp media file (§6) with `docent capture add` — the single home for content-sha addressing and append semantics. It content-addresses the bytes into `captures/<sha>.rrweb.json` (the filename **is** the sha-256 of the bytes, which dedups byte-identical screens across runs and freezes the exact bytes an anchor points at), issues the `cap_` id, and appends the validated `captures[]` registry entry to the manifest:

```bash
# screenshot: full-page CSS-pixel document size rides --dims
npx -y @angusfretwell/docent@latest capture add --walkthrough wlk_… --kind screenshot --media <tmp>.rrweb.json \
  --route /signup --viewport 1280x800 --dims 1280x2400 --title "Empty signup form"

# recording: --duration-ms rides instead of --dims
npx -y @angusfretwell/docent@latest capture add --walkthrough wlk_… --kind recording --media <tmp>.rrweb.json \
  --route /signup --viewport 1280x800 --duration-ms 8200 --title "Submitting the signup"
#   → { "captureId": "cap_…", "media": "<sha>", "registry": { … }, "walkthroughId": "wlk_…" }
```

`--dims` is for screenshots and `--duration-ms` for recordings; the mismatch is refused, as is any capture on a code walkthrough. `--media` is a file path read relative to the cwd. `--route` and `--viewport` record where you actually were, which is what the Review shows. `--title` is the shot's title from the plan — a short descriptive name for the state ("Empty signup form"), shown in place of the generic "Screenshot 1" / "Recording 1". Always pass the plan's title, unchanged: a capture that is not the state its title claims is an obstacle on your receipt, never a retitle, because a retitled capture makes that gap invisible to the author. All captures are born against the walkthrough's `bornChangeId`. The CLI is non-gating (the files stay plain and hand-writable), but prefer it: it validates against the same schemas the server renders.

## 8. Teardown

Close your browser session when the last shot is registered, and leave everything else exactly as you found it:

```bash
agent-browser --session "$session" close
```

The app's server is never yours to stop, however it was started.

## Stop conditions

- **App not reachable** (§3) — hard stop with the actionable message; never a silent broken capture.
- **The app drops mid-walk** — stop, and return the receipt with the captures you did land plus the obstacle. A half-filled shell an author can narrate beats no shell at all.
- **No findable system Chrome** — report the bring-your-own-Chrome requirement and stop.

## Non-goals

- **Nothing editorial.** No titles you invented, no `walkthrough rename`, no sections, no callouts — the shell's `title` and `sections` stay empty for the authoring half.
- **No subagents of your own.** You are the run's only executor: the browser sessions would be isolated but the app's backend is not, so two of you racing one dev server capture a race rather than a product.
- **No re-planning.** The shot list is not a starting point to improve on. A screen you noticed and nobody asked for is not a shot.
- **No git writes and no runbook writes.** No commits, no pushes, no working-tree edits; the runbook is input.
- **No questions.** You have no human to ask. Where this brief leaves something to judgment, judge it and move.
