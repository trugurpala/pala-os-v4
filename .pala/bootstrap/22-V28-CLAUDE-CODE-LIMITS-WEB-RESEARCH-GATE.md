# Gate 22 — Claude Code Limits + Web Research Gate

Pala OS must be built inside the real limits of Claude Code.

## Verified constraints to respect

- Claude Code can read code, edit files, run commands and integrate with tools, but Pala must not treat Claude as an unlimited autonomous system.
- Claude memory files are context, not hard enforcement.
- Project settings, permissions and hooks can help enforce behavior, but must be tested locally.
- MCP scopes and paths must never be invented.
- Model/effort support must be detected, not assumed.
- Skills have recurring context/token cost after loading; keep SKILL.md concise.
- Subagents can help, but they do not replace final Pala verification.

## Required implementation

Create:

```txt
docs/evidence/v28-web-research.md
docs/architecture/claude-code-limits-and-pala-response.md
docs/claude-code/OPUS-4-8-MAX-RUNBOOK.md
docs/claude-code/MEMORY-HOOKS-SKILLS-SUBAGENTS-MCP.md
.pala/rules/claude-code-limits-policy.md
.pala/rules/model-effort-token-policy.md
```

## PASS criteria

- Runtime is checked in evidence.
- No invented config path.
- No fake model claim.
- Hooks are optional until smoke-tested.
- Real enforcement path is CLI + DB + ledger + evidence + tests.
