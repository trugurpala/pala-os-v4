# MCP Installer

The v28 MCP repair flow is fixture-only and dry-run first.

```bash
npm run pala -- setup --repair --dry-run --all
npm run pala -- setup --check --all
npm run pala -- setup --remove --dry-run --all
npm run pala -- mcp-smoke --dry-run
```

The dry-run:

- writes nothing to real Codex, Claude, Cursor, or Claude Desktop configs
- preserves unrelated fixture MCP servers
- preserves unrelated top-level config keys
- treats an existing non-Pala-owned `pala` entry as an ownership conflict
- makes `--check` read-only and makes `--remove` remove only a recognized
  Pala-owned fixture entry
- uses `realpath_contained_single_handle_max_1mb_payload_free`: fixture files
  must be realpath-contained, symlink/junction-free regular files no larger
  than 1,000,000 bytes, and are read from one stable handle
- uses shared payload-free path metadata before reading, so a missing fixture
  below a symlink/junction is unsafe rather than an empty fixture
- blocks unsafe, oversized, unstable, invalid-JSON, or invalid-shape fixtures
  for manual verification
- reports descriptor-close failure as `fixture_file_close_failed` through
  `structured_fail_closed_no_throw`, discards the parsed fixture, and proposes
  no change
- returns only bounded server-name/count/action summaries; never returns fixture
  payloads, environment values, or secret values
- caps a plan at 20 clients and each returned server-name list at 200 names
- includes a backup plan while reporting `payload_exposed: false`,
  `secret_values_exposed: false`, and `writes_performed: false`

Any future real write requires explicit approval, current official path
verification, and a timestamped backup. This repository does not currently
perform real config writes.

Client notes and current-source links live in `docs/MCP_CLIENTS.md` and
`docs/evidence/current-sources.md`.
