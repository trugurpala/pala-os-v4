# v27 Self Check

## Added in v27

- Local SQLite DB architecture and executable CLI skeleton.
- Append-only ledger expansion.
- Mistake-to-rule promotion flow.
- Claude Code memory usage policy.
- Decision engine policy and decision records.
- Vibe coder before/during/after usage guide.
- Backend/frontend/worker map.
- Reference radar rules with benchmark lesson categories.
- Schema file for local DB.
- Gitignore rules for DB/raw evidence/private files.
- Dashboard route stubs under `control/*/index.html`.
- Public-readiness files and GitHub workflow stubs.

## Important Claim

Pala OS memory lives in local DB + ledger + rules + evidence, not in prompt memory alone.

## Evidence Table

| Check | Evidence | Status |
|---|---|---|
| Mini-kernel directories exist | `.pala/rules`, `.pala/state`, `.pala/ledger`, `.pala/memory`, `.pala/evidence`, `.pala/archive`, `docs/evidence` | checked |
| DB path is gitignored | `.gitignore` | checked |
| Required TypeScript libs exist | `src/lib/*.ts` | checked |
| Dashboard overview has approved tagline | `control/overview/index.html` | checked |
| Dashboard reads truth contract | `control/*/index.html` | checked |
| Current source evidence exists | `docs/evidence/current-sources.md` | checked |
| Benchmark state exists | `.pala/state/benchmark-state.json` | checked |
| Sample run, decision, mistake records exist | `.pala/db/pala.sqlite` | checked |
| Final local verify | latest `.pala/evidence/raw/*-command-verify.log` | checked |

No fake PASS: the local gate status is stored in command evidence and final reporting must include raw logs and blockers.
