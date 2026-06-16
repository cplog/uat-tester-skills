#!/usr/bin/env bash
# Install uat-harness-skill into the current consumer project via npx skills.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
DEFAULT_REPO="$(cd "$SKILL_DIR/../.." && pwd)"
REPO="${UAT_SKILL_REPO:-$DEFAULT_REPO}"

_uat_find_project_root() {
  local dir="${PWD}"
  while [[ "$dir" != "/" ]]; do
    if [[ -f "$dir/uat-manifest.yml" ]] || [[ -f "$dir/package.json" ]]; then
      if [[ "$dir" != "$DEFAULT_REPO" ]] || [[ -f "$dir/uat-manifest.yml" ]]; then
        echo "$dir"
        return 0
      fi
    fi
    dir="$(dirname "$dir")"
  done
  echo "${PWD}"
}

PROJECT_ROOT="$(_uat_find_project_root)"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required. Install Node.js, then re-run." >&2
  exit 1
fi

echo "Installing uat-harness-skill from: $REPO"
echo "Consumer project root: $PROJECT_ROOT"

AGENTS_ARGS=()
if [[ -n "${UAT_AGENTS:-}" ]]; then
  for a in $UAT_AGENTS; do AGENTS_ARGS+=(-a "$a"); done
  echo "Target agents: $UAT_AGENTS"
else
  echo "Target agents: auto-detect (set UAT_AGENTS=\"cursor codex\" to override)"
fi

(cd "$PROJECT_ROOT" && npx skills add "$REPO" --skill uat-harness-skill "${AGENTS_ARGS[@]:-}" -y)

SKILL_DST="$PROJECT_ROOT/.agents/skills/uat-harness-skill"
if [[ ! -d "$SKILL_DST" ]]; then
  echo "Install may have failed — .agents/skills/uat-harness-skill not found." >&2
  echo "Run: npx skills list" >&2
  exit 1
fi

echo ""
echo "Installed: $SKILL_DST"
echo "Next steps (from $PROJECT_ROOT):"
echo "  SKILL_DIR=\"\$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)\""
echo "  cp \"\$SKILL_DIR/templates/manifest-template.yml\" ./uat-manifest.yml"
echo "  # Add uat:* npm scripts — see README or SKILL.md Install section"
echo "  # Reload your agent after install"
