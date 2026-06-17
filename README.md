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

## Install (consumer project)

Project-scoped install (default). The skill lands in `.agents/skills/` — the shared path for Cursor, Codex, OpenCode, Amp, Gemini, GitHub Copilot, and other [npx skills](https://github.com/vercel-labs/skills)-supported agents. Cursor also reads via a symlink under `.cursor/skills/`.

```bash
cd /path/to/your-app

# Auto-detects your agent(s); omit -a or pass one or more explicitly
npx skills@latest add cplog/uat-tester-skills --skill uat-harness-skill -y
# List skills in the repo first:
# npx skills@latest add cplog/uat-tester-skills --list

SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
cp "$SKILL_DIR/templates/manifest-template.yml" ./uat-manifest.yml
# edit flows, tiers, destructive_commands
```

Or ask the agent to run the **`init`** sub-command to scaffold `uat-manifest.yml` from your codebase instead of copying the template.

Add npm scripts to the consumer `package.json` (required for `npm run uat:*` below):

```json
{
  "scripts": {
    "uat:setup": "node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes",
    "uat:preflight": "node .agents/skills/uat-harness-skill/scripts/preflight.mjs --pretty",
    "uat:signals": "node .agents/skills/uat-harness-skill/scripts/context-signals.mjs --pretty",
    "uat:tier-a": "bash .agents/skills/uat-harness-skill/scripts/tier-a.sh",
    "uat:tier-b": "bash .agents/skills/uat-harness-skill/scripts/tier-b.sh",
    "uat:tier-c": "bash .agents/skills/uat-harness-skill/scripts/tier-c.sh",
    "uat:tier-d": "bash .agents/skills/uat-harness-skill/scripts/tier-d.sh",
    "uat:browser": "bash .agents/skills/uat-harness-skill/scripts/browser.sh",
    "uat:discover": "node .agents/skills/uat-harness-skill/scripts/discover.mjs --pretty",
    "uat:review": "node .agents/skills/uat-harness-skill/scripts/review.mjs --pretty",
    "uat:audit": "node .agents/skills/uat-harness-skill/scripts/audit.mjs --pretty",
    "uat:codegen": "node .agents/skills/uat-harness-skill/scripts/codegen.mjs --force"
  }
}
```

One-command onboarding + discovery/audit:

```bash
npm run uat:setup             # scaffold uat-manifest.yml + wire uat:* scripts
npm run uat:discover          # routes + API endpoints in repo
npm run uat:review            # diff-scoped: minimal tiers/flows for this PR
npm run uat:audit             # whole-repo coverage gaps (tagged output)
node .agents/skills/uat-harness-skill/scripts/discover.mjs --draft   # suggested YAML
npm run uat:codegen           # Playwright skeleton → .uat/generated/flows.spec.ts
```

**Review vs audit:** `uat:review` answers “what should I UAT for *this change*?” (git diff). `uat:audit` answers “what routes lack manifest coverage?” (whole repo). Use `deferred_coverage[]` in the manifest for paths intentionally covered only by smoke (see skill `reference/audit.md`).

`uat:setup` chooses base URL automatically (`http://127.0.0.1:3000` by default). To target preview/deployed directly:

```bash
node .agents/skills/uat-harness-skill/scripts/setup.mjs --env custom --url https://preview.example.com --yes
```

Multi-repo backend (sibling API repo):

```bash
UAT_DISCOVER_PATHS=../backend-api npm run uat:discover
```

Or add `linked_repos` in `uat-manifest.yml` (see skill `reference.md`).

**Banner:** `npm run uat:preflight` and other `--pretty` scripts print the UAT harness banner. Suppress with `UAT_NO_BANNER=1`. The ASCII logo from `npx skills` itself is controlled by [vercel-labs/skills](https://github.com/vercel-labs/skills), not this repo.

Reload your agent after install.

If `where-skill.sh` fails, confirm install with `npx skills list`.

**Do not use `-g` (global install)** unless you also change npm script paths — global install puts the skill in agent-specific global dirs, not `.agents/skills/`.

## Install (maintainers — local clone)

```bash
cd /path/to/your-app
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
# optional: export UAT_AGENTS="cursor codex"
npx skills add "$UAT_SKILL_REPO" --skill uat-harness-skill -y
```

Then follow the same manifest and npm script steps as above.

## Example

See [`examples/consumer-demo/`](examples/consumer-demo/) for a runnable dependency-free web app, its `uat-manifest.yml`, and `uat-run.log` (a recorded tier A/B/C run against the demo server).

```bash
cd examples/consumer-demo
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
npx skills add "$UAT_SKILL_REPO" --skill uat-harness-skill -y
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
