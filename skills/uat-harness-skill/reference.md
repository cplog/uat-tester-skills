# UAT Harness — manifest reference

Each project owns a root-level **`uat-manifest.yml`**. The generic skill never hardcodes routes or npm scripts.

## Required fields

| Field | Type | Purpose |
|-------|------|---------|
| `project_id` | string | Slug (`my-saas`) |
| `platform` | enum | `web`, `mobile_web`, `pwa`, `desktop_web` |
| `framework` | enum | `nextjs`, `react`, `vue`, … |
| `base_url` | url | Default app URL for smoke / Playwright |

## Scope fields (what to test)

| Field | Purpose |
|-------|---------|
| `flows[]` | Tier C operator checklist — `id`, `path`, `checks`, `critical` |
| `tiers.static` | Tier A commands (lint, build) |
| `tiers.smoke` | Tier B commands (deployment smoke) |
| `tiers.smoke_url_flag` | Extra flags when `UAT_URL` / `--url` set (e.g. `-- --url`) |
| `tiers.worker` | Tier D required worker commands |
| `tiers.worker_optional` | Tier D with `--full` |
| `tiers.extra_services[]` | Named services (`id`, `commands`) — e.g. DAQ, billing worker |
| `alert_routes` | Map alert type → route (optional drill-down UAT) |
| `destructive_commands` | Agent must confirm before running |
| `safety_notes` | Shown at start of Tier D / any write test |
| `environments` | Per-surface env vars + `read_only` |
| `docs` | Paths to USERFLOW, README, etc. |
| `locale` | Default locale, toggle, viewport bounds |
| `preflight.health_path` | HTTP path to probe (default `/`) — e.g. `/api/health` |

## Live app (Tier B & C)

Tier B **blocks** until the app responds. Tier C prints the URL to open.

```bash
npm run uat:preflight
npm run dev                    # local
UAT_URL=https://preview… npm run uat:tier-b
```

Resolution order: `UAT_URL` env → `--url` flag → manifest `base_url`.

## Flow object

```yaml
flows:
  - id: billing
    name: Billing
    path: [/settings/billing]
    critical: true
    checks:
      - plan selector renders
      - save persists after refresh
```

**Subset scope:** user says `--flows billing` or `flow ids: billing,home` → agent runs only those flows in Tier C.

## Tier commands (examples)

```yaml
tiers:
  static:
    - npm run lint
    - npm run build
  smoke:
    - npm run verify-deployment
  smoke_url_flag: "-- --url"
  worker:
    - npm run worker:health
  extra_services:
    - id: analytics
      commands:
        - npm run analytics:smoke
```

## New project setup

1. `npx skills add <repo> --skill uat-harness-skill -a cursor -y`
2. `cp .agents/skills/uat-harness-skill/templates/manifest-template.yml ./uat-manifest.yml`
3. Fill `flows`, `tiers`, `destructive_commands`
4. Add optional `uat:*` npm scripts (see SKILL.md Install section)

## Runnable scripts (from consumer project root)

```bash
bash .agents/skills/uat-harness-skill/scripts/tier-a.sh
bash .agents/skills/uat-harness-skill/scripts/tier-b.sh [--url https://…]
```

When vendored in-repo: `skills/uat-harness-skill/scripts/…` also works.

## Playwright / `uat test` (optional)

When using `uat-harness-skill/` CLI package, also set:

```yaml
auth:
  type: none
selector_strategy:
  primary: data-testid
  fallback_chain: [aria, text]
```

## Control Tower overlay

This repo’s manifest: **`uat-manifest.yml`** at project root (Tom Lee routes, verify-deployment, worker tiers, DAQ service). The skill stays generic; only the manifest is product-specific.
