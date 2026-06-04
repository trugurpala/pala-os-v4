# Backend / Frontend / Worker Map

This file explains Pala OS in a way backend, frontend, DevOps, and contributors can share.

## Backend / CLI

Backend owns:

- command routing
- DB migrations
- evidence writer
- ledger writer
- decision engine
- token economy records
- MCP config dry-run logic
- drift/sync/push checks
- quality radar checks

Main commands:

```txt
pala db init
pala db status
pala status
pala plan --goal "..."
pala verify
pala drift-check
pala sync-check
pala push-check
pala token-economy
pala quality-radar
pala setup --repair --dry-run --all
```

## Frontend / Control Tower

Frontend owns:

- `/control/overview`
- `/control/evidence`
- `/control/decisions`
- `/control/memory`
- `/control/mistakes`
- `/control/token-economy`
- `/control/drift`
- `/control/sync`
- `/control/push-readiness`
- `/control/mcp-installer`
- `/control/references`
- `/control/quality-radar`

Frontend rule:

```txt
Read truth. Do not create truth.
```

## Worker / n8n

Worker owns optional background tasks:

- scheduled reference freshness checks
- evidence summarization
- token summary aggregation
- dashboard refresh
- drift watch

Worker cannot:

- push code
- publish packages
- activate workflows
- write real MCP configs
- delete files

without explicit approval.

## Data flow

```txt
CLI/Worker → DB + Ledger + Evidence → Dashboard
```

Dashboard never reads from imagination. It reads stored truth.
