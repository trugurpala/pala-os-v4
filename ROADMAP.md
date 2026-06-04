# Roadmap

## Next

- Continue auditing remaining read-only capability stubs and placeholder-only
  recipes for the next highest-value evidence-backed replacement.

## Completed

- Made memory-registry lock acquisition/release race-aware while preserving
  fail-closed path safety and bounded attempts.
- Bounded action-plan goal and target inputs before classification and replaced
  raw returned values with payload-free presence and byte-count metadata.
- Made n8n plans preserve upstream observation truth and worker plans inspect
  the requested project root instead of silently using the default workspace.
- Made drift-fix and locale-sync fail closed instead of producing ready plans
  from incomplete source truth.
- Made smart suggestions and opportunity radar fail closed on incomplete
  bounded local source truth, and propagated that gate into skill proposals.
- Replaced the local-inventory-only external skill refresh stub with bounded
  local `SKILL.md` readiness checks and a proposal readiness gate.
- Added best-effort fixed payload-free JSON for unexpected top-level CLI
  failures.
- Replaced raw panel startup stderr errors with structured payload-free
  failures.
- Bounded and redacted raw-evidence kinds before envelope and filename use.
- Added a 5 MB final CLI JSON serialization preflight with payload-free
  fallback and raw-stack-free top-level failure handling.
- Added explicit payload-free evidence, ledger, and database outcome truth to
  decision persistence.
- Bounded and redacted decision token-budget and related-rule metadata before
  evidence or returned-payload persistence.
- Added explicit tri-state outcome truth for CLI raw evidence, evidence-row,
  ledger, DB completion, and state-refresh finalization writes.
- Removed raw unknown-command echoes from stdout, persistence, evidence
  payloads, and evidence filenames by using a fixed unknown-command record.
- Made interactive prompt close part of the safe-result gate; close failure
  now discards pending mistake input and returns a payload-free blocker.
- Made reference refresh ledger append truth explicit as not-attempted,
  confirmed, or unknown-after-attempt instead of claiming false non-writes.
- Replaced raw unbounded decision input persistence with one bounded redacted
  record shared by SQLite, evidence, ledger, and returned decision payloads;
  unsafe-to-record inputs now become metadata-only manual verification.
- Replaced unbounded raw CLI argv persistence with a bounded redacted command
  record and visible truncation truth.
- Replaced raw CLI exception stacks with structured payload-free failure
  results.
- Made panel static HEAD perform the same bounded stable file read as GET while
  returning no body.
- Made CLI final JSON wait for SQLite close and converted close failure into a
  payload-free output blocker.
- Made panel state HEAD run the same bounded JSON validation as GET while
  returning no body.
- Added a post-read database path recheck that discards pending panel route
  rows when the fixed path changes.
- Added a 1 MB content-free failure bound for redacted panel route responses.
- Converted existing memory-registry append descriptor-close failures into
  payload-free errors instead of false success while preserving lock release.
- Converted ledger-append descriptor-close failures into payload-free errors
  instead of false success while preserving lock release.
- Deferred panel route responses until read-only SQLite close succeeds and
  converted close failures into content-free blockers.
- Converted database-schema descriptor-close failures into structured,
  payload-free execution blockers that discard pending SQL.
- Converted state JSON descriptor-close failures into structured fallback-only
  blockers that discard parsed values.
- Converted ledger-inventory directory descriptor-close failures into
  structured incomplete-scan blockers that discard ledger candidates.
- Converted archive-inventory directory descriptor-close failures into
  structured no-candidate blockers.
- Converted latest-evidence directory and preview-file descriptor-close
  failures into structured blockers that discard pending candidates/content.
- Converted repo-inventory directory descriptor-close failures into
  structured incomplete-scan blockers that discard untrusted entries.
- Converted panel file descriptor-close failures into structured, content-free
  HTTP blockers while keeping the loopback read-only server available.
- Converted memory-registry descriptor-close failures into structured,
  payload-free empty-registry blockers.
- Converted MCP fixture descriptor-close failures into structured,
  payload-free no-proposal blockers.
- Converted ledger-safety file descriptor-close failures into structured,
  payload-free incomplete-scan blockers.
- Converted evidence-exchange target descriptor-close failures into
  structured, payload-free import and migration blockers.
- Removed raw workflow names from n8n import dry-run summaries while preserving
  only payload-free presence, count, and boolean metadata.
- Converted n8n workflow-target descriptor-close failures into structured,
  payload-free blockers instead of escaped exceptions.
- Converted shared repo-text descriptor-close failures into structured,
  payload-free blockers instead of escaped exceptions.
- Replaced the real evidence-migration implementation stub with a validated,
  payload-free migration-readiness approval plan; writes remain disabled.
- Added a post-read path-identity recheck and structured fail-closed metadata
  failure truth to bounded n8n import inspection.
- Replaced the real evidence-import not-implemented stub with a single-target,
  payload-free digest/count readiness and approval plan; writes remain disabled.
- Bound every dashboard atomic-replace retry to the original write-handle temp
  identity and made temp cleanup identity-safe.
- Bound every state atomic-replace retry to the original write-handle temp
  identity and made temp cleanup identity-safe.
- Bound kernel bootstrap initial-file publication to the original write-handle
  temp identity and made temp cleanup identity-safe.
- Bound memory registry first-create publication to the original write-handle
  temp identity and made temp cleanup identity-safe.
- Bound raw-evidence publication to the original write-handle temp identity
  and made temp cleanup identity-safe.
- Bound evidence-exchange export publication to the original write-handle temp
  identity and made temp cleanup identity-safe.
- Bound ledger repair publication to the original write-handle temp identity
  and made temp cleanup identity-safe.
- Added post-replace file-identity verification and visible verified-replace
  counts to ledger repair.
- Added post-publish file-identity verification to every create-only kernel
  bootstrap initial file.
- Added post-publish file-identity verification to memory registry first-create
  writes while preserving serialized append behavior.
- Added post-publish file-identity verification to create-only raw evidence
  writes, rejecting same-size target replacement races.
- Added post-publish file-identity verification and visible verified-backup
  counts before ledger repair can replace any live ledger.
- Added post-publish file-identity verification to create-only evidence
  exchange exports, rejecting same-size target replacement races.
- Proved concurrent create-only evidence exchange publication produces exactly
  one winner while competing writers return approval-required truth.
- Serialized Pala ledger append against explicit repair under one bounded
  fixed create-only mutation lock, preventing append loss at atomic replace.
- Serialized concurrent memory-registry create-or-append under a bounded fixed
  create-only lock, preserving every first-create record and aggregate bounds.
- Hardened concurrent first kernel bootstrap with `EEXIST`-tolerant,
  fail-closed fixed-directory rechecks.
- Hardened concurrent first dashboard generation with `EEXIST`-tolerant,
  fail-closed fixed-directory rechecks.
- Hardened concurrent fixed public-evidence replacement with last-writer-wins
  atomic publish truth, bounded transient retry, and per-attempt path rechecks.
- Hardened concurrent fixed state-file refresh with last-writer-wins atomic
  publish truth, bounded transient replace retry, and per-attempt path rechecks.
- Hardened concurrent dashboard route generation with bounded transient
  atomic-replace retry and path-safety rechecks before every attempt.
- Replaced direct ledger-redaction backup/rewrite operations with contained
  segment-wise private-directory creation, create-only atomic originals, and
  backup-gated atomic ledger replacement.
- Replaced evidence-exchange target/import/migration `existsSync` decisions
  with single-`lstat`, ENOENT-only missing truth.
- Replaced direct recursive evidence-exchange export writes with segment-wise
  contained parent creation and atomic create-only publication.
- Replaced state target `existsSync` branching with one `lstat` and
  ENOENT-only missing truth.
- Replaced direct mistake-registry append with fixed contained atomic create or
  verified single-handle append, redacted JSON validation, and writer limits
  aligned with the bounded reader.
- Replaced arbitrary-name direct public-evidence writes with a single-file
  allowlist, 1 MB pre/post-redaction bounds, contained path checks, and atomic
  replace.
- Replaced direct raw-evidence writes with pre-redaction 5 MB rejection,
  contained symlink/junction-free preflight, and atomic create-only
  publication; fixed JSON secret-field redaction discovered by the new test.
- Replaced name-derived direct ledger appends with a six-file allowlist,
  contained symlink/junction-free preflight, 1 MB record cap, and one verified
  append handle.
- Replaced SQLite path existence booleans with fixed contained,
  symlink/junction-free payload-free metadata observed before and immediately
  after database open.
- Replaced ledger inventory-root existence/realpath booleans with one
  contained, symlink/junction-free directory metadata inspection.
- Replaced latest-evidence inventory-root existence/realpath booleans with one
  contained, symlink/junction-free directory metadata inspection.
- Replaced archive-root existence/realpath booleans with one contained,
  symlink/junction-free directory metadata inspection.
- Replaced the CLI's generic existence helper with contained, symlink/junction-
  free, payload-free path-presence metadata decisions.
- Replaced worker entrypoint boolean composition with one fixed contained,
  symlink/junction-free regular-file metadata inspection.
- Replaced quality-radar required-artifact existence checks with four fixed,
  contained, symlink/junction-free regular-file metadata inspections.
- Replaced runtime `.claude` asset booleans with five fixed contained,
  symlink/junction-free, expected-kind path metadata inspections.
- Replaced i18n artifact existence checks with two fixed realpath-contained,
  symlink/junction-free regular-file metadata inspections.
- Replaced existence-only architecture-layer checks with seven fixed
  realpath-contained, symlink/junction-free, expected-kind metadata
  inspections that expose no payloads.
- Moved `reference-radar-state.json` into the bounded atomic state-I/O
  allowlist and made refresh-ledger recording conditional on a successful
  state replace.
- Replaced existence-only public-readiness truth with bounded, project-
  contained, stable single-handle inspection of 30 non-empty public artifacts,
  shared byte budgets, payload-free metadata, and explicit incomplete-scan
  blockers.
- Replaced direct unbounded CLI contract-source reads with a command-scoped
  cached bounded reader, shared byte budget, surfaced read metadata, and an
  explicit incomplete-read blocker.
- Replaced unbounded/repeated drift contract reads with cached
  project-contained stable single-handle reads, per-file and shared byte
  budgets, and explicit no-fake-PASS scan completeness.
- Replaced direct/unbounded initialization-schema execution with a
  project-contained 1 MB stable single-handle read plus temporary SQLite
  authorizer, defensive mode, and disabled extension loading.
- Replaced direct/unbounded state JSON reads and writes with bounded
  project-contained stable single-handle reads and same-directory atomic
  replace refreshes that reject symlink/junction targets.
- Replaced ambiguous/unbounded optional n8n CLI probing with bounded,
  raw-output-free discovery/version metadata and honest Windows missing-vs-
  failed distinction.
- Replaced unbounded worker `package.json` reads in both parent and subprocess
  with a shared project-contained 1 MB-bounded stable single-handle inspection
  and payload-free parse/script truth.
- Replaced unbounded rollback HEAD probing and raw stdout acceptance with a
  timeout/output-limited git observation that accepts only exact validated
  SHA-1/SHA-256 commit hashes.
- Replaced unbounded workflow YAML reads and matching mutation-line exposure
  with four fixed project-contained stable single-handle reads, per-file and
  aggregate byte budgets, and counts-only mutation truth.
- Replaced unbounded `CLAUDE.md` sync-dry-run reads with project-contained,
  1 MB-bounded stable single-handle inspection and proposal blocking on unsafe
  or incomplete source truth.
- Replaced unbounded runtime command capture and raw stdout/stderr evidence with
  five fixed timeout/output-limited observations, explicit process blockers,
  and bounded redacted first-line summaries.
- Hardened the local panel with loopback-host enforcement, project/control
  realpath containment, symlink/junction rejection, 1 MB state/static
  preflight, stable single-handle reads, and content-free failure responses.
- Replaced unbounded MCP fixture reads and full before/after config exposure
  with realpath-contained, symlink/junction-free, 1 MB-bounded stable
  single-handle inspection and payload-free structural summaries.
- Replaced unbounded mistake-registry reads and invalid raw-line echoing with a
  bounded single-handle JSONL scan, explicit exactness, counts-only invalid
  findings, and promotion blocking on incomplete/invalid memory truth.
- Replaced failure-to-empty git status/remote observations with bounded,
  timeout-limited, exactness-aware process truth that blocks PASS on command,
  parse, or output-limit failures.
- Replaced unbounded repo/quality traversal and full-file reads with a bounded
  realpath-contained inventory, per-file and aggregate text-byte budgets,
  stable single-handle reads with post-read identity checks, explicit scan
  completeness, and no-fake-PASS behavior.
- Replaced unbounded latest-evidence scans/full-file previews with a bounded
  exactness-aware inventory and single-handle prefix read.
- Bounded ledger safety by file, byte, line, and returned-finding budgets while
  preserving true finding counts and blocking repair on incomplete scans.
- Replaced unbounded archive candidate enumeration with a bounded directory
  iterator and explicit scan/candidate exactness truth.
- Hardened n8n import dry-runs with project-realpath containment, regular-file
  and 1 MB preflight checks, single-handle reads, and payload-free summaries.
- Replaced the interactive-memory placeholder with a TTY-only validated,
  confirmation-gated mistake capture flow that preserves JSON stdout.
- Replaced Windows privilege-detection Unknown state with a bounded read-only
  current-token role probe while preserving honest failure states.
- Replaced filename-only worker readiness with a dedicated fixed-mode local
  worker entrypoint and real bounded read-only subprocess smoke verification.
- Added CI-backed benchmark refresh automation with bounded stale-source
  warnings, category freshness thresholds, and no external fetch.
- Exposed the bounded benchmark refresh queue and summary in the read-only
  dashboard while preserving the full reference catalog.
- Exposed payload-free sanitized evidence-exchange preview summaries in the
  read-only dashboard.
- Added exact-match evidence-exchange schema compatibility and version-drift
  checks.
- Added a bounded decision-review queue with approval and evidence signals.
- Added explicit decision-review aging and escalation thresholds.
- Added decision-review summaries to sanitized evidence exchange schema v2.
- Added a validation-only evidence exchange v1-to-v2 migration plan.
- Exposed evidence exchange migration-plan capability in the read-only
  dashboard without payloads, target reads, or writes.
- Added a stable evidence-content digest beside the exact export digest so
  unchanged sanitized evidence can be compared across runs.
- Added a validation-only evidence exchange change detector that compares
  stable content digests without importing or writing.
- Exposed evidence comparison capability in the read-only dashboard without
  reading a target file.
- Added a validation-only current-content digest assertion command for CI that
  does not read a baseline file.
- Exposed the no-file content assertion capability in the read-only dashboard.
- Added explicit per-collection truncation truth to sanitized evidence exports
  and dashboard previews.
- Validated collection-truncation metadata consistency during evidence import
  inspection.
- Exposed truncation metadata validation status in the read-only evidence
  exchange dashboard summary.
- Added a strict-capable evidence completeness check that reports truncated or
  unknown collections without writing.
- Exposed evidence completeness status and policy in the read-only dashboard
  summary.
- Added exact normalized UTF-8 payload byte-budget truth to evidence export,
  validation, import inspection, and dashboard preview surfaces.
- Added a 2 MB raw-file stat preflight before evidence import or migration JSON
  parsing, plus target-free dashboard capability truth.
- Added realpath containment and symlink/junction rejection for evidence import,
  migration, comparison, and export targets.
- Added regular-file rejection and single-descriptor evidence target inspection
  with post-open path/identity and during-read stability checks.
- Added strict root, policy, and record-collection allowlists plus fixed
  sanitized-exchange safety-policy validation.
- Added per-record required-field, type, enum, timestamp, and URL validation
  with field-path-only findings.
- Added a bounded iterative payload complexity guard that stops before unsafe
  recursive or serialization-heavy validation.
- Added explicit exact/content digest availability and reason truth across
  export, import, comparison, and dashboard preview surfaces.
- Added strict root `generated_at` ISO timestamp validation with a bounded
  five-minute future-skew policy and dashboard truth.
- Added temporal consistency validation between root `generated_at` and valid
  record timestamps with field-path-only findings and dashboard truth.
- Added deterministic visible-field collection ordering for sanitized exports
  and import validation with bounded dashboard pair-count truth.
- Added exact canonical duplicate-record detection with counts-only dashboard
  truth and no automatic deduplication.
- Added a bounded first-200 validation finding budget with true total,
  omitted-count, and truncation truth.
- Added an explicit validation-phase execution matrix with dependency-aware
  skip reasons and dashboard aggregates.
- Added counts-only per-phase validation finding attribution with explicit
  unattributed-count truth.
- Replaced direct dashboard route writes with fixed-allowlist,
  project-contained preflight and atomic per-file replacement;
  symlink/junction targets block generation before the first write.
- Hardened common path metadata so missing-target ancestors are checked and a
  missing descendant below a symlink/junction cannot appear safely absent.
- Reused the common path metadata preflight for MCP fixtures and the memory
  registry, removing their existence-only missing-file shortcuts.
- Reused common path metadata for bounded repository text reads so a missing
  contract source below a symlink/junction makes the scan incomplete.
- Replaced repository inventory-root existence checks with common path metadata
  and exposed payload-free `root_inspection` truth in scan summaries.
- Replaced recursive/existence-only kernel initialization with fixed,
  project-contained create-only bootstrap and atomic initial-file creation.

## Later

- Add optional worker integration with approval-gated n8n flows.
- Add import/export for sanitized evidence summaries.
