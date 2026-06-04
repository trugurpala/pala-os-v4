# Recipe — First 10 Minutes Demo

Goal:
Show immediate value to a new user.

Commands:
```bash
pala panel
pala drift-check
pala setup --repair --dry-run --all
pala push-check
```

Expected:
- dashboard opens
- evidence logs appear
- no real config changes

Failure mode:
If evidence is missing or setup proposes a real write, stop and keep the result blocked.
