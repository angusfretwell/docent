#!/bin/sh
# The capture gate: is there a browser to drive, and does anything answer on the
# app's base URL? Neither check opens a browser — driving the app is the capture
# executor's job.
#
# Usage:  sh capture-gate.sh <base-url>
# Prints: {"browser":"ok|missing","url":"up|down","detail":"…"}
#         `detail` is why each failing check failed, joined by "; ", and empty
#         when both pass. It is written to be read aloud to the human.
#
# Exits non-zero only on a usage error: a check that did not pass is a finding the
# caller branches on, not a failure of this script.
#
# DOCENT_AGENT_BROWSER overrides the agent-browser invocation, for driving a build
# other than the published one.

set -u

browser_cli="${DOCENT_AGENT_BROWSER:-npx -y agent-browser@latest}"

base_url="${1:-}"
if [ -z "$base_url" ]; then
  echo "usage: sh capture-gate.sh <base-url>" >&2
  exit 2
fi

# `doctor` exits 1 for any failing check, including ones a tour has no stake in, so
# the exit code is discarded and `chrome.installed` is read out of the report.
# Its stderr passes through to say why the report never arrived.
doctor="$($browser_cli doctor --offline --quick --json)" || true

# Any HTTP status counts as up: a 404 or a 500 still means a server answered, and
# only a refused connection is not-up — which is what plain `curl` without `-f`
# reports. `--max-time` is what bounds the poll rather than merely repeating it: a
# socket that accepts and then never answers would hang on the first attempt.
url_state=down
url_detail=
attempt=0
while [ "$attempt" -lt 30 ]; do # ~15s while nothing accepts; ~75s if every attempt hangs
  if url_detail="$(curl -sS --max-time 2 -o /dev/null "$base_url" 2>&1)"; then
    url_state=up
    url_detail=
    break
  fi
  attempt=$((attempt + 1))
  sleep 0.5
done

BASE_URL="$base_url" DOCTOR="$doctor" URL_DETAIL="$url_detail" URL_STATE="$url_state" node -e '
  const report = (() => {
    try {
      return JSON.parse(process.env.DOCTOR);
    } catch {
      return undefined;
    }
  })();

  const chrome = report?.checks?.find((check) => check.id === "chrome.installed");
  const browser = chrome?.status === "pass" ? "ok" : "missing";
  const url = process.env.URL_STATE;

  const detail = [];
  if (browser === "missing") {
    detail.push(chrome?.message ?? "agent-browser doctor reported no chrome.installed check");
  }
  if (url === "down") {
    detail.push(process.env.URL_DETAIL || `nothing answered at ${process.env.BASE_URL}`);
  }

  process.stdout.write(`${JSON.stringify({ browser, url, detail: detail.join("; ") })}\n`);
'
