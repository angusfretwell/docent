# Product-walkthrough capture — spike

> **Throwaway prototype** answering wayfinder
> [#5 — Product walkthrough: capture pipeline](https://github.com/angusfretwell/docent/issues/5).
> Not production code. Fold the validated decisions into the real capture
> pipeline (once its data model is designed) and delete this.

## Question it answers

Can we capture a user-facing change as **rrweb recordings + static screenshots**
of the running app, and what does the capture *environment* assume — who drives
the browser, and what do we need from the dev server?

## What it does

`capture.mjs` stands up a trivial static server (the "dev server" stand-in)
serving `sample-app/` (a small signup flow), drives it **headlessly with
Playwright** as an agent would, **injects rrweb from the driver** (no changes to
the app under review), records the session, and takes full-page screenshots at
each step. `build-replay.mjs` bundles the events into a self-contained
`replay.html`; `validate-replay.mjs` loads that replay headlessly and asserts
rrweb actually reconstructs the recorded DOM.

## Run

```sh
bun install          # or: npm install
node capture.mjs     # -> evidence/events.json, evidence/*.png, evidence/manifest.json
node build-replay.mjs # -> evidence/replay.html (self-contained, open in a browser)
node validate-replay.mjs # asserts the replay reconstructs the app; exits non-zero on failure
```

**Environment note:** the scripts pin Chromium via
`executablePath: /opt/pw-browsers/chromium-1194/...` because the pinned
Playwright build differs from the pre-installed browser in the dev sandbox.
On a normal machine, drop that option and let Playwright find its own browser
(`npx playwright install chromium`).

See [`FINDINGS.md`](./FINDINGS.md) for the verdict.
