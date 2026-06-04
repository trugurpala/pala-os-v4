# Local Persistence Policy

Pala OS memory must live inside the project, not inside a chat session.

## Storage layers

| Layer | Path | Purpose | Git status |
|---|---|---|---|
| SQLite DB | `.pala/db/pala.sqlite` | local app state and dashboard queries | ignored |
| State | `.pala/state/*` | volatile dashboard/runtime snapshots | ignored |
| Ledger | `.pala/ledger/*.jsonl` | append-only local audit trail | ignored; sanitize before any public export |
| Archive | `.pala/archive/*` | retired local runtime evidence | ignored |
| Rules | `.pala/rules/*` | permanent operating rules | committed |
| Memory | `.pala/memory/*` | mistakes, lessons, pattern memory | committed if sanitized |
| Evidence raw | `.pala/evidence/raw/*` | raw logs, paths, command outputs | ignored |
| Evidence public | `docs/evidence/*` | sanitized summaries | committed |

## Do not store

- API keys
- MCP secrets
- OAuth tokens
- private emails
- private local absolute paths
- raw logs with credentials
- personally identifying debug dumps

## Redaction required

Before any public evidence is written, redact:

- Windows user paths
- home directories
- emails
- access tokens
- API keys
- bearer tokens
- MCP env secrets

Local ledgers must pass `pala ledger-safety-check` before public export. A repair may run only with
explicit local apply mode; it must preserve the original under gitignored
`.pala/private/ledger-redaction-backups/` before rewriting the local ledger.
Safety findings must never echo the sensitive source text.

Runtime state and ledgers are local truth sources, but they are not public
release artifacts. Public-safe evidence belongs under `docs/evidence/*`.

## Completion rule

A command is complete only when it records:

- run record
- command record
- exit code
- evidence path
- ledger event
- dashboard-visible state
