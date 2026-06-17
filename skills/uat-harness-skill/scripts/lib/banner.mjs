/**
 * UAT harness banner — shown on install and --pretty CLI output.
 * Set UAT_NO_BANNER=1 to suppress (CI / agent token savings).
 */

export const BANNER_COMPACT = `
╭─ UAT HARNESS ─────────────────────────────────────╮
│  ◈ A static   ◈ B smoke   ◈ C flows   ◈ D worker │
│  manifest-first · operator acceptance · agents   │
╰──────────────────────────────────────────────────╯`.trim();

export const BANNER_FULL = `
    ██╗   ██╗ █████╗ ████████╗
    ██║   ██║██╔══██╗╚══██╔══╝
    ██║   ██║███████║   ██║
    ██║   ██║██╔══██║   ██║
    ╚██████╔╝██║  ██║   ██║
     ╚═════╝ ╚═╝  ╚═╝   ╚═╝
  ╭─ harness ────────────────────────────────────────────╮
  │  [ A ] static gate    lint · build · typecheck      │
  │  [ B ] deploy smoke   preflight · health · API      │
  │  [ C ] operator flows CDP walkthrough · checklist   │
  │  [ D ] worker lane    cron · queue · extra services │
  │  uat-manifest.yml · cplog/uat-tester-skills         │
  ╰─────────────────────────────────────────────────────╯`.trim();

export function shouldShowBanner() {
  const v = (process.env.UAT_NO_BANNER || '').trim().toLowerCase();
  return !(v === '1' || v === 'true' || v === 'yes');
}

export function printBanner(mode = 'compact') {
  if (!shouldShowBanner()) return;
  const art = mode === 'full' ? BANNER_FULL : BANNER_COMPACT;
  console.log(art);
  console.log('');
}
