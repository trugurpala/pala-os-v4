# First 10 Minutes Demo

## Goal

Show a new user the local control tower and evidence loop in ten minutes.

## Commands

```bash
pala status
pala panel
pala drift-check
pala setup --repair --dry-run --all
```

## Expected evidence

The dashboard routes, DB status, raw logs, and MCP dry-run plan become visible without real config writes.

## Failure / no-fake-done

Missing proof stays Unknown or under manual verification; the demo never invents a green state.
