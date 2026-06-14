# uat-tester

Manifest-driven UAT harness for AI coding agents and optional Playwright CLI.

- **Agent skill** — `skills/uat-harness-skill/` (install via `npx skills`)
- **Playwright CLI** — `cli/` (`npx uat test` when built)
- **Per-project config** — `uat-manifest.yml` lives in each consumer repo, not here

## Quick install (consumer project)

```bash
cd /path/to/your-app

# Local path (this machine)
npx skills add /Users/erictaicp/work/uat-tester --skill uat-harness-skill -a cursor -y

# From GitHub
npx skills add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -y

cp .agents/skills/uat-harness-skill/templates/manifest-template.yml ./uat-manifest.yml
# edit flows, tiers, destructive_commands
```

Wire npm scripts in the consumer `package.json` (see `skills/uat-harness-skill/SKILL.md`).

Reload Cursor after install.

## Layout

```
uat-tester/
├── skills/uat-harness-skill/   # Canonical agent skill (SKILL.md, scripts, reference)
├── cli/                        # Optional Playwright package (@uat-tester/cli)
├── examples/                   # Sample manifest (not product-specific)
└── package.json                # Dev helpers for this repo
```

## Run tiers (from consumer repo root)

After install + `uat-manifest.yml`:

```bash
npm run uat:preflight
npm run uat:tier-a
npm run uat:tier-b -- --url http://127.0.0.1:3000
npm run uat:tier-c -- --flows billing,settings
npm run uat:tier-d
npm run uat:signals
```

## Control Tower

Tom Lee Control Tower keeps its product manifest at `control-tower/uat-manifest.yml` and installs this skill from:

```bash
npm run skills:install   # in control-tower
```

Set `UAT_SKILL_REPO` to override the default local path.

## Update skill

```bash
npx skills update uat-harness-skill -y
```

## CLI (optional)

```bash
cd cli && npm install && npm run build
npx uat test --manifest ../examples/uat-manifest.example.yml
```
