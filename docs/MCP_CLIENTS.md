# MCP Clients

Pala OS MCP commands provide safe fixture-only dry-run planning in v28.

Use:

```bash
npm run pala -- setup --repair --dry-run --all
npm run pala -- mcp-smoke --dry-run
```

Rules:

- Do not modify real MCP configs during tests.
- Use temporary `HOME`, `USERPROFILE`, `APPDATA`, and `XDG_CONFIG_HOME` fixtures.
- Preserve unrelated MCP servers.
- Preserve unrelated top-level config keys.
- Never overwrite or remove an existing `pala` entry unless it is recognized
  as Pala-owned.
- Back up before any real write.
- Remove only Pala-owned entries.
- Inspect fixture JSON through a realpath-contained, symlink/junction-free,
  1,000,000-byte-bounded stable single handle.
- Return bounded structural name/count/action summaries only; never return
  fixture payloads, environment values, or secret values.
- Treat unsafe, oversized, unstable, invalid-JSON, or invalid-shape fixtures
  as manual verification instead of an empty or clean config.

Official/current references are tracked in `docs/evidence/current-sources.md`.

The fixture contract is exercised for Cursor, Claude Code, Codex, and Claude
Desktop. Real client path formats remain subject to current official-source
verification before any future approved write implementation.
