---
name: uat-harness-skill
description: Manifest-driven UAT for web projects — tiers (static, smoke, operator flows, worker), deployment verification, and scoped checklists from uat-manifest.yml. Use when the user asks for UAT, acceptance testing, smoke test, operator flow validation, deployment verification, or tier-a/b/c/d harness runs.
argument-hint: "[setup|init|review|audit|tier-a|tier-b|tier-c|tier-d|report] [scope]"
user-invocable: true
---

# UAT Harness (manifest-first)

Multi-project acceptance testing. **Never hardcode routes or npm scripts in this skill** — project specifics live in `uat-manifest.yml` (Impeccable-style: generic skill + per-project context file).

Schema: [reference.md](reference.md)

## Setup

You MUST do these steps before proceeding:

1. Run `node <skill-dir>/scripts/context.mjs` once per session.  
   (`<skill-dir>` is `.agents/skills/uat-harness-skill` after install, or `skills/uat-harness-skill` when vendored.)  
   If output is `NO_MANIFEST`, run `setup` (preferred) or follow [reference/init.md](reference/init.md).
2. Run `node <skill-dir>/scripts/context-signals.mjs --pretty` — **read `health` before any tier**.  
   If `health.ok` is false, run the listed `fix:` commands first (skill update, lint migration, manifest scaffold). **Do not trust audit orphans or run tier-a when blockers are present.**
3. If the user did **not** name a sub-command, use context-signals recommendations (2–3 picks).
4. If the user named a sub-command (`setup`, `tailor`, `init`, `review`, `audit`, `tier-a`, `tier-b`, `tier-c`, `tier-d`, `report`), read `reference/<command>.md` before acting.
5. User scope (changed files, flow ids, tiers, URL, read-only DB) **narrows** tiers and `flows[]` subset.

### Bootstrap health (agent guardrails)

| Signal | Meaning | Agent action |
|--------|---------|--------------|
| `routes_discovered: 0` + App Router on disk | Stale or broken discovery | `npx skills@latest update uat-harness-skill -y` then re-run `discover.mjs` |
| `discovery-gap:` in audit | Orphan list suppressed — do not prune flows | Fix discovery first |
| `blocker: next-lint-removed` | Next.js 16+ — `next lint` gone | Run codemod; update `package.json` lint script before tier-a |
| `NO_MANIFEST` | Not onboarded | `setup.mjs --yes` or `init` |
| Audit shows many `orphan:` + 0 routes discovered | False positives | Update skill — do not delete manifest flows |

Correct setup order for a new repo:

```bash
npx skills@latest add cplog/uat-tester-skills --skill uat-harness-skill -y
node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes
node .agents/skills/uat-harness-skill/scripts/tailor.mjs --pretty   # agent customizes per project
# Agent edits uat-manifest.yml + UAT.md using reference/tailor.md
node .agents/skills/uat-harness-skill/scripts/context-signals.mjs --pretty   # health must be OK
npm run uat:preflight && npm run uat:tier-a
```

**`setup`** wires scripts and a skeleton manifest. **`tailor`** tells the agent how to customize flows, checks, `project_context`, and `UAT.md` for *this* repo — never ship generic discovery dumps unchanged.

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
| `setup` | One-command onboarding: scaffold manifest + wire npm scripts | [reference/setup.md](reference/setup.md) |
| `tailor` | **Project-specific** manifest + UAT.md customization (agent-driven) | [reference/tailor.md](reference/tailor.md) |
| `init` | No manifest or refresh project UAT config | [reference/init.md](reference/init.md) |
| `review` | Diff-scoped minimal tier/flow scope for this PR | [reference/review.md](reference/review.md) |
| `audit` | Compare manifest vs discovered routes/APIs | [reference/audit.md](reference/audit.md) |
| `tier-a` | UI-only, lint/build gate | [reference/tier-a.md](reference/tier-a.md) |
| `tier-b` | Deploy smoke, API health | [reference/tier-b.md](reference/tier-b.md) |
| `tier-c` | Operator UI walkthrough (CDP subagent or manual) | [reference/tier-c.md](reference/tier-c.md) |
| `tier-d` | Background jobs, extra services | [reference/tier-d.md](reference/tier-d.md) |
| `report` | Summarize session | [reference/report.md](reference/report.md) |

Tier command lists always come from manifest `tiers.*` — not from this table.

### Runnable scripts

```bash
node <skill-dir>/scripts/setup.mjs [--yes] [--dry-run] [--env local|preview|custom] [--url https://...]
bash <skill-dir>/scripts/tier-a.sh
bash <skill-dir>/scripts/tier-b.sh [--url https://…]
bash <skill-dir>/scripts/tier-c.sh [--flows id1,id2] [--url https://…]
bash <skill-dir>/scripts/tier-d.sh [--full] [--service <id>]
node <skill-dir>/scripts/tailor.mjs [--pretty|--json]
node <skill-dir>/scripts/discover.mjs [--pretty|--json|--draft]
node <skill-dir>/scripts/review.mjs [--pretty|--json] [--base ref]
node <skill-dir>/scripts/audit.mjs [--pretty|--json]
node <skill-dir>/scripts/codegen.mjs [--force]
npm run uat:preflight   # if wired in package.json
```

## Routing rules

1. **No sub-command**: run `context-signals.mjs --pretty`; if `health.ok` is false, fix blockers before recommending tiers.
2. **Sub-command match**: load `reference/<command>.md` and follow it.
3. **Intent without command name** (e.g. "smoke test the preview") → map to `tier-b`; "walk through billing" → `tier-c` with `--flows billing`.
4. **`tier-c` with CDP available** — after `tier-c.sh` prints subagent dispatch instructions, launch a subagent (Task tool) to execute the walkthrough; do not skip automation and only print the checklist.
5. **`NO_MANIFEST` from context.mjs**: run `init` flow before any tier.
6. **`audit` or "coverage gaps"**: run `discover.mjs` + `audit.mjs`; offer `init` merge for missing flows.
7. **`review` or "what to UAT for this PR"**: run `review.mjs`; run only tiers in the `net:` line.
8. **`setup` or "onboard this repo for UAT"**: run `setup.mjs --yes`; then **`tailor.mjs`** and customize manifest + `UAT.md` per [reference/tailor.md](reference/tailor.md).
9. **`tailor` or "customize UAT for this project"**: run `tailor.mjs --pretty`; read project docs; edit `flows[]`, `project_context`, `UAT.md`.

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
| `reference/<command>.md` | `reference/setup.md`, `init.md`, `review.md`, `audit.md`, `tier-*.md`, `report.md` |
| `npx impeccable detect` (deterministic) | `tier-*.sh` + `read-manifest.mjs` (deterministic) |
| `npx impeccable skills install` | `npm run skills:install` |
| `context-signals.mjs` (git → suggest commands) | `scripts/context-signals.mjs` |

## Install (`npx skills`)

The skill package lives at `skills/uat-harness-skill/` in [cplog/uat-tester-skills](https://github.com/cplog/uat-tester-skills). **`npx skills` symlinks the whole folder** (scripts, templates, reference) into `.agents/skills/` — the shared project path for Cursor, Codex, OpenCode, Amp, Gemini, GitHub Copilot, and other supported agents. Cursor also links via `.cursor/skills/`.

### Consumer install (recommended)

```bash
cd /path/to/your-app
# Auto-detects your agent(s); omit -a or pass one or more explicitly
npx skills@latest add cplog/uat-tester-skills --skill uat-harness-skill -y
# e.g. npx skills@latest add cplog/uat-tester-skills --skill uat-harness-skill -a cursor -a codex -y
```

Use `--skill uat-harness-skill` (the Playwright CLI lives under `cli/` in this repo — not a separate skill).

**Project install (default)** — skill at `.agents/skills/uat-harness-skill/`. npm script paths below work across supported agents.

**Global install (`-g`)** — skill in agent-specific global dirs. npm scripts pointing at `.agents/skills/` will not work unless you rewrite paths. Prefer project install.

### Maintainer install (local clone)

```bash
cd /path/to/your-app
export UAT_SKILL_REPO=/path/to/uat-tester-skills-clone
# optional: export UAT_AGENTS="cursor codex"
npx skills@latest add "$UAT_SKILL_REPO" --skill uat-harness-skill -y
```

### After install — quick path

Run one command to scaffold `uat-manifest.yml` and wire `uat:*` scripts:

```bash
node .agents/skills/uat-harness-skill/scripts/setup.mjs --yes
```

If you prefer interview-style flow mapping, use **`init`** instead of `setup`.

`setup` wires this script set in `package.json`:

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
    "uat:browser": "bash .agents/skills/uat-harness-skill/scripts/browser.sh"
  }
}
```

Tier scripts resolve project root from `uat-manifest.yml` / `package.json` in cwd.  
Run them from the consumer repo root and reload your agent after install.

### Example consumer

See `examples/consumer-demo/` in the skill repo: runnable demo server, `uat-manifest.yml`, and `uat-run.log` (recorded tier A/B/C output).

### Update skill

```bash
npx skills@latest update uat-harness-skill -y
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
