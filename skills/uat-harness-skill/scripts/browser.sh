#!/usr/bin/env bash
# Launch Chrome/Edge with remote debugging for Tier C automation.
# Uses a dedicated profile (login once; sessions persist). Override with UAT_CHROME_USER_DATA.
set -euo pipefail

CDP_PORT="${UAT_CDP_PORT:-9222}"
USER_DATA="${UAT_CHROME_USER_DATA:-${HOME}/.uat-harness/chrome-profile}"
CDP_URL="http://127.0.0.1:${CDP_PORT}"

_uat_find_chrome() {
  if [[ -n "${UAT_CHROME_BIN:-}" ]] && [[ -x "$UAT_CHROME_BIN" ]]; then
    echo "$UAT_CHROME_BIN"
    return 0
  fi
  local candidates=()
  case "$(uname -s)" in
    Darwin)
      candidates=(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        "/Applications/Chromium.app/Contents/MacOS/Chromium"
      )
      ;;
    Linux)
      candidates=(google-chrome google-chrome-stable chromium chromium-browser microsoft-edge)
      ;;
    MINGW*|MSYS*|CYGWIN*)
      candidates=(
        "${PROGRAMFILES}/Google/Chrome/Application/chrome.exe"
        "${PROGRAMFILES(x86)}/Google/Chrome/Application/chrome.exe"
      )
      ;;
  esac
  for c in "${candidates[@]}"; do
    if [[ -x "$c" ]] || command -v "$c" >/dev/null 2>&1; then
      echo "$c"
      return 0
    fi
  done
  return 1
}

if curl -sf "${CDP_URL}/json/version" >/dev/null 2>&1; then
  echo "Browser already listening on ${CDP_URL}"
  echo "Profile: ${USER_DATA}"
  exit 0
fi

CHROME="$(_uat_find_chrome)" || {
  echo "Chrome/Edge not found. Set UAT_CHROME_BIN to your browser executable." >&2
  exit 1
}

mkdir -p "$USER_DATA"

echo "Starting browser with CDP on port ${CDP_PORT}"
echo "Profile: ${USER_DATA} (log in once; sessions persist for Tier C)"
echo "Verify: curl -s ${CDP_URL}/json/version"

if [[ "$(uname -s)" == "Darwin" ]] && [[ "$CHROME" == *".app/"* ]]; then
  "$CHROME" \
    "--remote-debugging-port=${CDP_PORT}" \
    "--user-data-dir=${USER_DATA}" \
    ${UAT_BROWSER_EXTRA_ARGS:-} \
    "$@" &
else
  "$CHROME" \
    "--remote-debugging-port=${CDP_PORT}" \
    "--user-data-dir=${USER_DATA}" \
    "${UAT_BROWSER_EXTRA_ARGS:-}" \
    "$@" &
fi

for _ in $(seq 1 30); do
  if curl -sf "${CDP_URL}/json/version" >/dev/null 2>&1; then
    echo "CDP ready: ${CDP_URL}"
    exit 0
  fi
  sleep 0.5
done

echo "Browser started but CDP not reachable yet at ${CDP_URL}. Wait a few seconds and retry." >&2
exit 1
