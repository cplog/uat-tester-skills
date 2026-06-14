#!/usr/bin/env bash
# Tier D — worker lane. Usage: tier-d.sh [--full] [--service daq]
set -euo pipefail

source "$(dirname "$0")/lib/resolve-paths.sh"
FULL=0
SERVICE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --full) FULL=1; shift ;;
    --service) SERVICE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST"
  exit 1
fi

echo "=== Tier D — worker ($(node "$READER" "$MANIFEST" meta project_id)) ==="
echo "Safety:"
node "$READER" "$MANIFEST" safety | sed 's/^/  /' 2>/dev/null || true

TIER_CMD=worker
if [[ "$FULL" -eq 1 ]]; then
  TIER_CMD=worker_all
fi

while IFS= read -r cmd; do
  [[ -z "$cmd" ]] && continue
  echo "→ $cmd"
  (cd "$PROJECT_ROOT" && eval "$cmd")
done < <(node "$READER" "$MANIFEST" commands "$TIER_CMD")

if [[ -n "$SERVICE" ]]; then
  echo "=== Extra service: $SERVICE ==="
  while IFS= read -r cmd; do
    [[ -z "$cmd" ]] && continue
    echo "→ $cmd"
    (cd "$PROJECT_ROOT" && eval "$cmd")
  done < <(node "$READER" "$MANIFEST" commands extra "$SERVICE")
fi

echo "Tier D passed."
