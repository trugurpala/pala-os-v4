# Backend / Frontend / DevOps Contract

## Backend owns

- CLI command routing.
- SQLite migration and writes.
- Ledger append.
- Evidence writer.
- Redaction.
- Decision engine.
- MCP dry-run merge planner.
- Drift/sync/push checks.
- Token economy calculation.

Rule: backend command cannot report success without DB/ledger/evidence.

## Frontend owns

- `/control/*` pages.
- Read-only state rendering.
- Evidence timeline.
- Decision timeline.
- Memory/mistake views.
- Token confidence views.
- Push/readiness blockers.

Rule: frontend cannot invent success. Missing data is Unknown / Not checked / Manual verification required.

## DevOps/Admin owns

- CI setup.
- Security workflow.
- OpenSSF scorecard integration.
- Release readiness.
- `.gitignore` safety.
- Secret/log redaction policy.

Rule: no push/publish/release without `pala push-check` and release gate evidence.
