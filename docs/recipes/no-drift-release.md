# Recipe — No Drift Release

Goal:
Prevent README/docs/panel/source mismatch.

Commands:
```bash
pala drift-check
pala sync-check
pala push-check
```

Expected:
- mismatch fails
- push-check never pushes
- dashboard shows blockers

Failure mode:
Any unresolved drift or sync blocker prevents release acceptance.
