#!/usr/bin/env bash
# Install uat-harness-skill into the current consumer project (Cursor + .agents).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_REPO="$(cd "$SKILL_DIR/../.." && pwd)"

_uat_find_project_root() {
  local dir="${PWD}"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/uat-manifest.yml" ]] || [[ -f "$dir/package.json" ]]; then
      # Prefer consumer repo over skill repo when cwd is uat-tester itself
      if [[ "$dir" != "$SKILL_REPO" ]] || [[ -f "$dir/uat-manifest.yml" ]]; then
        echo "$dir"
        return 0
      fi
    fi
    dir="$(dirname "$dir")"
  done
  echo "${PWD}"
}

PROJECT_ROOT="$(_uat_find_project_root)"
CURSOR_DST="$PROJECT_ROOT/.cursor/skills/uat-harness-skill"

mkdir -p "$CURSOR_DST"
cp "$SKILL_DIR/SKILL.md" "$CURSOR_DST/SKILL.md"
cp "$SKILL_DIR/reference.md" "$CURSOR_DST/reference.md"
cp -R "$SKILL_DIR/reference" "$CURSOR_DST/reference" 2>/dev/null || true

chmod +x "$SKILL_DIR/scripts/"*.sh 2>/dev/null || true

if command -v npx >/dev/null 2>&1; then
  npx skills add "$SKILL_REPO" --skill uat-harness-skill -a cursor -y 2>/dev/null || true
fi

echo "Skill repo: $SKILL_REPO"
echo "Installed Cursor copy: $CURSOR_DST"
echo "Project manifest: ${UAT_MANIFEST:-$PROJECT_ROOT/uat-manifest.yml}"
