# 18 — Local Database and Memory Gate

Pala OS must not be a one-session prompt pack. It must have local persistent memory.

## Required memory layers

1. **SQLite local app database**
   - Path: `.pala/db/pala.sqlite`
   - Purpose: fast local dashboard queries, run history, decision history, mistake memory, token economy, drift/sync/push history.
   - Must be gitignored.

2. **Append-only JSONL ledger**
   - `.pala/ledger/events.jsonl`
   - `.pala/ledger/handoffs.jsonl`
   - `.pala/ledger/decisions.jsonl`
   - `.pala/ledger/mistakes.jsonl`
   - `.pala/ledger/token-economy.jsonl`
   - Purpose: recoverable audit trail and no silent overwrite.

3. **Human-readable rules and memory**
   - `.pala/rules/*`
   - `.pala/memory/mistake-registry.jsonl`
   - `.pala/memory/lessons-learned.md`
   - Purpose: reviewable operating memory for agents and humans.

4. **Evidence files**
   - `.pala/evidence/*` for local evidence.
   - `.pala/evidence/raw/*` for sensitive raw logs; must be gitignored.
   - `docs/evidence/*` for sanitized public summaries.

## Hard rule

If a command does not write or reference DB state, ledger event, and evidence path, it is not complete.

## No fake learning

A mistake can suggest a lesson, but it cannot become an active rule without explicit approval.

Required commands:

```txt
pala db init
pala db status
pala memory check
pala memory list
pala memory add-mistake
pala memory promote-rule --dry-run
pala memory sync-claude --dry-run
```
