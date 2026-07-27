#!/bin/sh
# Start recording the page the session is already on. Drive the flow after this
# returns, then close it with record-stop.sh.
#
# Usage: sh record-start.sh <session>
# A zero exit is the whole contract: the recorder is live and has its opening
# snapshot. Nothing is printed.
#
# DOCENT_CLI and DOCENT_AGENT_BROWSER override the CLI invocations, for driving a
# build other than the published one.

set -eu

docent_cli="${DOCENT_CLI:-npx -y @angusfretwell/docent@latest}"
browser_cli="${DOCENT_AGENT_BROWSER:-npx -y agent-browser@latest}"

session="${1:-}"
if [ -z "$session" ]; then
  echo "usage: sh record-start.sh <session>" >&2
  exit 2
fi

# A page load wipes the last injection, so the recorder goes in here rather than
# being the caller's to remember.
$docent_cli rrweb | $browser_cli --session "$session" eval --stdin >/dev/null

# The stop function is parked on the page because record-stop.sh runs in a process
# of its own; leaving the recorder unstoppable would let it keep emitting into the
# session after the flow it was recording ended.
$browser_cli --session "$session" eval --stdin >/dev/null <<'JS'
if (typeof rrweb === "undefined") {
  throw new Error("the rrweb recorder did not reach the page");
}
window.__evt = [];
window.__stopRrweb = rrweb.record({
  collectFonts: true,
  emit: (event) => window.__evt.push(event),
  inlineImages: true,
});
if (window.__evt.length < 2) {
  throw new Error("rrweb recorded no opening snapshot of this page");
}
JS
