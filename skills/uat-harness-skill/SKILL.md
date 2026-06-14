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
4. **Cleanup** — delete temp screenshots and scratch files after UAT.

## Commands

| Command | When | Reference |
|---------|------|-----------|
| `init` | No manifest or refresh project UAT config | [reference/init.md](reference/init.md) |
| `tier-a` | UI-only, lint/build gate | [reference/tier-a.md](reference/tier-a.md) |
| `tier-b` | Deploy smoke, API health | [reference/tier-b.md](reference/tier-b.md) |
| `tier-c` | Operator UI walkthrough | [reference/tier-c.md](reference/tier-c.md) |
| `tier-d` | Worker, cron, background jobs | [reference/tier-d.md](reference/tier-d.md) |
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
4. **`NO_MANIFEST` from context.mjs**: run `init` flow before any tier.

## Scope adjustment

| User says | Agent does |
|-----------|------------|
| UI only on one surface | `tier-a` + `tier-c --flows <id>` |
| Pre-deploy | `tier-a` + `tier-b` + `--url` if preview |
| Full operator UAT | `tier-b` + `tier-c` (all flows) |
| Worker/cron | `tier-d`; `--full` if optional scripts needed |
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

The skill package lives at `skills/uat-harness-skill/` in this repo. **`npx skills` copies the whole folder** (scripts, templates, reference) into `.agents/skills/` and links your agent (Cursor → `.cursor/skills/`).

### From local path (uat-tester repo)

```bash
cd /path/to/other-project
npx skills add /Users/erictaicp/work/uat-tester --skill uat-harness-skill -a cursor -y
```

### From GitHub (after push)

```bash
cd /path/to/other-project
npx skills add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -y
```

Use `--skill uat-harness-skill` (the Playwright CLI lives under `cli/` in uat-tester — not a separate skill).

### Global install (all projects)

```bash
npx skills add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -y -g
```

### After install — each project needs

1. **`uat-manifest.yml`** at project root:

```bash
cp .agents/skills/uat-harness-skill/templates/manifest-template.yml ./uat-manifest.yml
# edit flows, tiers, destructive_commands
```

2. **Optional npm scripts** in `package.json` (paths work from any install location):

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

Tier scripts resolve **project root** from `uat-manifest.yml` / `package.json` in cwd — run them from the consumer repo root.

3. **Reload Cursor** (or your agent) after install.

### Update skill

```bash
npx skills update uat-harness-skill -y
npx skills list -a cursor
```

### Standalone repo

Canonical home: **`/Users/erictaicp/work/uat-tester`** (this skill package).

```
uat-tester/
└── skills/
    └── uat-harness-skill/
        ├── SKILL.md
        ├── reference.md
        ├── reference/
        ├── scripts/
        └── templates/
```

Then: `npx skills add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -y`

### Agent script paths

Scripts ship inside the installed skill dir. Resolve with:

```bash
# skill dir (any install location)
bash .agents/skills/uat-harness-skill/scripts/where-skill.sh
node .agents/skills/uat-harness-skill/scripts/context.mjs
```

Consumer repos install via `npx skills`; tier scripts resolve project root from `uat-manifest.yml` / `package.json` in cwd.

**Control Tower** installs from uat-tester: `npm run skills:install` in the control-tower repo.
