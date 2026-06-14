#!/usr/bin/env bash
# Tier B — portal smoke. Commands from uat-manifest.yml tiers.smoke
# Usage: tier-b.sh [--url https://preview.vercel.app]
set -euo pipefail

source "$(dirname "$0")/lib/resolve-paths.sh"
UAT_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url) UAT_URL="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST"
  exit 1
fi

export UAT_URL
PREFLIGHT_ARGS=(--pretty --require)
[[ -n "$UAT_URL" ]] && PREFLIGHT_ARGS+=(--url "$UAT_URL")
echo "=== Preflight (app must be reachable) ==="
if ! node "$SKILL_DIR/scripts/preflight.mjs" "${PREFLIGHT_ARGS[@]}"; then
  echo ""
  echo "Tier B blocked until the app responds. Start npm run dev or pass --url <deployed-preview>."
  exit 1
fi
echo ""

echo "=== Tier B — smoke ($(node "$READER" "$MANIFEST" meta project_id)) ==="
URL_FLAG="$(node "$READER" "$MANIFEST" smoke_url_flag)"

while IFS= read -r cmd; do
  [[ -z "$cmd" ]] && continue
  if [[ -n "$UAT_URL" && -n "$URL_FLAG" ]]; then
    echo "→ $cmd $URL_FLAG $UAT_URL"
    (cd "$PROJECT_ROOT" && eval "$cmd $URL_FLAG $UAT_URL")
  else
    echo "→ $cmd"
    (cd "$PROJECT_ROOT" && eval "$cmd")
  fi
done < <(node "$READER" "$MANIFEST" commands smoke)

echo "Tier B passed."
