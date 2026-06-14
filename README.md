# uat-tester-skills

Manifest-driven UAT harness for AI coding agents and optional Playwright CLI.

Repository: [github.com/cplog/uat-tester-skills](https://github.com/cplog/uat-tester-skills)

- **Agent skill** — `skills/uat-harness-skill/` (install via `npx skills`)
- **Playwright CLI** — `cli/` (`npx uat test` when built)
- **Per-project config** — `uat-manifest.yml` lives in each consumer repo, not here

## Install (consumer project)

Project-scoped install (default). The skill lands in `.agents/skills/`; Cursor reads it via a symlink under `.cursor/skills/`.

```bash
cd /path/to/your-app

npx skills add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -y

SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
cp "$SKILL_DIR/templates/manifest-template.yml" ./uat-manifest.yml
# edit flows, tiers, destructive_commands
```

Or ask the agent to run the **`init`** sub-command to scaffold `uat-manifest.yml` from your codebase instead of copying the template.

Add npm scripts to the consumer `package.json` (required for `npm run uat:*` below):

```json
{
  "scripts": {
    "uat:preflight": "node .agents/skills/uat-harness-skill/scripts/preflight.mjs --pretty",
    "uat:signals": "node .agents/skills/uat-harness-skill/scripts/context-signals.mjs --pretty",
    "uat:tier-a": "bash .agents/skills/uat-harness-skill/scripts/tier-a.sh",
    "uat:tier-b": "bash .agents/skills/uat-harness-skill/scripts/tier-b.sh",
    "uat:tier-c": "bash .agents/skills/uat-harness-skill/scripts/tier-c.sh",
    "uat:tier-d": "bash .agents/skills/uat-harness-skill/scripts/tier-d.sh"
  }
}
```

Reload Cursor after install.

If `where-skill.sh` fails, confirm install with `npx skills list -a cursor`.

**Do not use `-g` (global install)** unless you also change npm script paths — global install puts the skill in `~/.cursor/skills/`, not `.agents/skills/`.

## Install (maintainers — local clone)

```bash
cd /path/to/your-app
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
npx skills add "$UAT_SKILL_REPO" --skill uat-harness-skill -a cursor -y
```

Then follow the same manifest and npm script steps as above.

## Layout

```
uat-tester-skills/
├── skills/uat-harness-skill/   # Canonical agent skill (SKILL.md, scripts, reference)
├── cli/                        # Optional Playwright package (@uat-tester/cli)
├── examples/                   # Sample manifest (not product-specific)
└── package.json                # Dev helpers for this repo
```

## Run tiers (from consumer repo root)

After install, npm scripts, and `uat-manifest.yml`:

```bash
npm run uat:preflight
npm run uat:tier-a
npm run uat:tier-b -- --url http://127.0.0.1:3000
npm run uat:tier-c -- --flows billing,settings
npm run uat:tier-d
npm run uat:signals
```

| Tier | Manifest key | Purpose |
|------|--------------|---------|
| A | `tiers.static` | Lint / build — no running app |
| B | `tiers.smoke` | Live app smoke / health |
| C | `flows[]` | Operator UI checklist |
| D | `tiers.worker` | Background jobs (optional) |

## Update skill

```bash
npx skills update uat-harness-skill -y
```

## CLI (optional)

```bash
cd cli && npm install && npm run build
npx uat test --manifest ../examples/uat-manifest.example.yml
```
