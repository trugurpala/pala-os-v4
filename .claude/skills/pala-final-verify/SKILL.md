---
description: Use before accepting any completed Pala OS task.
allowed-tools: Read Grep Glob Bash
---

# Pala Final Verify Skill

Check:

1. Commands ran with exit codes.
2. Evidence logs exist.
3. DB migration/status is known.
4. Ledger event was appended.
5. Dashboard does not fake status.
6. README/docs/state/panel are not drifting.
7. No push, publish, deletion, real MCP write or n8n activation happened.

Return PASS only if Pala gates have evidence.
