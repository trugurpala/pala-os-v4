# 04 — Local Control Tower

Build a local dashboard/control tower.

Required command:

```bash
pala panel
```

Required routes/sections:

```txt
/control/overview
/control/evidence
/control/tests
/control/security
/control/installer
/control/drift
/control/sync
/control/push-readiness
/control/token-economy
/control/references
/control/benchmarks
/control/quality-radar
/control/refactor
/control/playbooks
/control/external-skills
/control/public-release
```

Dashboard reads only real state:

- `.pala/state/*.json`
- `.pala/ledger/*.jsonl`
- `.pala/evidence/**`
- `docs/evidence/**`
- `docs/security/**`
- package metadata
- test logs

No fake green.
