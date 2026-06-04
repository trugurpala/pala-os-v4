# Example 14 — Vibe Coder Console Flow

## Before coding

```txt
Run Pala preflight for this goal: build MCP repair dry-run.
```

Expected:

```txt
pala status
pala memory check
pala plan --goal "build MCP repair dry-run"
pala token-budget --goal "build MCP repair dry-run"
pala reference-check
```

## While coding

```txt
Show Pala state, last evidence, and token economy.
```

Expected:

```txt
pala dashboard-state
pala evidence last
pala token-economy
pala next-actions
```

## After coding

```txt
Run Pala final verification.
```

Expected:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```

## Failure / no-fake-done

If final verification reports blockers, keep the task partial and follow the reported next action.
