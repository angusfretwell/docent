#!/usr/bin/env bash
# THROWAWAY SPIKE — capture driver evaluation (wayfinder #12)
# The SAME pipeline #5 proved with Playwright (navigate → inject rrweb → drive the
# flow → pull events + screenshots), but driven by **agent-browser** instead:
# a stateful CLI over system Chrome (CDP), no Playwright, no bundled browser.
#
# This script is the reproducible form of a flow an agent would normally drive
# one command at a time, reading the page with `snapshot -i` as it goes.
#
# Prereqs: `npm install` (rrweb only), `agent-browser` on PATH, system Chrome.
# Run: ./capture.sh
set -euo pipefail
cd "$(dirname "$0")"

export AGENT_BROWSER_SESSION=cap
OUT=evidence
mkdir -p "$OUT"

# --- 0. Stand in for "the dev server": serve sample-app/ over HTTP ----------
node serve.mjs 5599 & SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null; agent-browser close 2>/dev/null || true' EXIT
until curl -sf -o /dev/null http://localhost:5599/; do sleep 0.1; done
URL=http://localhost:5599/
echo "[spike] dev server on $URL"

# --- 1. Launch headless Chrome, stage the capture viewport, navigate -------
agent-browser open >/dev/null              # about:blank, so we can set viewport first
agent-browser set viewport 480 720 >/dev/null
agent-browser open "$URL" >/dev/null
agent-browser snapshot -i                  # agent-native page read (refs, no selectors)

# --- 2. Inject rrweb into the live page (driver-injected — app untouched) ---
cat node_modules/rrweb/dist/rrweb.umd.min.cjs | agent-browser eval --stdin >/dev/null
agent-browser eval "window.__events=[]; rrweb.record({emit:e=>window.__events.push(e)}); 'recording'" >/dev/null
echo "[spike] rrweb injected + recording (typeof rrweb = $(agent-browser eval 'typeof window.rrweb'))"

# --- 3. Drive the flow like a reviewer walking the change ------------------
agent-browser screenshot --full "$OUT/01-initial.png" >/dev/null
agent-browser fill @e2 "reviewer@docent.dev" >/dev/null
agent-browser fill @e3 "short" >/dev/null                       # triggers "Too short"
agent-browser screenshot --full "$OUT/02-password-too-short.png" >/dev/null
agent-browser fill @e3 "correct-horse-battery" >/dev/null       # valid -> enables button
agent-browser screenshot --full "$OUT/03-valid-ready-to-submit.png" >/dev/null
agent-browser click @e4 >/dev/null                              # submit
agent-browser wait --text "welcome aboard" >/dev/null
agent-browser screenshot --full "$OUT/04-success-toast.png" >/dev/null

# --- 4. Pull the rrweb event log out of the page (the capture artifact) ----
agent-browser eval "JSON.stringify(window.__events)" --json \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const e=JSON.parse(JSON.parse(s).data.result);require("fs").writeFileSync("evidence/events.json",JSON.stringify(e));console.log("[spike] pulled "+e.length+" rrweb events -> evidence/events.json")})'

echo "[spike] capture complete. Build the replay with: node build-replay.mjs"
