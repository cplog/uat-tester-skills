# Tier D — worker / background lane

Runs `tiers.worker` commands. Use `--full` for `worker_optional`. Use `--service <id>` for `extra_services`.

## Steps

1. Print `safety_notes` from manifest to the user.
2. Confirm worker execution is allowed in this environment (not portal-only).
3. Execute:

```bash
bash skills/uat-harness-skill/scripts/tier-d.sh
bash skills/uat-harness-skill/scripts/tier-d.sh --full
bash skills/uat-harness-skill/scripts/tier-d.sh --service daq
# or: npm run uat:tier-d
```

4. Never run `destructive_commands` without explicit approval.

## When to use

- Cron, scrape, queue workers, health pipelines
- OpenCLI / browser automation lanes

## Report

Command output, scrape run IDs, health signal IDs, worker job IDs.
