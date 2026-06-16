# Audit — coverage gaps vs repo discovery

Compare **`uat-manifest.yml`** against what exists in the codebase (UI routes, API endpoints, npm scripts). Use before/after `init` to find missing flows and empty tier lists.

## Step 1: Run discovery and audit

From the consumer project root:

```bash
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"

node "$SKILL_DIR/scripts/discover.mjs" --pretty
node "$SKILL_DIR/scripts/audit.mjs" --pretty
```

JSON for agents:

```bash
node "$SKILL_DIR/scripts/discover.mjs" --json
node "$SKILL_DIR/scripts/audit.mjs" --json
```

Draft manifest snippets (for `init` merge):

```bash
node "$SKILL_DIR/scripts/discover.mjs" --draft
```

## Step 2: Multi-repo (frontend + backend)

When API lives in a sibling repo, either:

- Set `UAT_DISCOVER_PATHS=../backend-api` for one-off audit, or
- Add to manifest:

```yaml
linked_repos:
  - id: backend-api
    path: ../backend-api
    base_url: http://127.0.0.1:8000
```

Re-run audit — API routes from linked repos appear with a `[repo-name]` tag.

## Step 3: Interpret the report

| Section | Meaning | Action |
|---------|---------|--------|
| Missing UI flows | Route on disk, not in `flows[]` | Add flow with `path` + `checks` |
| Missing API coverage | Endpoint not in any flow path or smoke | Add flow check or `tiers.smoke` curl/fetch |
| Orphan flows | Manifest path not found in repo | Rename path or remove stale flow |
| Suggested tiers.smoke | No smoke tier but APIs exist | Add health probe or existing npm script |

Do not auto-edit the manifest without user confirmation.

## Step 4: Recommend follow-up

- Gaps in UI → offer `init` merge or manual `flows[]` edits
- Gaps in API → suggest `tiers.smoke` one-liner or Tier B script
- Large gap count → prioritize `critical: true` routes first
- After manifest update → re-run `audit.mjs` until missing counts are acceptable

## Step 5: Optional codegen handoff

When the user wants executable tests (not just checklist):

- UI flows → `@uat-tester/cli` `uat discover` / `uat test` (Playwright)
- API routes → suggest pytest/httpx or existing integration test file

The skill does not write test files unless the user explicitly asks.
