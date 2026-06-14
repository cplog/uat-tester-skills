#!/usr/bin/env bash
# Tier C — operator checklist. Usage: tier-c.sh [--flows a,b] [--critical] [--url https://…]
set -euo pipefail

source "$(dirname "$0")/lib/resolve-paths.sh"
ARGS=()
UAT_URL="${UAT_URL:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --flows) ARGS+=(--flows "$2"); shift 2 ;;
    --critical) ARGS+=(--critical); shift ;;
    --url) UAT_URL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST"
  exit 1
fi

BASE_URL="$(node "$READER" "$MANIFEST" meta base_url)"
OPEN_URL="${UAT_URL:-$BASE_URL}"

echo "=== Preflight (open this URL for manual UI) ==="
node "$SKILL_DIR/scripts/preflight.mjs" --pretty ${UAT_URL:+--url "$UAT_URL"} || true
echo ""
echo "Open for Tier C: $OPEN_URL"
echo ""

echo "=== Tier C — operator checklist (manual UI) ==="
if ((${#ARGS[@]} > 0)); then
  node "$READER" "$MANIFEST" checklist "${ARGS[@]}"
else
  node "$READER" "$MANIFEST" checklist
fi
echo ""
echo "Mark items in your UAT report. See docs.userflow in manifest if present."
