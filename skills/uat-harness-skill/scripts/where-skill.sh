#!/usr/bin/env bash
# Print skill script directory for npm script wiring in consumer projects.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
echo "$SKILL_DIR"
