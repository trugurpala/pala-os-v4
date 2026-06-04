# 01 — Claude Code Official Compatibility Gate

Before using Claude-specific behavior:

- check official docs if internet is available
- check local CLI help if installed
- record source/date/version/decision
- do not invent config paths
- do not confuse Claude Code and Claude Desktop

Required checks if available:

```bash
claude --version
claude --help
claude mcp --help
claude mcp list
```

Known policy:

- `CLAUDE.md` provides context, not hard enforcement.
- Skills, hooks, subagents, MCP and plugins are separate layers.
- Code Review is optional and does not replace Pala gates.
