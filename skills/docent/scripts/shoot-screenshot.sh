#!/bin/sh
# Take one still of the page the session is already on, as an rrweb event stream.
#
# Usage:  sh shoot-screenshot.sh <session> <out.rrweb.json>
# Prints: {"dims":"1280x2400"} — ready for `capture add --dims`.
#
# DOCENT_CLI and DOCENT_AGENT_BROWSER override the CLI invocations, for driving a
# build other than the published one.

set -eu

docent_cli="${DOCENT_CLI:-npx -y @angusfretwell/docent@latest}"
browser_cli="${DOCENT_AGENT_BROWSER:-npx -y agent-browser@latest}"

session="${1:-}"
out="${2:-}"
if [ -z "$session" ] || [ -z "$out" ]; then
  echo "usage: sh shoot-screenshot.sh <session> <out.rrweb.json>" >&2
  exit 2
fi

# A page load wipes the last injection, so the recorder goes in here rather than
# being the caller's to remember.
$docent_cli rrweb | $browser_cli --session "$session" eval --stdin >/dev/null

# `record()` emits Meta then FullSnapshot synchronously and returns its own stop
# function, so starting and immediately stopping yields exactly the still frame.
$browser_cli --session "$session" eval --stdin >"$out" <<'JS'
if (typeof rrweb === "undefined") {
  throw new Error("the rrweb recorder did not reach the page");
}
window.__evt = [];
rrweb.record({ collectFonts: true, emit: (event) => window.__evt.push(event), inlineImages: true })();
if (window.__evt.length < 2) {
  throw new Error("rrweb recorded no snapshot of this page");
}
window.__evt.slice(0, 2);
JS

# The full document size in CSS pixels, not the viewport: that is what the Review
# sizes the still to.
dims="$($browser_cli --session "$session" eval \
  'document.documentElement.scrollWidth + "x" + document.documentElement.scrollHeight' | tr -d '"')"

printf '{"dims":"%s"}\n' "$dims"
