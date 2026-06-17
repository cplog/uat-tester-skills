# Tailor — project-specific UAT setup (agent-driven)

Use when the user wants UAT **customized for this repo** — not a generic scaffold.

**`setup`** = fast deterministic wiring (manifest skeleton + npm scripts).  
**`tailor`** = agent reads the project, groups routes by operator surface, writes project-specific flows, checks, `UAT.md`, and `project_context`.

Run **`tailor`** after `setup` on new projects, or when audit shows too many generic/missing flows.

## Step 1: Run the tailoring brief

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
node "$SKILL_DIR/scripts/tailor.mjs" --pretty
```

JSON for agents:

```bash
node "$SKILL_DIR/scripts/tailor.mjs" --json
```

The brief includes:

- **health** — fix blockers before tailoring
- **project_docs** — AGENTS.md, USERFLOW, README paths to read
- **suggested_flow_groups** — feature-level flows (not one flow per page)
- **defer_candidates** — webhooks, legal, docs → `deferred_coverage`
- **interview_questions** — only what code/docs did not answer
- **agent_tasks** — numbered customization checklist

## Step 2: Read project context (mandatory)

Before editing `uat-manifest.yml`, read:

| Doc | Why |
|-----|-----|
| `project_docs.userflow` | Real operator journeys → flow `checks` |
| `project_docs.agents` | Stack, auth, conventions |
| `project_docs.readme` | Deploy URL, scripts, env |
| Existing `uat-manifest.yml` | Keep good flows; fix stale paths only |

**Do not** copy `discover.mjs --draft` verbatim into the manifest. Use it as input; **tailor** checks to this product.

## Step 3: Customize uat-manifest.yml

### Flows — feature-level, not page-level

Good (crewio-style):

```yaml
flows:
  - id: inbox
    name: Inbox
    path: [/helloboss/inbox]
    critical: true
    checks:
      - conversation list loads
      - reply sends and thread updates
```

Bad (generic discovery dump):

```yaml
  - id: helloboss-inbox-page
    checks:
      - page loads without error
```

### Add `project_context` (per-project agent memory)

```yaml
project_context:
  audience: "Business operators using the /helloboss portal"
  product_surface: "/helloboss"
  auth: "Auth0 + magic link — Tier C requires logged-in session"
  critical_journeys:
    - "Login → dashboard → inbox reply"
    - "Contacts → detail → memory tab"
  locale: "zh-TW default — toggle without layout break"
  out_of_scope:
    - "Native mobile builds"
    - "Webhook endpoints (deferred)"
  notes:
    - "Read-only DB in local UAT"
```

Agents must read `project_context` on every UAT session (via `context.mjs`).

### Tiers — use this project's scripts

- `tiers.static` — only commands that **work** in this repo (Next 16: `eslint .` not `next lint`)
- `tiers.smoke` — project's e2e or health probe
- `deferred_coverage` — webhooks, `/api-docs`, legal pages

## Step 4: Write UAT.md (operator brief)

Copy [../templates/UAT.md](../templates/UAT.md) to project root. Fill:

- **Audience** — who runs UAT and when
- **Critical paths** — flow ids + one line each
- **Environments** — local port, preview URL, auth notes
- **Out of scope** — what the harness does not cover

Link from manifest:

```yaml
docs:
  uat: UAT.md
  userflow: path/to/USERFLOW.md   # if exists
```

## Step 5: Verify

```bash
node "$SKILL_DIR/scripts/audit.mjs" --pretty
node "$SKILL_DIR/scripts/context-signals.mjs" --pretty   # health OK
npm run uat:preflight
npm run uat:tier-a
npm run uat:tier-c -- --flows <critical-flow-ids>
```

## When to use tailor vs setup vs init

| User intent | Command |
|-------------|---------|
| "Wire UAT quickly" | `setup` |
| "Customize UAT for our product" | **`tailor`** → edit manifest + UAT.md |
| "Refresh manifest from scratch" | `init` (interview) or `tailor` + `--refresh` setup |
| "What to test this PR" | `review` (not tailor) |

## Agent rules

1. **Never delete manifest flows** when `discovery-gap` is present — fix the skill first.
2. **Ask ≤4 questions** — only after reading `tailor.mjs` output and project docs.
3. **Checks must be product-specific** — visible widgets, auth gates, save persistence, locale.
4. **Re-run audit** after every manifest edit until critical paths are covered or explicitly deferred.
