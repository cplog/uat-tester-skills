# Tier A — static gate

Run commands from `tiers.static` in the manifest.

## Steps

1. Run `node <skill-dir>/scripts/context.mjs` if not already done this session.
2. Execute:

```bash
npm run uat:tier-a
# or direct:
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
bash "$SKILL_DIR/scripts/tier-a.sh"
```

3. Both lint and build (or whatever manifest lists) must pass.
4. On failure: fix root cause, re-run Tier A only.

## When to use

- UI copy, layout, styling only
- No API contract or background job changes

## Report

Record commands from manifest output and pass/fail per command.
