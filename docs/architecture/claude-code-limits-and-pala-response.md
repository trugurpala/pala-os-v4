# Claude Code Limits and Pala OS Response

## What Claude Code gives us

- Reads and edits code.
- Runs shell commands.
- Uses MCP tools.
- Loads project instructions from CLAUDE.md.
- Supports settings, permissions, hooks, skills, subagents and plugins.
- Can run different models/effort levels depending on account/provider/version.

## What Claude Code does not guarantee alone

- It does not turn CLAUDE.md into a hard policy engine.
- It does not replace a project database.
- It does not make dashboard data true automatically.
- It does not guarantee exact token/cost tracking for every local command.
- It should not be trusted to modify real user configs without dry-run and approval.

## Pala OS response

| Limit | Pala response |
|---|---|
| CLAUDE.md is context | CLI gates + DB + ledger + hooks/tests enforce |
| Auto memory is not app DB | `.pala/db/pala.sqlite` and JSONL ledger |
| Agent says done | `pala verify`, `drift-check`, `push-check` decide |
| Token visibility uncertain | exact/estimated/unknown with confidence |
| MCP paths can change | official compatibility gate + dry-run fixtures |
| Strong model can over-spend | model/effort/token policy and budget checks |
| Dashboard can lie | dashboard reads only local truth sources |

## Final rule

Pala OS does not make Claude Code unlimited.
Pala OS makes Claude Code-controlled work observable, memory-aware, cost-aware and evidence-bound.
