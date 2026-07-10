# 0012 — capture driver: agent-browser (THROWAWAY SPIKE)

Evaluates **agent-browser** as the product-walkthrough capture driver, against the
Playwright baseline from [0005](../0005-product-walkthrough-capture/). Answers wayfinder
[#12](https://github.com/angusfretwell/docent/issues/12). **Read [`FINDINGS.md`](./FINDINGS.md).**

Same pipeline as #5 (navigate → inject rrweb → drive the flow → screenshots → pull events
→ self-contained replay); only the **driver** changes. Notably, the whole spike — capture
*and* replay-validation — runs through agent-browser, so it needs **no Playwright and no
bundled-browser download**, only a system Chrome driven over CDP.

## Layout

- `sample-app/` — the app under review (same signup flow as #5, unchanged).
- `serve.mjs` — stand-in dev server (serves `sample-app/` over HTTP).
- `capture.sh` — the agent-browser-driven capture (the reproducible form of a flow an
  agent would normally drive one command at a time via `snapshot -i`).
- `build-replay.mjs` — folds `evidence/events.json` into a self-contained `replay.html`.
- `validate-replay.mjs` — loads the replay headlessly **via agent-browser** and asserts
  rrweb reconstructed the recorded DOM.
- `evidence/` — screenshots, `events.json`, `manifest.json`, `replay.html`.

## Run

```sh
npm install            # rrweb only — no Playwright, no browser download
./capture.sh           # drive the flow, write evidence/
node build-replay.mjs  # evidence/replay.html
node validate-replay.mjs
```

Prereqs: `agent-browser` on PATH and a system Chrome/Chromium.

Throwaway: delete or fold into the real capture pipeline once the driver is chosen and
the product-walkthrough data model ([#15](https://github.com/angusfretwell/docent/issues/15)) lands.
