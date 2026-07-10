---
name: capture-product-walkthrough
description: Capture a served product's UI into content-addressed screenshot and rrweb-recording blobs plus captures[] registry entries, driving system Chrome over agent-browser with zero changes to the app under review. Use when producing product-walkthrough captures, recording a UI flow for review, or when /docent or /author-product-walkthrough needs captures. Owns the .docent/capture.md serving runbook.
---

# capture-product-walkthrough

Records a **served, reachable** app into capture blobs and their `captures[]` registry entries — the capture half of the product walkthrough, separable from authoring (which touches no browser). You **drive**, you don't author: produce captures only, never sections and never Findings.

Two invariants hold for every capture:

- **Zero changes to the app under review.** rrweb is **driver-injected** at capture time; the app takes no code change and no runtime dependency on docent — it only has to be served and reachable.
- **You consume a served app; you never spawn it.** Serving is the human's dev workflow. Either it is already running, or the human gives you the command and you run it via Bash **in their session**. docent-the-tool never boots the app.

The driver is **agent-browser** — system Chrome over CDP, out-of-process (you shell out to the CLI), no Playwright, no bundled browser. Its commands are version-matched; before driving, load its own reference:

```bash
agent-browser skills get core          # authoritative command reference (matches installed version)
```

Bring-your-own-Chrome: agent-browser drives a findable system Chrome/Chromium rather than a shipped browser. If none is found, `agent-browser install` provisions one.

## 1. Source the setup — precedence, then AFK

Gather the setup knowledge a capture needs — base URL / port, viewport default, and any login or data-seeding steps — in this **precedence** order, stopping at the first that answers:

1. **Existing codebase context** — README, CONTRIBUTING, `package.json` scripts, `.env.example`, in-repo agent docs.
2. **The `.docent/capture.md` runbook** — the fallback brief (see [runbook-template.md](runbook-template.md) for its shape).
3. **Ask the human** — a single, one-time prompt.

When setup is discoverable in 1 or 2, run **AFK** — no prompt. The human-in-the-loop prompt fires **only** at step 3, when nothing is discoverable. Whatever you learn there, you author into the runbook at the end (step 8) so later captures don't re-ask.

**Done when** you hold: the base URL, the viewport default, and the steps to reach a usable app state (login, seed).

## 2. Reach the app — the readiness gate

Get the app to a verified-rendered state before capturing. **Never emit a broken capture silently** — a connection-refused or error page must fail loudly, not become a screenshot.

- **Already-running server** (human booted it) → navigate to the starting route (step 3) and **verify real DOM rendered**: `agent-browser snapshot -i` shows the app's actual elements, not an error page.
- **Agent-launched server** (you ran the command in the human's session) → **poll the base URL until it responds** (`until curl -sf -o /dev/null <url>; do sleep 0.2; done`) under a timeout, _then_ navigate and verify as above.
- **On failure** → **hard stop** with an actionable message, e.g. `app not reachable at <url> — is your dev server up?`. Do not proceed to capture.

## 3. Stage viewport and route

Launch Chrome, set the viewport **before** navigating (so it frames the first paint), then open the route:

```bash
agent-browser open                     # about:blank first, so viewport applies to the capture
agent-browser set viewport <w> <h>     # e.g. 1280 800
agent-browser open <url><route>
```

- **Viewport** — the runbook default (a stable property of the app), **overridable per-capture**.
- **Starting route** — a **per-capture** concern: the value the user gave; else **inferred from the Change under review** (the changed files/routes point at what to walk); else `/` as a last resort.

Both are recorded on the capture entity in step 7 (`viewport`, `route`); the runbook or instruction is only their source.

## 4. Inject rrweb (recordings only)

Screenshots skip this step. For a recording, inject rrweb by **driver eval** and start recording — the app is untouched:

```bash
cat "$(node -e 'process.stdout.write(require.resolve("rrweb/dist/rrweb.umd.min.cjs"))')" | agent-browser eval --stdin
agent-browser eval "window.__evt=[]; rrweb.record({emit:e=>window.__evt.push(e)}); 'recording'"
```

rrweb takes a full snapshot on `record()`, so inject-after-load is sufficient. If a recording ever needs events from first paint, `agent-browser open --init-script <path>` injects before page JS.

## 5. Drive and capture

Drive the flow the way you already work — `snapshot -i` to read the page live (accessibility tree, element refs, disabled states visible), act on what you see, re-snapshot after any DOM change. Refs go stale on navigation; re-snapshot.

- **Screenshot** — `agent-browser screenshot --full <tmp>.png` (full scroll height). Note its full-page pixel `dims`.
- **Recording** — after the flow, pull the **raw rrweb event stream**: `agent-browser eval "JSON.stringify(window.__evt)" --json` → write the events array verbatim. Note `durationMs` (last event ts − first).

## 6. Content-address the blobs

Write each capture's bytes to a **content-addressed** blob — the filename **is** the hash of the bytes (sha-256 hex), which dedups byte-identical screens across rounds and freezes the exact bytes an anchor points at:

```bash
SHA=$(shasum -a 256 <tmp>.png | cut -d' ' -f1)
mkdir -p <wlk>/captures && mv <tmp>.png <wlk>/captures/$SHA.png        # recordings: $SHA.rrweb.json
```

`<wlk>` is the product walkthrough dir you are capturing into — `.docent/dossiers/<branch-slug>/walkthroughs/product/wlk_<ulid>/`. Composed under `/docent`, the orchestrator supplies it; run standalone, mint a fresh `wlk_<ulid>/` with a minimal product `manifest.json` (`schema`, `id`, `kind: product`, `title`, `bornChangeId` = the Change under review, `sections: []`) so the registry has a home.

## 7. Register the capture

Append one entry to the walkthrough manifest's `captures[]` for each blob — the atomic, first-class capture record:

```jsonc
// screenshot
{ "id": "cap_<ulid>", "kind": "screenshot", "media": "<sha>", "route": "/signup", "viewport": [1280, 800], "dims": [1280, 2400] }
// recording
{ "id": "cap_<ulid>", "kind": "recording", "media": "<sha>", "route": "/signup", "viewport": [1280, 800], "durationMs": 8200 }
```

`media` is the content sha (step 6). All captures are born against the walkthrough's `bornChangeId` — no per-capture `capturedAgainst`.

## 8. First-run: author the runbook

If the setup came from step 1's precedence — asking the human — write what you learned to `.docent/capture.md` so later captures run AFK. Follow [runbook-template.md](runbook-template.md). If a runbook already existed and was correct, leave it; if you discovered it was stale (e.g. the port changed), update it.

## 9. Teardown — only what it started

- **Human-run server** → **never stopped.** It is theirs.
- **Agent-launched server** → **reused across every capture in the session** (capture is expensive), then **stopped when the capture work is done.**
- Close the browser session when finished: `agent-browser close`.

## Stop conditions

- **App not reachable** (step 2) — hard stop with the actionable message; never a silent broken capture.
- **No system Chrome and `agent-browser install` cannot provision one** — report the bring-your-own-Chrome requirement and stop.
