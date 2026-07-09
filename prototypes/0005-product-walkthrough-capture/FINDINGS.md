# Findings — product-walkthrough capture pipeline

Answers wayfinder [#5](https://github.com/angusfretwell/docent/issues/5). Spike code in this directory; evidence in [`evidence/`](./evidence).

## Verdict: feasible, end-to-end, with zero changes to the app under review

A running app → rrweb session recording + full-page screenshots → a
self-contained replay that faithfully reconstructs the app. Proven against a
small signup flow (`sample-app/`), driven headlessly by Playwright.

| Signal | Result |
| --- | --- |
| rrweb events captured over the flow | **28** (1 Meta, 1 FullSnapshot, 26 incremental) |
| Full-page screenshots | **4** (one per step of the flow) |
| Self-contained `replay.html` | **276 KB**, no network, opens straight in a browser |
| Replay fidelity | `validate-replay.mjs` **passes** — the replayed DOM contains the form, heading, typed email, and the success toast; even the cursor position is reconstructed (compare `evidence/04-success-toast.png` ↔ `evidence/05-replay-reconstructed.png`) |

## Decisions (settled with the human on the ticket)

- **Who drives the browser → agent-driven, headless.** The agent scripts the
  flow via a browser driver (Playwright in this spike). Reproducible,
  re-runnable per Change, and fits agent-authored PRs — the same session that
  made the change can capture the walkthrough. Human-driven and hybrid capture
  were considered and deferred; the seam is just "who calls the driver," so
  they can return later without reworking the pipeline.
- **How rrweb gets into the app → driver-injected.** The driver injects rrweb at
  capture time (`page.addScriptTag`). **The app under review needs no code
  changes and takes no runtime dependency on docent** — it only has to be
  *served and reachable*. App-bundled rrweb (always-on/production recording) was
  considered and rejected for the initial build (couples the reviewed app to
  docent).

## What the capture pipeline assumes of the "dev server"

Minimal, and worth stating as the contract the product will lean on:

1. The app is **served over HTTP at a known URL** (a dev server) and reachable
   from the capture driver. rrweb records a *live* DOM; there is no static-file
   shortcut.
2. There is a **known starting route** to navigate to.
3. A **viewport size** is chosen for the capture (screenshots + rrweb replay
   dimensions). The spike used 480×720.
4. **Booting the dev server is out of the pipeline's hands** — something
   upstream (`npm run dev` / the reviewer / the agent) must have it running.
   How docent learns/launches that command is not settled here.

## Inputs this surfaces for later tickets

- **Product-walkthrough data model** (fog): a walkthrough section references two
  asset kinds produced here — an **rrweb event log (JSON)** and **screenshots
  (PNG)**. The model must hold/point at both. Graduates once the Comment model
  lands (per the map).
- **Comment model** ([#7](https://github.com/angusfretwell/docent/issues/7)):
  confirms the future walkthrough anchor types this pillar needs — a
  **screenshot region** and a **recording timestamp** (rrweb events are
  timestamped, so timestamp anchoring is directly supported).
- **Capture driver choice** (new follow-up): this spike used Playwright. Whether
  the product drives via Playwright or **agent-browser** is a separate
  evaluation — see the follow-up ticket graduated from this one.

## Not covered (deliberately)

The product-walkthrough **data model** (how sections, recordings, screenshots
and rich text compose) — that is the next step, not this ticket. This ticket
only validated that the raw capture works and pinned the capture environment.
