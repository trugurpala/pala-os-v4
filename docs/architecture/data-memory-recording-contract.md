# Data, Memory and Recording Contract

## Why local DB exists

Prompt memory is not enough. Pala OS needs a local database so it can remember runs, commands, decisions, mistakes, token usage, evidence and gate results across sessions.

## Layers

| Layer | Purpose | Git status |
|---|---|---|
| `.pala/db/pala.sqlite` | Local app state and dashboard queries | gitignored |
| `.pala/state/*` | Volatile dashboard/runtime snapshots | gitignored |
| `.pala/ledger/*.jsonl` | Append-only local audit trail | gitignored |
| `.pala/archive/*` | Retired local runtime evidence | gitignored |
| `.pala/rules/*` | Permanent rules | committed |
| `.pala/memory/*` | Mistake and lesson registry | committed if sanitized |
| `.pala/evidence/raw/*` | Raw logs | gitignored |
| `docs/evidence/*` | Sanitized evidence summaries | committed |

## Recording rule

Every command execution must create or reference:

- run id
- command id
- command text or label
- exit code
- raw log path
- changed file list
- evidence summary
- ledger event

## Mistake learning rule

```txt
mistake detected
  ↓
write mistakes table
  ↓
append mistakes.jsonl
  ↓
update mistake-registry.jsonl
  ↓
propose lesson
  ↓
approval required to promote to rule
```
