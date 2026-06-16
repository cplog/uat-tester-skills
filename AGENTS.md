# Agent Guide — uat-tester-skills

This repository is the source for **cplog/uat-tester-skills**: a manifest-driven UAT (User Acceptance Testing) harness for AI coding agents, plus an optional Playwright-based CLI. All project-specific configuration lives in a consumer-side `uat-manifest.yml`; this repo itself contains only the generic skill and tooling.

The codebase, comments, and documentation are in **English**. Use English for any new docs, comments, and commit messages.

## Project overview

The project ships two related artifacts:

1. **`skills/uat-harness-skill/`** — An agent skill installed into consumer projects via `npx skills add cplog/uat-tester-skills --skill uat-harness-skill -y`. After install it lives in the consumer's `.agents/skills/` (and `.cursor/skills/` for Cursor). It is manifest-first: it reads the consumer's `uat-manifest.yml` and never hardcodes routes or npm scripts.
2. **`cli/`** — An optional TypeScript/Node package (`@uat-tester/cli`) that provides `npx uat test` and related commands. It uses Playwright to auto-discover flows, self-heal selectors, and run generated tests against the manifest.

UAT is organized into four tiers:

| Tier | Manifest key | Purpose | Requires live app? |
|------|--------------|---------|-------------------|
| A | `tiers.static` | Lint / build / static gate | No |
| B | `tiers.smoke` | Deployment smoke / health checks | Yes |
| C | `flows[]` | Operator UI walkthrough checklist | Yes |
| D | `tiers.worker` | Background jobs / workers / extra services | Optional |

The design follows an **Impeccable-style** pattern: generic reusable skill + per-project context file (`uat-manifest.yml`), plus `reference/<command>.md` instruction files that agents must read before running a sub-command.

## Repository layout

```
uat-tester-skills/
├── README.md                          # Human-facing install and usage
├── package.json                       # Root dev helpers (no runtime deps)
├── .gitignore                         # Ignore node_modules, dist, logs, .env
├── AGENTS.md                          # This file
├── uat-run.log                        # Recorded root-level run (not in demo project)
├── cli/                               # Optional Playwright CLI package
│   ├── package.json                   # @uat-tester/cli manifest
│   ├── tsconfig.json                  # TypeScript compiler config
│   ├── .gitignore                     # node_modules, dist, test-results, etc.
│   └── src/                           # TypeScript source
│       ├── cli.ts                     # Commander CLI entry point (`uat` bin)
│       ├── index.ts                   # Public API exports
│       ├── core/                      # Config, runner, logger, types
│       │   ├── config.ts              # YAML/Zod manifest loader + validator
│       │   ├── logger.ts              # Chalk-based logger
│       │   ├── runner.ts              # Playwright UATRunner
│       │   └── types.ts               # All TypeScript interfaces
│       ├── adapters/                  # Framework-specific adapters
│       │   ├── base-adapter.ts
│       │   ├── registry.ts
│       │   ├── nextjs-adapter.ts
│       │   ├── react-adapter.ts
│       │   ├── svelte-adapter.ts
│       │   └── vue-adapter.ts
│       ├── discoverers/               # Flow discovery + test generation
│       │   ├── flow-discovery.ts
│       │   └── test-generator.ts
│       └── healers/                   # Selector fallback / healing
│           ├── selector-engine.ts
│           └── ai-healer.ts
├── skills/uat-harness-skill/          # Canonical agent skill
│   ├── SKILL.md                       # Skill header + routing rules for agents
│   ├── reference.md                   # Manifest schema reference
│   ├── reference/                     # Per-command instructions
│   │   ├── init.md
│   │   ├── tier-a.md
│   │   ├── tier-b.md
│   │   ├── tier-c.md
│   │   ├── tier-d.md
│   │   └── report.md
│   ├── scripts/                       # Runnable helpers
│   │   ├── context.mjs                # Manifest context loader (Impeccable boot)
│   │   ├── context-signals.mjs        # Git/dev-server/preflight signal generator
│   │   ├── preflight.mjs              # HTTP preflight probe
│   │   ├── tier-a.sh                  # Static tier runner
│   │   ├── tier-b.sh                  # Smoke tier runner
│   │   ├── tier-c.sh                  # Operator flows (CDP automation or manual checklist)
│   │   ├── tier-c-automation.mjs      # Subagent dispatch prompt when CDP is up
│   │   ├── browser.sh                 # Launch Chrome with CDP for Tier C
│   │   ├── tier-d.sh                  # Worker lane runner
│   │   ├── install.sh                 # npx skills installer helper
│   │   ├── where-skill.sh             # Print skill directory
│   │   └── lib/                       # Shared script internals
│   │       ├── read-manifest.mjs      # Minimal YAML reader for tier scripts
│   │       ├── browser-control.mjs    # Playwright CDP helper for Tier C subagents
│   │       └── resolve-paths.sh       # Bash path resolver
│   └── templates/
│       └── manifest-template.yml      # Starter uat-manifest.yml
├── examples/
│   ├── consumer-demo/                 # Runnable demo web app + recorded UAT run
│   │   ├── package.json
│   │   ├── server.mjs
│   │   ├── uat-manifest.yml
│   │   └── uat-run.log
│   └── uat-manifest.example.yml       # Standalone manifest example
└── docs/plans/                        # Design documents
    └── 2026-06-16-tier-c-automation-design.md
```

## Technology stack

- **Runtime:** Node.js >= 20.0.0.
- **Language:** TypeScript 5.5+ in `cli/`, plain ES modules / CommonJS in skill scripts.
- **CLI framework:** Commander (`cli/src/cli.ts`).
- **Browser automation:** Playwright 1.45+ and `@playwright/test` in the CLI; `playwright-core` is sufficient for the skill CDP helpers and is an optional consumer devDependency.
- **Config parsing:** js-yaml + Zod schema validation in the CLI; minimal inline YAML parser in skill scripts.
- **Styling:** chalk (logs), ora (spinners).
- **Testing:** Vitest 1.6+ (configured but no test files are currently present in `cli/`).
- **Linting:** ESLint 9.5+.
- **Skill packaging:** `npx skills` (Vercel Labs skills format). The skill is just a folder with `SKILL.md`, scripts, reference docs, and templates.

## Build and test commands

From the repository root:

```bash
# Install and build the optional CLI
npm run cli:install     # npm install --prefix cli
npm run cli:build       # npm run build --prefix cli

# Install the skill locally into the current project (maintainer workflow)
npm run skills:install  # bash skills/uat-harness-skill/scripts/install.sh
```

From `cli/`:

```bash
cd cli
npm install
npm run build       # tsc -> dist/
npm run dev         # tsc --watch
npm run test        # vitest (currently no tests)
npm run lint        # eslint src/**/*.ts
```

The CLI emits to `cli/dist/` and exposes the `uat` binary. After build:

```bash
cd cli
npx uat test --manifest ../examples/uat-manifest.example.yml
```

## Consumer project workflow

The skill is consumed from another repository. A typical consumer adds these scripts to `package.json`:

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

For automated Tier C with a logged-in browser:

```bash
npm install -D playwright-core            # optional but recommended
npm run uat:browser                       # launches Chrome with CDP on :9222
npm run uat:tier-c                        # emits subagent dispatch instructions when CDP is up
npm run uat:tier-c -- --manual            # skip automation, print checklist
```

Then:

```bash
npm run uat:preflight
npm run uat:tier-a
npm run uat:tier-b -- --url http://127.0.0.1:3000
npm run uat:tier-c -- --flows billing,settings
npm run uat:tier-d
```

## Code organization

### Skill (`skills/uat-harness-skill/`)

- **`SKILL.md`** and `reference/*.md` are the agent-facing contract. Agents must read `reference/<command>.md` when a sub-command (`init`, `tier-a`, `tier-b`, `tier-c`, `tier-d`, `report`) is invoked.
- **`scripts/context.mjs`** loads `uat-manifest.yml` (and optional `UAT.md`) and prints a summary. If no manifest exists, it emits `NO_MANIFEST` so the agent must run `init` first.
- **`scripts/context-signals.mjs`** inspects git state, dev-server ports, and preflight status to recommend which tiers to run. It does not run tiers itself.
- **`scripts/preflight.mjs`** probes `base_url` plus optional `preflight.health_path`. Tier B uses `--require` and exits non-zero if the app is down.
- **`scripts/tier-*.sh`** read commands from the manifest via `lib/read-manifest.mjs` and execute them from the consumer project root.
- **`scripts/tier-c-automation.mjs`**, **`scripts/browser.sh`**, and **`scripts/lib/browser-control.mjs`** implement the CDP-based operator walkthrough. When a browser is listening on `UAT_CDP_URL` (default `http://127.0.0.1:9222`), `tier-c.sh` prints subagent dispatch instructions instead of a manual checklist.
- **`scripts/lib/read-manifest.mjs`** now supports a `flows-json` command that powers the automation dispatcher.
- **`templates/manifest-template.yml`** is the starting point for new consumers.

### CLI (`cli/src/`)

- **`core/`** — Framework-agnostic engine:
  - `config.ts` validates manifests with Zod and expands `${ENV:default}` variables.
  - `runner.ts` launches Playwright, authenticates, executes generated test steps, captures failure screenshots, and cleans up.
  - `logger.ts` provides leveled console output.
  - `types.ts` defines the manifest and runtime types.
- **`adapters/`** — Framework-specific behavior (Next.js, React/Vue/Nuxt/Remix, Svelte, Vue). Each adapter extracts routes from source files and applies framework quirks.
- **`discoverers/`** — `FlowDiscoveryEngine` discovers flows from git diff and framework routes; `TestGenerator` converts flows into Playwright test steps.
- **`healers/`** — `SelectorEngine` resolves selectors using a fallback chain and structural healing (Levenshtein similarity). `AIHealer` calls `opencli vision find` as an optional vision fallback.
- **`cli.ts`** wires everything into the `uat` command: `init`, `validate`, `discover`, `test`, `heal`, `baseline`, `report`, `dashboard`. Several sub-commands (`heal`, `baseline`, `report`, `dashboard`) are currently placeholders.

## Development conventions

- **Manifest-first.** Never hardcode consumer routes, scripts, or URLs in the generic skill. Project specifics belong in `uat-manifest.yml`.
- **No assumptions about consumer stack.** The skill supports many frameworks via adapters; defaults are just defaults.
- **Impeccable-style routing.** When a user invokes a named sub-command, the agent reads the matching `reference/<command>.md`. When no sub-command is given, run `context-signals.mjs --pretty` and recommend 2–3 tiers before acting.
- **Destructive commands require explicit approval.** The manifest's `destructive_commands` and `safety_notes` must be printed and acknowledged before running Tier D or any write test.
- **English only** for code comments, docs, and logs.
- **Bash scripts** use `set -euo pipefail` and source `lib/resolve-paths.sh` to resolve `SKILL_DIR` and `PROJECT_ROOT`.
- **Node scripts** are ES modules (`.mjs`) and use `import.meta.url` detection to guard CLI execution.
- **TypeScript** targets ES2022, CommonJS output, strict mode, with source maps and declarations.

## Testing instructions

- The CLI declares `vitest` in `cli/package.json`, but there are currently no test files under `cli/tests/` or `cli/src/**/*.test.ts`.
- To add tests, create files under `cli/tests/` or `cli/src/**/*.test.ts` and run `npm run test --prefix cli`.
- The runnable integration sample is in `examples/consumer-demo/`:

```bash
cd examples/consumer-demo
npm install   # if needed
npm run dev   # in another terminal
npm run uat:preflight
npm run uat:tier-a
npm run uat:tier-b -- --url http://127.0.0.1:3000
npm run uat:tier-c
```

- `examples/consumer-demo/uat-run.log` contains a recorded successful tier A/B/C run.

## Security considerations

- **Never log secrets.** Do not print `.env`, `.env.local`, API keys, proxy credentials, or test credentials in agent output or test results.
- **Destructive commands.** Only run commands listed under `destructive_commands` after the user explicitly approves. Print `safety_notes` before Tier D.
- **Read-only default.** Manifest `environments.*.read_only` defaults to `true`; assume read-only unless the user explicitly approves writes.
- **Test credentials** in `uat-manifest.yml` are for local/test environments only. Do not commit real passwords or OTP secrets.
- **AI vision fallback** (`ai_healer.ts`) writes temporary screenshots to `/tmp/uat-screenshot-<timestamp>.png` and deletes them after the OpenCLI call. Ensure `/tmp` is appropriately restricted on shared machines.
- **Playwright** runs with `--no-sandbox --disable-setuid-sandbox` for CI compatibility; ensure this is acceptable for your execution environment.
- **Environment variable expansion** in the CLI supports `${VAR:default}` syntax; be cautious that defaults do not leak sensitive values into committed manifests.

## Deployment / release process

- This repo is published as a GitHub repository (`cplog/uat-tester-skills`) and consumed via `npx skills add cplog/uat-tester-skills --skill uat-harness-skill -y`.
- The CLI package `@uat-tester/cli` is built from `cli/` and could be published to npm independently; the `bin` entry is `dist/cli.js`.
- `prepare` in `cli/package.json` runs `npm run build`, so installing the CLI from source also compiles it.
- The root `package.json` is private and only provides maintainer helper scripts; it is not published.

## Important files to read before changing code

- `skills/uat-harness-skill/SKILL.md` — agent routing and install instructions
- `skills/uat-harness-skill/reference.md` — manifest schema reference
- `skills/uat-harness-skill/reference/*.md` — per-command agent instructions
- `cli/src/core/types.ts` and `cli/src/core/config.ts` — manifest TypeScript contract and validation
- `README.md` — human-facing install guide
