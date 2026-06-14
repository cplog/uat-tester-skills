# Tier B — deployment smoke

Run commands from `tiers.smoke`. **Requires a live app** at `base_url` or `--url` / `UAT_URL`.

## Steps

1. **Preflight** (required — Tier B exits if this fails):

```bash
npm run uat:preflight
# or with preview:
UAT_URL=https://preview.vercel.app npm run uat:preflight
```

2. Start local app if needed: `npm run dev` (default `http://localhost:3000` from manifest).

3. Execute smoke:

```bash
npm run uat:tier-b
npm run uat:tier-b -- --url https://preview.example.com
```

4. Verify DB connectivity, health endpoints, and smoke script output.

## When to use

- API route changes
- Dashboard data wiring
- Pre-promote to Vercel/production

## Report

Include **URL tested**, smoke script output, and any failing subsystem.
