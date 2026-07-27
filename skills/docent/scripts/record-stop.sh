#!/bin/sh
# Stop the recording record-start.sh opened and write its event stream to <out>.
#
# Usage:  sh record-stop.sh <session> <out.rrweb.json>
# Prints: {"durationMs":8200} — ready for `capture add --duration-ms`.
#
# DOCENT_AGENT_BROWSER overrides the agent-browser invocation, for driving a build
# other than the published one.

set -eu

browser_cli="${DOCENT_AGENT_BROWSER:-npx -y agent-browser@latest}"

session="${1:-}"
out="${2:-}"
if [ -z "$session" ] || [ -z "$out" ]; then
  echo "usage: sh record-stop.sh <session> <out.rrweb.json>" >&2
  exit 2
fi

# Stopped before either read, so the duration and the stream describe the same
# recording rather than one the recorder grew between two calls.
duration="$($browser_cli --session "$session" eval --stdin <<'JS'
if (typeof window.__stopRrweb !== "function") {
  throw new Error("nothing is recording this page — a navigation mid-flow wipes both the recorder and its events, so a recording is one page's flow");
}
window.__stopRrweb();
window.__stopRrweb = undefined;
if (!Array.isArray(window.__evt) || window.__evt.length < 2) {
  throw new Error("the recording is empty");
}
window.__evt.at(-1).timestamp - window.__evt[0].timestamp;
JS
)"

$browser_cli --session "$session" eval 'window.__evt' >"$out"

printf '{"durationMs":%s}\n' "$duration"
