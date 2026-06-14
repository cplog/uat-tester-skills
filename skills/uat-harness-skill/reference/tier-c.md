# Tier C — operator flows

Manual UI walkthrough. **Open a live app** in the browser — same URL rules as Tier B.

## Steps

1. **Preflight** — confirm URL (warns if down; you cannot walk UI without a running app):

```bash
npm run uat:preflight
UAT_URL=https://preview.vercel.app npm run uat:preflight
```

2. Start `npm run dev` locally, or use a deployed preview via `--url` / `UAT_URL`.

3. Print scoped checklist:

```bash
npm run uat:tier-c
npm run uat:tier-c -- --flows billing,settings --url https://preview.example.com
```

4. Walk each flow at the printed **Open for Tier C** URL.
5. Use `locale` settings from manifest (toggle, viewport width).
6. If `alert_routes` exists, verify dashboard drill-downs for changed alert types.

## When to use

- Feature UX, i18n, navigation, exports
- After Tier B passes

## Report

List flow `id`s checked, **URL used**, pass/fail per `checks` item, screenshots for failures.
