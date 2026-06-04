# 05 — Admin / Background / n8n

Pala OS controls and approves.
n8n, if local, may be a workflow/background runner.
Claude Code writes code and evidence.

n8n must never bypass approval.

Required commands:

```bash
pala admin-check
pala worker-check
pala worker-run --dry-run
pala n8n-check
pala n8n-plan --dry-run
pala n8n-import --dry-run
```

Rules:

- detect n8n locally if available
- redact API keys
- no workflow activation without approval
- no external call without approval
- if n8n missing, Pala still works
