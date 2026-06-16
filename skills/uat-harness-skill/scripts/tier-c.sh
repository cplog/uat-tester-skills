#!/usr/bin/env bash
# Tier C — operator flows. Usage: tier-c.sh [--flows a,b] [--critical] [--url https://…] [--manual]
set -euo pipefail

source "$(dirname "$0")/lib/resolve-paths.sh"
ARGS=()
UAT_URL="${UAT_URL:-}"
FORCE_MANUAL=0
CDP_PORT="${UAT_CDP_PORT:-9222}"
CDP_URL="${UAT_CDP_URL:-http://127.0.0.1:${CDP_PORT}}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --flows) ARGS+=(--flows "$2"); shift 2 ;;
    --critical) ARGS+=(--critical); shift ;;
    --url) UAT_URL="$2"; shift 2 ;;
    --manual) FORCE_MANUAL=1; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST"
  exit 1
fi

BASE_URL="$(node "$READER" "$MANIFEST" meta base_url)"
OPEN_URL="${UAT_URL:-$BASE_URL}"

echo "=== Preflight (open this URL for Tier C) ==="
node "$SKILL_DIR/scripts/preflight.mjs" --pretty ${UAT_URL:+--url "$UAT_URL"} || true
echo ""
echo "Open for Tier C: $OPEN_URL"
echo ""

_cdp_available() {
  curl -sf "${CDP_URL}/json/version" >/dev/null 2>&1
}

if [[ "$FORCE_MANUAL" -eq 0 ]] && _cdp_available; then
  export UAT_CDP_URL="$CDP_URL"
  node "$SKILL_DIR/scripts/tier-c-automation.mjs" \
    --manifest "$MANIFEST" \
    --url "$OPEN_URL" \
    "${ARGS[@]:-}"
  exit 0
fi

echo "=== Tier C — operator checklist (manual UI) ==="
if [[ "$FORCE_MANUAL" -eq 0 ]]; then
  echo ""
  echo "CDP browser not detected at ${CDP_URL}."
  echo "For automated Tier C (logged-in browser):"
  echo "  npm run uat:browser"
  echo "  npm install -D playwright   # optional, for browser-control.mjs"
  echo "Then re-run: npm run uat:tier-c"
  echo ""
  echo "Or pass --manual to skip this hint."
  echo ""
fi

if ((${#ARGS[@]} > 0)); then
  node "$READER" "$MANIFEST" checklist "${ARGS[@]}"
else
  node "$READER" "$MANIFEST" checklist
fi
echo ""
echo "Mark items in your UAT report. See docs.userflow in manifest if present."
