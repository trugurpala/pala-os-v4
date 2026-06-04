# Claude Code Memory Policy

Pala OS must use Claude Code memory correctly.

## What CLAUDE.md is

`CLAUDE.md` is always-on context for Claude Code. It is useful for project instructions, but it is not a database, not an audit log, and not a hard enforcement system.

## What goes into CLAUDE.md

- short project identity
- short operating rules
- where Pala memory lives
- safe command habits
- no fake done reminder
- link to `.pala/rules/*`

## What must not go into CLAUDE.md

- long raw logs
- secrets
- full benchmark dumps
- full mistake history
- private local paths
- giant generated docs
- anything that should be queried from DB/ledger/evidence

## Memory sync command

`pala memory sync-claude --dry-run` may propose a short `CLAUDE.md` summary update.
It must not overwrite CLAUDE.md without showing a diff and getting approval.

## Hard enforcement

Hard gates must live in:

- CLI checks
- tests
- hooks/settings/permissions where available
- local DB/ledger/evidence
- dashboard truth checks

Not in memory text alone.
