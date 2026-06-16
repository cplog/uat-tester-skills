# Init — scaffold uat-manifest.yml

One-time (or refresh) project setup. Crawl the repo, interview the user, write **`uat-manifest.yml`** at the project root. Optionally write **`UAT.md`** (operator summary, like Impeccable's PRODUCT.md).

## Step 1: Load current state

- Check for existing `uat-manifest.yml` (or `$UAT_MANIFEST`).
- Check for `UAT.md` at root, `.agents/context/`, or `setup/docs/guides/`.
- If manifest exists: ask whether to refresh fully, merge new flows only, or skip.

Never silently overwrite without confirmation.

## Step 2: Explore the codebase

Run discovery first (do not rely on manual grep alone):

```bash
SKILL_DIR="$(bash <skill-dir>/scripts/where-skill.sh)"
node "$SKILL_DIR/scripts/discover.mjs" --pretty
node "$SKILL_DIR/scripts/discover.mjs" --draft   # suggested flows + tiers
```

If manifest already exists:

```bash
node "$SKILL_DIR/scripts/audit.mjs" --pretty
```

Multi-repo (frontend + backend API in sibling folder):

```bash
UAT_DISCOVER_PATHS=../backend-api node "$SKILL_DIR/scripts/discover.mjs" --pretty
```

Or add `linked_repos` to the manifest (see [../reference.md](../reference.md)).

Discover what you can before asking:

| Signal | Maps to manifest |
|--------|------------------|
| `discover.mjs` UI routes | `flows[].path`, `checks` |
| `discover.mjs` API routes | `flows[]` or `tiers.smoke` probes |
| `package.json` scripts | `tiers.static`, `tiers.smoke`, `tiers.worker` |
| FastAPI `@app.get`, OpenAPI | API flows / smoke |
| `scripts/cron*`, `worker*`, `docker-compose` | `tiers.worker`, `extra_services` |
| `setup/docs/guides/USERFLOW.md` or similar | `docs.userflow`, flow `checks` |
| `.env.local.example` | `environments`, `safety_notes` |
| Destructive npm scripts | `destructive_commands` |

Note framework (`nextjs`, `vite`, etc.) for `framework` field.

## Step 3: Ask (only what code didn't answer)

2–3 questions per round:

1. **Primary operator surfaces** — which routes matter for acceptance?
2. **Deploy smoke** — existing script or URL health check?
3. **Background work** — cron, workers, separate APIs?
4. **DB policy** — production DB? read-only default for UAT?

Do not ask for routes already obvious from the router.

## Step 4: Write uat-manifest.yml

Use schema in [../reference.md](../reference.md). Minimum:

- `project_id`, `platform`, `framework`, `base_url`
- `flows[]` with `id`, `path`, `checks`
- `tiers.static`, `tiers.smoke` (can be empty arrays)
- `destructive_commands`, `safety_notes`
- `docs.userflow` if a guide exists

Copy from [../templates/manifest-template.yml](../templates/manifest-template.yml) and customize.

## Step 5: Optional UAT.md

Short operator-facing summary (not duplicated checklist):

```markdown
# UAT

## Audience
[Who runs UAT and when]

## Critical paths
[flow ids + one line each]

## Environments
[local, preview, worker — and DB rules]

## Out of scope
[What this harness does not cover]
```

## Step 6: Recommend next steps

Suggest exact commands:

- `node "$SKILL_DIR/scripts/audit.mjs"` — verify coverage after init
- `npm run uat:tier-a` — after UI-only change
- `npm run uat:tier-b -- --url <preview>` — before deploy
- `npm run uat:tier-c -- --flows <ids>` — operator walkthrough
- `npm run uat:tier-d` — worker/cron change

Point to `docs.userflow` when present.
