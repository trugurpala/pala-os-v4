# Recipe — MCP Installer Repair Dry Run

Goal:
Check and repair MCP configs without touching real user configs.

Commands:
```bash
pala setup --repair --dry-run --all
pala setup --check
pala mcp-smoke
```

Expected:
- dry-run writes zero files
- unrelated MCP servers preserved
- backup plan shown

Failure mode:
Invalid fixture config requires manual verification; a real config write always requires approval.
