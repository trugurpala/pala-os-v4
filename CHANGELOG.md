# Changelog

## 0.27.0

- Made memory-registry lock observation tolerate bounded disappearance races
  and safe successor acquisition without weakening unsafe-path failures.
- Bounded autopilot goals and external-skill proposal targets before
  classification and removed their raw values from returned plans.
- Removed raw workflow names from n8n import dry-run summaries; summaries now
  expose only name presence, counts, and boolean metadata.
- Made n8n plans fail closed on incomplete availability observation and made
  worker plans preserve the requested project-root inspection options.
- Made drift-fix and locale-sync distinguish complete known findings from
  incomplete source truth before returning plan readiness.
- Made smart suggestions, opportunity radar, and external-skill proposals
  require complete bounded local source truth instead of returning
  unconditional safe advisory status.
- Replaced the local-inventory-only external skill refresh stub with a bounded
  project skill readiness inspection and proposal gate; external fetch and
  install remain disabled.
- Added best-effort fixed payload-free JSON for unexpected top-level CLI
  failures.
- Replaced raw panel startup stderr errors with structured payload-free
  failures.
- Bounded and redacted raw-evidence kinds before envelope and filename use.
- Added a 5 MB final CLI JSON serialization preflight with payload-free
  fallback and raw-stack-free top-level failure handling.
- Added explicit payload-free evidence, ledger, and database outcome truth to
  decision persistence, with SQLite inserted last.
- Bounded and redacted decision token-budget and related-rule metadata, with
  payload-free manual verification for unsafe metadata.
- Added explicit tri-state CLI finalization outcomes, payload-free write
  failures, prerequisite-aware skips, and late-blocker DB status correction.
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
- Added post-replace file-identity verification and verified-replace counts to
  ledger repair.
- Added post-publish file-identity verification to every create-only kernel
  bootstrap initial file.
- Added post-publish file-identity verification to memory registry first-create
  writes while preserving serialized append behavior.
- Added post-publish file-identity verification to create-only raw evidence
  writes, rejecting same-size target replacement races.
- Added post-publish file-identity verification and verified-backup counts to
  ledger repair before any live ledger replacement.
- Added post-publish file-identity verification to create-only evidence
  exchange exports, rejecting same-size target replacement races.
- Documented and tested one-winner semantics for concurrent same-target
  create-only evidence exchange exports.
- Serialized Pala ledger append against explicit repair under one bounded
  fixed create-only mutation lock, preventing append loss at atomic replace.
- Serialized concurrent memory-registry create-or-append under a bounded fixed
  create-only lock, preserving every first-create record and aggregate bounds.
- Hardened concurrent first kernel bootstrap with `EEXIST`-tolerant,
  fail-closed fixed-directory rechecks.
- Hardened concurrent first dashboard generation with `EEXIST`-tolerant,
  fail-closed fixed-directory rechecks.
- Hardened concurrent fixed public-evidence replacement with last-writer-wins
  atomic publish truth and bounded, path-rechecked transient replace retry.
- Hardened concurrent fixed state-file refresh with last-writer-wins atomic
  publish truth and bounded, path-rechecked transient replace retry.
- Hardened concurrent dashboard route generation with bounded, path-rechecked
  retry for transient Windows atomic-replace contention.
- Replaced direct ledger-redaction backup/rewrite operations with contained
  create-only atomic backups followed by backup-gated atomic ledger
  replacement.
- Replaced evidence-exchange target existence decisions with single-`lstat`,
  ENOENT-only missing truth.
- Replaced direct evidence-exchange export writes with rechecked segment-wise
  parent creation and atomic create-only publication.
- Replaced state target `existsSync` branching with single-`lstat`,
  ENOENT-only missing truth.
- Replaced direct mistake-registry append with fixed contained atomic-create
  or single-handle append and reader-aligned byte limits.
- Replaced arbitrary-name direct public-evidence writes with a fixed
  single-file allowlist, bounded redaction, contained path checks, and atomic
  replace.
- Replaced direct raw-evidence writes with bounded contained atomic create-only
  publication, and fixed pretty-printed JSON secret-field redaction.
- Replaced direct name-derived ledger appends with a fixed six-file allowlist,
  1 MB redacted-record cap, contained path checks, and one verified append
  handle.
- Replaced SQLite path `existsSync` truth with fixed contained,
  symlink/junction-free payload-free metadata observed before and immediately
  after database open.
- Replaced ledger inventory-root existence/realpath booleans with one
  payload-free contained directory metadata inspection.
- Replaced latest-evidence inventory-root existence/realpath booleans with one
  payload-free contained directory metadata inspection.
- Replaced archive inventory root existence/realpath booleans with one
  payload-free contained directory metadata inspection.
- Replaced the CLI's generic `existsSync` decisions with contained,
  symlink/junction-free, payload-free path-presence metadata.
- Replaced worker entrypoint existence/realpath booleans with one fixed
  payload-free path metadata inspection before smoke execution.
- Replaced quality-radar required-artifact existence checks with fixed
  contained, symlink/junction-free, payload-free path metadata inspection.
- Replaced runtime `.claude` asset existence booleans with bounded fixed-path
  metadata that rejects missing, wrong-kind, and symlink/junction targets.
- Replaced i18n README/mirror existence checks with fixed contained,
  symlink/junction-free, payload-free path metadata inspection.
- Replaced existence-only architecture-layer checks with bounded fixed-path
  metadata inspection that rejects wrong kinds and symlink/junction paths
  without reading or returning payloads.
- Moved reference-radar state recording from direct writes to bounded atomic
  state I/O and prevented refresh-ledger recording when the state write fails.
- Replaced existence-only public-readiness checks with bounded, project-
  contained stable single-handle inspection of 30 non-empty artifacts,
  payload-free metadata, shared byte budgets, and no-fake-PASS completeness.
- Replaced direct unbounded CLI contract-source reads with command-scoped
  cached bounded reads, a shared byte budget, surfaced metadata, and an
  explicit incomplete-read blocker.
- Replaced unbounded/repeated semantic-drift source reads with cached bounded
  project-contained stable single-handle reads, a shared byte budget, and
  explicit no-fake-PASS completeness.
- Replaced direct/unbounded initialization-schema execution with a bounded
  project-contained stable single-handle read and temporary SQLite authorizer,
  defensive mode, and disabled extension loading.
- Replaced direct/unbounded `.pala/state` JSON reads and writes with bounded
  project-contained stable single-handle reads and same-directory atomic
  replace refreshes that reject symlink/junction targets.
- Replaced ambiguous optional n8n CLI probing with bounded, raw-output-free
  Windows discovery and version metadata that distinguishes missing from
  failed observations without returning executable paths.
- Added local SQLite-backed CLI skeleton.
- Added append-only ledger and raw evidence recording.
- Added real decision, memory, token economy, MCP dry-run, dashboard truth,
  repository inspection, ledger safety, and operational plan gates.
- Added a loopback-only read-only dashboard server and live state API.
- Added public-readiness files and local release gates.
- Added strict CLI mode and a local workflow-contract gate that rejects
  publishing/deployment steps and verifies CI permissions and required checks.
- Added bounded dashboard search/pagination, ownership-safe MCP fixture plans,
  semantic drift checks, and sanitized evidence exchange validation.
- Added CI-backed bounded benchmark refresh queues with source-age warnings,
  category freshness policies, explicit stale reasons, and no external fetch.
- Added a read-only benchmark dashboard queue with compact summary truth while
  preserving the full reference catalog as a separate view.
- Added a payload-free read-only evidence exchange dashboard preview with
  counts, validation, digest, and private-row exclusion totals.
- Fixed missing route query parameters incorrectly collapsing the read-only API
  page size from the documented default of 20 to 1.
- Added exact-match evidence exchange schema compatibility checks to the CLI,
  security workflow, drift contract, dashboard summary, and final verify.
- Added a bounded, latest-per-type decision-review queue with approval and
  evidence signals across CLI, CI, final verify, and the read-only dashboard.
- Kept wide dashboard tables readable by moving overflow into the table
  container instead of crushing columns and breaking short words.
- Added explicit 1/7/30-day decision-review aging thresholds with due-soon and
  overdue visibility escalation, without automatic approval or resolution.
- Advanced sanitized evidence exchange to schema v2 with an allowlisted,
  path-free decision-review summary collection.
- Added a validation-only evidence exchange v1-to-v2 migration plan that never
  returns a candidate payload or writes a file.
- Exposed the fixed validation-only evidence migration capability in the
  read-only dashboard without reading targets, returning payloads, or writing.
- Added a stable canonical evidence-content digest beside the exact export
  digest so unchanged sanitized evidence can be compared across runs.
- Added validation-only evidence change detection using digest matches and
  collection-count deltas without payload exposure, import, or writes.
- Exposed the fixed comparison capability in the read-only dashboard without
  reading a comparison target or running a comparison.
- Added a strict-capable current-content digest assertion that reads no
  baseline file and exposes no payload.
- Exposed the no-file assertion capability in the read-only dashboard without
  accepting a digest or running an assertion.
- Added exact-or-explicit-unknown per-collection truncation truth to evidence
  exports and dashboard previews, including separate decision-review scan
  truncation.
- Added validate-when-present consistency checks for evidence truncation
  metadata while preserving metadata-free schema-v2 compatibility.
- Exposed truncation metadata validation status in the read-only evidence
  exchange dashboard summary.
- Added a strict-capable read-only evidence completeness gate that fails on
  truncated, count-unknown, or invalid collections.
- Exposed evidence completeness policy and status in the read-only dashboard
  summary without changing preview execution status.
- Added exact normalized UTF-8 payload byte-budget truth with 80% warning and
  over-limit status across export, validation, import inspection, and dashboard
  preview surfaces.
- Added a 2 MB stat-before-read raw-file preflight for evidence import and
  migration inspection, exposed as a target-free dashboard capability.
- Added realpath containment and symlink/junction rejection for project-local
  evidence targets, plus target-free dashboard path-safety capability truth.
- Added regular-file rejection and single-descriptor target inspection with
  post-open path/identity rechecks, bounded reads, and honest `O_NOFOLLOW`
  capability reporting.
- Added strict evidence-exchange root, policy, and record-collection shape
  validation with fixed sanitized safety-policy values.
- Added per-record required-field, type, enum, timestamp, and URL validation
  with field-path-only findings and dashboard status.
- Added a bounded iterative depth/node/cycle guard that stops evidence
  validation before unsafe recursive or serialization-heavy work.
- Added explicit exact/content digest availability and unavailable-reason truth
  across export, import, comparison, and dashboard preview surfaces.
- Added strict root `generated_at` ISO timestamp validation with bounded
  five-minute future-skew status in validation and dashboard previews.
- Added temporal consistency validation that rejects valid record timestamps
  after root `generated_at` and exposes bounded status/count truth.
- Added deterministic per-collection visible-field ordering normalization and
  validation with field-path-only findings and dashboard pair-count truth.
- Added exact canonical duplicate-record detection with repeated-index
  findings, counts-only dashboard truth, and no automatic deduplication.
- Added a bounded first-200 evidence validation finding collector that keeps
  true total/omitted counts and prevents truncation from corrupting phase
  status.
- Added explicit executed/skipped validation-phase truth with dependency-aware
  skip reasons and read-only dashboard aggregates.
- Added counts-only per-phase validation finding attribution with explicit
  unattributed-count truth and no record-value exposure.
- Added a dedicated smoke-only local worker entrypoint plus real bounded
  subprocess contract verification, strict final/CI gates, and malformed-output
  blocker truth without starting a workload.
- Added cross-platform read-only admin privilege detection with bounded Windows
  current-token probing, POSIX `getuid`, no elevation request, and no captured
  output exposure.
- Added real TTY-only interactive mistake capture with bounded field validation,
  stderr prompts, explicit confirmation, and no-write cancellation/non-TTY
  behavior.
- Hardened n8n workflow import planning with realpath containment, regular-file
  and 1 MB preflight checks, single-handle stable reads, structural-only
  summaries, and no workflow/credential payload exposure.
- Replaced unbounded archive inventory scans with a bounded directory iterator,
  explicit scan truncation and candidate-count exactness, and no-move/no-delete
  truth.
- Bounded ledger safety scans by directory entries, bytes, lines, and returned
  findings; preserved true finding counts and blocked redaction repair whenever
  scan completeness cannot be proven.
- Replaced unbounded latest-evidence discovery and full-file preview reads with
  bounded mtime inventory, explicit latest exactness, and single-handle prefix
  reads.
- Replaced unbounded repository/quality traversal and full-file reads with
  bounded realpath-contained inventory, per-file and aggregate text-byte
  budgets, stable single-handle reads with post-read path identity checks,
  explicit scan completeness, capped findings, and no-fake-PASS gates.
- Replaced git status/remote failure-to-empty behavior with bounded
  timeout/output-limited observations, exact parsed counts, raw-output
  suppression, and explicit blockers for process, parse, and buffer failures.
- Replaced unbounded mistake-registry reads and invalid raw-line exposure with
  bounded project-contained single-handle JSONL inspection, exactness and
  truncation truth, and blocked rule proposals when registry truth is unsafe.
- Replaced unbounded MCP fixture reads and full before/after config exposure
  with realpath-contained, symlink/junction-free, 1 MB-bounded stable
  single-handle inspection, bounded name/count/action summaries, and explicit
  no-payload/no-secret/no-write truth.
- Hardened the loopback panel server with allowed-host enforcement,
  realpath-contained symlink/junction-free state/static reads, 1 MB preflight
  limits, stable single-handle identity checks, and content-free failures.
- Replaced unbounded runtime command capture and raw stdout/stderr evidence with
  five fixed 5-second/64 KB observations, explicit process-failure truth, and
  bounded redacted first-line summaries.
- Replaced unbounded `CLAUDE.md` sync-dry-run reads with project-contained,
  1 MB-bounded stable single-handle inspection, payload-free missing-line
  summaries, and proposal blocking on unsafe or incomplete source truth.
- Replaced unbounded workflow YAML reads and matching mutation-line exposure
  with four fixed project-contained stable single-handle reads, 1 MB per-file
  and 2 MB aggregate budgets, and counts-only mutation findings.
- Replaced unbounded rollback HEAD probing and raw stdout acceptance with a
  5-second/256-byte git observation that accepts only exact validated
  SHA-1/SHA-256 commit hashes.
- Replaced unbounded worker `package.json` reads in both parent and subprocess
  with a shared project-contained 1 MB-bounded stable single-handle inspection
  and payload-free parse/script truth.
- Replaced direct dashboard route writes with fixed project-contained path
  preflight, symlink/junction rejection, 1 MB per-file limits, atomic replace,
  exact count/byte summaries, and bounded payload-free failure truth.
- Hardened common path metadata inspection to reject missing targets whose
  existing ancestor path contains a symlink or junction.
- Replaced MCP fixture and memory-registry existence-only preflights with the
  shared path metadata inspection, including safe missing-ancestor truth.
- Replaced bounded repository text-reader existence-only preflights with shared
  path metadata, preserving single-handle reads and aggregate byte budgets.
- Replaced repository inventory-root existence-only preflights with shared path
  metadata and surfaced payload-free root inspection in scan summaries.
- Replaced recursive kernel directory creation and direct initial-file writes
  with fixed path preflight, segment creation, and atomic create-only links.
