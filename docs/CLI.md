# CLI

Pala OS runs locally from `PROJECT_ROOT`:

```bash
npm run pala -- <command>
```

The package is not published. Registry or global-install commands are not
supported until publication evidence exists.

Kernel bootstrap uses `fixed_project_contained_create_only_kernel_bootstrap`.
Before creating local runtime structure, it preflights 12 fixed directories
and 11 protected files with payload-free symlink/junction-free metadata. It
creates only missing directories and nine fixed initial files, uses atomic
create-only links, never overwrites an existing file, and blocks before the
first write when any protected path is unsafe. Concurrent first bootstrap uses
`rechecked_eexist_tolerant`: only `EEXIST` from fixed-directory creation is
accepted, followed immediately by a contained symlink/junction-free metadata
recheck; other errors and unsafe results remain blocking. Every new initial
file must pass `temporary_and_initialized_file_dev_ino_match` after
publication.
Its temporary source follows
`write_handle_and_temporary_path_dev_ino_match`; cleanup unlinks the temp path
only while the created-file identity still matches.

## Core flow

Before work:

```bash
npm run pala -- status
npm run pala -- memory check
npm run pala -- plan --goal "describe the task"
npm run pala -- token-budget --goal "describe the task"
npm run pala -- reference-check
npm run pala -- benchmark-refresh --dry-run
npm run pala -- decision-review --strict
```

`benchmark-refresh --dry-run` records a bounded local queue with source age,
category-specific freshness thresholds, explicit `stale_reasons`, and coverage
gaps. It performs no external fetch and never marks a source fresh by itself.
Its state-before-ledger write result reports append truth as `not_attempted`,
`confirmed`, or `unknown_after_attempt`; an exception or missing ledger path
never becomes a false claim that no append occurred.

`decision-review --strict` reads a bounded, deduplicated queue of decisions
that require approval, manual verification, or dry-run follow-up. It never
grants approval or resolves a decision. The queue also reports 1/7/30-day
critical/high/medium aging thresholds and overdue escalation signals.

Unknown top-level commands follow
`structured_payload_free_without_raw_command`. Their raw command name and
remaining arguments are replaced with `pala <UNKNOWN_COMMAND>` before DB,
state, ledger, evidence, or stdout persistence. The response uses fixed
`unknown_command`, and raw evidence uses the fixed `command-unknown` kind.

After work:

```bash
npm run pala -- verify
npm run pala -- drift-check
npm run pala -- sync-check
npm run pala -- push-check
npm run pala -- quality-radar
```

`pala drift-check` uses `bounded_cached_contract_text_reads_with_shared_budget`.
Contract sources are project-contained stable single-handle reads capped at
2,000,000 bytes each and a shared 20,000,000-byte budget. Repeated references
reuse a cached inspection instead of rereading the file. Unsafe, unreadable,
oversized, unstable, or aggregate-budget-limited source truth blocks drift
PASS, and source payloads are not returned in read metadata.

CLI contract-source reads use the same cached bounded reader. Commands that
inspect fixed repository text expose `cli_text_read` metadata when reads occur.
Any unsafe, unreadable, oversized, unstable, or shared-budget-limited read adds
`cli_contract_text_read_incomplete` and prevents command PASS instead of
silently substituting empty source truth.

Every routed CLI command creates a run record, command record, ledger event,
exit code, and raw evidence log. A successful process exit does not by itself
mean the reported status is PASS.

CLI persistence finalization follows
`explicit_outcome_cli_finalization_before_database_close`. Raw evidence, its
SQLite evidence row, the event ledger append, DB run/command completion, and
operational-state refresh each report `not_attempted`, `confirmed`, or
`unknown_after_attempt`. A write exception or missing confirmation downgrades
the command to manual verification with exit code 1 without returning the raw
error. Raw-evidence-dependent writes follow
`not_attempted_when_prerequisite_unconfirmed`. If state refresh adds a late
blocker, DB completion is repeated idempotently so the final DB status reflects
that blocker. Operational state stores only a bounded identifier-only
finalization summary.

CLI final JSON follows `close_database_before_stdout_json`. The command closes
its SQLite connection before exposing the completed result on stdout. A close
failure becomes `cli_output_blocked:database_close_failed` and no pending
result payload is written. Before close, JSON serialization is preflighted and
capped at 5,000,000 UTF-8 bytes. Circular, unserializable, or oversized output
follows `payload_free_failure_json_after_database_close`: after a successful
close, stdout receives only a fixed blocker and exit code 1. Unexpected
top-level failures follow `nonzero_without_raw_stack_or_pending_payload` and
`fixed_payload_free_json_best_effort`: stdout receives fixed
`cli_top_level_failed` JSON when possible, and Node never prints a raw
exception stack or pending result. Routed command exceptions follow
`structured_payload_free_without_stack`: stdout receives only
`cli_command_failed`, an optional bounded safe error code, and explicit
raw-error/stack exposure flags. Exception messages and stacks are not returned.

CLI persistence uses `bounded_redacted_cli_command_record`. At most 100
arguments are recorded, each argument is inspected from at most 1,024 bytes,
and the final recorded command is capped at 4,096 UTF-8 bytes. Known sensitive
flag values, secret-like text, and personal paths are redacted before the
command reaches run/command DB rows, evidence, ledgers, or operational state.
`command_record` exposes exact argument count, recorded count, byte count, and
truncation truth without raw arguments.

Raw evidence write uses
`bounded_project_contained_atomic_create_only_redacted_raw_evidence`.
Serialized input is rejected before redaction when it exceeds 5,000,000 bytes.
Evidence kind follows `bounded_redacted_before_envelope_and_filename`: the raw
kind is capped at 256 UTF-8 bytes, redacted, and converted to a safe slug
before either the envelope or filename can use it.
Accepted content is redacted, remeasured, written to a bounded temporary file
inside the contained symlink/junction-free raw-evidence directory, and
published through an atomic create-only link. Existing evidence is never
overwritten. The `temporary_and_target_dev_ino_match` policy rejects a target
whose file identity changes immediately after publication. Failures expose no
payload.
Temporary source identity follows
`write_handle_and_temporary_path_dev_ino_match`; cleanup unlinks the temp path
only while that created-file identity still matches.

Public evidence write uses
`bounded_fixed_project_contained_atomic_public_evidence_replace`. Only
`docs/evidence/official-compatibility-check.md` is writable through this API.
Input is capped at 1,000,000 bytes before and after redaction, the contained
symlink/junction-free parent and target are checked around the write, and a
bounded temporary file is published through atomic replace. Invalid names,
unsafe paths, and failures expose no payload. Concurrent writers use
`last_writer_wins_rechecked_transient_atomic_replace_retry`: the target path is
rechecked before each of at most 20 replace attempts, only transient
`EACCES`/`EBUSY`/`EPERM` errors are retried, and a successful atomic publish
remains successful if a later bounded writer supersedes it before post-check.

`pala status` and end-of-command state refresh use
`bounded_project_contained_single_handle_state_json_with_atomic_replace`.
Only five fixed `.pala/state` JSON files are accepted, including
`reference-radar-state.json`. Existing state is
read from one stable handle with a 1,000,000-byte limit; symlinks, junctions,
outside paths, unstable content, oversized files, and invalid JSON are
rejected without returning source content. Target existence uses
`single_lstat_with_enoent_only_missing_truth`: only `ENOENT` is accepted as
missing, while every other inspection failure blocks. Descriptor-close
failure returns `state_file_close_failed`, discards the parsed value, and
returns only the caller-provided fallback. Refresh writes a bounded temporary
file in the validated state directory and uses atomic replace, never a direct
write through an existing state path. Reference refresh records its append-only
ledger event only after the atomic state write succeeds and surfaces
payload-free `state_io` metadata.

Concurrent state refreshes use
`last_writer_wins_rechecked_transient_atomic_replace_retry`. Each writer
rechecks the fixed target before at most 20 bounded transient replace retries.
A successful rename proves that writer published atomically; a following safe
writer may supersede it before post-check, so results report target safety and
write currentness separately instead of inventing a failure. Unsafe targets,
permanent replace errors, and missing post-replace targets still block.
Every retry also requires
`write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt`;
cleanup unlinks a temp path only while its created identity still matches.

`pala db status --strict` exposes payload-free inspection of the initialization
schema and the live database path. Database path observation uses
`fixed_project_contained_database_path_metadata_only`: before and immediately
after open, `.pala/db/pala.sqlite` must be a project-contained,
symlink/junction-free regular file path. Status derives `exists` from that
metadata and returns no database payload. New-database initialization uses
`bounded_project_contained_single_handle_schema_with_authorized_sqlite_execution`:
`.pala/schema/001_init.sql` must be a project-contained, stable single-handle
regular file no larger than 1,000,000 bytes. Execution enables SQLite
defensive mode, disables extension loading, and uses an authorizer that rejects
attach/detach, temp objects, drop/alter, virtual tables, functions, and
schema-external writes. Schema metadata failures use
`structured_fail_closed_no_throw`; descriptor-close failure becomes
`database_schema_file_close_failed`, discards the pending SQL, and blocks
execution. The SQL payload is never returned.

Append `--strict` when a shell or CI job must fail unless command acceptance is
`PASS`. `npm run verify` uses strict mode; `npm run pala -- verify` remains an
informational project-readiness report.

Use `pala workflow-check --strict` to verify that repository workflows use the
required local gates and contain no push, publish, release, or deploy step.
The check uses
`bounded_project_contained_single_handle_workflow_contract_scan`: four fixed
workflow files are project-contained, read from stable single handles, capped
at 1,000,000 bytes each and 2,000,000 bytes total. Unsafe, unreadable,
oversized, or aggregate-budget-limited workflow truth blocks PASS. Mutation
findings expose counts only, never the matching run/action payloads.

Use `pala public-readiness-check --strict` to inspect the 30 fixed public
artifacts before release. The
`bounded_required_public_artifact_single_handle_scan` policy requires every
artifact to be a non-empty, project-contained regular file read through one
stable handle, with a 2,000,000-byte per-file limit and shared 20,000,000-byte
budget. Missing, empty, unsafe, unreadable, oversized, or aggregate-budget-
limited truth blocks PASS. Results expose metadata only and never return
artifact payloads, publish, push, or write files.

Use `pala evidence export --dry-run` to build and validate a sanitized exchange
in memory. Explicit `--apply --target docs/evidence/exports/<name>.json` may
write a new export but never overwrite one. `pala evidence import --dry-run
--target <file>` validates only and never imports into local state.
Without `--dry-run`, the same command produces a read-only
`validated_target_digest_and_count_delta_approval_plan`: one stable target
observation is validated and compared with the current sanitized DB summary.
Matching content is a safe no-op; changed content is approval-gated while the
real import write path remains disabled by policy. The plan returns no payload
and performs no write or external call.
Export dry-runs and import inspections report the exact `digest_sha256` plus a
stable `content_digest_sha256` that excludes only root `generated_at` after
canonicalizing object keys.
`pala evidence compare --dry-run --target <file>` validates a project-local
baseline and reports only digest matches and collection-count deltas; it does
not return payloads, import data, or write files.
`pala evidence assert-content --content-digest <sha256> --strict` compares a
caller-supplied expected digest with current sanitized evidence without
reading a baseline file; mismatch fails strict mode.
`pala evidence completeness-check --strict` fails when any sanitized evidence
collection is truncated, count-unknown, or invalid, without returning payloads
or writing.
Evidence export dry-runs report per-collection eligible/exported counts and
explicit complete, truncated, or unknown truncation status.
Import inspection validates truncation metadata consistency when present and
reports `valid`, `invalid`, or `not_present`.
`pala evidence schema-check --strict` verifies the exact-match schema
compatibility contract without reading or writing an exchange file. Current
schema v2 adds the allowlisted decision-review summary collection.
`pala evidence migrate --dry-run --target <file>` produces a validation-only
v1-to-v2 migration plan without returning a candidate payload or writing a
file. `pala evidence migrate --target <file>` uses
`validated_source_schema_migration_readiness_approval_plan`: it validates one
source observation, treats a valid current-schema exchange as a safe no-op,
and approval-gates a valid v1-to-v2 candidate while migration writes remain
disabled by policy.

Use `npm run pala -- --help` for the executable command list. The organized
operator map lives in `docs/cli/command-map.md`.

Start the read-only local dashboard with:

```bash
npm run panel
```

The panel accepts only the `127.0.0.1` and `::1` loopback hosts and serves
`/api/state` without write routes. Its
`loopback_read_only_realpath_contained_single_handle_max_bytes` contract reads
state and static control files only when they are realpath-contained,
symlink/junction-free regular files no larger than 1,000,000 bytes. Reads use
one stable handle; unsafe or oversized panel files return an error without
returning their content. Startup failures follow
`structured_payload_free_without_raw_error`: stderr receives fixed
`panel_start_failed`, an optional validated short error code, and no raw
message or stack. Metadata/read/descriptor-close failures follow
`structured_fail_closed_no_throw`; a descriptor close failure becomes
`file_close_failed`, discards any pending response body, and returns a
content-free error. Read-only route data is held until its SQLite connection
closes successfully; `route_database_close_failed` discards pending rows and
returns the same content-free failure shape. Redacted route JSON is capped at
1,000,000 bytes; `route_response_exceeds_byte_limit` discards oversized route
rows and returns a content-free error. The database path is rechecked after
read and close; `route_database_path_changed_after_read` discards pending rows
if the fixed path is no longer a contained regular file. State `HEAD` requests
follow `same_validation_status_as_get_without_body`: they perform the same
bounded JSON validation as `GET` while returning no body. Static `HEAD`
requests follow `same_read_status_as_get_without_body`: they perform the same
bounded stable file read as `GET` while returning no body.

Dashboard route generation uses
`bounded_fixed_project_contained_atomic_dashboard_generation`. The fixed
`control/` output allowlist is preflighted with payload-free contained path
metadata, symlink/junction targets are blocked before generation, each output
is capped at 1,000,000 bytes, and files are atomically replaced from unique
temporary files in their validated parent directories. Successful preflights
and writes are returned as exact count/byte summaries; only bounded unsafe-path
or failed-file metadata is listed.

Concurrent first generation uses `rechecked_eexist_tolerant`: if another
process creates a fixed output directory first, only `EEXIST` is accepted and
the directory is immediately rechecked for contained, symlink/junction-free
metadata. Other create errors and unsafe post-create paths still fail closed.

Concurrent command processes use
`rechecked_transient_atomic_replace_retry`: only transient Windows atomic
replace errors are retried, at most 20 attempts, and the contained parent and
target are rechecked before every attempt. Permanent errors and unsafe path
changes still fail closed. Results expose aggregate attempt/retry counts
without returning generated payloads. Every retry also requires
`write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt`;
cleanup unlinks a temporary path only while its created identity still
matches. Successful summaries expose the verified temporary-source count.

## Read-only and plan-only gates

Operational commands such as `worker-run`, `n8n-import`, `autopilot-run`,
`drift-fix`, `archive-old`, `locale-sync`, and `refactor-plan` inspect real
local state and produce bounded plans. They explicitly report that no workload,
external call, destructive action, import, activation, or file move occurred.
Worker readiness is the one process-level exception: `worker-check` and
`worker-run --dry-run` start one fixed, bounded, read-only smoke subprocess,
validate its contract, and exit without starting a workload.

`autopilot-plan`, `autopilot-run`, and `external-skill-propose` use
`bounded_complete_user_input_classification_with_payload_free_metadata`.
Goal and target inputs must fit within 4,096 UTF-8 bytes before internal
classification. Oversized inputs require manual verification, and results
return only presence, exact byte-count, and truncation metadata, never the raw
goal or target.

`pala skills-check` and `pala external-skills-refresh` use
`bounded_local_skill_readiness_without_external_fetch_or_install`. The
project-contained `.claude/skills` inventory is bounded by the shared repo
scanner, and each `SKILL.md` is checked for delimited frontmatter, a
description, a Markdown title, substantive body content, a 4,000-byte limit,
and placeholder-free content. Results expose only skill paths and fixed check
metadata. Incomplete or unsafe scans and unready skills require manual
verification. No marketplace search, external fetch, install, or write is
performed; `external-skill-propose` also blocks when local readiness is
unconfirmed.

`pala smart-suggestions` uses
`bounded_local_advisory_from_explicit_source_truth`. It emits at most one
fixed advisory per seven local inspection areas and exposes only bounded
source-status metadata. A source that explicitly reports
`scan_complete: false` makes the command and `pala opportunity-radar` require
manual verification through fixed `smart_suggestion_source_incomplete:<area>`
blockers. Known findings may still produce advisories, but incomplete source
truth cannot produce a trusted radar result. Neither command fetches external
data or writes files, and `external-skill-propose` inherits this source-truth
gate.

`pala n8n-plan`, `pala drift-fix`, and `pala locale-sync` use
`plan_status_requires_complete_source_truth`. A complete inspection with known
findings may produce a `dry_run_only` repair plan, while a complete inspection
with no findings is safe. If source truth is incomplete, the plan itself
requires manual verification and exposes a fixed plan-specific source blocker.
`worker-run` also forwards its requested project root and bounded observation
options into the worker readiness inspection instead of silently inspecting a
different workspace. These commands do not start a workload, import or
activate a workflow, or change files.

Use `npm run worker:smoke` to run the fixed worker self-check directly, or
`pala worker-check --strict` to verify the entrypoint, package script, timeout,
and returned safety contract. Parent and subprocess package checks share a
project-contained, 1 MB-bounded, payload-free single-handle inspection. See
`docs/WORKER.md`. The parent also requires
`fixed_worker_entrypoint_path_metadata_scan` to confirm that `src/worker.ts`
is a contained, symlink/junction-free regular file before starting smoke.

Use `pala admin-check --strict` to observe the current standard/elevated token
without requesting elevation. Windows uses a bounded non-interactive role
probe; POSIX uses `getuid`. See `docs/ADMIN.md`.

`pala runtime-check` uses
`bounded_fixed_command_process_metadata_with_redacted_first_line`: five fixed
local compatibility commands each have a 5-second timeout and 64,000-byte
stdout/stderr budget. It returns process metadata and at most a 160-character
redacted first-line summary; raw stdout, raw stderr, and process error payloads
are never returned or written to evidence. Timeout, output-limit, process,
nonzero-exit, or invalid-output states block runtime observation PASS.
The same command reports five fixed `.claude` project assets through
`bounded_fixed_runtime_project_asset_path_metadata_scan`. Each asset must have
the expected file/directory kind on a project-contained, symlink/junction-free
path. Asset payloads are never read or returned; missing or unsafe assets block
runtime PASS.

`pala n8n-check --strict` uses
`bounded_optional_n8n_version_metadata_with_redacted_first_line` with a
5-second timeout, 16,000-byte stdout/stderr budget, and a 160-character
redacted first-line summary. On Windows,
`bounded_windows_where_n8n_cmd_presence_only` first distinguishes a genuinely
missing optional CLI without returning the discovered path or raw process
output. Discovery/version timeout, overflow, process failure, nonzero exit, or
invalid output blocks PASS; a safely observed missing n8n installation does
not.

Use `pala memory add-mistake --interactive` only from a real TTY. It validates
bounded fields and requires explicit confirmation before the local mistake
writer runs. Inline fields and interactive mode cannot be combined. The prompt
interface must close before the confirmed input is returned. Close failure
uses `payload_free_manual_verification_no_write`, reports
`interactive_prompt_close_failed`, and discards the pending input.

`pala n8n-import --dry-run --target workflow.json` inspects only a project-local
JSON regular file through a realpath-contained, 1 MB-bounded single handle.
It rechecks path identity after reading and before parsing. Metadata observation
failures use `structured_fail_closed_no_throw`, expose no workflow payload or
credential values, and never import or activate the workflow. Descriptor-close
failure returns `workflow_target_close_failed`, discards parsed truth, and does
not throw. The summary follows
`counts_and_boolean_metadata_without_raw_workflow_fields` and returns only
workflow-name presence, counts, and boolean metadata; it never returns the raw
workflow name or node fields.

`pala archive-old --older-than-days 30` uses
`bounded_directory_iterator_with_explicit_exactness`: it scans at most 1,000
raw-evidence entries plus one truncation probe, returns at most 120 candidate
paths, and reports `candidate_count_exact` plus `scan_truncated`. An incomplete
inventory requires manual verification. Archive root truth is reported as
payload-free `root_inspection` metadata derived from the contained,
symlink/junction-free path contract; a missing root is exactly empty and an
unsafe root blocks inventory. Descriptor-close failures follow
`structured_fail_closed_no_throw`; `archive_inventory_directory_close_failed`
discards gathered entries and candidates. It never moves or deletes files.

`pala evidence last` uses
`bounded_directory_iterator_latest_mtime_with_prefix_read`: it scans at most
5,000 raw-evidence entries plus one truncation probe, reports `latest_exact`,
and reads only a single-handle prefix capped at 4,096 bytes and 1,200
characters. Latest-evidence root truth is reported as payload-free
`root_inspection` metadata from the contained, symlink/junction-free directory
contract; a missing root is exactly empty and an unsafe root blocks selection.
It never reads the full log merely to return a preview. Metadata and
descriptor-close failures follow `structured_fail_closed_no_throw`:
`raw_evidence_directory_close_failed` discards all gathered candidates, while
`latest_evidence_file_close_failed` discards the pending preview without
exposing its content.

`pala quality-radar`, repository inspections, and their doctor aggregation use
`bounded_realpath_contained_inventory_with_single_handle_text_reads`. Each
inventory scans at most 5,000 entries and 32 directory levels; each inspected
text file is a project-realpath-contained regular file read from one stable
handle, capped at 2,000,000 bytes, and rechecked against its path identity
after reading. Aggregated quality and doctor scans share a 20,000,000-byte
total text-read budget. Returned findings are capped at 200 while true finding
counts and `scan_complete` remain explicit. Entry/depth/total-byte limits,
unsafe paths, unreadable files, or oversized text block PASS instead of
producing an empty-findings success.
Metadata and descriptor-close failures follow
`structured_fail_closed_no_throw`; `repo_text_file_close_failed` blocks scan
completeness and returns no inspected text payload. A directory descriptor
close failure becomes `repo_directory_close_failed`, discards entries gathered
from that directory, and keeps inventory truth incomplete.
A missing text target below a symlink/junction ancestor is unsafe rather than
an ordinary missing file; bounded readers reuse the common payload-free path
metadata preflight before opening a handle.
Repo inventory root truth is exposed as payload-free `root_inspection`
metadata. A missing root is exactly empty, while a missing root below a
symlink/junction makes the scan incomplete.

Generic CLI path-presence decisions use
`repo_path_presence_from_contained_metadata_only`. A path counts as present
only when metadata inspection confirms project realpath containment and a
symlink/junction-free path. Unsafe, unreadable, or wrong-kind targets never
become a true existence result, and no payload is read or returned.
Missing-target ancestors are also walked before a missing path is accepted, so
an absent file below a symlink/junction is not treated as safely absent.

`pala quality-radar --strict` additionally uses
`bounded_fixed_quality_required_artifact_path_metadata_scan` for four fixed
v28 evidence, dashboard, and test artifacts. The metadata-only check requires
project-contained, symlink/junction-free regular files and separates missing
artifacts from unsafe or wrong-kind paths without reading their payloads.

`pala architecture-check --strict` additionally uses
`bounded_fixed_architecture_path_metadata_scan` for seven fixed architecture
layers. The metadata-only check verifies expected file/directory kind,
realpath containment, and a symlink/junction-free path without reading or
returning layer payloads. Missing, unsafe, or wrong-kind layers block PASS.

`pala i18n-check --strict` uses
`bounded_fixed_i18n_artifact_path_metadata_scan` for the English public README
and Turkish usage mirror. Both must be project-contained, symlink/junction-
free regular files. The check returns path metadata only and blocks PASS on
missing, unsafe, or wrong-kind artifacts.

`pala sync-check`, `pala push-check`, and command completion metadata use
`bounded_git_porcelain_v1_z_with_explicit_process_truth`. Git status has a
5-second timeout and 1,000,000-byte output budget; remote-name observation has
a 64,000-byte budget. `pala rollback-check` uses
`bounded_git_rev_parse_head_with_validated_hash` with the same timeout and a
256-byte output budget, accepting only an exact 40- or 64-hex commit hash.
They expose bounded parsed names or a validated hash, never raw stdout or
stderr, and report `changed_files_count_exact` / `remote_count_exact`.
Timeouts, process failures, invalid output, or output-limit overflow block PASS
instead of being treated as a clean worktree or an empty remote list.

`pala memory check`, `pala memory list`, and rule-proposal dry-runs consume the
bounded single-handle registry scan documented in `docs/MEMORY.md`. They expose
record/count exactness and never return an invalid raw JSONL line.
Registry descriptor-close failure returns `memory_registry_file_close_failed`
through `structured_fail_closed_no_throw` and exposes no parsed records.
`pala memory sync-claude --dry-run` also uses a bounded project-contained
single-handle read and blocks its proposal when `CLAUDE.md` truth is unsafe or
incomplete.

`pala setup --check --all`, MCP repair/remove dry-runs, and `pala mcp-smoke
--dry-run` use `realpath_contained_single_handle_max_1mb_payload_free`.
Fixture descriptor-close failure returns `fixture_file_close_failed` through
`structured_fail_closed_no_throw`, discards parsed config truth, and proposes
no change.
Fixture files are realpath-contained, symlink/junction-free regular files
preflighted at 1,000,000 bytes and read through one stable handle. Results
expose only bounded server-name/count/action summaries; fixture payloads,
environment values, and secret values are never returned. Unsafe, oversized,
unstable, invalid-JSON, or invalid-shape fixtures block PASS.

Use `pala ledger-safety-check` to scan local ledgers before public export
without echoing sensitive source text. `pala ledger-redact --dry-run` previews repair; explicit
`--apply` creates a gitignored `.pala/private` backup before sanitizing local
ledgers for export.
The safety scan is bounded to 100 entries, 10 MB per file, 50,000 lines per
file, and 200 returned findings while preserving true finding counts. Repair
is blocked unless `scan_complete` is true.
File descriptor-close failure returns `ledger_file_close_failed` through
`structured_fail_closed_no_throw`, discards the unread-safe result, and exposes
no ledger text. A directory descriptor-close failure returns
`ledger_directory_close_failed` and discards gathered ledger-file candidates.

Explicit ledger repair uses
`bounded_project_contained_atomic_backup_then_replace`. Backup directories are
created one verified segment at a time, every bounded original is published as
a create-only backup before replacement begins, and sanitized ledgers are
atomically replaced from same-directory temporary files. Path changes,
symlinks/junctions, failed backups, oversized files, and writes outside the
project fail closed; failures expose no source payload. Apply holds
`bounded_fixed_create_only_lock_serialized_ledger_mutations` across its first
scan, all backups/replacements, and final scan; normal Pala ledger appends use
the same bounded lock so a live append cannot be lost at replacement. Unsafe,
changed, unreleasable, or stale locks block and are not automatically
reclaimed.

## Honest acceptance semantics

`pala verify --strict` verifies Master Workflow infrastructure. It may return
PASS while product execution or release authorization remains
`approval_required`. Readiness and authorization are reported separately and
never converted into a fake product or release PASS.

The Master Workflow dashboard exposes `infrastructure_acceptance`,
`product_workflow_status`, `release_readiness`, and `release_authorization`.
Figma/Product and Release gates require explicit human approval evidence before
their ledger status can become `passed`. Decision-engine `needs_approval` is
displayed as the canonical gate status `approval_required`.

Kernel bootstrap and ledger append verification derive their expected counts
from the exported contract inventories in `src/lib/db.ts` and
`src/lib/ledger.ts`; verification must not hardcode a hidden replacement count.
Fresh clones bootstrap required local ledger files as empty JSONL files, with no
fake PASS records. Runtime `.pala/ledger/*`, `.pala/state/*`,
`.pala/evidence/raw/*`, and `.pala/evidence/*.md` files are local evidence only
and are not commit artifacts.
