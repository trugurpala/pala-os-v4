# Claude Code Memory / Hooks / Skills / Subagents / MCP — Pala Usage

## CLAUDE.md

Use for short, always-loaded project context. Do not put long manuals here.

## Auto memory

Useful for Claude's learnings, but not the product database. Pala stores product memory in SQLite + ledger + mistake registry.

## Hooks

Use hooks to block or warn about risky actions after local smoke test.

Recommended guarded actions:

- `git push`
- package publish
- destructive deletion
- real MCP config writes
- secret reads/writes

Pala ships hook scripts as optional. Activate only after smoke test.

## Skills

Use `.claude/skills/*/SKILL.md` for repeatable short workflows:

- `/pala-operator`
- `/pala-final-verify`

Keep SKILL.md short. Put detailed docs in `docs/`.

## Subagents

Use `.claude/agents/` for role separation:

- pala-architect
- pala-backend-engineer
- pala-frontend-engineer
- pala-qa-evidence-reviewer
- pala-security-mcp-guard

Subagents help; they do not decide final PASS.

## MCP

MCP setup must be dry-run first. Never mutate real MCP configs in tests. Use temp fixtures.
