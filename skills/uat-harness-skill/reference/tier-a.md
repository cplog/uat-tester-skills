# Tier A — static gate

Run commands from `tiers.static` in the manifest.

## Steps

1. Run `node scripts/context.mjs` if not already done this session.
2. Execute:

```bash
bash skills/uat-harness-skill/scripts/tier-a.sh
# or: npm run uat:tier-a
```

3. Both lint and build (or whatever manifest lists) must pass.
4. On failure: fix root cause, re-run Tier A only.

## When to use

- UI copy, layout, styling only
- No API contract or worker changes

## Report

Record commands from manifest output and pass/fail per command.
