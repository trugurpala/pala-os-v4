# MCP Repair Dry Run Demo

## Goal

Propose an MCP repair while preserving existing servers and real user configs.

## Commands

```bash
pala setup --repair --dry-run --all
pala mcp-smoke --dry-run
```

## Expected evidence

The output includes a proposed diff, backup plan, `writes_performed: false`, and raw logs.

## Failure / no-fake-done

Invalid fixture JSON requires manual verification. A real config write requires explicit approval.
