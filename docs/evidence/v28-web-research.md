# V28 Web Research Evidence

Checked on 2026-06-04 against current official documentation and the local runtime.

## Local Runtime

| Check | Observed |
|---|---|
| Claude Code | `2.1.153` |
| Node.js | `v24.14.1` |
| npm | `11.11.0` |
| Git | `2.54.0.windows.1` |
| Active model | Unknown from this non-interactive session |
| Active effort | Unknown from this non-interactive session |
| MCP command surface | Available; `claude mcp --help` and read-only list succeeded |

## Claude Code Official Sources

- [Overview](https://code.claude.com/docs/en/overview): Claude Code reads code, edits files, runs commands, and integrates with development tools.
- [Memory](https://code.claude.com/docs/en/memory): CLAUDE.md and auto memory are context, not enforced configuration.
- [Hooks](https://code.claude.com/docs/en/hooks): `PreToolUse` can allow, deny, ask, or defer tool calls.
- [Settings and permissions](https://code.claude.com/docs/en/settings): project settings and permission rules have scoped precedence.
- [Skills](https://code.claude.com/docs/en/slash-commands): project skills live under `.claude/skills/<skill-name>/SKILL.md` and load when used.
- [Subagents](https://code.claude.com/docs/en/sub-agents): project subagents live under `.claude/agents/` and are helpers, not final authority.
- [MCP](https://code.claude.com/docs/en/mcp): local, project, and user scopes use different storage and approval behavior.
- [Model configuration](https://code.claude.com/docs/en/model-config): model aliases and supported effort levels can change; `max` is session-only and can spend more tokens.

## Important Correction

The supplied v28 pack uses an "Opus 4.8 Max" filename and operator phrase. The current local runtime and official model documentation do not prove that a model named Opus 4.8 is active or supported here. Pala therefore records model and effort as `Unknown` until `/status`, `/model`, `/effort`, environment, or another trustworthy runtime source confirms them.

## Pala Decisions

1. Pala remains local-first.
2. Enforcement is CLI + DB + ledger + evidence + tests, with optional smoke-tested hooks.
3. Real MCP config writes remain approval-gated; tests use temporary fixtures.
4. Dashboard reads stored truth and never invents green status.
5. References are lessons only; no code, copy, branding, package-name, or screenshot copying.
