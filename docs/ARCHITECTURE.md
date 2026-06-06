# Architecture

Pala OS is a local control/evidence layer above coding agents.

```txt
CLI / Worker -> SQLite + Ledger + Evidence -> Dashboard
```

## Backend / CLI

The CLI owns command routing, DB migrations, evidence writing, ledger writing, decision records, token records, and safe dry-run plans.

Kernel bootstrap uses `fixed_project_contained_create_only_kernel_bootstrap`.
It preflights the fixed runtime directory/file allowlist with payload-free
project-contained metadata before any write. Missing directories are created
one segment at a time; nine fixed initial files use atomic create-only links.
Existing files are never overwritten, and any symlink/junction or wrong-kind
protected path blocks bootstrap before the first write. Concurrent fixed
directory creation is `rechecked_eexist_tolerant`: `EEXIST` triggers immediate
metadata revalidation, while other create errors and unsafe results block.
New initial files must pass `temporary_and_initialized_file_dev_ino_match`.
Their temporary sources follow
`write_handle_and_temporary_path_dev_ino_match`, and cleanup only unlinks a
still-matching created temp identity.

Database path observation uses
`fixed_project_contained_database_path_metadata_only`. The fixed
`.pala/db/pala.sqlite` target is inspected before and immediately after open;
missing-target ancestors, symlink/junction components, outside paths, and
wrong-kind entries block database use. Status exposes path metadata only and
does not read or return database payloads.

New-database initialization reads `.pala/schema/001_init.sql` through a
project-contained, 1 MB-bounded stable single handle. Before execution it
disables extension loading, enables SQLite defensive mode, and installs a
temporary SQLite authorizer that permits the fixed schema-creation surface
while denying attach/detach, temp objects, destructive schema changes, virtual
tables, functions, and writes outside SQLite's own schema table. The authorizer
is removed before normal migrations. Descriptor-close failure is converted to
payload-free `database_schema_file_close_failed`; the pending SQL is discarded
and initialization does not execute it.

Semantic drift checks use cached bounded contract-source reads. Each source is
project-contained, capped at 2 MB, opened through one stable handle with a
post-read path identity check, and counted once against a shared 20 MB text
budget. Incomplete source truth blocks drift PASS rather than producing empty
text that could masquerade as agreement.

Fixed repository text inspected directly by CLI commands uses the same cached
bounded reader and shared 20 MB budget. Read metadata is attached to command
results, while incomplete source truth adds an explicit blocker before
completion and evidence recording.

CLI finalization follows
`explicit_outcome_cli_finalization_before_database_close`. The raw-evidence
write, SQLite evidence row, event ledger append, DB completion, and
operational-state refresh each expose a tri-state outcome instead of allowing
an escaped exception or false success. Missing raw-evidence confirmation keeps
dependent DB-evidence and ledger writes `not_attempted`. Late state-refresh
failures trigger an idempotent final DB completion update, and state snapshots
persist only bounded identifier-only finalization summaries.

CLI final output follows `close_database_before_stdout_json`. The completed
JSON result remains pending until the command's SQLite connection closes.
`cli_output_blocked:database_close_failed` prevents stdout payload exposure
when that close cannot be confirmed. A pre-close serialization pass caps the
pending JSON at 5,000,000 UTF-8 bytes; unsafe output is replaced by a fixed
payload-free failure JSON that is written only after confirmed close.
Unexpected top-level failures best-effort emit fixed `cli_top_level_failed`
JSON and exit nonzero without printing a raw stack or pending payload. Routed command exceptions use
`structured_payload_free_without_stack`; raw exception messages and stacks are
not included in stdout results.

Unknown top-level commands follow
`structured_payload_free_without_raw_command`. Before persistence, the raw
command name and all remaining arguments are replaced by the fixed
`pala <UNKNOWN_COMMAND>` record. The result uses fixed `unknown_command`, and
raw evidence uses fixed `command-unknown`, so arbitrary unknown input cannot
become output, DB/state/ledger content, or an evidence filename.

CLI command record persistence follows `bounded_redacted_cli_command_record`.
Execution still receives the operator's original arguments, while DB rows,
evidence, ledgers, and operational state receive only the 100-argument,
1,024-byte-per-argument, 4,096-byte-total redacted command representation plus
explicit truncation metadata.

Decision record persistence follows
`bounded_redacted_decision_record_before_persistence`. SQLite, evidence,
ledger, and returned decision payloads share one redacted input object capped
at 100,000 UTF-8 bytes, plus bounded redacted reason and decision-type fields.
Evidence and returned payloads also share a separately redacted 25,000-byte
metadata record for token budget and at most 100 bounded related-rule IDs.
Serialization failures, oversized inputs, or unsafe metadata become
payload-free metadata-only records and downgrade nominally safe decisions to
manual verification.

Decision persistence then follows
`evidence_then_ledger_then_database_with_explicit_outcomes`. Evidence and
ledger records identify their later persistence state as pending; the final
SQLite insert receives a decision already downgraded by any known evidence or
ledger failure. Exceptions and missing path/insert confirmations become fixed
payload-free blocker IDs and cannot escape as raw errors or false success.

State target existence uses one `lstat`; only `ENOENT` is accepted as missing.
Other inspection failures block state reads and atomic refreshes rather than
masquerading as an absent file.

Ledger append uses a fixed six-file allowlist and one bounded append handle.
The parent and target must be project-contained, regular, and free of
symlink/junction components before and after the write. Records are redacted
and capped at 1 MB; invalid names, path changes, short writes, or unsafe
metadata fail closed without exposing payloads. Appends and explicit repair
apply share one bounded fixed create-only mutation lock; this serializes live
ledger replacement against append without automatically reclaiming stale
locks. Append descriptor-close failure becomes payload-free
`ledger_append_blocked:file_close_failed` rather than a false success, while
the outer mutation-lock release still runs.

Raw evidence write uses a project-contained create-only path. Serialized input
is capped at 5 MB before redaction; accepted content is redacted and published
from a bounded temporary file through an atomic create-only link. Parent and
target metadata are checked before publication, existing evidence is never
overwritten, and `temporary_and_target_dev_ino_match` rejects a post-publish
same-size replacement. Failures expose no payload.
Temporary source identity follows
`write_handle_and_temporary_path_dev_ino_match`, and cleanup only unlinks a
still-matching created temp identity.
The raw evidence kind is independently capped at 256 UTF-8 bytes, redacted,
and slugged before it can enter either the envelope or filename.

Public evidence write is limited to the fixed official-compatibility report.
Input is capped at 1 MB before and after redaction, the contained
symlink/junction-free parent and target are checked around the write, and a
bounded temporary file is published through atomic replace. Arbitrary file
names and writes outside `docs/evidence` are blocked. Concurrent replacement
uses bounded transient-error retry with a parent/target safety recheck before
every attempt. Successful publication follows last-writer-wins truth: a later
safe, bounded writer may supersede the file before the first writer's
post-check without turning that completed atomic publish into a false failure.

Memory registry append uses one fixed target and keeps writer bounds aligned
with reader bounds. New registry creation uses an atomic create-only link;
existing registry writes use one verified append handle. Redacted records are
capped at 1 MB, the full registry at 5 MB, and unsafe/changing paths or invalid
redacted JSON fail closed without exposing payloads. Concurrent writers are
serialized by one fixed contained create-only lock with bounded acquisition
attempts, preserving first-create records and the aggregate size bound.
An existing-lock disappearance during inspection is bounded-retry only, never
accepted as acquisition. After unlink, release accepts either absence of the
released identity or a safely inspected different successor lock already
holding the fixed path.
Existing-append descriptor-close failure becomes payload-free
`memory_registry_append_blocked:file_close_failed` instead of false success.
The first create must pass `temporary_and_registry_dev_ino_match`.
Its temporary source follows
`write_handle_and_temporary_path_dev_ino_match`, and cleanup only unlinks a
still-matching created temp identity.
Unsafe, changed, unreleasable, or stale locks fail closed and are never
automatically reclaimed.

Evidence exchange export write is explicit-apply only and create-only. Missing
parent directories are created one segment at a time with path rechecks; the
bounded export is written to a no-follow temporary handle and published
through an atomic hard link. Existing or racing targets are never overwritten,
concurrent parent creation is `rechecked_eexist_tolerant`, and same-target
publication follows
`atomic_create_only_one_winner_existing_target_needs_approval`. The
`temporary_and_target_dev_ino_match` policy verifies the published target
still has the temporary source's file identity. Same-size replacements fail
closed, and failures expose no payload.
Temporary source identity follows
`write_handle_and_temporary_path_dev_ino_match`, and cleanup only unlinks a
still-matching created temp identity.

Evidence-exchange target path safety uses single-`lstat`, ENOENT-only missing
truth for export, import, migration, comparison, and nearest-ancestor checks.
Other inspection failures block before target read or write.

Runtime compatibility observation executes only five fixed local version/help
commands. Each process has a 5-second timeout and 64 KB output budget; stored
truth contains process metadata plus a bounded redacted first-line summary,
never raw stdout, stderr, or process-error payloads. Any timeout, output-limit,
process, nonzero-exit, or invalid-output state blocks runtime observation PASS.

Runtime project asset path inspection uses
`bounded_fixed_runtime_project_asset_path_metadata_scan` for five fixed
`.claude` settings, hook, skill, and agent targets. It checks expected
file/directory kind and rejects paths with symlink/junction components without
reading or returning asset payloads.

Local skill readiness inspection uses
`bounded_project_skill_readiness_scan` under the shared bounded repository
inventory and text-reader contract. `skills-check` verifies fixed structural
requirements for each contained `SKILL.md`; `external-skills-refresh` wraps
that truth with
`bounded_local_skill_readiness_without_external_fetch_or_install`. The wrapper
can report local readiness or blockers, but it cannot search a marketplace,
fetch, install, or write. `external-skill-propose` inherits the readiness gate
instead of producing a ready plan from an incomplete or unsafe scan.

Smart suggestion source truth follows
`bounded_local_advisory_from_explicit_source_truth`. Seven fixed local
inspection areas may each contribute one bounded advisory. The result carries
only area-level status/count metadata, and any source with incomplete scan
truth adds a fixed area blocker and prevents a trusted radar status.
`opportunity-radar` derives from the same result through
`bounded_local_opportunities_from_smart_suggestion_truth`; it performs no
external fetch or write. External-skill proposals also require this suggestion
source truth before returning a ready dry-run plan.

Plan source truth follows `plan_status_requires_complete_source_truth`.
`n8n-plan`, `drift-fix`, and `locale-sync` distinguish a complete inspection
with known findings from an incomplete inspection. Known findings can yield a
bounded dry-run plan; incomplete source truth yields manual verification with
a fixed plan-specific blocker. `worker-run` preserves its requested project
root and bounded observation options when it evaluates readiness. The plan
layer never turns an unsafe or incomplete source scan into readiness and never
starts a workload or writes files.

Action-plan user inputs follow
`bounded_complete_user_input_classification_with_payload_free_metadata`.
Autopilot goals and external-skill targets are classified only when the full
input fits within 4,096 UTF-8 bytes. Returned plans expose payload-free
presence and exact byte-count metadata rather than raw goal or target text;
oversized or unnormalizable inputs fail closed before classification.

Optional n8n CLI availability is observed through a fixed bounded local
process. Windows first uses a payload-free `where.exe n8n.cmd` presence probe;
only a positive discovery starts the fixed version command. Both discovery and
version observations are timeout/output-limited, expose no raw stdout, stderr,
error payload, or discovered path, and perform no activation or external call.

Workflow contract inspection reads four fixed project-contained YAML files
through stable single handles with per-file and aggregate byte budgets.
Incomplete reads block workflow PASS, and mutation matching returns counts
only rather than potentially sensitive run/action payloads.

Public-readiness artifact inspection replaces existence-only release truth
with `bounded_required_public_artifact_single_handle_scan`. All 30 fixed public
artifacts must be non-empty, project-contained regular files read through
stable single handles under per-file and shared byte budgets. The result
returns payload-free metadata and blocks PASS on missing, empty, unsafe,
unreadable, oversized, or incomplete artifact truth; it never writes,
publishes, or pushes.

## Local Worker

`src/worker.ts` currently accepts only the fixed, bounded, local read-only
`--smoke-check` mode. `worker-check` starts that subprocess with a parent
timeout, validates its exact safety contract and JSON result, and never starts
a workload. `worker-run --dry-run` reuses the readiness evidence and remains
plan-only. Future workload or n8n integration stays approval-gated.
The parent inspects `src/worker.ts` through
`fixed_worker_entrypoint_path_metadata_scan`, requiring a contained,
symlink/junction-free regular file and exposing payload-free path metadata.
Parent and subprocess both inspect `package.json` through the same
project-contained 1 MB-bounded stable single-handle reader and expose no
package payload.

## Privilege Inspection

`admin-check` observes the current token without requesting elevation. Windows
uses a bounded, hidden, non-interactive `WindowsPrincipal` role probe; POSIX
uses `getuid`. The result exposes only structured detection metadata, never
captured stdout or stderr, and does not authorize later actions.

`n8n-import --dry-run` accepts only project-local JSON regular files and uses a
realpath-contained, 1 MB-bounded, single-handle inspection with identity and
content-stability checks plus a post-read path identity recheck before parsing.
Metadata observation failures follow `structured_fail_closed_no_throw`; target
changes and observation failures expose no workflow payload or credential
values. Descriptor-close failure returns `workflow_target_close_failed`,
discards parsed truth, and does not throw. The plan cannot import or activate a
workflow. Its workflow summary follows
`counts_and_boolean_metadata_without_raw_workflow_fields`: it exposes only
name presence, counts, and boolean metadata, never the raw workflow name or
node fields.

`archive-old` uses a bounded directory iterator and reports explicit scan
truncation and candidate-count exactness. It treats incomplete inventory as
manual verification and never moves or deletes archive candidates.
Archive inventory root truth comes from one payload-free contained,
symlink/junction-free directory metadata inspection; a missing root is exactly
empty and an unsafe root blocks inventory before directory iteration.
`archive_inventory_directory_close_failed` discards gathered entries and
candidates, preserving incomplete-inventory truth without throwing.

`evidence last` selects a latest raw-evidence candidate from a bounded mtime
inventory, reports whether latest selection is exact, and reads only a bounded
single-handle prefix. Scan truncation or unsafe files prevent a latest-PASS.
Latest-evidence inventory root truth comes from one payload-free contained,
symlink/junction-free directory metadata inspection before iteration.
Descriptor-close failures are structured and fail closed:
`raw_evidence_directory_close_failed` discards gathered candidates, and
`latest_evidence_file_close_failed` discards the pending preview.

`quality-radar`, repository inspections, and doctor share a bounded
realpath-contained repository inventory. Traversal and depth are capped, text
files are byte-preflighted and read through one stable handle with a post-read path identity recheck, and aggregated scans share a total text-byte budget.
Returned findings are bounded while true counts remain explicit. Every
inspection reports `scan_complete`; incomplete inventory or unread content
blocks PASS.
Metadata and descriptor-close failures follow
`structured_fail_closed_no_throw`; `repo_text_file_close_failed` blocks the
scan and exposes no inspected text payload. `repo_directory_close_failed`
discards entries gathered from the affected directory and keeps inventory
truth incomplete.
A missing text target below a symlink/junction ancestor is unsafe rather than
ordinary absence because bounded text reads reuse common path metadata before
opening a handle.
Repo inventory root truth is exposed as payload-free `root_inspection`
metadata before traversal; a missing root below a symlink/junction blocks
scan completeness.

CLI path presence decisions use
`repo_path_presence_from_contained_metadata_only`. Presence is derived only
from realpath-contained, symlink/junction-free metadata inspection; unsafe or
unreadable targets are never treated as existing, and payloads are not read.
Missing-target ancestors are checked too; a missing descendant below a
symlink/junction returns unsafe metadata rather than safe absence.

Quality required-artifact path inspection uses
`bounded_fixed_quality_required_artifact_path_metadata_scan` for four fixed
evidence, dashboard, and test files. It requires project-contained,
symlink/junction-free regular files, exposes payload-free metadata, and
distinguishes missing artifacts from unsafe or wrong-kind paths.

Architecture layer path inspection uses
`bounded_fixed_architecture_path_metadata_scan` for seven fixed CLI, schema,
rules, state, ledger, evidence, and dashboard paths. It checks realpath
containment, rejects symlinks/junctions and wrong file/directory kinds, exposes
metadata only, and performs no read or write of layer payloads.

i18n artifact path inspection uses
`bounded_fixed_i18n_artifact_path_metadata_scan` for the English README and
Turkish usage mirror. It requires two project-contained,
symlink/junction-free regular files and exposes payload-free path metadata.

Git worktree, remote, and HEAD truth is observed through bounded,
timeout-limited read-only subprocesses. Status uses NUL-delimited porcelain
parsing, remote names are bounded separately, and rollback readiness accepts
only an exact validated 40- or 64-hex HEAD hash. Raw process output is never
returned, and process/output failures block sync, push readiness, rollback
readiness, and final PASS rather than masquerading as clean state.

MCP fixture inspection is fixture-only and payload-free. A fixture target must
be realpath-contained, symlink/junction-free, regular, and no larger than 1 MB;
it is opened and read through one stable handle with post-read identity checks.
Plans expose bounded server names, counts, ownership/action truth, and blockers,
never config payloads, environment values, secret values, or a write path.
Descriptor-close failure becomes payload-free `fixture_file_close_failed`
through `structured_fail_closed_no_throw`; parsed fixture truth is discarded
before any proposal can be built.
The shared path metadata preflight also rejects a missing fixture below an
existing symlink/junction ancestor.

## Local Memory

- `.pala/db/pala.sqlite`: local dashboard/query state
- `.pala/ledger/*.jsonl`: append-only audit trail
- `.pala/memory/*`: mistake and lesson memory
- `.pala/rules/*`: reviewable operating rules
- `.pala/evidence/*`: proof

Interactive mistake capture is separated into a TTY-only validated collector
and the existing local writer. Prompts use stderr, explicit confirmation is
required, and invalid, cancelled, or non-TTY sessions perform no write.
Prompt close failure is checked before a confirmed input can reach the writer;
`interactive_prompt_close_failed` returns payload-free manual-verification
truth and discards the pending input.

Mistake-registry reads are project-contained, byte/line/record/finding bounded,
single-handle, and post-read identity checked. Invalid JSONL source text is
never returned. Incomplete or invalid registry truth blocks memory PASS and
rule proposals.
Descriptor-close failure becomes payload-free
`memory_registry_file_close_failed` through
`structured_fail_closed_no_throw`; parsed records are discarded.
The shared path metadata preflight also rejects a missing registry below an
existing symlink/junction ancestor instead of treating it as safely empty.

CLAUDE summary sync dry-runs reuse the project-contained bounded text reader.
They return only fixed required/missing-line truth and block all proposed diffs
when the current `CLAUDE.md` cannot be read completely and safely.

`ledger-safety-check` uses bounded, single-handle JSONL reads with explicit
file/line/finding budgets and true finding counts. Incomplete scans block PASS
and `ledger-redact` repair; findings never echo source text.
Descriptor-close failure becomes payload-free `ledger_file_close_failed`
through `structured_fail_closed_no_throw` and keeps the scan incomplete.
`ledger_directory_close_failed` discards gathered ledger-file candidates and
keeps inventory truth incomplete.
Ledger inventory root truth comes from one payload-free contained,
symlink/junction-free directory metadata inspection before file enumeration.

Ledger repair write uses
`bounded_project_contained_atomic_backup_then_replace`. The explicit apply path
creates the private backup hierarchy one verified segment at a time, publishes
all bounded originals through create-only atomic links, verifies each with
`temporary_and_backup_dev_ino_match`, and begins ledger replacement only after
every backup succeeds. Repair truth reports the verified-backup count. Each
sanitized ledger is then
atomically replaced from a same-directory temporary file after source identity
rechecks. Unsafe or changed paths fail closed without source-payload exposure
or writes outside the project. The full apply scan/backup/replace/final-scan
window holds the same bounded fixed mutation lock used by Pala ledger appends,
preventing append loss at atomic replacement.
Every live replacement must pass
`temporary_and_live_ledger_dev_ino_match`; repair truth reports the verified
replacement count.
Temporary-source identity follows
`write_handle_and_temporary_path_dev_ino_match`, and cleanup only unlinks a
still-matching created temp identity.

## Dashboard

Dashboard routes live under `control/*/index.html`. `src/panel-server.ts`
serves them on loopback and exposes a read-only `/api/state` endpoint backed by
`.pala/state/dashboard-state.json`. Bounded `/api/route/<route>` endpoints open
the local SQLite DB read-only and expose only registered SELECT-query views.
They accept bounded `limit`, `offset`, and `q` parameters, scan at most 500
rows, and perform search in memory after the registered query. No route API
accepts writes.

Dashboard route generation uses
`bounded_fixed_project_contained_atomic_dashboard_generation`. It preflights
the fixed `control/` directories and output files with project-contained,
symlink/junction-free metadata before writing. Missing fixed directories are
created one segment at a time and rechecked; generated files are capped at
1 MB and atomically replaced from unique temporary files in the validated
parent directory. Successful path inspections and writes are summarized as
exact counts and bytes; only bounded unsafe-path or failed-file metadata is
returned.

Concurrent fixed-directory creation uses `rechecked_eexist_tolerant`.
`EEXIST` is treated only as a signal to recheck the fixed directory; wrong
kinds, symlink/junction paths, unsafe containment, and other creation errors
remain blocking.

Concurrent dashboard generation uses
`rechecked_transient_atomic_replace_retry`. Transient Windows replace
contention is retried at most 20 times with bounded backoff, and parent/target
containment is rechecked before every attempt. Permanent replace errors or
unsafe path changes remain blocking. Every retry also requires
`write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt`;
cleanup unlinks a temporary path only while its created identity still
matches. Successful summaries expose the verified temporary-source count.

The panel read contract is
`loopback_read_only_realpath_contained_single_handle_max_bytes`: startup rejects
non-loopback hosts, state/static targets must be project/control-contained
symlink/junction-free regular files, and each is preflighted at 1 MB before a
stable single-handle read. Unsafe, oversized, unstable, or invalid state files
return content-free errors. Startup error events emit fixed
`panel_start_failed` plus an optional validated short code, never the raw
exception message or stack. The SQLite route path is also checked as a
project-contained non-symlink regular file before read-only opening.
Metadata/read/descriptor-close failures use
`structured_fail_closed_no_throw`; `file_close_failed` discards any pending
file body before a content-free error response is sent. Route data is not sent
until the read-only SQLite connection closes; `route_database_close_failed`
discards pending rows and leaves the server available for later requests.
Redacted route responses are capped at 1 MB; `route_response_exceeds_byte_limit`
discards pending rows before a content-free error is sent. The fixed database
path is rechecked after route read and close; unsafe or changed path truth
returns payload-free `route_database_path_changed_after_read`. State `HEAD`
uses the same bounded read and JSON validation status as `GET`, but sends no
body. Static `HEAD` uses the same bounded stable file-read status as `GET`, but
sends no body.

Command-side state reads and refresh writes use
`bounded_project_contained_single_handle_state_json_with_atomic_replace`.
Only five fixed files directly under `.pala/state` are eligible, including
`reference-radar-state.json`. Reads are project-contained,
symlink/junction-free, 1 MB-bounded, stable single-handle JSON inspections.
`state_file_close_failed` discards any parsed value and returns only the
caller-provided fallback through structured fail-closed truth.
Refresh serializes a bounded temporary file inside the validated state
directory and performs an atomic replace; unsafe existing targets are not
followed or overwritten. Reference refresh appends its ledger event only after
the atomic state write succeeds.

Reference refresh write truth follows
`state_then_ledger_with_explicit_append_outcome`. It reports ledger append as
`not_attempted`, `confirmed`, or `unknown_after_attempt`; only a non-empty
returned path confirms the append. An exception after the append attempt
cannot become a false "not written" result and instead adds a payload-free
manual-verification blocker.

Concurrent state refresh uses
`last_writer_wins_rechecked_transient_atomic_replace_retry`. Transient Windows
replace contention is retried at most 20 times with a target safety recheck
before every attempt. Atomic publish success and post-replace target safety
are reported separately because a later safe writer may legitimately
supersede an earlier value.
Every retry requires
`write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt`;
cleanup only unlinks a still-matching created temp identity.

`/api/route/benchmarks` is a specialized read-only view backed by the bounded
reference refresh plan. It exposes stale-source queue rows plus summary
metrics, category gaps, and freshness policy. The full source catalog remains
available from `/api/route/references`.

`/api/route/evidence-exchange` builds the sanitized export in memory for
validation, then returns only collection counts, digest, validation status,
exclusion totals, the fixed validation-only migration capability, and the
fixed migration-readiness capability. It never returns the payload or candidate
payload, reads no migration target, and exposes no write path. Exchange schema
v2 includes an allowlisted
decision-review summary without free-text reasons or evidence paths.
The route shows both the exact export digest and a stable content digest that
canonicalizes object keys and excludes only the root `generated_at` value.
It also shows the fixed comparison capability without reading a comparison
target or running a comparison.
The fixed import-readiness capability describes the
`validated_target_digest_and_count_delta_approval_plan` without selecting or
reading a target. At command time, the plan validates one stable target
observation and compares it with the current sanitized DB summary; matching
content is a safe no-op and changed content is approval-gated while writes stay
disabled by policy.
The fixed migration-readiness capability describes the
`validated_source_schema_migration_readiness_approval_plan` without selecting
or reading a source. At command time, the plan validates one stable source
observation and its applicable migration candidate; current valid content is a
safe no-op and a valid v1-to-v2 candidate is approval-gated while migration
writes stay disabled by policy.
The fixed assertion capability is descriptive only; the dashboard does not
accept an expected digest or run an assertion.
Every evidence collection carries explicit collection truncation truth:
exported count, eligible count, count exactness, and complete/truncated/unknown
status.
The route summary also exposes truncation metadata validation status without
returning the payload.
Evidence completeness status and policy are shown separately from the safe
read-only preview execution status.
The evidence exchange route also exposes the exact normalized payload byte
budget, utilization, remaining bytes, and warning status without returning the
payload.
The fixed raw-file byte preflight capability describes the 2 MB stat-before-read
import limit without checking, reading, or parsing a target file.
The fixed target path safety capability describes realpath containment and
symlink/junction rejection without checking an operator-supplied target.
The fixed single-handle file inspection capability describes regular-file,
post-open path/identity recheck, bounded same-descriptor read, and platform
`O_NOFOLLOW` support without opening a target. Descriptor-close failures use
`structured_fail_closed_no_throw`; `close_failed` discards parsed truth and
becomes an import- or migration-target blocker without exposing payloads.
Strict schema shape status rejects unknown root, policy, or record-collection
keys and fixed safety-policy drift, and is exposed in the read-only route
summary.
Record value validation checks required fields, types, closed enums, and
timestamps, and exposes only status plus field-path findings.
The payload complexity guard uses a bounded iterative scan and stops
serialization-heavy validation when depth, node count, or cycle limits fail.
Digest availability explicitly distinguishes available exact/content digests
from targets that were not parsed or could not be serialized safely.
generated_at time truth validates ISO timestamp syntax and bounded future skew,
then exposes status and skew without repeating the timestamp value.
Temporal consistency then verifies that valid record timestamps do not occur
after root `generated_at`, exposing only status, bounded counts, and maximum
ahead duration.
Collection ordering normalizes and validates selected sanitized records using
per-collection visible-field sort orders, then exposes status and bounded pair
counts without returning records.
Duplicate-record truth checks exact canonical equality inside each valid
selected collection and exposes only status and bounded counts, never record
identities or fingerprints.
The validation finding budget returns at most the first 200 field-path-only
findings while preserving true total, omitted-count, and truncation truth for
phase status and the read-only dashboard.
Validation phase execution records executed/skipped state and dependency
reasons for every validation phase, while the dashboard exposes bounded
aggregate counts and skip reasons separately from acceptance.
Finding attribution binds each observed validation finding to its producing
phase and exposes counts only, including an explicit unattributed count.

Evidence migration is plan-only. A v1-to-v2 plan validates a hypothetical
candidate in memory, never returns that candidate payload, and performs no
file or database write. The non-dry-run route is a read-only migration-readiness
approval plan, not a migration executor.

`/api/route/decision-review` exposes the bounded, deduplicated read-only
decision review queue with approval and evidence signals. It never grants
approval or resolves a decision. Queue items include age, threshold, and
due-soon/overdue escalation status.

Frontend reads truth. It does not create truth.

If data is missing, the dashboard must show `Unknown`, `Not checked`, `Partial`, `Blocked`, or `Manual verification required`.

Master Workflow acceptance is multi-dimensional. Infrastructure verification,
product workflow execution, release readiness, and release authorization are
separate truth values. Pending human approval does not fail infrastructure
verification, but it cannot satisfy an approval-gated PASS or authorize an
external write. The read-only Master Workflow route derives these values from
fixed local gate definitions and ledger records.

Kernel and ledger contracts expose their own inventories, and verification
checks the declared inventory lengths instead of hidden numeric expectations.
Fresh-clone ledger bootstrap creates missing required JSONL files empty; runtime
verification evidence remains local and gitignored unless it is deliberately
sanitized into `docs/evidence/*`.
