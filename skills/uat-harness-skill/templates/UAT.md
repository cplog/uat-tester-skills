# UAT — {{project_id}}

Operator acceptance testing brief for this project. The generic harness skill reads this file via `context.mjs`.

## Audience

Who runs UAT and when (e.g. before deploy, after PR merge, weekly smoke).

## Critical paths

| Flow id | Route | What must work |
|---------|-------|----------------|
| | | |

## Environments

| Env | URL | Auth | DB policy |
|-----|-----|------|-----------|
| local | http://localhost:3000 | | read-only |
| preview | | | read-only |

## Auth prerequisite (Tier C)

How to obtain a logged-in session for operator walkthroughs.

## Locale / viewport

Default locale, toggle behavior, min viewport (if applicable).

## Out of scope

What this harness does **not** cover (mobile native, webhooks, perf, security audit).

## Notes

Project-specific quirks agents must know during UAT.
