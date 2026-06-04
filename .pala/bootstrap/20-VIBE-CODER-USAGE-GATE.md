# 20 — Vibe Coder Usage Gate

Pala OS must be usable by a vibe coder while coding in Claude Code/Cursor/Codex console and after the coding work appears to be finished.

## Before coding

The user runs or asks the agent to run:

```txt
pala status
pala memory check
pala plan --goal "..."
pala token-budget --goal "..."
pala reference-check
```

Purpose: do not start blind.

## While coding

The user can ask:

```txt
pala evidence last
pala dashboard-state
pala next-actions
pala token-economy
pala stop-if-risk
pala memory check --category "current task"
```

Purpose: keep the agent inside evidence, budget, and rules.

## After coding

The user must ask or run:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory add-mistake --interactive
pala memory promote-rule --dry-run
```

Purpose: no fake done, no drift, no repeated mistake, no blind push.

## User-facing mental model

```txt
Claude Code/Cursor/Codex = işi yapan usta
Pala OS = ustanın kontrol kulesi, muhasebesi, hafızası ve kalite kapısı
```
