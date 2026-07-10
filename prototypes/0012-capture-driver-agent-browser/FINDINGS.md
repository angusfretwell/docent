# Findings — capture driver: agent-browser vs Playwright

Answers wayfinder [#12](https://github.com/angusfretwell/docent/issues/12). Spike code in
this directory; evidence in [`evidence/`](./evidence). The capture pipeline itself is
[#5](https://github.com/angusfretwell/docent/issues/5)'s — this ticket only swaps the **driver**.

## Verdict: agent-browser is a viable capture driver — and a better fit for docent

The full #5 pipeline — navigate → inject rrweb → drive the flow → pull events +
screenshots → self-contained replay — **runs end-to-end on agent-browser with the
same result as Playwright, and the spike never imports Playwright at all** (capture
*and* replay-validation both go through agent-browser). Zero changes to the app under
review.

| Signal | Result (agent-browser) | #5 (Playwright) |
| --- | --- | --- |
| rrweb events captured | **24** (1 Meta, 1 FullSnapshot, 22 incremental) | 28 |
| Full-page screenshots | **4** (one per step) | 4 |
| Self-contained `replay.html` | **269 KB**, no network | 276 KB |
| Replay fidelity | `validate-replay.mjs` **PASS** — replayed DOM has the form, heading, typed email, and success toast (`evidence/04-success-toast.png` ↔ `evidence/05-replay-reconstructed.png`) | PASS |
| Driver footprint | **no npm browser dep, no bundled-browser download** — system Chrome over CDP | `playwright` + ~150 MB pinned browser |

## The four axes (from the ticket)

### 1. Fit for agent-authored flows — **clearly better**

This is the axis that matters most for docent, and the one you can only judge by
*doing* it (so I drove the flow live, one command at a time, before scripting it).

- **Playwright** is a *write-a-script-first* model. The agent authors `capture.mjs`
  up front and must already know the selectors (`#email`, `#pw`, `.toast.show`). A
  wrong selector means editing and re-running the whole script. It's batch.
- **agent-browser** is the *read-act-observe loop the agent already lives in*. The
  browser is a persistent session; the agent issues one command at a time and **reads
  the page as it goes** with `snapshot -i` — an accessibility tree with compact refs:

  ```
  - heading "Create your account" [level=1, ref=e1]
  - textbox "Email" [ref=e2]
  - textbox "Password" [ref=e3]
  - button "Create account" [disabled, ref=e4]
  ```

  Four lines, no selectors invented in advance, and the button's `[disabled]` state is
  *right there*. "Walk through this change" becomes: open → snapshot → act on what you
  see → screenshot → repeat. Mid-flow I confirmed the button had enabled with a
  one-line `eval` — the kind of live check that's awkward in a batch Playwright script.
  This is exactly how an agent authoring an unfamiliar walkthrough naturally operates.

- **Caveat:** refs go stale on DOM change (re-snapshot after navigations/re-renders),
  and for a *fixed, known* flow a committed script is more deterministic to re-run.
  `capture.sh` here is that reproducible form — but note it's a transcript of the live
  drive, not something the agent had to know up front.

### 2. rrweb injection — **holds, identical model**

Driver-injected, exactly like #5. `page.addScriptTag(rrweb)` becomes: pipe the rrweb
UMD source into `agent-browser eval --stdin`, then start recording with a one-line
`eval`, then pull the log with `eval "JSON.stringify(window.__events)"`. After
injection `typeof window.rrweb === "object"`; the app takes no code change and no
runtime dependency on docent. The #5 **driver-injected** decision is unaffected.

Bonus: agent-browser has `--init-script <path>` (inject *before* page JS on every
navigation) — an even cleaner driver-injection path if we ever want rrweb live from
first paint. Inject-after-load worked fine here (rrweb takes a full snapshot on
`record()`), so we don't need it, but the seam is there.

### 3. Screenshots + a running dev server — **same contract, met verbatim**

- Full-page screenshots via `screenshot --full` (Playwright's `fullPage: true`). Four
  screenshots, one per step, visually correct (empty form → "Too short" validation →
  valid/enabled → green success toast).
- Dev-server contract is **identical** to #5's four points: served HTTP URL
  (`http://localhost:5599/`), reachable, a known route, an explicit capture viewport
  (`set viewport 480 720`). rrweb records the live DOM; there is no static shortcut,
  and booting the server stays upstream of the driver. `serve.mjs` stands in for it.

### 4. Packaging / footprint — **decisively lighter, with one trade**

- **Playwright** pulls the `playwright` npm package *and* a pinned per-platform browser
  download (~150 MB). The #5 spike even had to hardcode
  `executablePath: /opt/pw-browsers/chromium-1194/...`. For an `npx review-tool`
  distribution that's a heavy, platform-specific dependency and a browser matrix to
  manage.
- **agent-browser** drives the **system Chrome** over CDP — no bundled browser, no
  per-platform matrix. This spike's `node_modules` is **rrweb only** (13 packages;
  rrweb is the *injected/replay asset*, not the driver). The driver is a single CLI
  (installable `npm i -g agent-browser`, runnable via `npx`, or embeddable through its
  built-in MCP server).
- **The trade:** this swaps "we ship a browser" for "the user has a findable
  Chrome/Chromium." That's a real assumption for `npx` — reasonable on dev machines
  (CI is out of scope per the map), and agent-browser offers Lightpanda / cloud-browser
  fallbacks if we ever need them.

## The one real decision for the human: integration *shape*

Not a con, but a conscious architectural fork:

- **Playwright** is an **in-process library** — the capture module imports it, drives it
  in the same Node process, and gets values back as native return values.
- **agent-browser** is an **out-of-process CLI/daemon** — the capture module orchestrates
  a persistent browser session by shelling out (or speaking MCP), and reads results from
  stdout / `--json`.

For an *agent-driven* product where the agent already lives at the CLI, the
orchestrate-a-CLI shape is arguably the more natural one, and it's what makes axis 1 fall
out for free. But it does make docent's capture code an **orchestrator of agent-browser
commands** rather than a Playwright script — worth confirming before it's load-bearing.

## Recommendation

**Adopt agent-browser as the capture driver.** It clears every axis, is a materially
better fit for agent-authored walkthroughs (axis 1), and is dramatically lighter for
`npx` distribution (axis 4) — at two conscious costs: **bring-your-own-Chrome**, and a
**CLI/subprocess integration shape** rather than an in-process library.

## Does NOT do

Design the product-walkthrough **data model** — that's [#15](https://github.com/angusfretwell/docent/issues/15).
This ticket only settles *which driver* runs the (already-proven) capture pipeline.
