# No Delete / No Push

Pala OS may report on destructive or external actions, but must not perform them without explicit approval.

Approval-gated actions:

- deleting files
- `git push`
- package publish
- production deployment
- real MCP config write
- n8n workflow activation

`pala push-check` reports only. It never pushes.
