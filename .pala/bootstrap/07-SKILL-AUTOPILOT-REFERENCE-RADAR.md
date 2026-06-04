# 07 — Skill / Autopilot / Reference Radar

Autopilot is not unlimited permission.

Flow:

Goal → source check → benchmark check → skill selection → agent/department assignment → dry-run → approval → execution → evidence → dashboard.

Required commands:

```bash
pala skills-check
pala hooks-check
pala agents-check
pala autopilot-plan --goal "..."
pala autopilot-run --dry-run --goal "..."
pala external-skills-refresh
pala external-skill-propose --target "..."
pala opportunity-radar
```

External skill policy:

- benchmark/reference allowed
- optional integration candidate allowed
- copy code/copy/branding prohibited
- auto-install prohibited
- approval required for install
