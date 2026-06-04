# Pala OS from Zero — Full System View

## One sentence

Pala OS is a local control/evidence/memory layer above Claude Code, Cursor, Codex and other AI coding agents.

## Flow

```txt
User goal
  ↓
AI coding agent proposes/executes
  ↓
Pala decision engine checks rules, memory, risks, sources, token budget
  ↓
Allowed action writes DB + ledger + evidence
  ↓
Dashboard reads local truth
  ↓
Final gates decide PASS or BLOCKED
```

## Main modules

1. Kernel: `.pala/rules`, `.pala/state`, `.pala/ledger`, `.pala/evidence`, `.pala/db`.
2. CLI: `pala status`, `plan`, `verify`, `drift-check`, `push-check`, `setup --repair --dry-run --all`.
3. DB: SQLite local app memory.
4. Ledger: append-only JSONL audit trail.
5. Memory: mistake registry and lessons learned.
6. Decision engine: blocked / approval / dry-run / safe local write / pass allowed.
7. Dashboard: `/control/*` pages reading DB/state/evidence.
8. Reference radar: current-source checks and competitor lessons.
9. MCP safe repair: dry-run only until approval.
10. Token economy: exact/estimated/unknown with confidence.

## What happens when vibe coder starts

```txt
pala status
pala memory check
pala plan --goal "..."
pala token-budget --goal "..."
```

## What happens when agent says done

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```

If any critical evidence is missing, the result is not PASS.
