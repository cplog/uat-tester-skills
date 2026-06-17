# Setup — one-command onboarding

Bootstrap a repo for UAT in one pass:

1. Scaffold `uat-manifest.yml` from repository discovery
2. Wire `uat:*` scripts into `package.json` idempotently
3. Select local vs deployed base URL
4. Run an audit snapshot to show remaining gaps

Use this when the user says:

- "set up UAT here"
- "wire this project for the skill"
- "generate manifest and npm scripts"

## Run

From the consumer project root:

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
node "$SKILL_DIR/scripts/setup.mjs" --yes
```

Dry-run preview:

```bash
node "$SKILL_DIR/scripts/setup.mjs" --dry-run
```

Force regenerate manifest (creates `.bak` backup):

```bash
node "$SKILL_DIR/scripts/setup.mjs" --refresh --yes
```

Environment choice:

```bash
node "$SKILL_DIR/scripts/setup.mjs" --env local --yes
node "$SKILL_DIR/scripts/setup.mjs" --env custom --url https://preview.example.com --yes
```

## Behavior notes

- If `uat-manifest.yml` exists, setup **does not overwrite by default**.
- Use `--refresh` only when the user wants a regenerated manifest.
- Script wiring is idempotent: existing matching `uat:*` entries are kept.
- If `package.json` is missing, manifest is still created.

## What to report back

- Manifest status: created / skipped / refreshed
- Script wiring status: updated / already present / skipped
- Audit result (`Lean already. Ship.` or tagged gaps)
- Chosen base URL (`local`, preview URL, or custom)

## After setup

Recommend next commands:

```bash
npm run uat:preflight
npm run uat:review
npm run uat:tier-a
```
