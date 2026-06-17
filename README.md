```
    ██╗   ██╗ █████╗ ████████╗
    ██║   ██║██╔══██╗╚══██╔══╝
    ██║   ██║███████║   ██║
    ██║   ██║██╔══██║   ██║
    ╚██████╔╝██║  ██║   ██║
     ╚═════╝ ╚═╝  ╚═╝   ╚═╝
  ╭─ harness ────────────────────────────────────────────╮
  │  [ A ] static   [ B ] smoke   [ C ] flows   [ D ]   │
  │  manifest-first · operator acceptance · agents      │
  ╰─────────────────────────────────────────────────────╯
```

Manifest-driven UAT harness for AI coding agents and optional Playwright CLI.

Repository: [github.com/cplog/uat-tester-skills](https://github.com/cplog/uat-tester-skills)

- **Agent skill** — `skills/uat-harness-skill/` (install via `npx skills`)
- **Playwright CLI** — `cli/` (`npx uat test` when built)
- **Per-project config** — `uat-manifest.yml` lives in each consumer repo, not here

## Quick Start (5 minutes)

Use this path for first-time setup in any app repo.

```bash
cd /path/to/your-app

# 1) Install the skill package
npx skills@latest add cplog/uat-tester-skills --skill uat-harness-skill -y

# 2) Bootstrap manifest + uat:* scripts
node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes

# 3) Verify and choose minimum test scope
npm run uat:preflight
npm run uat:review
```

What setup does:

- Creates `uat-manifest.yml` if missing
- Adds `uat:*` scripts to `package.json` (idempotent)
- Runs a quick audit snapshot

Reload your agent after install.

## Local vs deployed target

Default target is local: `http://127.0.0.1:3000`.

Use deployed preview instead:

```bash
node .agents/skills/uat-harness-skill/scripts/setup.mjs --env custom --url https://preview.example.com --yes
```

At runtime you can also override with `UAT_URL` or `--url`:

```bash
UAT_URL=https://preview.example.com npm run uat:tier-b
npm run uat:tier-c -- --url https://preview.example.com
```

## Daily workflow

```bash
npm run uat:review    # What to run for this PR (diff-scoped)
npm run uat:tier-a
npm run uat:tier-b
npm run uat:tier-c -- --flows billing,settings
npm run uat:audit     # Whole-repo coverage gaps
```

`uat:review` answers: "what should I test for this change?"  
`uat:audit` answers: "what routes/endpoints are still uncovered?"

## Common scripts

`setup.mjs` wires this script set:

```json
{
  "scripts": {
    "uat:setup": "node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes",
    "uat:preflight": "node .agents/skills/uat-harness-skill/scripts/preflight.mjs --pretty",
    "uat:signals": "node .agents/skills/uat-harness-skill/scripts/context-signals.mjs --pretty",
    "uat:discover": "node .agents/skills/uat-harness-skill/scripts/discover.mjs --pretty",
    "uat:review": "node .agents/skills/uat-harness-skill/scripts/review.mjs --pretty",
    "uat:audit": "node .agents/skills/uat-harness-skill/scripts/audit.mjs --pretty",
    "uat:codegen": "node .agents/skills/uat-harness-skill/scripts/codegen.mjs --force",
    "uat:tier-a": "bash .agents/skills/uat-harness-skill/scripts/tier-a.sh",
    "uat:tier-b": "bash .agents/skills/uat-harness-skill/scripts/tier-b.sh",
    "uat:tier-c": "bash .agents/skills/uat-harness-skill/scripts/tier-c.sh",
    "uat:tier-d": "bash .agents/skills/uat-harness-skill/scripts/tier-d.sh",
    "uat:browser": "bash .agents/skills/uat-harness-skill/scripts/browser.sh"
  }
}
```

## Advanced setup

- List skills before install:  
  `npx skills@latest add cplog/uat-tester-skills --list`
- Multi-repo backend discovery:  
  `UAT_DISCOVER_PATHS=../backend-api npm run uat:discover`
- Prefer deterministic scaffold with no file writes:  
  `node .agents/skills/uat-harness-skill/scripts/setup.mjs --dry-run`
- Prefer interview-driven scaffold (agent-guided): use the `init` sub-command.
- If `where-skill.sh` fails: `npx skills list`
- Avoid `-g` unless you also rewrite npm script paths.
- Suppress UAT banner in CI: `UAT_NO_BANNER=1`

## Troubleshooting

- `setup.mjs` says `--env custom requires --url`  
  Provide a full URL with protocol:  
  `node .agents/skills/uat-harness-skill/scripts/setup.mjs --env custom --url https://preview.example.com --yes`
- `setup.mjs` says `invalid package.json`  
  Fix JSON syntax first, then rerun setup.
- Existing custom `uat:*` scripts were not changed  
  Setup keeps your custom commands and lists conflicts; update manually only if you want the defaults.
- `uat:preflight` fails on localhost  
  Start the app (`npm run dev`) or use deployed URL via `UAT_URL` / `--url`.

## Install (maintainers — local clone)

```bash
cd /path/to/your-app
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
# optional: export UAT_AGENTS="cursor codex"
npx skills@latest add "$UAT_SKILL_REPO" --skill uat-harness-skill -y
```

Then follow the same manifest and npm script steps as above.

## Example

See [`examples/consumer-demo/`](examples/consumer-demo/) for a runnable dependency-free web app, its `uat-manifest.yml`, and `uat-run.log` (a recorded tier A/B/C run against the demo server).

```bash
cd examples/consumer-demo
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
npx skills@latest add "$UAT_SKILL_REPO" --skill uat-harness-skill -y
npm run dev   # in another terminal
npm run uat:preflight && npm run uat:tier-a && npm run uat:tier-b -- --url http://127.0.0.1:3000 && npm run uat:tier-c
```

## Layout

```
uat-tester-skills/
├── skills/uat-harness-skill/   # Canonical agent skill (SKILL.md, scripts, reference)
├── cli/                        # Optional Playwright package (@uat-tester/cli)
├── examples/
│   ├── consumer-demo/          # Runnable example + recorded UAT run
│   └── uat-manifest.example.yml
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
| C | `flows[]` | Operator UI checklist (CDP automation or manual) |
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
