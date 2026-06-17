# Review — diff-scoped UAT scope

Recommend **minimal tiers and flows** for the current git diff. Like ponytail-review for complexity, but for acceptance coverage: what to run for *this* change, not the whole repo.

**Boundary:** scope recommendation only — runs no tiers. Code quality, security, and performance belong in a normal review pass, not here.

## Step 1: Run review

From the consumer project root:

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"

node "$SKILL_DIR/scripts/review.mjs" --pretty
node "$SKILL_DIR/scripts/review.mjs" --base develop   # compare against a branch
node "$SKILL_DIR/scripts/review.mjs" --json
```

## Step 2: Interpret output

| Tag | Meaning |
|-----|---------|
| `tier-a:` | Run static gate (lint/build) |
| `tier-b:` | Run deployment smoke |
| `tier-c:` | Run operator walkthrough; `--flows` when inferred |
| `tier-d:` | Run worker lane |
| `tier-e:` | Run extra service smoke via `tier-d --service` |
| `skip:` | Tier not needed for this diff |
| `preflight:` | App down — start dev or set `UAT_URL` before B/C |
| `init:` | No manifest — scaffold first |

End line:

- `net: run A + C(billing). ~2 tier(s), ~1 flow(s).` — minimal scope summary
- `Clean diff. Nothing to UAT.` — no changed files
- `net: run init first.` — missing manifest

## Step 3: Act on recommendations

1. Run only the tiers listed in `net:` (not every skip line).
2. Narrow Tier C with `--flows` when review names specific flow ids.
3. If preflight blocks B/C, start the app then re-run review.
4. After tiers complete, follow [report.md](report.md).

## Review vs audit

| Command | Scope | Question |
|---------|-------|----------|
| **review** | Git diff | What should I UAT for *this PR*? |
| **audit** | Whole repo | What routes lack manifest coverage? |

Run **review** before every PR UAT. Run **audit** when refreshing `uat-manifest.yml` or onboarding a repo.

## Step 4: When user asks without a sub-command

If intent is "what should I test for this change?" → run `review.mjs`, not full `context-signals` alone.

Do not auto-run tiers without user confirmation when Tier D or destructive scripts are recommended.
