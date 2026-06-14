# Report — UAT summary

After any tier session, write this report. Pull `project_id` from manifest via `context.mjs`.

## Template

```markdown
# UAT Report — [date] — [project_id] — [scope]

## Environment
- Manifest: [path]
- URL: [base_url or UAT_URL]
- DB: read-only | write (user approved)

## Tiers completed
- [ ] A (static)  [ ] B (smoke)  [ ] C (flows)  [ ] D (worker)
- [ ] D — extra service: [service-id] (same tier as D, via `--service`)

## Commands run
- (exact commands from manifest tiers)

## Flows checked
- (flow ids from Tier C)

## Evidence
- Screenshots, API responses, job/run IDs

## Failures (root cause, not workaround)
- Expected vs actual → likely cause → fix or follow-up

## Follow-ups
- PRs, config, manifest updates, doc updates
```

## Rules

- Failures must cite root cause.
- Do not claim pass without command output or checklist evidence.
- Suggest manifest updates when a new flow or script is missing.
- **Extra services** are not a separate tier — record them under Tier D with the service id.
