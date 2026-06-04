# 06 — MCP Installer UX

Required commands:

```bash
pala setup --cursor
pala setup --claude
pala setup --codex
pala setup --claude-desktop
pala setup --all
pala setup --check
pala setup --repair --dry-run --all
pala setup --remove --cursor
pala doctor
pala verify
pala mcp-smoke
```

Tests must use temp HOME/APPDATA fixtures.
Do not modify real user MCP configs during tests.

Rules:

- backup before real write
- dry-run writes nothing
- preserve unrelated MCP servers
- remove only `pala`
- no secrets in snippets
- invalid JSON/TOML handled safely
