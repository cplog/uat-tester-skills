#!/usr/bin/env bash
# Tier A — static gate (lint + build). Commands from uat-manifest.yml tiers.static
set -euo pipefail

source "$(dirname "$0")/lib/resolve-paths.sh"

if [[ ! -f "$MANIFEST" ]]; then
  echo "Missing manifest: $MANIFEST"
  echo "Copy template: cp \"$SKILL_DIR/templates/manifest-template.yml\" ./uat-manifest.yml"
  exit 1
fi

echo "=== Tier A — static ($(node "$READER" "$MANIFEST" meta project_id)) ==="
while IFS= read -r cmd; do
  [[ -z "$cmd" ]] && continue
  echo "→ $cmd"
  (cd "$PROJECT_ROOT" && eval "$cmd")
done < <(node "$READER" "$MANIFEST" commands static)

echo "Tier A passed."
