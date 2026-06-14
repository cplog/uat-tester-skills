# Tier D — worker / background lane

Runs `tiers.worker` commands. Use `--full` for `worker_optional`. Use `--service <id>` for `extra_services`.

## Steps

1. Print `safety_notes` from manifest to the user.
2. Confirm background job execution is allowed in this environment.
3. Execute:

```bash
npm run uat:tier-d
npm run uat:tier-d -- --full
npm run uat:tier-d -- --service <service-id>
# or direct:
SKILL_DIR="$(bash .agents/skills/uat-harness-skill/scripts/where-skill.sh)"
bash "$SKILL_DIR/scripts/tier-d.sh"
bash "$SKILL_DIR/scripts/tier-d.sh" --full
bash "$SKILL_DIR/scripts/tier-d.sh" --service <service-id>
```

4. Never run `destructive_commands` without explicit approval.

## When to use

- Scheduled jobs, queue workers, sync pipelines
- Separate APIs or services listed in `extra_services`

## Report

Command output, job/run IDs, and any failing subsystem.
