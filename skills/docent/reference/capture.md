# Capturing the product walkthrough

Records a **served, reachable** app into capture blobs and their `captures[]` registry entries — the capture half of the product pillar, separable from authoring (which touches no browser, [product-walkthrough.md](product-walkthrough.md)). You **drive**, not author — you produce captures only.

Two invariants hold for every capture:

- **Zero changes to the app under review.** rrweb is driver-injected at capture time; the app takes no code change and no runtime dependency on docent — it only has to be served and reachable.
- **You consume a served app; you never spawn it.** Serving is the human's dev workflow. Either it is already running, or the human gives you the command and you run it in their session.

The driver is **agent-browser** — system Chrome over CDP, out-of-process (you shell out to the CLI), no bundled browser. Before driving, load its own reference — the command shapes shown here are illustrative; the loaded reference is authoritative and version-matched:

```bash
agent-browser skills get core          # authoritative command reference (matches installed version)
```

Bring-your-own-Chrome: agent-browser drives a findable system Chrome/Chromium — docent ships no browser. With no findable Chrome, hard-stop reporting the requirement.

## 1. Source the setup — precedence, then AFK

Gather the setup knowledge a capture needs — base URL / port, viewport default, and any login or data-seeding steps — in this **precedence** order, stopping at the first that answers:

1. **Existing codebase context** — README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs.
2. **The `.docent/capture.md` runbook** — the fallback brief (see [runbook-template.md](runbook-template.md) for its shape).
3. **Ask the human** — a single, one-time prompt.

When setup is discoverable in 1 or 2, run **AFK** — no prompt. The human-in-the-loop prompt fires only at rung 3; whatever you learn there, author into the runbook at the end (§8) so later captures don't re-ask.

**Done when** you hold: the base URL, the viewport default, and the steps to reach a usable app state (login, seed).

## 2. Reach the app — the readiness gate

Get the app to a verified-rendered state before capturing. **Never emit a broken capture silently** — a connection-refused or error page must fail loudly, not become a screenshot.

- **Already-running server** (human booted it) → navigate to the starting route (§3) and verify **real DOM** rendered: `agent-browser snapshot -i` shows the app's actual elements, not an error page.
- **Agent-launched server** (you ran the command in the human's session) → poll the base URL until it responds — **any HTTP status** counts as up (a 404 or 500 still means the server answered); only a refused connection is not-up. Poll under an overall timeout, then hard stop if it never answers:

  ```bash
  for _ in $(seq 1 100); do curl -s -o /dev/null --max-time 2 <url> && break; sleep 0.2; done
  ```

  `curl -s` (no `-f`) exits 0 on any HTTP response and non-zero only on a failed connection — exactly the gate needed. Once it answers, navigate and verify real DOM as above.

- **On failure** → **hard stop** with an actionable message, e.g. `app not reachable at <url> — is your dev server up?`. Do not proceed to capture.

## 3. Stage viewport and route

Launch Chrome, set the viewport **before** navigating (so it frames the first paint), then open the route:

```bash
agent-browser open                     # about:blank first, so viewport applies to the capture
agent-browser set viewport <w> <h>     # e.g. 1280 800
agent-browser open <url><route>
```

- **Viewport** — the runbook default (a stable property of the app), overridable per-capture.
- **Starting route** — a per-capture concern: the value the human gave; else inferred from the Change under review (the changed files/routes point at what to walk); else `/` as a last resort.

Both are recorded on the capture entity in §7 (`viewport`, `route`); the runbook or instruction is only their source.

## 4. Inject rrweb

**Both** capture kinds are rrweb event streams — a screenshot is a DOM snapshot, not a raster, so it stays sharp at any zoom when the Review renders it. Inject rrweb by driver eval:

```bash
# rrweb's exports map does not expose the UMD build, so resolve the package
# entry and take its sibling rather than asking for the subpath directly.
cat "$(node -e 'const p=require("node:path");process.stdout.write(p.join(p.dirname(require.resolve("rrweb")),"rrweb.umd.min.cjs"))')" | agent-browser eval --stdin
```

This resolves rrweb from wherever node can find it; if nothing resolves, install it somewhere disposable (e.g. `npm i --prefix <scratch-dir> rrweb`) and resolve from there — never add it to the app under review.

rrweb takes a full snapshot on `record()`, so inject-after-load is sufficient. Record with assets inlined, so a capture stays readable after the dev server is gone:

```js
rrweb.record({ collectFonts: true, emit, inlineImages: true });
```

Stylesheets are inlined by default; images and fonts are **not** — without those two options a replay months later shows holes where the app's assets used to be. The cost is blob size, which is the right trade for an immutable artifact.

## 5. Drive and capture

Drive the flow the way you already work — `snapshot -i` to read the page live (accessibility tree, element refs, disabled states visible), act on what you see, re-snapshot after any DOM change. Refs go stale on navigation; re-snapshot.

- **Screenshot** — once the page is in the state you want, take the snapshot pair. `record()` emits `Meta` then `FullSnapshot` synchronously and returns its own stop function, so starting and immediately stopping yields exactly the still frame:

  ```bash
  agent-browser eval "window.__evt=[]; rrweb.record({collectFonts:true,emit:e=>window.__evt.push(e),inlineImages:true})(); JSON.stringify(window.__evt.slice(0,2))" --json
  ```

  Write those two events to a `<tmp>.rrweb.json` file. Note `dims` — the **full document** size in CSS pixels, which is what the Review sizes the still to, not the viewport:

  ```bash
  agent-browser eval "[document.documentElement.scrollWidth,document.documentElement.scrollHeight]" --json
  ```

- **Recording** — start recording before driving the flow, then pull the raw rrweb event stream: `agent-browser eval "JSON.stringify(window.__evt)" --json` → write the events array verbatim to a `<tmp>.rrweb.json` file. Note `durationMs` (last event ts − first).

## 6. Mint the walkthrough shell

Captures register onto a **product walkthrough**, so first establish which `wlk_` you are capturing into. When the reconcile flow (SKILL.md) supplies the id, use it. Run standalone, mint a fresh shell:

```bash
npx -y @angusfretwell/docent walkthrough create --kind product
#   → { "changeId": "chg_…", "walkthroughId": "wlk_…" }
```

Omit `--title`: the shell mints with an empty `title` and empty `sections` — both are editorial, which the authoring half fills — you author nothing. The CLI binds `bornChangeId` to the live head's Change, minting the Change lazily if the head has none.

## 7. Register the capture

Register each temp media file (§5) with `docent capture add` — the single home for content-sha minting and append semantics. It content-addresses the bytes into `captures/<sha>.rrweb.json` (the filename **is** the sha-256 of the bytes, which dedups byte-identical screens across rounds and freezes the exact bytes an anchor points at), mints the `cap_` id, and appends the validated `captures[]` registry entry to the manifest:

```bash
# screenshot: full-page CSS-pixel document size rides --dims
npx -y @angusfretwell/docent capture add --walkthrough wlk_… --kind screenshot --media <tmp>.rrweb.json \
  --route /signup --viewport 1280x800 --dims 1280x2400 --title "Empty signup form"

# recording: --duration-ms rides instead of --dims
npx -y @angusfretwell/docent capture add --walkthrough wlk_… --kind recording --media <tmp>.rrweb.json \
  --route /signup --viewport 1280x800 --duration-ms 8200 --title "Submitting the signup"
#   → { "captureId": "cap_…", "media": "<sha>", "registry": { … }, "walkthroughId": "wlk_…" }
```

`--dims` is for screenshots and `--duration-ms` for recordings; the mismatch is refused, as is any capture on a code walkthrough. `--media` is a file path read relative to the cwd. `--route` and `--viewport` record the §3 staging on the capture entity. `--title` is a **short descriptive name for the state you just captured** ("Empty signup form") — the Review shows it in place of the generic "Screenshot 1" / "Recording 1". It is naming what you produced, not authoring prose: a few words, not a sentence; the section narrative stays the authoring half's job. Technically optional (an untitled capture falls back to its ordinal), but always pass one. All captures are born against the walkthrough's `bornChangeId`. The CLI is non-gating (the files stay plain and hand-writable), but prefer it: it validates against the same schemas the server renders.

## 8. First-run: author the runbook

If the setup required asking the human (precedence rung 3), write what you learned to `.docent/capture.md` so later captures run AFK. Follow [runbook-template.md](runbook-template.md). If a runbook already existed and was correct, leave it; if you discovered it was stale (e.g. the port changed), update it.

## 9. Teardown — only what it started

- **Human-run server** → never stopped. It is theirs.
- **Agent-launched server** → reused across every capture in the session (capture is expensive), then stopped when the capture work is done.
- Close the browser session when finished: `agent-browser close`.

## Stop conditions

- **App not reachable** (§2) — hard stop with the actionable message; never a silent broken capture.
- **No findable system Chrome** — report the bring-your-own-Chrome requirement and stop.
