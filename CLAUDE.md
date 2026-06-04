# CLAUDE.md - Pala OS v28 Session Rules

Pala OS is not a coding agent.

Pala OS is a local control tower and operating layer for AI/vibe coding agents.

**Agent does the work. Pala OS verifies the work.**

## Claude Code Limit-Aware Operation

- `CLAUDE.md` and auto memory are context, not hard enforcement.
- Use hooks, settings, permissions, local tests, CLI gates, DB, ledger, and evidence for enforcement.
- Do not assume active model or effort. Verify with `/status`, `/model`, and `/effort` when available.
- Do not claim a specific Opus version or Max effort unless the local runtime confirms it.
- Keep skills concise. Move long procedures into supporting docs.
- Subagents are helpers; final acceptance still requires Pala verification.

## Source Of Truth

Do not rely on chat memory alone. Read and update:

```txt
.pala/rules/*
.pala/state/*
.pala/ledger/*
.pala/memory/*
.pala/evidence/*
.pala/schema/*
```

## Hard Rules

- Use `PROJECT_ROOT = current working directory`.
- No hardcoded personal local paths in public files.
- No fake PASS.
- No push, publish, deletion, real MCP config write, or n8n activation without explicit approval.
- No token/cost savings claim without evidence.
- No exact token cost if only estimated.

## Before Risky Work

```txt
pala memory check
pala reference-check
pala token-budget --goal "..."
pala plan --goal "..."
```

## After Work

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```
