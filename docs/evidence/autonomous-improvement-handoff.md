# Autonomous Improvement Handoff

This is a durable handoff for the local Pala OS improvement run. It avoids
volatile timestamps, run counts, raw-log paths, and current Git status. Read
live truth from `.pala/state/dashboard-state.json` or rerun the gates below.

## Safety Boundary

The autonomous run stayed inside `PROJECT_ROOT`.

- No commit, push, publish, deployment, release, or destructive action was
  performed.
- No real global/user MCP or agent configuration was modified.
- Model and effort were not invented.
- Operational commands that could imply mutation remain read-only or
  plan-only and explicitly report what they did not execute.

## Implemented Truth Contracts

- Every routed CLI command records a run, command, evidence log, ledger event,
  completion summary, and refreshed local state snapshot.
- Command acceptance and project acceptance are separate.
- `--strict` returns nonzero unless command acceptance is `PASS`.
- SQLite, raw evidence, runtime state, local ledgers, and archives are
  gitignored local truth.
- Ledger safety validates JSON and scans for personal paths and secret-like
  values without echoing sensitive source text.
- Repository, architecture, quality, docs, examples, prompts, tests, skills,
  hooks, agents, and operational readiness checks inspect real local evidence.
- MCP fixture plans preserve unrelated servers and top-level keys, distinguish
  check/repair/remove behavior, and stop on Pala-entry ownership conflicts.
- The loopback-only dashboard reads `/api/state` and bounded read-only SQLite
  route queries with bounded local search and pagination. It exposes no write
  route.
- Workflow contracts verify required strict local gates, Node 24, explicit
  read permissions, and absence of push, publish, release, or deploy steps.
- Semantic drift compares positioning, versions, strict-mode, dashboard,
  persistence, MCP, public-claim, workflow, and durable-evidence contracts.
- Sanitized evidence exchange exports only bounded allowlisted DB fields,
  rejects private/raw fields, never overwrites, and keeps import validation-only.
- Benchmark refresh automation emits a bounded local-only queue with source-age
  warnings, category-specific thresholds, stale reasons, and coverage gaps.
- The read-only benchmark dashboard route renders that queue and its summary;
  the references route remains the complete source catalog.
- The read-only evidence-exchange route exposes only sanitized preview counts,
  validation, digest, and exclusions; it never returns the payload.
- Evidence exchange compatibility is exact-match only; older or newer schema
  versions require a reviewed migration and are never silently accepted.
- The decision-review queue is bounded, latest-per-type, approval/evidence
  aware, read-only, and never grants approval or resolves decisions.
- Decision review aging uses explicit 1/7/30-day thresholds; overdue items
  escalate visibility only and never mutate decision state.
- Evidence exchange schema v2 adds an allowlisted decision-review summary;
  free-text reasons and evidence paths remain excluded from that collection.
- Evidence migration is validation-only v1-to-v2 planning; no candidate
  payload is returned and source-project re-export is required for summaries.
- The read-only evidence-exchange dashboard exposes the fixed migration
  capability without reading a target, returning a candidate payload, or
  allowing writes.
- Evidence export, import inspection, and dashboard preview expose exact and
  stable content digests; the stable digest canonicalizes keys and excludes
  only root `generated_at`.
- Evidence comparison validates a project-local baseline and reports only
  digest matches and collection-count deltas; it returns no payload and
  performs no import, external call, or write.
- The read-only evidence-exchange dashboard exposes comparison capability and
  safety boundaries without reading a target or running a comparison.
- Content-digest assertion compares a caller-supplied SHA-256 with current
  sanitized evidence and can fail strict mode without reading a file,
  returning a payload, making an external call, or writing.
- The read-only dashboard exposes the fixed assertion capability but never
  accepts an expected digest or runs an assertion.
- Evidence exports and dashboard previews report per-collection exported and
  eligible counts plus exact complete/truncated/unknown status; bounded scans
  are never presented as complete.
- Import inspection validates truncation metadata when present and reports
  valid, invalid, or not-present status without rejecting earlier metadata-free
  schema-v2 exports.
- The evidence-exchange dashboard summary exposes current truncation metadata
  validation status without returning the payload.
- The strict-capable evidence completeness check requires all sanitized
  collections to be complete and exact; it returns no payload and performs no
  target read, external call, or write.
- The dashboard exposes completeness status and policy separately from the
  safe read-only preview execution status.
- Final verification and dashboard blocker lists report root causes without
  duplicating derivative failure labels.

## Verification Commands

```bash
npm run check
npm run pala -- workflow-check --strict
npm run pala -- doctor --strict
npm run pala -- decision-review --strict
npm run pala -- quality-radar --strict
npm run pala -- dashboard-truth-check --strict
npm run pala -- ledger-safety-check --strict
npm run pala -- evidence schema-check --strict
npm run pala -- benchmark-refresh --dry-run
npm run pala -- public-readiness-check --strict
npm run pala -- drift-check --strict
npm run pala -- verify
```

`npm run pala -- verify` is an informational project-readiness report.
`npm run verify` is the strict shell/CI form.

## Expected External Blockers

These remain honest blockers until a maintainer or active runtime supplies
real evidence:

- `model_or_effort_unknown`: only the active agent surface may provide this.
- `worktree_has_uncommitted_or_untracked_files`: requires maintainer review
  and an intentional commit baseline.
- `no_git_remote_configured`: requires an intentional remote configuration.

The autonomous run must not clear these by inventing observations, committing,
configuring a remote, pushing, or publishing.

## Resume Rule

After any change, rerun the strict local gates and the informational final
verify. Treat new failures as evidence to investigate; keep the external
blockers above untouched unless the user explicitly changes the safety
boundary.
