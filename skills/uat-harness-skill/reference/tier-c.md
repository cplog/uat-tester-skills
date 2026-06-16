# Tier C — operator flows

Tier C verifies operator UI journeys from `flows[]` in the manifest. It supports **automated** walkthrough (logged-in browser via CDP) or **manual** checklist fallback.

## Automated (recommended when auth matters)

Uses Chrome DevTools Protocol (CDP) to attach to the user's browser — sessions and cookies persist in a dedicated profile.

### Setup (once per machine)

```bash
npm install -D playwright   # for browser-control.mjs helpers
npm run uat:browser         # launches Chrome with CDP on :9222
```

Log in to your app in that browser window once. The profile lives at `~/.uat-harness/chrome-profile` (override with `UAT_CHROME_USER_DATA`).

### Run

```bash
npm run uat:preflight
npm run dev                   # or use preview URL
npm run uat:tier-c
npm run uat:tier-c -- --flows billing,settings --url https://preview.example.com
```

When CDP is available, `tier-c.sh` prints **subagent dispatch instructions**. The main agent must launch a subagent (Task tool) to:

1. Connect via `node <skill-dir>/scripts/lib/browser-control.mjs ping`
2. Navigate each flow URL and verify natural-language `checks`
3. Return pass/fail per check with screenshot paths on failure

### Browser control helpers

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
node "$SKILL_DIR/scripts/lib/browser-control.mjs" ping
node "$SKILL_DIR/scripts/lib/browser-control.mjs" navigate http://127.0.0.1:3000/settings
node "$SKILL_DIR/scripts/lib/browser-control.mjs" screenshot /tmp/uat-home.png
```

Environment: `UAT_CDP_URL` (default `http://127.0.0.1:9222`), `UAT_CDP_PORT`, `UAT_CHROME_BIN`.

## Manual fallback

If CDP is not running, Tier C prints a human checklist (same as before):

```bash
npm run uat:tier-c -- --manual
# or direct:
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
bash "$SKILL_DIR/scripts/tier-c.sh" --manual
```

Walk each flow at the printed **Open for Tier C** URL. Use `locale` settings from manifest (toggle, viewport width).

## When to use

- Feature UX, i18n, navigation, exports
- After Tier B passes
- Staging/production flows that need an existing login session

## Report

List flow `id`s checked, **URL used**, pass/fail per `checks` item, screenshots for failures. See [report.md](report.md).
