#!/usr/bin/env bash
# Resolve SKILL_DIR (this skill package) and PROJECT_ROOT (consumer repo).
# Source from tier-*.sh:  source "$(dirname "$0")/lib/resolve-paths.sh"
set -euo pipefail

_skill_script_dir="$(cd "$(dirname "${BASH_SOURCE[1]:-${BASH_SOURCE[0]}}")" && pwd)"
SKILL_DIR="$(cd "$_skill_script_dir/.." && pwd)"

_uat_find_project_root() {
  local dir="${PWD}"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/uat-manifest.yml" ]]; then
      echo "$dir"
      return 0
    fi
    if [[ -f "$dir/package.json" ]]; then
      echo "$dir"
      return 0
    fi
    dir="$(dirname "$dir")"
  done
  echo "${PWD}"
}

PROJECT_ROOT="$(_uat_find_project_root)"
MANIFEST="${UAT_MANIFEST:-$PROJECT_ROOT/uat-manifest.yml}"
READER="$SKILL_DIR/scripts/lib/read-manifest.mjs"
