#!/usr/bin/env bash
# Example on-gate-blocked hook: post a notification to ntfy.sh.
#
# This file is not installed. DocPath only runs scripts placed in
# .docpath/hooks/. To enable it:
#
#   cp docs/examples/hooks/on-gate-blocked.sh .docpath/hooks/on-gate-blocked.sh
#   export DOCPATH_NTFY_TOPIC=your-topic
#
# When DOCPATH_NTFY_TOPIC is unset or empty, the script exits 0 and does not
# contact the network. A non-zero curl status is reported by the hook runner
# as a warning; it does not change the gate outcome.
set -u

topic="${DOCPATH_NTFY_TOPIC:-}"
if [ -z "$topic" ]; then
  exit 0
fi

# The runner writes a JSON payload on stdin. Drain it so a full pipe cannot
# stall the gate. The message itself uses the environment variables.
cat >/dev/null || true

message=$(printf 'DocPath gate blocked\ngate: %s\ntask: %s\nstep: %s\nreason: %s\npaths: %s' \
  "${DOCPATH_GATE:-}" \
  "${DOCPATH_TASK:-}" \
  "${DOCPATH_STEP:-}" \
  "${DOCPATH_REASON:-}" \
  "${DOCPATH_PATHS:-[]}")

curl -fsS -d "$message" "https://ntfy.sh/${topic}"
