# AGENTS.md — Pala OS Agent Contract

## Role

Coding agents write, edit, inspect, and test project files.
Pala OS controls, verifies, records, budgets, and blocks unsafe/fake-done workflows.

## Required behavior

1. Read `.pala/rules/*` before implementation.
2. Read `.pala/memory/*` before repeating a risky category.
3. Create/update DB/ledger/evidence for commands.
4. Keep dashboard states honest.
5. Never claim PASS without evidence.
6. Use dry-run for config, MCP, publish, delete, push, deployment, and n8n.
7. Ask approval when required.

## Team responsibilities

| Area | Owner role | Truth source |
|---|---|---|
| CLI/backend | Backend operator | SQLite + ledger + evidence |
| Dashboard | Frontend operator | DB/state/evidence only |
| MCP installer | Integration operator | dry-run evidence + backups |
| Worker/n8n | Automation operator | approval-gated workflows |
| Docs/GitHub | Release operator | README/docs/rules/evidence |
| Memory | Governance operator | mistakes/lessons/rules |
| Token economy | Cost operator | token_usage + token ledger |
| Benchmark radar | Research operator | reference_sources + evidence |

## Command lifecycle

```txt
plan → decision → dry-run → approval if needed → execute → evidence → verify → memory update
```
