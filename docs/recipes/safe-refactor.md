# Recipe — Safe Refactor

Goal:
Analyze a large unfamiliar codebase and refactor safely.

Commands:
```bash
pala architecture-check
pala refactor-plan --target .
pala quality-radar
pala test-gap-check
```

Expected dashboard:
- `/control/architecture`
- `/control/refactor`
- `/control/quality-radar`

Failure mode:
If no baseline tests exist, create characterization tests or mark refactor blocked.
