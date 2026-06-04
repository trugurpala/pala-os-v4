# Claude Code Memory Usage

Pala OS uses Claude Code memory as a short instruction surface, not as the source of truth.

## CLAUDE.md

Keep it short. It should say:

- Pala OS is the control/evidence layer.
- Use PROJECT_ROOT.
- No fake done.
- No push/publish/delete/real config write without approval.
- Read `.pala/rules/*` and `.pala/memory/*` before risky tasks.
- Write evidence for every command.

## .claude/settings.json

Settings may help guide behavior, but they are not enough by themselves.

## Hooks / permissions / tests

Where available, use deterministic gates for:

- no push
- no delete
- no secret leak
- evidence required
- tests/lint required
- dashboard truth check

## Skills / subagents

Use skills and subagents for specialized workflows, but store task outcomes in Pala DB/ledger/evidence.

## Memory sync

`pala memory sync-claude --dry-run` should compare current short CLAUDE.md against rules and propose a diff.

It must not dump the whole DB into CLAUDE.md.
