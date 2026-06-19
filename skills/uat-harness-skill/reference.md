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
| `tiers.extra_services[]` | Named services (`id`, `commands`) — e.g. billing worker, analytics API |
| `alert_routes` | Map alert type → route (optional drill-down UAT) |
| `destructive_commands` | Agent must confirm before running |
| `safety_notes` | Shown at start of Tier D / any write test |
| `environments` | Per-surface env vars + `read_only` |
| `docs` | Paths to UAT.md, USERFLOW, README, etc. |
| `project_context` | Per-project agent memory — audience, auth, journeys, out_of_scope |
| `locale` | Default locale, toggle, viewport bounds |
| `preflight.health_path` | HTTP path to probe (default `/`) — e.g. `/api/health` |
| `linked_repos[]` | Sibling repos for discovery/audit (`id`, `path`, optional `base_url`) |
| `deferred_coverage[]` | Intentionally untested paths (`id`, `path`, `reason`, `revisit`) — audit ignores these |
| `reporting` | Bug reporter configuration (optional) |

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

## project_context (per-project tailoring)

Agents read this on every session. Fill via `reference/tailor.md`.

```yaml
project_context:
  audience: "Operators on /helloboss portal"
  product_surface: "/helloboss"
  auth: "Auth0 — Tier C needs logged-in session"
  critical_journeys:
    - "Login → inbox → reply"
  out_of_scope:
    - "Webhook endpoints"
  notes:
    - "zh-TW default locale"
```

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

## reporting (bug reporter)

Optional block controlling how failed Tier C checks are captured, diagnosed, and exported.

```yaml
reporting:
  enabled: true
  evidence_dir: .uat/evidence
  report_dir: .uat/reports
  severity_threshold: low
  auto_capture: true
  auto_diagnose: true
  gh_export:
    enabled: false
    repo: owner/repo
    labels: [bug, uat]
    assignees: []
```

| Field | Purpose |
|-------|---------|
| `enabled` | Master switch for automatic evidence capture |
| `evidence_dir` | Where screenshot + DOM + logs bundles are stored |
| `report_dir` | Where generated Markdown/JSON reports are stored |
| `severity_threshold` | Minimum severity included in reports (`info`, `low`, `medium`, `high`, `critical`) |
| `auto_capture` | Capture evidence automatically on Tier C failure |
| `auto_diagnose` | Run AI diagnosis on captured evidence |
| `gh_export.enabled` | Export reports to GitHub Issues |
| `gh_export.repo` | Target repo (`owner/name`) |
| `gh_export.labels` | Labels applied to created issues |
| `gh_export.assignees` | Auto-assignees for created issues |

## New project setup

1. `npx skills add cplog/uat-tester-skills --skill uat-harness-skill -y`
2. `SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"` then copy template or run agent `init`
3. `node "$SKILL_DIR/scripts/discover.mjs" --draft` — review suggested flows
4. Fill `flows`, `tiers`, `destructive_commands`
5. `node "$SKILL_DIR/scripts/audit.mjs"` — fix coverage gaps
6. Add `uat:*` npm scripts (see SKILL.md Install section)

## Runnable scripts (from consumer project root)

```bash
bash .agents/skills/uat-harness-skill/scripts/tier-a.sh
bash .agents/skills/uat-harness-skill/scripts/tier-b.sh [--url https://…]
```

When vendored in this repo: `skills/uat-harness-skill/scripts/…` also works as `<skill-dir>`.

## Playwright / `uat test` (optional)

When using the `@uat-tester/cli` package, also set:

```yaml
auth:
  type: none
selector_strategy:
  primary: data-testid
  fallback_chain: [aria, text]
```
