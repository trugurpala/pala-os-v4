# Local Database and Memory Architecture

Pala OS needs memory because a vibe coding workflow fails when each agent session forgets what happened before.

## Final memory model

```txt
CLAUDE.md / AGENTS.md = short context and operating entry points
.pala/rules/* = permanent reviewable laws
.pala/db/pala.sqlite = local app database
.pala/ledger/*.jsonl = append-only audit trail
.pala/memory/* = mistake registry and lessons
.pala/evidence/* = proof files and raw logs
docs/evidence/* = public-safe evidence summaries
```

## Why SQLite

SQLite is local, portable, fast enough for a desktop control tower, and does not require a server. It is the right default for local-first dashboard state.

## Why JSONL ledger

The ledger is append-only so the project can recover history even if the DB is reset or migrated.

## Why rules stay as files

Rules must be visible in GitHub and easy for contributors to review. DB memory alone is not enough.

## Dashboard contract

The dashboard may render:

- runs
- commands
- evidence
- decisions
- mistakes
- lessons
- approvals
- token usage
- drift checks
- sync checks
- push checks
- MCP config checks
- reference sources
- quality findings

The dashboard must not invent status. If data is missing, it must show `Unknown`, `Not checked`, `Partial`, `Blocked`, or `Manual verification required`.

## Git safety

Do not commit `.pala/db/pala.sqlite` or raw evidence. Commit schema, rules, sanitized docs, and example fixtures.
