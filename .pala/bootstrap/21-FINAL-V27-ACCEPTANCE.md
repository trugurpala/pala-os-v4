# 21 — Final v27 Acceptance

v27 is accepted only if these are implemented as files, commands, or explicit stubs with evidence:

- Local DB design exists: `.pala/schema/001_init.sql`.
- DB path is gitignored: `.pala/db/*.sqlite*`.
- Ledger files exist and are append-only by policy.
- Mistake registry exists.
- Decision engine policy exists.
- Vibe coder usage guide exists.
- Claude Code memory policy exists.
- Competitor/reference lessons are listed as benchmark inputs, not copy targets.
- Dashboard data contract says frontend reads DB/state/evidence only.
- CLI command map includes before/during/after coding commands.
- Main paste prompt forces the agent to build in the correct order.

No PASS without:

- created files list
- command list
- exit codes
- raw log paths
- DB status
- sample run record
- sample mistake record
- dashboard pages consuming DB/state/evidence
