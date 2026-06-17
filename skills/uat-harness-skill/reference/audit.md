# Audit — coverage gaps vs repo discovery

Compare **`uat-manifest.yml`** against what exists in the codebase (UI routes, API endpoints, npm scripts). Use before/after `init` to find missing flows and empty tier lists.

**Boundary:** UAT audit = coverage gaps only. Code quality, security, and performance belong in a normal review pass — not here. Lists findings; applies nothing.

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

## Step 2: Interpret tagged output

One line per finding, ranked by severity:

| Tag | Meaning | Action |
|-----|---------|--------|
| `missing-ui:` | Route on disk, not in `flows[]` | Add flow with `path` + `checks` |
| `missing-api:` | Endpoint not in flows or deferred | Add flow check or `tiers.smoke` |
| `orphan:` | Manifest path not found in repo | Rename path or remove stale flow |
| `no-checks:` | Flow with empty `checks[]` | Add operator checks |
| `no-critical:` | No flow marked `critical: true` | Flag at least home/checkout |
| `deferred:` | Intentionally skipped (ledger) | No action — audit respects this |

End line:

- `net: N untested ui, M untested api, …` — gaps remain
- `Lean already. Ship.` — no coverage gaps (deferred entries may still list)

## Step 3: Deferred coverage ledger

Surfaces you deliberately exclude from `flows[]` but want audit to ignore:

```yaml
deferred_coverage:
  - id: api-health
    path: /api/health
    reason: covered by tiers.smoke only
    revisit: when adding API flow checks
```

Re-run audit — path moves from `missing-api:` to `deferred:`.

## Step 4: Multi-repo (frontend + backend)

When API lives in a sibling repo, either:

- Set `UAT_DISCOVER_PATHS=../backend-api` for one-off audit, or
- Add to manifest:

```yaml
linked_repos:
  - id: backend-api
    path: ../backend-api
    base_url: http://127.0.0.1:8000
```

Re-run audit — API routes from linked repos appear with a `[repo-name]` tag in discovery.

## Step 5: Recommend follow-up

- Gaps in UI → offer `init` merge or manual `flows[]` edits
- Gaps in API → suggest `tiers.smoke` one-liner or Tier B script
- Large gap count → prioritize `critical: true` routes first
- After manifest update → re-run `audit.mjs` until `Lean already. Ship.`

## Step 6: Review vs audit

| Command | Scope | Question |
|---------|-------|----------|
| [review.md](review.md) | Git diff | What to UAT for *this PR*? |
| **audit** | Whole repo | What routes lack manifest coverage? |

## Step 7: Optional codegen handoff

When the user wants executable tests (not just checklist):

- UI flows → `@uat-tester/cli` `uat discover` / `uat test` (Playwright)
- API routes → suggest pytest/httpx or existing integration test file

The skill does not write test files unless the user explicitly asks.
