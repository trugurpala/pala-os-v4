# Pala CLI Command Map

## Setup / DB

| Command | Purpose |
|---|---|
| `pala db init` | Create `.pala/db/pala.sqlite` through bounded, authorized initialization-schema execution. |
| `pala db status` | Show DB availability plus payload-free bounded initialization-schema inspection. |
| `pala runtime-check` | Record bounded raw-output-free local CLI compatibility, honest model/effort observations, and payload-free contained `.claude` asset truth. |
| `pala status` | Show project state through a bounded, project-contained single-handle JSON read. |

## Before coding

| Command | Purpose |
|---|---|
| `pala memory check` | Read bounded exact mistake/lesson truth relevant to the current task. |
| `pala plan --goal "..."` | Produce dry-run plan and decision record. |
| `pala decision-review` | Show the bounded read-only review queue with approval and evidence signals. |
| `pala token-budget --goal "..."` | Estimate or read token budget with confidence. |
| `pala reference-check` | Show current/stale reference status. |
| `pala reference-refresh --dry-run` | Record the current reference radar and bounded refresh plan without external fetch. |
| `pala benchmark-refresh --dry-run` | Run the CI-facing bounded benchmark refresh queue with source-age warnings and category gaps. |

## While coding

| Command | Purpose |
|---|---|
| `pala dashboard-state` | Show what dashboard will render. |
| `pala evidence last` | Show a bounded-prefix latest evidence candidate with explicit scan and latest-selection exactness. |
| `pala evidence export --dry-run` | Build and validate a bounded sanitized evidence exchange without writing a file. |
| `pala evidence import --dry-run --target <file>` | Validate a project-local sanitized exchange without importing it. |
| `pala evidence import --target <file>` | Build a payload-free read-only import-readiness and approval plan without importing it. |
| `pala evidence compare --dry-run --target <file>` | Compare a project-local baseline with current sanitized evidence using only digests and record-count deltas. |
| `pala evidence assert-content --content-digest <sha256> --strict` | Fail strict mode when current stable sanitized-evidence content does not match the expected digest, without reading a file. |
| `pala evidence completeness-check --strict` | Fail strict mode when any sanitized evidence collection is truncated, count-unknown, or invalid. |
| `pala evidence migrate --dry-run --target <file>` | Produce a validation-only v1-to-v2 migration plan without returning a candidate payload. |
| `pala evidence migrate --target <file>` | Produce a read-only migration-readiness approval plan; never migrate or write. |
| `pala evidence schema-check` | Verify the exact-match evidence exchange schema compatibility contract. |
| `pala drift-check --quick` | Quick source-of-truth drift scan through cached bounded contract-source reads. |
| `pala token-economy` | Show known/estimated token data. |
| `pala next-actions` | Show blockers and next step. |
| `pala stop-if-risk` | Stop if current risk crosses policy threshold. |

## After coding

| Command | Purpose |
|---|---|
| `pala verify` | Run the final verification bundle with contained payload-free metadata for generic path-presence decisions. |
| `pala drift-check` | Detect README/docs/panel/package/state drift with shared-budget no-fake-PASS source reads. |
| `pala sync-check` | Check bounded exact git worktree truth; process/output failures block PASS. |
| `pala push-check` | Report bounded exact worktree/remote readiness without pushing. |
| `pala quality-radar` | Show duplicate/test/docs/dashboard risk through bounded inventory, single-handle text reads, and four fixed contained payload-free required-artifact path checks; incomplete scans block PASS. |
| `pala architecture-check --strict` | Verify seven fixed architecture layers through contained, symlink-free, payload-free path metadata. |
| `pala workflow-check` | Verify strict local CI gates through bounded payload-free workflow reads. |
| `pala public-readiness-check --strict` | Verify 30 fixed public artifacts through bounded payload-free stable single-handle reads; incomplete truth blocks PASS. |
| `pala ledger-safety-check` | Scan local ledgers before export for personal paths or secret-like values without echoing source text. |
| `pala ledger-redact --dry-run` | Preview a backed-up local-ledger redaction repair. |
| `pala memory add-mistake` | Record a mistake. |
| `pala memory add-mistake --interactive` | Collect bounded mistake fields from a real TTY and require explicit confirmation before writing. |
| `pala memory promote-rule --dry-run` | Propose turning a lesson into a rule only after a complete valid bounded registry scan. |
| `pala memory sync-claude --dry-run` | Compare bounded project-contained CLAUDE.md truth and block unsafe proposals. |

## MCP / integrations

| Command | Purpose |
|---|---|
| `pala setup --repair --dry-run --all` | Plan bounded payload-free MCP/client fixture repair. |
| `pala setup --check --all` | Inspect bounded fixture structure without returning payloads or proposing a config change. |
| `pala setup --remove --dry-run --all` | Preview ownership-safe fixture removal through bounded payload-free summaries. |
| `pala mcp-smoke --dry-run` | Validate the payload-free MCP plan without touching real config. |

## Read-only / plan-only operations

| Command | Purpose |
|---|---|
| `pala admin-check --strict` | Observe standard/elevated current-token state without requesting elevation or exposing probe output. |
| `pala i18n-check --strict` | Verify the English README and Turkish usage mirror through contained, payload-free path metadata. |
| `pala worker-check --strict` | Start one bounded read-only smoke subprocess and strictly verify its fixed safety contract without starting a workload. |
| `pala worker-run --dry-run` | Run the bounded readiness smoke-check and produce a plan without starting a workload. |
| `pala n8n-check --strict` | Observe optional local n8n availability through bounded raw-output-free discovery/version metadata. |
| `pala n8n-plan` | Produce a local n8n plan only after bounded availability source truth completes. |
| `pala n8n-import --dry-run --target workflow.json` | Validate one realpath-contained, 1 MB-bounded project-local workflow JSON without exposing payloads, importing, or activating. |
| `pala autopilot-plan --goal "..."` | Produce a bounded local-only action plan and stop conditions. |
| `pala autopilot-run --dry-run --goal "..."` | Validate the autonomous-run gate without starting a mutation loop. |
| `pala skills-check` | Verify bounded local `SKILL.md` readiness without writes. |
| `pala external-skills-refresh` | Report bounded local skill readiness without marketplace search, fetch, or install. |
| `pala external-skill-propose --target "..."` | Propose skill needs from local findings only after local readiness is confirmed. |
| `pala smart-suggestions` | Produce bounded local advisories only when source scan truth is complete. |
| `pala opportunity-radar` | Reuse bounded smart-suggestion truth without external fetch or writes. |
| `pala drift-fix` | Produce a repair plan only from complete drift source truth, without changing files. |
| `pala archive-old --older-than-days 30` | Produce a bounded old-evidence inventory with explicit truncation/count exactness, without moving or deleting files. |
| `pala locale-sync` | Produce a locale sync plan only from complete source truth, without editing translations. |
| `pala refactor-plan` | Produce a staged refactor plan from architecture, tests, and rollback readiness. |
| `pala rollback-check` | Validate bounded worktree truth and an exact bounded HEAD hash without resetting files. |

## Dashboard

| Command | Purpose |
|---|---|
| `pala panel` | Print the read-only local control tower URL and bounded panel-read contract. |
| `npm run panel` | Start the loopback-only, realpath-contained, byte-bounded panel server. |
| `pala dashboard-truth-check` | Confirm dashboard routes consume the read-only state API and declare real truth sources. |

The dashboard includes `/control/evidence-exchange/`, a payload-free preview
of sanitized export counts, validation, digest, and private-row exclusions.
It also includes `/control/decision-review/`, the bounded review queue without
approval or resolution actions.
