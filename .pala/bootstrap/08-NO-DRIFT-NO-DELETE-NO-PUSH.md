# 08 — No Drift / No Delete / No Push

Required commands:

```bash
pala drift-check
pala drift-fix --dry-run
pala sync-check
pala archive-old --dry-run
pala push-check
```

Rules:

- README/docs/panel/source-of-truth cannot drift
- old files are not hard-deleted
- archive candidates require dry-run first
- push-check never pushes
- publish never happens without explicit approval
