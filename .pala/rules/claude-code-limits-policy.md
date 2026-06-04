# Claude Code Limits Policy

Pala OS must respect Claude Code as a powerful coding agent, not an unlimited runtime.

## Rules

1. `CLAUDE.md` is context, not enforcement.
2. Auto memory is useful, but not a database.
3. Blocking behavior belongs in CLI gates, tests, permissions, and hooks.
4. Hooks must be smoke-tested before being made active.
5. Claude Code MCP config paths must follow official docs only.
6. Project `.mcp.json` is team-shared and requires approval.
7. User/local MCP config lives outside repo and must not be edited during tests.
8. Skills must be concise because loaded skills stay in context and cost tokens.
9. Subagents are role helpers, not final authority.
10. Final PASS always requires Pala DB + ledger + evidence.
