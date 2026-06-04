# Evidence Exchange

Pala OS can build a bounded sanitized evidence exchange from allowlisted local
SQLite fields.

```bash
npm run pala -- evidence export --dry-run
npm run pala -- evidence export --apply --target docs/evidence/exports/example.json
npm run pala -- evidence import --dry-run --target docs/evidence/exports/example.json
npm run pala -- evidence import --target docs/evidence/exports/example.json
```

## Export Contract

- Includes bounded decision, public-safe evidence, quality finding, and
  reference records.
- Includes a bounded `decision_review` summary collection with approval,
  evidence-status, age, escalation, priority, and review-reason signals.
- Excludes decision-review free-text reasons and evidence paths from that
  summary collection.
- Excludes raw logs, command text, decision inputs, root hashes, MCP config
  paths/diffs, and private DB fields.
- Redacts personal paths and secret-like values.
- Limits every collection to 100 records and the complete payload to
  1,000,000 bytes.
- Uses the `exact_counts_or_explicit_unknown` policy to report exported count,
  eligible count, count exactness, and `complete`, `truncated`, or
  `unknown_beyond_scan_limit` status for every collection.
- Writes only a new JSON file under `docs/evidence/exports/` when explicit
  `--apply` and `--target` are provided.
- Never overwrites an existing export.

Applied export writes use
`bounded_project_contained_atomic_create_only_evidence_export`. Missing parent
directories are created one segment at a time with a path-safety recheck after
each segment. The bounded JSON is written to a no-follow temporary handle and
published through an atomic create-only link. A target that already exists or
appears during the write is never overwritten; it returns an explicit blocker
or approval state. The
`atomic_create_only_one_winner_existing_target_needs_approval` policy makes
same-target concurrent publication explicit: exactly one writer can publish,
and competing writers return `needs_approval`. Concurrent parent creation is
`rechecked_eexist_tolerant`. After publication, the
`temporary_and_target_dev_ino_match` policy verifies that the target is still
the same file identity as the bounded temporary source; a same-size
replacement fails closed. Write failures expose no payload.
Temporary source identity follows
`write_handle_and_temporary_path_dev_ino_match`; cleanup unlinks the temp path
only while that created-file identity still matches.

## Payload Byte Budget

The `exact_utf8_json_bytes_with_80_percent_warning` policy reports the exact
UTF-8 byte count of the normalized `JSON.stringify(payload)` representation.
Exports, import inspections, validation results, and dashboard previews expose
`payload_bytes`, `max_payload_bytes`, `remaining_payload_bytes`,
`payload_utilization_percent`, and `payload_byte_status`.

`payload_byte_status` is `within_budget` below 80%, `near_limit` from 80%
through the 1,000,000-byte limit, and `over_limit` above the limit. Over-limit
payloads fail validation. This payload budget is not a raw on-disk file-size
preflight; whitespace in a project-local JSON target is outside this count.

## Raw File Preflight

The `stat_before_read_with_2mb_limit` policy checks the raw project-local JSON
file size before JSON parsing or reading file content. Files above 2,000,000
bytes return a raw-byte-limit blocker with `target_parse_performed: false`.
Valid-size import and migration inspections report `raw_file_byte_budget`
alongside explicit stat and parse-attempt truth.

The dashboard exposes this fixed import-preflight capability without selecting
a target, checking its size, reading it, or parsing it. It performs no import
or write.

## Target Path Safety

The `realpath_contained_no_symlinks` policy requires existing import, migration,
and comparison targets to resolve inside the project root without any symlink
or junction segment. New export targets must have a symlink-free parent path
whose nearest existing ancestor resolves inside the project root. A path-safety
failure blocks before target open, read, parse, import, or export write.
Target and ancestor existence uses
`single_lstat_with_enoent_only_missing_truth`: only `ENOENT` is treated as
missing; other inspection failures block rather than masquerading as absence.

The dashboard exposes this fixed target-path capability without checking a
target. It never claims that an operator-supplied path has passed.

## Single-handle File Inspection

The `single_fd_fstat_read_with_post_open_path_recheck` policy opens an accepted
target once, confirms it is a regular file with `fstat`, rechecks path safety
and file identity after opening, enforces the raw byte limit, then reads and
parses through that same file descriptor. It also checks that file size and
modification time stayed stable during the read.

`O_NOFOLLOW` is used when the runtime exposes it. The capability reports
`nofollow_supported` honestly; platforms without that flag still receive the
pre-open and post-open path checks, identity comparison, and same-handle read.
Directories and other non-regular targets are blocked before reading.

Descriptor-close failures follow `structured_fail_closed_no_throw`: a pending
parsed result is discarded and the caller receives `import_target_close_failed`
or `migration_target_close_failed` without an exchange payload. The dashboard
describes this fixed capability, including the `close_failed` reason, without
opening, reading, parsing, or closing a target.

## Strict Schema Shape

The `allowlisted_keys_and_fixed_safety_policy_values` policy rejects unknown
root fields, policy fields, and record collections. It also requires the fixed
sanitized-exchange safety values, including `public_safe_only: true`,
`raw_logs_excluded: true`, and `import_writes_allowed: false`, plus valid
excluded-private-runtime counts.

Validation and the dashboard report `schema_shape_status` as `valid` or
`invalid`. Collection-truncation metadata remains optional for earlier v2
exports, but unknown shape or weaker safety policy values do not.

## Record Value Validation

The `required_fields_types_enums_and_timestamps` policy validates required
fields and value types for every allowlisted collection. It checks closed
decision, risk, priority, escalation, evidence-status, and redaction enums;
timestamp syntax; ISO date-or-timestamp reference checks; boolean/0-or-1
approval values; numeric review ages; string arrays; and nullable HTTP(S)
reference URLs.

Validation and the dashboard report `record_validation_status` as `valid` or
`invalid`. Findings identify the invalid field path without echoing its value.

## Payload Complexity Guard

The `iterative_max_depth_32_max_nodes_50000` policy scans payload safety with an
iterative traversal capped at depth 32 and 50,000 nodes. Cycles, excessive
depth, or excessive node count stop validation before schema, record,
truncation, digest, or serialization-heavy work continues.

When the guard stops validation, byte-budget truth reports
`serialization_performed: false` and `payload_byte_status: unknown`; later
validation statuses report `not_checked`. The dashboard exposes the policy,
status, observed depth, and observed node count for the current safe preview.

## Import Contract

Import is validation-only. It checks a project-local JSON file against the
exchange schema and safety limits, then reports a digest and record counts.
It never writes to SQLite, ledgers, state, evidence, or project files.

Without `--dry-run`, `pala evidence import --target <file>` produces the
read-only `validated_target_digest_and_count_delta_approval_plan`. It validates
one stable target observation, compares that observation with the current
sanitized DB summary, and reports digest matches plus record-count deltas
without returning the payload. A matching target is a safe no-op. A changed
target returns `needs_approval` with
`real_evidence_import_write_disabled_by_policy`; the plan still performs no
import, write, or external call.

The `validate_when_present` policy verifies collection-truncation metadata
against actual collection array lengths, limits, exactness flags, and status
semantics. Validation reports `truncation_metadata_status` as `valid`,
`invalid`, or `not_present`; metadata-free earlier schema-v2 exports remain
accepted as `not_present`.

The real import write path remains intentionally disabled by policy and
requires a separate reviewed implementation plus explicit approval.

## Schema Compatibility

Schema version: `2`

Compatibility policy: `exact_match_only`. Only the current schema version is
accepted as compatible. Older or newer versions remain validation-only and
require a reviewed migration; Pala does not silently upgrade or downgrade
exchange data. Version 1 is now `older_than_supported` because version 2 adds
the allowlisted `decision_review` summary collection.

```bash
npm run pala -- evidence schema-check --strict
```

## Digests

Every export, import inspection, and dashboard preview reports two SHA-256
fingerprints:

- `digest_sha256` fingerprints the exact exchange, including `generated_at`.
- `content_digest_sha256` uses the
  `canonical_without_generated_at` policy: root object keys are canonicalized
  and `generated_at` is excluded, while record-array order and all evidence
  content remain significant.

The stable content digest lets operators compare unchanged sanitized evidence
across runs without returning or importing the payload.

## Digest Availability

The `explicit_exact_and_content_digest_availability` policy reports separate
availability status for exact and stable-content digests. Normal export,
preview, and safely serializable parsed imports report `available`.

Missing or invalid JSON targets report `unavailable` with
`not_computed_no_parsed_payload`. Parsed payloads stopped by complexity or safe
serialization limits report `unavailable` with
`complexity_or_serialization_failed`. Comparison preserves the target
`digest_availability` truth when it cannot run.

## generated_at Time Truth

The `iso_timestamp_with_5_minute_future_skew_limit` policy requires root
`generated_at` to be a valid ISO timestamp and no more than five minutes ahead
of the validation clock. Older timestamps remain valid.

Validation and the dashboard expose `generated_at_status`, bounded
`future_skew_ms`, and the fixed maximum skew without repeating the timestamp
value. Complexity-stopped validation reports this phase as `not_checked`.

## Temporal Consistency

The `generated_at_not_before_valid_record_timestamps` policy requires root
`generated_at` to be equal to or later than every valid record timestamp.
It checks decision, decision-review, public-evidence, and quality-finding
`created_at` values plus optional reference `last_checked_at` values.

Validation and the dashboard expose `temporal_consistency_status`, checked and
future record-timestamp counts, and the maximum ahead duration. A violation
reports the field path without echoing the timestamp value. This phase reports
`not_checked` when root time truth or record validation is not valid.

## Deterministic Collection Ordering

The `deterministic_per_collection_visible_field_order` policy normalizes and
validates each selected record collection using only fields present in the
sanitized exchange. Time-oriented collections are newest-first with explicit
visible-field tie breakers, references are category/name-first, and
decision-review summaries preserve priority/approval/age order with visible
tie breakers.

Validation and the dashboard expose `collection_ordering_status`, checked
collection and adjacent-pair counts, and the out-of-order pair count. A
violation reports only the second record's collection/index path. This phase
reports `not_checked` when record validation is not valid. Ordering truth does
not claim completeness or deterministic selection beyond the exported limit.

## Exact Duplicate-Record Truth

The `exact_canonical_record_identity_counts_only` policy checks each valid
selected collection for records whose sanitized canonical content is exactly
equal. It does not expose record identities or fingerprints, automatically
remove records, or claim anything about records beyond the export limit.

Validation and the dashboard expose `duplicate_record_status`, checked record
count, duplicate record count, and duplicate group count. Every repeated
record reports only its collection/index path. Duplicate presence requires
manual verification because exact repeats can distort count and digest
interpretation. This phase reports `not_checked` when record validation is not
valid.

## Validation Finding Budget

The `bounded_first_200_with_total_count` policy returns at most the first 200
field-path-only validation findings while separately counting every observed
finding. Validation phase status uses the true total count, so reaching the
return limit cannot make a later phase incorrectly appear valid.

Validation and the dashboard expose the maximum returned findings, true total,
returned and omitted counts, and `validation_findings_truncated`. The budget
limits response size without hiding whether additional findings exist.

## Validation Phase Execution

The `explicit_executed_skipped_with_dependency_reason` policy records whether
each validation phase executed or was skipped. Skipped phases carry a concrete
dependency reason such as `complexity_invalid`, `payload_not_object`,
`generated_at_not_valid`, or `record_validation_invalid`.

Validation returns the full phase matrix with each phase result. The dashboard
exposes overall `complete` or `partial` execution status, executed/skipped
counts, and `validation_phase_skip_reasons`. Phase execution status is separate
from payload acceptance status.

## Validation Finding Attribution

The `counts_only_by_validation_phase` policy attributes every observed finding
to the validation phase that produced it. It exposes phase counts only; it
does not expose record values, new fingerprints, or additional finding text.

Validation returns total, attributed, and unattributed counts plus the
per-phase count map. The dashboard exposes nonzero
`validation_finding_phase_counts` and the unattributed count. A nonzero
unattributed count indicates an implementation gap that requires review.

## No-file Content Assertion

```bash
npm run pala -- evidence assert-content --content-digest <sha256> --strict
```

The `expected_sha256_only_no_file_read` policy compares a caller-supplied
expected SHA-256 with the current stable content digest. A mismatch makes
strict mode fail. The assertion reads no baseline file, returns no payload,
performs no external call, and writes nothing.

## Completeness Check

```bash
npm run pala -- evidence completeness-check --strict
```

The `all_collections_complete_and_exact` policy passes only when every
sanitized evidence collection is `complete` with exact counts and the exchange
validates. Truncated or unknown collections make strict mode fail. The check
returns no payload, reads no target file, performs no external call, and
writes nothing.

## Validation-only Change Detection

```bash
npm run pala -- evidence compare --dry-run --target docs/evidence/exports/baseline.json
```

The `digest_and_count_delta_only` comparison policy validates a project-local
exchange, builds the current sanitized exchange in memory, and reports exact
and stable-content digest matches plus per-collection record-count deltas. It
returns no payload, imports nothing, performs no external call, and writes
nothing.

## Migration Plans and Readiness

```bash
npm run pala -- evidence migrate --dry-run --target docs/evidence/exports/legacy-v1.json
npm run pala -- evidence migrate --target docs/evidence/exports/legacy-v1.json
```

The only supported plan is schema v1 to v2. It validates a hypothetical v2
candidate with fixed safety policy values, a generated timestamp when missing,
and an empty `decision_review` collection, reports
`requires_source_project_reexport` for real decision-review summaries, and
performs no migration or write. The candidate payload is never returned.
Newer, malformed, or other unsupported versions require manual verification.
The non-dry-run command is still read-only. Its
`validated_source_schema_migration_readiness_approval_plan` reads and validates
one source observation: a valid current-schema exchange is a safe no-op, a
valid v1-to-v2 candidate is approval-gated while migration writes remain
disabled by policy, and invalid or unsupported sources are `not_ready`.

## Read-only Dashboard Preview

`/control/evidence-exchange/` reads `/api/route/evidence-exchange` and shows
collection counts, validation status, exact and stable content digests, and
excluded-private-row counts. Collection rows and the route summary explicitly
show truncation and count-exactness truth, and the dashboard summary exposes
`truncation_metadata_status`. The dashboard summary exposes completeness policy
and status without changing preview execution status. It also exposes strict
schema shape policy and validation status, plus the exact payload byte budget
and warning status, without returning the payload. Record validation policy and
status, payload complexity truth, and generated-at time truth are shown
separately. Temporal consistency status and bounded count/duration truth are
also shown without returning timestamp values. Deterministic collection
ordering status and bounded pair counts are shown without returning records.
Exact duplicate-record status and bounded count truth are shown without
returning record identities or fingerprints. Validation finding budget,
total/returned/omitted counts, and truncation truth are also visible. It shows
validation phase execution status, counts, and explicit skip reasons. It shows
counts-only validation finding attribution and unattributed-count truth. It shows
the fixed raw-file preflight capability without checking or parsing a target,
the fixed import-readiness capability without selecting or reading a target,
the target-free realpath/symlink safety capability, the fixed migration capability,
and the fixed migration-readiness capability without selecting or reading a
source. Migration capability truth includes supported source
versions, target version, `validation_only` mode, and the source-project
re-export requirement. The fixed comparison capability shows
the digest/count-only policy and safety boundaries, but does not read a
comparison target or run a comparison. The preview never returns the payload
or candidate payload. The fixed assertion capability shows the strict-capable
no-file policy but does not run an assertion or accept an expected digest.
The import-readiness capability describes target validation, digest/count
comparison, approval, payload-free, and no-write truth.
The migration-readiness capability describes source/candidate validation,
approval, payload-free, and no-write truth.
The preview never reads a target file, never writes an export, and never
imports or migrates data.
