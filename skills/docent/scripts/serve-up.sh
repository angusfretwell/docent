#!/bin/sh
# Ensure a docent server is serving this repo, and print where it is. A server
# already answering is reused; a second one is never started.
#
# Usage:  sh serve-up.sh
# Prints: {"serving":true,"url":"http://127.0.0.1:…/"}
#
# Exits non-zero with an actionable message when the server never comes up, so a
# boot failure stops the run rather than spinning.
#
# DOCENT_CLI overrides the CLI invocation, for driving a build other than the
# published one.

set -u

docent_cli="${DOCENT_CLI:-npx -y @angusfretwell/docent@latest}"

if status="$($docent_cli status 2>/dev/null)"; then
  printf '%s\n' "$status"
  exit 0
fi

# nohup, because this outlives the script: the server it starts is what the caller
# opens a browser against, and it runs until the human stops it.
nohup $docent_cli serve >/dev/null 2>&1 &

# `docent serve` records its address on boot, so poll for it rather than sleeping a
# fixed guess — bounded at ~10s.
attempt=0
while [ "$attempt" -lt 50 ]; do
  if status="$($docent_cli status 2>/dev/null)"; then
    printf '%s\n' "$status"
    exit 0
  fi
  attempt=$((attempt + 1))
  sleep 0.2
done

echo "docent serve did not come up within ~10s — run '$docent_cli serve' in this repo to see the boot error, then re-run /docent" >&2
exit 1
