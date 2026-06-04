# Operator Console Usage Policy

Pala OS must be useful to a vibe coder inside the Claude Code console.

## Before coding

```bash
pala status
pala memory check
pala plan --goal "..."
pala token-budget --goal "..."
pala reference-check
```

## While coding

```bash
pala evidence last
pala drift-check --quick
pala token-economy
pala next-actions
```

## After agent says done

```bash
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```

## Rule

The agent saying "done" is not enough.
The Pala verification chain decides whether the task is accepted.
