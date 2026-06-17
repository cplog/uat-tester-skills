# Tier A — static gate

Run commands from `tiers.static` in the manifest.

## Steps

1. Run `node <skill-dir>/scripts/context.mjs` if not already done this session.
2. Run `node <skill-dir>/scripts/context-signals.mjs --pretty` — if `health` shows blockers, fix them first (see below).
3. Execute:

```bash
npm run uat:tier-a
# or direct:
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
bash "$SKILL_DIR/scripts/tier-a.sh"
```

4. Both lint and build (or whatever manifest lists) must pass.
5. On failure: fix root cause, re-run Tier A only.

## Common blockers

| Failure | Cause | Fix |
|---------|-------|-----|
| `no such directory: .../lint` | Next.js 16 removed `next lint` | `npx @next/codemod@canary next-lint-to-eslint-cli .` then `"lint": "eslint ."` |
| Tier script not found | Stale/missing skill install | `npx skills@latest update uat-harness-skill -y` |

Tier A runs `lib/static-preflight.mjs` before each manifest command and will print the codemod fix when it detects broken `next lint`.

## When to use

- UI copy, layout, styling only
- No API contract or background job changes

## Report

Record commands from manifest output and pass/fail per command.
