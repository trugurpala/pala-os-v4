# Phase Contract Evidence Map

This document maps each implementation phase to durable evidence. It does not
copy volatile run counts, timestamps, raw-log paths, or current acceptance
status. Read current truth from `.pala/state/dashboard-state.json` and rerun
`pala verify`.

## Phase Evidence

| Phase | Durable evidence | Current gate |
|---|---|---|
| 0 - Compatibility and scan | `docs/evidence/official-compatibility-check.md`, `.pala/db/pala.sqlite` | `pala runtime-check` |
| 1 - Mini-kernel | `.pala/rules`, `.pala/state`, `.pala/ledger`, `.pala/evidence`, `.pala/memory`, `.pala/schema` | `pala architecture-check` |
| 2 - Local DB and memory | `.pala/schema/001_init.sql`, gitignored SQLite/state/ledger/archive runtime, sanitized public exports | `pala db status`, `pala memory check`, `pala ledger-safety-check`, `pala evidence export --dry-run` |
| 3 - CLI lifecycle | `src/cli.ts`, command/run/evidence/ledger records | `pala doctor` |
| 4 - Dashboard truth | `control/*/index.html`, `.pala/state/dashboard-state.json` | `pala dashboard-truth-check` |
| 5 - Decision engine | `src/lib/decision-engine.ts`, bounded decision-review queue, decision DB rows and ledger | `pala plan --goal "..."`, `pala decision-review --strict` |
| 6 - No-fake-done verification | test, quality, ledger, drift, sync, push, and model/effort gates | `pala verify` |
| 7 - MCP dry-run repair | fixture-only plans preserving existing servers | `pala setup --repair --dry-run --all` |
| 8 - Token economy | exact/estimated/unknown separation with confidence | `pala token-economy` |
| 9 - Reference radar | official sources, freshness, bounded stale queue, and category coverage | `pala reference-check`, `pala benchmark-refresh --dry-run`, `pala benchmark-check` |
| 10 - Evidence exchange | bounded sanitized v2 export, decision-review summaries, strict completeness gate, explicit and consistency-validated collection truncation truth, exact and stable content digests, no-file digest assertion, digest/count-only change detection, payload-free preview, exact-match compatibility, and validation-only v1-to-v2 migration plan | `pala evidence export --dry-run`, `pala evidence completeness-check --strict`, `pala evidence assert-content --content-digest <sha256> --strict`, `pala evidence compare --dry-run --target <file>`, `pala evidence schema-check --strict`, `pala evidence migrate --dry-run --target <file>` |
| 11 - Public GitHub readiness | community, security, workflow, and release artifacts | `pala public-readiness-check`, `pala workflow-check` |
| 12 - Operational plans | worker, n8n, autopilot, drift-fix, archive, locale, and refactor local plans | relevant plan command |

## Acceptance Law

- A successful command exit is not automatically project PASS.
- Local check PASS and project acceptance are separate values.
- Unknown model/effort stays Unknown.
- Worktree, remote, push, publish, deploy, external activation, destructive
  action, and real global config state are never invented.
- Raw evidence, SQLite, runtime state, local ledgers, and archives remain
  gitignored; ledgers must pass `pala ledger-safety-check` before public export.

## Current Truth

Use:

```bash
npm run pala -- runtime-check
npm run pala -- quality-radar
npm run pala -- drift-check
npm run pala -- verify
```

Then inspect `.pala/state/dashboard-state.json`. Any unresolved blocker keeps
project acceptance at `PARTIAL` or `BLOCKED`.

For the durable autonomous-run handoff and resume boundary, see
`docs/evidence/autonomous-improvement-handoff.md`.
