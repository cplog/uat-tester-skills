---
name: uat-harness-skill
description: Manifest-driven UAT for web projects — tiers (static, smoke, operator flows, worker), deployment verification, and scoped checklists from uat-manifest.yml. Use when the user asks for UAT, acceptance testing, smoke test, operator flow validation, deployment verification, or tier-a/b/c/d harness runs.
argument-hint: "[init|tier-a|tier-b|tier-c|tier-d|report] [scope]"
user-invocable: true
---

# UAT Harness (manifest-first)

Multi-project acceptance testing. **Never hardcode routes or npm scripts in this skill** — project specifics live in `uat-manifest.yml` (Impeccable-style: generic skill + per-project context file).

Schema: [reference.md](reference.md)

## Setup

You MUST do these steps before proceeding:

1. Run `node <skill-dir>/scripts/context.mjs` once per session (`<skill-dir>` = `.agents/skills/uat-harness-skill` after `npx skills add`, or `skills/uat-harness-skill` when vendored). Skip if you already have its output. `NO_MANIFEST` → follow [reference/init.md](reference/init.md).
2. If the user did **not** name a sub-command, run `node <skill-dir>/scripts/context-signals.mjs --pretty` and lead with **2–3 recommendations**.
3. If the user invoked a sub-command (`init`, `tier-a`, `tier-b`, `tier-c`, `tier-d`, `report`), read `reference/<command>.md` next. Non-optional.
4. User scope (changed files, flow ids, tiers, URL, read-only DB) **narrows** tiers and `flows[]` subset.

## Before you start

0. **Live app** — Tier B and Tier C UI require a reachable URL. Run `npm run uat:preflight` first. Local: `npm run dev`. Remote: `UAT_URL=https://preview…` or `npm run uat:tier-b -- --url https://…`. Tier B **blocks** if the app does not respond.
1. **Destructive commands** — only run manifest `destructive_commands` after explicit user approval.
2. **Safety** — print `safety_notes` before Tier D or any write test.
3. **Secrets** — never log env files, API keys, or proxy credentials.
4. **Tier C automation** — when CDP browser is up (`npm run uat:browser`), `tier-c.sh` emits subagent dispatch instructions; main agent must run a subagent to verify flows. See [reference/tier-c.md](reference/tier-c.md). Manual fallback: `--manual` or no CDP.
5. **Cleanup** — delete temp screenshots and scratch files after UAT.

## Commands

| Command | When | Reference |
|---------|------|-----------|
| `init` | No manifest or refresh project UAT config | [reference/init.md](reference/init.md) |
| `tier-a` | UI-only, lint/build gate | [reference/tier-a.md](reference/tier-a.md) |
| `tier-b` | Deploy smoke, API health | [reference/tier-b.md](reference/tier-b.md) |
| `tier-c` | Operator UI walkthrough (CDP subagent or manual) | [reference/tier-c.md](reference/tier-c.md) |
| `tier-d` | Background jobs, extra services | [reference/tier-d.md](reference/tier-d.md) |
| `report` | Summarize session | [reference/report.md](reference/report.md) |

Tier command lists always come from manifest `tiers.*` — not from this table.

### Runnable scripts

```bash
bash <skill-dir>/scripts/tier-a.sh
bash <skill-dir>/scripts/tier-b.sh [--url https://…]
bash <skill-dir>/scripts/tier-c.sh [--flows id1,id2] [--url https://…]
bash <skill-dir>/scripts/tier-d.sh [--full] [--service <id>]
npm run uat:preflight   # if wired in package.json
```

## Routing rules

1. **No sub-command**: run `context-signals.mjs --pretty`; recommend 2–3 picks with reasons; wait for user confirmation before Tier D or destructive scripts.
2. **Sub-command match**: load `reference/<command>.md` and follow it.
3. **Intent without command name** (e.g. "smoke test the preview") → map to `tier-b`; "walk through billing" → `tier-c` with `--flows billing`.
4. **`tier-c` with CDP available** — after `tier-c.sh` prints subagent dispatch instructions, launch a subagent (Task tool) to execute the walkthrough; do not skip automation and only print the checklist.
5. **`NO_MANIFEST` from context.mjs**: run `init` flow before any tier.

## Scope adjustment

| User says | Agent does |
|-----------|------------|
| UI only on one surface | `tier-a` + `tier-c --flows <id>` |
| Pre-deploy | `tier-a` + `tier-b` + `--url` if preview |
| Full operator UAT | `tier-b` + `tier-c` (all flows) |
| Worker / background | `tier-d`; `--full` if optional scripts needed |
| Secondary API | `tier-d --service <extra_services.id>` |
| Read-only DB | skip `destructive_commands` |

## Compared to Impeccable ([pbakaus/impeccable](https://github.com/pbakaus/impeccable))

| Impeccable | UAT harness |
|------------|-------------|
| `PRODUCT.md` + `DESIGN.md` | `uat-manifest.yml` + optional `UAT.md` |
| `context.mjs` boot | `scripts/context.mjs` boot |
| `reference/<command>.md` | `reference/init.md`, `tier-*.md`, `report.md` |
| `npx impeccable detect` (deterministic) | `tier-*.sh` + `read-manifest.mjs` (deterministic) |
| `npx impeccable skills install` | `npm run skills:install` |
| `context-signals.mjs` (git → suggest commands) | `scripts/context-signals.mjs` |

## Install (`npx skills`)

The skill package lives at `skills/uat-harness-skill/` in [cplog/uat-tester-skills](https://github.com/cplog/uat-tester-skills). **`npx skills` symlinks the whole folder** (scripts, templates, reference) into `.agents/skills/` — the shared project path for Cursor, Codex, OpenCode, Amp, Gemini, GitHub Copilot, and other supported agents. Cursor also links via `.cursor/skills/`.

### Consumer install (recommended — project scope)

```bash
cd /path/to/your-app
# Auto-detects your agent(s); omit -a or pass one or more explicitly
npx skills add cplog/uat-tester-skills --skill uat-harness-skill -y
# e.g. npx skills add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -a codex -y
```

Use `--skill uat-harness-skill` (the Playwright CLI lives under `cli/` in this repo — not a separate skill).

**Project install (default)** — skill at `.agents/skills/uat-harness-skill/`. npm script paths below work across supported agents.

**Global install (`-g`)** — skill in agent-specific global dirs. npm scripts pointing at `.agents/skills/` will not work unless you rewrite paths. Prefer project install.

### Maintainer install (local clone)

```bash
cd /path/to/your-app
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
# optional: export UAT_AGENTS="cursor codex"
npx skills add "$UAT_SKILL_REPO" --skill uat-harness-skill -y
```

### After install — each project needs

1. **`uat-manifest.yml`** at project root:

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
cp "$SKILL_DIR/templates/manifest-template.yml" ./uat-manifest.yml
# edit flows, tiers, destructive_commands
```

Or run the agent **`init`** sub-command to scaffold from the codebase.

2. **npm scripts** in `package.json` (required for `npm run uat:*`):

```json
{
  "scripts": {
    "uat:preflight": "node .agents/skills/uat-harness-skill/scripts/preflight.mjs --pretty",
    "uat:signals": "node .agents/skills/uat-harness-skill/scripts/context-signals.mjs --pretty",
    "uat:tier-a": "bash .agents/skills/uat-harness-skill/scripts/tier-a.sh",
    "uat:tier-b": "bash .agents/skills/uat-harness-skill/scripts/tier-b.sh",
    "uat:tier-c": "bash .agents/skills/uat-harness-skill/scripts/tier-c.sh",
    "uat:tier-d": "bash .agents/skills/uat-harness-skill/scripts/tier-d.sh",
    "uat:browser": "bash .agents/skills/uat-harness-skill/scripts/browser.sh"
  }
}
```

Tier scripts resolve **project root** from `uat-manifest.yml` / `package.json` in cwd — run them from the consumer repo root.

3. **Reload your agent** after install.

### Example consumer

See `examples/consumer-demo/` in the skill repo: runnable demo server, `uat-manifest.yml`, and `uat-run.log` (recorded tier A/B/C output).

### Update skill

```bash
npx skills update uat-harness-skill -y
npx skills list
```

### Repo layout

```
uat-tester-skills/
└── skills/
    └── uat-harness-skill/
        ├── SKILL.md
        ├── reference.md
        ├── reference/
        ├── scripts/
        └── templates/
```

### Agent script paths

Resolve `<skill-dir>` once per session:

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
node "$SKILL_DIR/scripts/context.mjs"
bash "$SKILL_DIR/scripts/tier-a.sh"
```

When vendored inside a monorepo: `skills/uat-harness-skill/` also works as `<skill-dir>`.

Consumer repos install via `npx skills`; tier scripts resolve project root from `uat-manifest.yml` / `package.json` in cwd.
