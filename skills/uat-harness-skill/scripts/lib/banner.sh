#!/usr/bin/env bash
# UAT harness ASCII banner for bash scripts. UAT_NO_BANNER=1 to suppress.

uat_banner() {
  if [[ "${UAT_NO_BANNER:-}" == "1" || "${UAT_NO_BANNER:-}" == "true" ]]; then
    return 0
  fi
  cat <<'EOF'

    ██╗   ██╗ █████╗ ████████╗
    ██║   ██║██╔══██╗╚══██╔══╝
    ██║   ██║███████║   ██║
    ██║   ██║██╔══██║   ██║
    ╚██████╔╝██║  ██║   ██║
     ╚═════╝ ╚═╝  ╚═╝   ╚═╝
  ╭─ harness ────────────────────────────────────────────╮
  │  [ A ] static   [ B ] smoke   [ C ] flows   [ D ]   │
  │  manifest-first · operator acceptance · agents      │
  ╰─────────────────────────────────────────────────────╯

EOF
}

uat_banner_compact() {
  if [[ "${UAT_NO_BANNER:-}" == "1" || "${UAT_NO_BANNER:-}" == "true" ]]; then
    return 0
  fi
  cat <<'EOF'
╭─ UAT HARNESS ─────────────────────────────────────╮
│  ◈ A static   ◈ B smoke   ◈ C flows   ◈ D worker │
│  manifest-first · operator acceptance · agents   │
╰──────────────────────────────────────────────────╯
EOF
  echo ""
}
