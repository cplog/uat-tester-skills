# Report — generated UAT bug reports

The `report` command turns Tier C failure evidence into developer-ready bug reports.

## When to use

- After `uat:tier-c` has produced `.uat/evidence/` bundles.
- To aggregate multiple failures into one Markdown + JSON report.
- To export findings to GitHub Issues.

## Run

```bash
# Aggregate all evidence into .uat/reports/
npm run uat:report

# JSON only
npm run uat:report -- --format json

# Filter by severity
npm run uat:report -- --severity medium

# Export to GitHub Issues (requires gh CLI authenticated)
npm run uat:report -- --gh-export --gh-repo owner/repo
```

## Evidence directory

Each failed check produces a bundle at:

```
.uat/evidence/<timestamp>-<flow-id>-<check-slug>/
  screenshot.png
  dom.html
  console-logs.json
  network-errors.json
  browser-state.json
  metadata.json
  diagnosis.json   # cached diagnosis output
```

## Report output

Reports are written to `.uat/reports/`:

- `uat-bug-report-<project>-<timestamp>.md` — human-readable summary + per-bug details
- `uat-bug-report-<project>-<timestamp>.json` — machine-readable structured report

A bug report includes:

- Bug title and severity
- Root-cause hypothesis
- Reproduction steps
- Suggested fixes
- Screenshot and evidence links
- Branch, commit, app URL, and manifest context

## Configuration

Control reporting behavior in `uat-manifest.yml`:

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

## Notes

- `.uat/` may contain screenshots and state snapshots. Add it to `.gitignore`.
- Diagnosis requires `ANTHROPIC_API_KEY` for AI-powered analysis; otherwise a heuristic fallback is used.
- GitHub export requires the `gh` CLI and write access to the target repo.
- Use `--no-capture` with `uat:tier-c` to skip evidence collection for a quick run.
