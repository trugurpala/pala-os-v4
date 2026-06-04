import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { buildDecisionReviewQueue } from "./decision-review.ts";
import { PROJECT_ROOT, toProjectPath } from "./paths.ts";
import { redact } from "./redaction.ts";

const EXCHANGE_KIND = "pala-public-evidence-export";
const EXCHANGE_SCHEMA_VERSION = 2;
const MAX_RECORDS = 100;
const MAX_BYTES = 1_000_000;
const MAX_RAW_FILE_BYTES = 2_000_000;
const MAX_PAYLOAD_DEPTH = 32;
const MAX_PAYLOAD_NODES = 50_000;
const MAX_GENERATED_AT_FUTURE_SKEW_MS = 300_000;
const MAX_RETURNED_FINDINGS = 200;
const NEAR_LIMIT_RATIO = 0.8;
const FINDING_TOTAL_COUNT = Symbol("findingTotalCount");
const FINDING_PHASE_COUNTS = Symbol("findingPhaseCounts");
const FINDING_ACTIVE_PHASE = Symbol("findingActivePhase");
const FINDING_PHASE_NAMES = [
  "complexity",
  "generated_at",
  "schema_shape",
  "compatibility",
  "record_validation",
  "temporal_consistency",
  "collection_ordering",
  "duplicate_records",
  "truncation_metadata",
  "byte_budget"
];
const NOFOLLOW_FLAG = Number.isInteger(fs.constants.O_NOFOLLOW) ? fs.constants.O_NOFOLLOW : 0;
const FORBIDDEN_KEYS = new Set([
  "blockers_json",
  "command",
  "config_path_redacted",
  "evidence_path",
  "goal",
  "inputs_json",
  "proposed_diff_json",
  "raw_log_path",
  "root_path_hash"
]);
const SENSITIVE_TEXT = /[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s"']+|\/Users\/[^/\s"']+|\/home\/[^/\s"']+|Bearer\s+[A-Za-z0-9._~+/=-]+|(api[_-]?key|token|secret|password|authorization)\s*[:=]\s*["']?(?!<REDACTED>)[^"',}\s]+|sk-[A-Za-z0-9_-]{12,}/i;
const PRIVATE_LOCAL_PATH = /(?:^|[\\/])\.pala[\\/](?:archive|db|evidence[\\/]raw|ledger|private|secrets|state)(?:[\\/]|$)/i;
const PRIVATE_RUNTIME_DIRS = ["archive", "db", "evidence/raw", "ledger", "private", "secrets", "state"];
const PRIVATE_RUNTIME_SQL_PARAMS = PRIVATE_RUNTIME_DIRS.flatMap((dir) => [`%.pala/${dir}`, `%.pala/${dir}/%`]);
const TRUNCATION_STATUSES = new Set(["complete", "truncated", "unknown_beyond_scan_limit"]);
const ROOT_KEYS = new Set(["generated_at", "kind", "policy", "records", "schema_version"]);
const POLICY_KEYS = new Set([
  "collection_truncation",
  "decision_review_summary_only",
  "excluded_private_runtime_rows",
  "import_writes_allowed",
  "private_paths_redacted",
  "public_safe_only",
  "raw_logs_excluded"
]);
const FIXED_SAFETY_POLICY = Object.freeze({
  public_safe_only: true,
  raw_logs_excluded: true,
  private_paths_redacted: true,
  decision_review_summary_only: true,
  import_writes_allowed: false
});
const EXCLUDED_PRIVATE_RUNTIME_KEYS = new Set(["public_evidence", "quality_findings"]);
const ALLOWED_RECORD_KEYS = {
  decisions: new Set(["created_at", "decision", "decision_type", "reason", "required_approval", "risk_level"]),
  decision_review: new Set(["age_days", "base_priority", "created_at", "decision", "decision_type", "escalation_status", "evidence_status", "max_review_age_days", "priority", "required_approval", "review_reasons", "risk_level"]),
  public_evidence: new Set(["created_at", "kind", "path", "redaction_status"]),
  quality_findings: new Set(["category", "created_at", "file_path", "severity", "status", "summary"]),
  references: new Set(["category", "freshness_status", "last_checked_at", "lesson", "name", "pala_decision", "status", "url"])
};
const REQUIRED_RECORD_KEYS = {
  decisions: ALLOWED_RECORD_KEYS.decisions,
  decision_review: ALLOWED_RECORD_KEYS.decision_review,
  public_evidence: ALLOWED_RECORD_KEYS.public_evidence,
  quality_findings: new Set(["category", "created_at", "severity", "status", "summary"]),
  references: new Set(["category", "freshness_status", "name", "status"])
};
const DECISION_VALUES = new Set(["blocked", "needs_approval", "dry_run_only", "safe_local_write", "manual_verification_required", "pass_allowed", "safe_to_execute"]);
const RISK_VALUES = new Set(["unknown", "low", "medium", "high", "critical"]);
const PRIORITY_VALUES = new Set(["low", "medium", "high", "critical"]);
const EVIDENCE_STATUS_VALUES = new Set(["linked", "missing"]);
const ESCALATION_STATUS_VALUES = new Set(["within_window", "due_soon", "overdue"]);
const REDACTION_STATUS_VALUES = new Set(["unknown", "redacted", "verified", "not_required"]);
const RECORD_TIMESTAMP_FIELDS = Object.freeze({
  decisions: ["created_at"],
  decision_review: ["created_at"],
  public_evidence: ["created_at"],
  quality_findings: ["created_at"],
  references: ["last_checked_at"]
});
const COLLECTION_ORDERING_SPECS = Object.freeze({
  decisions: [
    ["created_at", "desc", "timestamp"],
    ["decision_type", "asc", "string"],
    ["decision", "asc", "string"],
    ["reason", "asc", "string"],
    ["risk_level", "asc", "string"],
    ["required_approval", "asc", "number"]
  ],
  decision_review: [
    ["priority", "asc", "priority"],
    ["required_approval", "desc", "number"],
    ["age_days", "desc", "number"],
    ["created_at", "desc", "timestamp"],
    ["decision_type", "asc", "string"],
    ["decision", "asc", "string"],
    ["risk_level", "asc", "string"],
    ["evidence_status", "asc", "string"],
    ["base_priority", "asc", "priority"],
    ["max_review_age_days", "asc", "number"],
    ["escalation_status", "asc", "string"],
    ["review_reasons", "asc", "canonical"]
  ],
  public_evidence: [
    ["created_at", "desc", "timestamp"],
    ["kind", "asc", "string"],
    ["path", "asc", "string"],
    ["redaction_status", "asc", "string"]
  ],
  quality_findings: [
    ["created_at", "desc", "timestamp"],
    ["category", "asc", "string"],
    ["severity", "asc", "string"],
    ["status", "asc", "string"],
    ["summary", "asc", "string"],
    ["file_path", "asc", "string"]
  ],
  references: [
    ["category", "asc", "string"],
    ["name", "asc", "string"],
    ["status", "asc", "string"],
    ["freshness_status", "asc", "string"],
    ["url", "asc", "string"],
    ["last_checked_at", "asc", "string"],
    ["lesson", "asc", "string"],
    ["pala_decision", "asc", "string"]
  ]
});
const ORDERING_PRIORITY_RANK = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });

export const EVIDENCE_EXCHANGE_CONTRACT = Object.freeze({
  kind: EXCHANGE_KIND,
  current_schema_version: EXCHANGE_SCHEMA_VERSION,
  supported_import_versions: [EXCHANGE_SCHEMA_VERSION],
  compatibility_policy: "exact_match_only",
  content_digest_policy: "canonical_without_generated_at",
  comparison_policy: "digest_and_count_delta_only",
  import_readiness_policy: "validated_target_digest_and_count_delta_approval_plan",
  migration_readiness_policy: "validated_source_schema_migration_readiness_approval_plan",
  content_assertion_policy: "expected_sha256_only_no_file_read",
  collection_truncation_policy: "exact_counts_or_explicit_unknown",
  truncation_metadata_validation_policy: "validate_when_present",
  completeness_policy: "all_collections_complete_and_exact",
  payload_byte_budget_policy: "exact_utf8_json_bytes_with_80_percent_warning",
  raw_file_byte_preflight_policy: "stat_before_read_with_2mb_limit",
  target_path_policy: "realpath_contained_no_symlinks",
  target_existence_probe_policy: "single_lstat_with_enoent_only_missing_truth",
  file_handle_inspection_policy: "single_fd_fstat_read_with_post_open_path_recheck",
  file_handle_close_failure_policy: "structured_fail_closed_no_throw",
  file_handle_close_failure_reason: "close_failed",
  schema_shape_policy: "allowlisted_keys_and_fixed_safety_policy_values",
  record_validation_policy: "required_fields_types_enums_and_timestamps",
  complexity_policy: "iterative_max_depth_32_max_nodes_50000",
  digest_availability_policy: "explicit_exact_and_content_digest_availability",
  generated_at_policy: "iso_timestamp_with_5_minute_future_skew_limit",
  temporal_consistency_policy: "generated_at_not_before_valid_record_timestamps",
  collection_ordering_policy: "deterministic_per_collection_visible_field_order",
  duplicate_record_policy: "exact_canonical_record_identity_counts_only",
  finding_budget_policy: "bounded_first_200_with_total_count",
  phase_execution_policy: "explicit_executed_skipped_with_dependency_reason",
  finding_attribution_policy: "counts_only_by_validation_phase",
  required_collections: Object.keys(ALLOWED_RECORD_KEYS),
  max_records_per_collection: MAX_RECORDS,
  max_bytes: MAX_BYTES
});

export const EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_atomic_create_only_evidence_export",
  max_raw_file_bytes: MAX_RAW_FILE_BYTES,
  parent_directory_creation_policy: "one_segment_at_a_time_with_path_recheck",
  concurrent_parent_creation_policy: "rechecked_eexist_tolerant",
  concurrent_publish_policy: "atomic_create_only_one_winner_existing_target_needs_approval",
  path_policy: EVIDENCE_EXCHANGE_CONTRACT.target_path_policy,
  temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match",
  identity_safe_temp_cleanup: true,
  post_publish_identity_policy: "temporary_and_target_dev_ino_match",
  atomic_create_link: true,
  overwrite_allowed: false,
  payload_exposed_on_failure: false,
  writes_outside_docs_evidence_exports_allowed: false
});

export const EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY = Object.freeze({
  supported_from_versions: [1],
  target_schema_version: EXCHANGE_SCHEMA_VERSION,
  mode: "validation_only",
  decision_review_population: "requires_source_project_reexport",
  candidate_payload_exposed: false,
  writes_allowed: false,
  migration_performed: false
});

export const EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.migration_readiness_policy,
  mode: "read_only_approval_plan",
  target_scope: "project_local_json",
  target_validation_required: true,
  supported_from_versions: [1],
  target_schema_version: EXCHANGE_SCHEMA_VERSION,
  candidate_validation_required: true,
  target_read_performed: false,
  candidate_validation_performed: false,
  candidate_payload_exposed: false,
  migration_performed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

export const EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.comparison_policy,
  mode: "validation_only",
  target_scope: "project_local_json",
  target_read_performed: false,
  payload_exposed: false,
  import_performed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

export const EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.content_assertion_policy,
  mode: "strict_capable_validation_only",
  assertion_performed: false,
  target_file_read: false,
  payload_exposed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

export const EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.raw_file_byte_preflight_policy,
  mode: "validation_only",
  target_scope: "project_local_json",
  max_raw_file_bytes: MAX_RAW_FILE_BYTES,
  target_stat_performed: false,
  target_parse_performed: false,
  payload_exposed: false,
  import_performed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

export const EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.import_readiness_policy,
  mode: "read_only_approval_plan",
  target_scope: "project_local_json",
  target_validation_required: true,
  comparison_required: true,
  target_read_performed: false,
  comparison_performed: false,
  payload_exposed: false,
  import_performed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

export const EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.target_path_policy,
  existence_probe_policy: EVIDENCE_EXCHANGE_CONTRACT.target_existence_probe_policy,
  mode: "validation_only",
  scope: "project_local_targets_and_export_parent",
  target_check_performed: false,
  realpath_check_performed: false,
  symlink_check_performed: false,
  target_read_performed: false,
  payload_exposed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

export const EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY = Object.freeze({
  policy: EVIDENCE_EXCHANGE_CONTRACT.file_handle_inspection_policy,
  close_failure_policy: EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_policy,
  close_failure_reason: EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_reason,
  mode: "validation_only",
  target_open_performed: false,
  target_fstat_performed: false,
  target_read_performed: false,
  target_parse_performed: false,
  target_close_performed: false,
  target_close_succeeded: null,
  post_open_path_recheck_performed: false,
  single_file_handle_used: false,
  nofollow_supported: NOFOLLOW_FLAG !== 0,
  payload_exposed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

function pathIsInside(root, target, allowRoot = false) {
  const relative = path.relative(root, target);
  return (allowRoot || relative !== "") && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pathHasSymlinkBelowRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let stats;
    try {
      stats = fs.lstatSync(current);
    } catch {
      break;
    }
    if (stats.isSymbolicLink()) return true;
  }
  return false;
}

function nearestExistingPath(target) {
  let current = target;
  while (path.dirname(current) !== current) {
    const entry = inspectPathEntry(current);
    if (entry.status !== "safe_to_execute") return null;
    if (entry.exists) return current;
    current = path.dirname(current);
  }
  const rootEntry = inspectPathEntry(current);
  return rootEntry.status === "safe_to_execute" && rootEntry.exists ? current : null;
}

function inspectTargetPathSafety(fullPath, projectRoot, options = {}) {
  const targetEntry = inspectPathEntry(fullPath);
  const targetEntryExists = targetEntry.status === "safe_to_execute" && targetEntry.exists;
  const inspectedPath = options.targetMustExist || targetEntryExists ? fullPath : path.dirname(fullPath);
  const existingPath = options.targetMustExist || targetEntryExists ? fullPath : nearestExistingPath(inspectedPath);
  const lexicalContained = pathIsInside(projectRoot, fullPath);
  const symlinkDetected = lexicalContained ? pathHasSymlinkBelowRoot(projectRoot, inspectedPath) : true;
  let realpathContained = false;
  try {
    if (lexicalContained && existingPath) {
      const realRoot = fs.realpathSync(projectRoot);
      const realExisting = fs.realpathSync(existingPath);
      realpathContained = pathIsInside(realRoot, realExisting, true);
    }
  } catch {
    realpathContained = false;
  }
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.target_path_policy,
    existence_probe_policy: EVIDENCE_EXCHANGE_CONTRACT.target_existence_probe_policy,
    status: targetEntry.status === "safe_to_execute" && lexicalContained && realpathContained && !symlinkDetected ? "safe_to_execute" : "blocked",
    lexical_contained: lexicalContained,
    realpath_contained: realpathContained,
    symlink_detected: symlinkDetected,
    target_check_performed: true,
    realpath_check_performed: true,
    symlink_check_performed: true
  };
}

function privateRuntimeSqlClause(column) {
  const normalized = `LOWER(REPLACE(COALESCE(${column}, ''), '\\', '/'))`;
  return PRIVATE_RUNTIME_DIRS.flatMap(() => [`${normalized} NOT LIKE ?`, `${normalized} NOT LIKE ?`]).join(" AND ");
}

function countRows(db, sql, params = []) {
  return Number(db.prepare(sql).get(...params)?.count || 0);
}

function truncationMetadata(exportedRecordCount, eligibleRecordCount, eligibleRecordCountExact = true, forcedStatus = null) {
  const truncationStatus = forcedStatus || (
    eligibleRecordCount > MAX_RECORDS
      ? "truncated"
      : eligibleRecordCountExact
        ? "complete"
        : "unknown_beyond_scan_limit"
  );
  return {
    max_records: MAX_RECORDS,
    exported_record_count: exportedRecordCount,
    eligible_record_count: eligibleRecordCount,
    eligible_record_count_exact: eligibleRecordCountExact,
    truncation_status: truncationStatus,
    truncated: truncationStatus === "truncated"
  };
}

function sqlCollection(db, selectSql, countSql, params = []) {
  const records = db.prepare(selectSql).all(...params, MAX_RECORDS);
  const eligibleRecordCount = countRows(db, countSql, params);
  return {
    records,
    truncation: truncationMetadata(records.length, eligibleRecordCount)
  };
}

function recordCounts(payload) {
  return Object.fromEntries(Object.entries(payload?.records || {}).map(([name, records]) => [name, Array.isArray(records) ? records.length : 0]));
}

function digest(payload) {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function digestAvailability(available, reason = null) {
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.digest_availability_policy,
    exact_digest_status: available ? "available" : "unavailable",
    content_digest_status: available ? "available" : "unavailable",
    reason: available ? null : reason
  };
}

function createFindingCollector() {
  const findings = [];
  findings[FINDING_TOTAL_COUNT] = 0;
  findings[FINDING_PHASE_COUNTS] = Object.fromEntries(FINDING_PHASE_NAMES.map((phase) => [phase, 0]));
  findings[FINDING_ACTIVE_PHASE] = null;
  Object.defineProperty(findings, "push", {
    enumerable: false,
    value: (...items) => {
      findings[FINDING_TOTAL_COUNT] += items.length;
      const phase = findings[FINDING_ACTIVE_PHASE];
      if (phase) findings[FINDING_PHASE_COUNTS][phase] += items.length;
      const remaining = Math.max(0, MAX_RETURNED_FINDINGS - findings.length);
      if (remaining > 0) Array.prototype.push.apply(findings, items.slice(0, remaining));
      return findings.length;
    }
  });
  return findings;
}

function withFindingPhase(findings, phase, callback) {
  const previous = findings[FINDING_ACTIVE_PHASE];
  findings[FINDING_ACTIVE_PHASE] = phase;
  try {
    return callback();
  } finally {
    findings[FINDING_ACTIVE_PHASE] = previous;
  }
}

function findingCount(findings) {
  return findings[FINDING_TOTAL_COUNT] ?? findings.length;
}

function findingBudgetState(findings) {
  const totalFindingCount = findingCount(findings);
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.finding_budget_policy,
    max_returned_findings: MAX_RETURNED_FINDINGS,
    total_finding_count: totalFindingCount,
    returned_finding_count: findings.length,
    omitted_finding_count: Math.max(0, totalFindingCount - findings.length),
    findings_truncated: totalFindingCount > findings.length
  };
}

function findingAttributionState(findings) {
  const totalFindingCount = findingCount(findings);
  const phases = { ...findings[FINDING_PHASE_COUNTS] };
  const attributedFindingCount = Object.values(phases).reduce((total, count) => total + count, 0);
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.finding_attribution_policy,
    total_finding_count: totalFindingCount,
    attributed_finding_count: attributedFindingCount,
    unattributed_finding_count: Math.max(0, totalFindingCount - attributedFindingCount),
    phases
  };
}

function validationPhaseExecution(input) {
  const complexityValid = input.complexity.status === "valid";
  const recordValidationValid = input.recordValidationStatus === "valid";
  const generatedAtValid = input.generatedAt.status === "valid";
  const objectPhaseReason = !complexityValid
    ? "complexity_invalid"
    : !input.payloadIsObject
      ? "payload_not_object"
      : null;
  const recordDependentReason = objectPhaseReason || (recordValidationValid ? null : "record_validation_invalid");
  const temporalReason = objectPhaseReason
    || (generatedAtValid ? null : "generated_at_not_valid")
    || (recordValidationValid ? null : "record_validation_invalid");
  const phases = {
    compatibility: { execution_status: "executed", result_status: input.compatibility.compatibility, skip_reason: null },
    complexity: { execution_status: "executed", result_status: input.complexity.status, skip_reason: null },
    byte_budget: complexityValid
      ? { execution_status: "executed", result_status: input.byteBudget.payload_byte_status, skip_reason: null }
      : { execution_status: "skipped", result_status: input.byteBudget.payload_byte_status, skip_reason: "complexity_invalid" },
    generated_at: complexityValid
      ? { execution_status: "executed", result_status: input.generatedAt.status, skip_reason: null }
      : { execution_status: "skipped", result_status: input.generatedAt.status, skip_reason: "complexity_invalid" },
    schema_shape: objectPhaseReason
      ? { execution_status: "skipped", result_status: input.schemaShapeStatus, skip_reason: objectPhaseReason }
      : { execution_status: "executed", result_status: input.schemaShapeStatus, skip_reason: null },
    record_validation: objectPhaseReason
      ? { execution_status: "skipped", result_status: input.recordValidationStatus, skip_reason: objectPhaseReason }
      : { execution_status: "executed", result_status: input.recordValidationStatus, skip_reason: null },
    temporal_consistency: temporalReason
      ? { execution_status: "skipped", result_status: input.temporalConsistency.status, skip_reason: temporalReason }
      : { execution_status: "executed", result_status: input.temporalConsistency.status, skip_reason: null },
    collection_ordering: recordDependentReason
      ? { execution_status: "skipped", result_status: input.collectionOrdering.status, skip_reason: recordDependentReason }
      : { execution_status: "executed", result_status: input.collectionOrdering.status, skip_reason: null },
    duplicate_records: recordDependentReason
      ? { execution_status: "skipped", result_status: input.duplicateRecords.status, skip_reason: recordDependentReason }
      : { execution_status: "executed", result_status: input.duplicateRecords.status, skip_reason: null },
    truncation_metadata: objectPhaseReason
      ? { execution_status: "skipped", result_status: input.truncationMetadataStatus, skip_reason: objectPhaseReason }
      : { execution_status: "executed", result_status: input.truncationMetadataStatus, skip_reason: null },
    finding_budget: {
      execution_status: "executed",
      result_status: input.findingBudget.findings_truncated ? "truncated" : "complete",
      skip_reason: null
    }
  };
  const entries = Object.values(phases);
  const skippedPhaseCount = entries.filter((phase) => phase.execution_status === "skipped").length;
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.phase_execution_policy,
    status: skippedPhaseCount > 0 ? "partial" : "complete",
    phase_count: entries.length,
    executed_phase_count: entries.length - skippedPhaseCount,
    skipped_phase_count: skippedPhaseCount,
    phases
  };
}

export function evidenceExchangeByteBudget(payload) {
  const nearLimitThresholdBytes = Math.ceil(MAX_BYTES * NEAR_LIMIT_RATIO);
  let serialized;
  try {
    serialized = JSON.stringify(payload) ?? "";
  } catch {
    return {
      policy: EVIDENCE_EXCHANGE_CONTRACT.payload_byte_budget_policy,
      payload_bytes: null,
      max_payload_bytes: MAX_BYTES,
      near_limit_threshold_bytes: nearLimitThresholdBytes,
      remaining_payload_bytes: null,
      payload_utilization_percent: null,
      payload_byte_status: "unknown",
      serialization_performed: false
    };
  }
  const payloadBytes = Buffer.byteLength(serialized, "utf8");
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.payload_byte_budget_policy,
    payload_bytes: payloadBytes,
    max_payload_bytes: MAX_BYTES,
    near_limit_threshold_bytes: nearLimitThresholdBytes,
    remaining_payload_bytes: MAX_BYTES - payloadBytes,
    payload_utilization_percent: Number(((payloadBytes / MAX_BYTES) * 100).toFixed(2)),
    serialization_performed: true,
    payload_byte_status: payloadBytes > MAX_BYTES
      ? "over_limit"
      : payloadBytes >= nearLimitThresholdBytes
        ? "near_limit"
        : "within_budget"
  };
}

function rawFileByteBudget(rawFileBytes) {
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.raw_file_byte_preflight_policy,
    raw_file_bytes: rawFileBytes,
    max_raw_file_bytes: MAX_RAW_FILE_BYTES,
    remaining_raw_file_bytes: MAX_RAW_FILE_BYTES - rawFileBytes,
    raw_file_byte_status: rawFileBytes > MAX_RAW_FILE_BYTES ? "over_limit" : "within_budget"
  };
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

export function evidenceExchangeContentDigest(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return digest(canonicalize(payload));
  }
  const { generated_at: _generatedAt, ...content } = payload;
  return digest(canonicalize(content));
}

function inspectPayloadComplexityAndSafety(payload, findings) {
  const stack = [{ value: payload, location: "$", depth: 0 }];
  const seen = new WeakSet();
  let observedNodeCount = 0;
  let observedMaxDepth = 0;
  let depthLimitExceeded = false;
  let nodeLimitExceeded = false;
  let cycleDetected = false;
  while (stack.length > 0) {
    const current = stack.pop();
    observedNodeCount += 1;
    observedMaxDepth = Math.max(observedMaxDepth, current.depth);
    if (observedNodeCount > MAX_PAYLOAD_NODES) {
      nodeLimitExceeded = true;
      findings.push({ location: current.location, summary: `Payload node count exceeds ${MAX_PAYLOAD_NODES}.` });
      break;
    }
    if (current.depth > MAX_PAYLOAD_DEPTH) {
      depthLimitExceeded = true;
      findings.push({ location: current.location, summary: `Payload depth exceeds ${MAX_PAYLOAD_DEPTH}.` });
      break;
    }
    const value = current.value;
    if (typeof value === "string") {
      if (SENSITIVE_TEXT.test(value)) findings.push({ location: current.location, summary: "Sensitive or personal text is present." });
      if (PRIVATE_LOCAL_PATH.test(value)) findings.push({ location: current.location, summary: "Private/local runtime path is present." });
      continue;
    }
    if (!value || typeof value !== "object") continue;
    if (seen.has(value)) {
      cycleDetected = true;
      findings.push({ location: current.location, summary: "Cyclic payload values are not allowed." });
      break;
    }
    seen.add(value);
    const children = Array.isArray(value)
      ? value.map((child, index) => ({ child, location: `${current.location}[${index}]` }))
      : Object.entries(value).map(([key, child]) => ({ key, child, location: `${current.location}.${key}` }));
    if (Array.isArray(value) && value.length > MAX_RECORDS) {
      findings.push({ location: current.location, summary: `Record array exceeds ${MAX_RECORDS} items.` });
    }
    if (observedNodeCount + stack.length + children.length > MAX_PAYLOAD_NODES) {
      observedNodeCount = MAX_PAYLOAD_NODES + 1;
      nodeLimitExceeded = true;
      findings.push({ location: current.location, summary: `Payload node count exceeds ${MAX_PAYLOAD_NODES}.` });
      break;
    }
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child.key && FORBIDDEN_KEYS.has(child.key)) {
        findings.push({ location: child.location, summary: "Forbidden private/raw field is present." });
      }
      stack.push({ value: child.child, location: child.location, depth: current.depth + 1 });
    }
  }
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.complexity_policy,
    status: depthLimitExceeded || nodeLimitExceeded || cycleDetected ? "invalid" : "valid",
    max_depth: MAX_PAYLOAD_DEPTH,
    max_nodes: MAX_PAYLOAD_NODES,
    observed_max_depth: observedMaxDepth,
    observed_node_count: observedNodeCount,
    depth_limit_exceeded: depthLimitExceeded,
    node_limit_exceeded: nodeLimitExceeded,
    cycle_detected: cycleDetected,
    iterative_scan_performed: true
  };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

function nullableString(value) {
  return value === null || value === undefined || typeof value === "string";
}

function timestamp(value) {
  return nonEmptyString(value) && /^\d{4}-\d{2}-\d{2}T/.test(value) && !Number.isNaN(Date.parse(value));
}

function nullableDateOrTimestamp(value) {
  return value === null
    || value === undefined
    || (nonEmptyString(value) && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(value) && !Number.isNaN(Date.parse(value)));
}

function validateGeneratedAt(payload, findings, nowMs) {
  const parsed = Date.parse(payload?.generated_at);
  if (!timestamp(payload?.generated_at)) {
    findings.push({ location: "$.generated_at", summary: "generated_at must be a valid ISO timestamp." });
    return {
      policy: EVIDENCE_EXCHANGE_CONTRACT.generated_at_policy,
      status: "invalid",
      parsed: false,
      future_skew_ms: null,
      max_future_skew_ms: MAX_GENERATED_AT_FUTURE_SKEW_MS
    };
  }
  const futureSkewMs = Math.max(0, parsed - nowMs);
  if (futureSkewMs > MAX_GENERATED_AT_FUTURE_SKEW_MS) {
    findings.push({ location: "$.generated_at", summary: `generated_at exceeds the ${MAX_GENERATED_AT_FUTURE_SKEW_MS}ms future-skew limit.` });
    return {
      policy: EVIDENCE_EXCHANGE_CONTRACT.generated_at_policy,
      status: "future_skew",
      parsed: true,
      future_skew_ms: futureSkewMs,
      max_future_skew_ms: MAX_GENERATED_AT_FUTURE_SKEW_MS
    };
  }
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.generated_at_policy,
    status: "valid",
    parsed: true,
    future_skew_ms: futureSkewMs,
    max_future_skew_ms: MAX_GENERATED_AT_FUTURE_SKEW_MS
  };
}

function temporalConsistencyState(overrides = {}) {
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.temporal_consistency_policy,
    status: "not_checked",
    checked_record_timestamp_count: 0,
    future_record_timestamp_count: 0,
    max_record_ahead_ms: null,
    ...overrides
  };
}

function validateTemporalConsistency(payload, generatedAt, recordValidationStatus, findings) {
  if (generatedAt.status !== "valid" || recordValidationStatus !== "valid") {
    return temporalConsistencyState();
  }
  const generatedAtMs = Date.parse(payload.generated_at);
  let checkedCount = 0;
  let futureCount = 0;
  let maxAheadMs = 0;
  for (const [collection, fields] of Object.entries(RECORD_TIMESTAMP_FIELDS)) {
    for (const [index, record] of payload.records[collection].entries()) {
      for (const field of fields) {
        const value = record[field];
        if (value === null || value === undefined) continue;
        const parsed = Date.parse(value);
        checkedCount += 1;
        if (parsed > generatedAtMs) {
          const aheadMs = parsed - generatedAtMs;
          futureCount += 1;
          maxAheadMs = Math.max(maxAheadMs, aheadMs);
          findings.push({
            location: `$.records.${collection}[${index}].${field}`,
            summary: "Record timestamp is after generated_at."
          });
        }
      }
    }
  }
  return temporalConsistencyState({
    status: futureCount > 0 ? "record_after_generated_at" : "valid",
    checked_record_timestamp_count: checkedCount,
    future_record_timestamp_count: futureCount,
    max_record_ahead_ms: futureCount > 0 ? maxAheadMs : 0
  });
}

function collectionOrderingState(overrides = {}) {
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.collection_ordering_policy,
    status: "not_checked",
    checked_collection_count: 0,
    checked_adjacent_pair_count: 0,
    out_of_order_pair_count: 0,
    collections: Object.fromEntries(Object.keys(COLLECTION_ORDERING_SPECS).map((collection) => [
      collection,
      { status: "not_checked", checked_adjacent_pair_count: 0, out_of_order_pair_count: 0 }
    ])),
    ...overrides
  };
}

function orderingValue(value, type) {
  if (value === null || value === undefined) return null;
  if (type === "timestamp") return Date.parse(value);
  if (type === "priority") return ORDERING_PRIORITY_RANK[value] ?? Number.MAX_SAFE_INTEGER;
  if (type === "number") return Number(value);
  if (type === "canonical") return JSON.stringify(canonicalize(value));
  return String(value);
}

function compareOrderingValues(left, right, direction) {
  if (left === right) return 0;
  if (left === null) return direction === "asc" ? -1 : 1;
  if (right === null) return direction === "asc" ? 1 : -1;
  const compared = left < right ? -1 : 1;
  return direction === "asc" ? compared : -compared;
}

function compareCollectionRecords(collection, left, right) {
  for (const [field, direction, type] of COLLECTION_ORDERING_SPECS[collection]) {
    const compared = compareOrderingValues(orderingValue(left[field], type), orderingValue(right[field], type), direction);
    if (compared !== 0) return compared;
  }
  return 0;
}

function sortEvidenceCollections(payload) {
  for (const collection of Object.keys(COLLECTION_ORDERING_SPECS)) {
    payload.records[collection].sort((left, right) => compareCollectionRecords(collection, left, right));
  }
  return payload;
}

function validateCollectionOrdering(payload, recordValidationStatus, findings) {
  if (recordValidationStatus !== "valid") return collectionOrderingState();
  const collections = {};
  let checkedAdjacentPairCount = 0;
  let outOfOrderPairCount = 0;
  for (const collection of Object.keys(COLLECTION_ORDERING_SPECS)) {
    const records = payload.records[collection];
    let collectionOutOfOrderCount = 0;
    for (let index = 1; index < records.length; index += 1) {
      checkedAdjacentPairCount += 1;
      if (compareCollectionRecords(collection, records[index - 1], records[index]) > 0) {
        collectionOutOfOrderCount += 1;
        outOfOrderPairCount += 1;
        findings.push({
          location: `$.records.${collection}[${index}]`,
          summary: "Collection record is outside the deterministic visible-field order."
        });
      }
    }
    collections[collection] = {
      status: collectionOutOfOrderCount > 0 ? "invalid" : "valid",
      checked_adjacent_pair_count: Math.max(0, records.length - 1),
      out_of_order_pair_count: collectionOutOfOrderCount
    };
  }
  return collectionOrderingState({
    status: outOfOrderPairCount > 0 ? "invalid" : "valid",
    checked_collection_count: Object.keys(COLLECTION_ORDERING_SPECS).length,
    checked_adjacent_pair_count: checkedAdjacentPairCount,
    out_of_order_pair_count: outOfOrderPairCount,
    collections
  });
}

function duplicateRecordState(overrides = {}) {
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.duplicate_record_policy,
    status: "not_checked",
    checked_collection_count: 0,
    checked_record_count: 0,
    duplicate_record_count: 0,
    duplicate_group_count: 0,
    collections: Object.fromEntries(Object.keys(ALLOWED_RECORD_KEYS).map((collection) => [
      collection,
      { status: "not_checked", checked_record_count: 0, duplicate_record_count: 0, duplicate_group_count: 0 }
    ])),
    ...overrides
  };
}

function validateDuplicateRecords(payload, recordValidationStatus, findings) {
  if (recordValidationStatus !== "valid") return duplicateRecordState();
  const collections = {};
  let checkedRecordCount = 0;
  let duplicateRecordCount = 0;
  let duplicateGroupCount = 0;
  for (const collection of Object.keys(ALLOWED_RECORD_KEYS)) {
    const records = payload.records[collection];
    const seen = new Map();
    const duplicateGroups = new Set();
    let collectionDuplicateRecordCount = 0;
    for (const [index, record] of records.entries()) {
      checkedRecordCount += 1;
      const identity = JSON.stringify(canonicalize(record));
      if (seen.has(identity)) {
        collectionDuplicateRecordCount += 1;
        duplicateRecordCount += 1;
        duplicateGroups.add(identity);
        findings.push({
          location: `$.records.${collection}[${index}]`,
          summary: "Exact duplicate sanitized record repeats an earlier record in this collection."
        });
      } else {
        seen.set(identity, index);
      }
    }
    duplicateGroupCount += duplicateGroups.size;
    collections[collection] = {
      status: collectionDuplicateRecordCount > 0 ? "duplicates_present" : "valid",
      checked_record_count: records.length,
      duplicate_record_count: collectionDuplicateRecordCount,
      duplicate_group_count: duplicateGroups.size
    };
  }
  return duplicateRecordState({
    status: duplicateRecordCount > 0 ? "duplicates_present" : "valid",
    checked_collection_count: Object.keys(ALLOWED_RECORD_KEYS).length,
    checked_record_count: checkedRecordCount,
    duplicate_record_count: duplicateRecordCount,
    duplicate_group_count: duplicateGroupCount,
    collections
  });
}

function booleanLike(value) {
  return typeof value === "boolean" || value === 0 || value === 1;
}

function nonNegativeNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function stringArray(value) {
  return Array.isArray(value) && value.every(nonEmptyString);
}

function nullableHttpUrl(value) {
  if (value === null || value === undefined) return true;
  if (!nonEmptyString(value)) return false;
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const RECORD_FIELD_RULES = {
  decisions: {
    created_at: [timestamp, "a valid timestamp string"],
    decision: [(value) => DECISION_VALUES.has(value), "a recognized decision value"],
    decision_type: [nonEmptyString, "a non-empty string"],
    reason: [nonEmptyString, "a non-empty string"],
    required_approval: [booleanLike, "a boolean or 0/1"],
    risk_level: [(value) => RISK_VALUES.has(value), "a recognized risk level"]
  },
  decision_review: {
    age_days: [nonNegativeNumber, "a non-negative number"],
    base_priority: [(value) => PRIORITY_VALUES.has(value), "a recognized priority"],
    created_at: [timestamp, "a valid timestamp string"],
    decision: [(value) => DECISION_VALUES.has(value), "a recognized decision value"],
    decision_type: [nonEmptyString, "a non-empty string"],
    escalation_status: [(value) => ESCALATION_STATUS_VALUES.has(value), "a recognized escalation status"],
    evidence_status: [(value) => EVIDENCE_STATUS_VALUES.has(value), "a recognized evidence status"],
    max_review_age_days: [positiveNumber, "a positive number"],
    priority: [(value) => PRIORITY_VALUES.has(value), "a recognized priority"],
    required_approval: [(value) => typeof value === "boolean", "a boolean"],
    review_reasons: [stringArray, "an array of non-empty strings"],
    risk_level: [(value) => RISK_VALUES.has(value), "a recognized risk level"]
  },
  public_evidence: {
    created_at: [timestamp, "a valid timestamp string"],
    kind: [nonEmptyString, "a non-empty string"],
    path: [nonEmptyString, "a non-empty string"],
    redaction_status: [(value) => REDACTION_STATUS_VALUES.has(value), "a recognized redaction status"]
  },
  quality_findings: {
    category: [nonEmptyString, "a non-empty string"],
    created_at: [timestamp, "a valid timestamp string"],
    file_path: [nullableString, "a string or null"],
    severity: [(value) => RISK_VALUES.has(value), "a recognized severity"],
    status: [nonEmptyString, "a non-empty string"],
    summary: [nonEmptyString, "a non-empty string"]
  },
  references: {
    category: [nonEmptyString, "a non-empty string"],
    freshness_status: [nonEmptyString, "a non-empty string"],
    last_checked_at: [nullableDateOrTimestamp, "a valid ISO date or timestamp string or null"],
    lesson: [nullableString, "a string or null"],
    name: [nonEmptyString, "a non-empty string"],
    pala_decision: [nullableString, "a string or null"],
    status: [nonEmptyString, "a non-empty string"],
    url: [nullableHttpUrl, "an HTTP(S) URL or null"]
  }
};

function validateRecordCollections(payload, findings) {
  const startFindingCount = findingCount(findings);
  for (const [collection, allowedKeys] of Object.entries(ALLOWED_RECORD_KEYS)) {
    const records = payload.records?.[collection];
    if (!Array.isArray(records)) {
      findings.push({ location: `$.records.${collection}`, summary: "Required record collection must be an array." });
      continue;
    }
    records.forEach((record, index) => {
      if (!record || typeof record !== "object" || Array.isArray(record)) {
        findings.push({ location: `$.records.${collection}[${index}]`, summary: "Record must be a JSON object." });
        return;
      }
      for (const key of Object.keys(record)) {
        if (!allowedKeys.has(key)) {
          findings.push({ location: `$.records.${collection}[${index}].${key}`, summary: "Record field is not allowlisted for this collection." });
        }
      }
      for (const key of REQUIRED_RECORD_KEYS[collection]) {
        if (!Object.hasOwn(record, key)) {
          findings.push({ location: `$.records.${collection}[${index}].${key}`, summary: "Required record field is missing." });
        }
      }
      for (const [key, value] of Object.entries(record)) {
        const rule = RECORD_FIELD_RULES[collection]?.[key];
        if (rule && !rule[0](value)) {
          findings.push({ location: `$.records.${collection}[${index}].${key}`, summary: `Record field must be ${rule[1]}.` });
        }
      }
    });
  }
  return findingCount(findings) === startFindingCount ? "valid" : "invalid";
}

function validateSchemaShape(payload, findings) {
  const startFindingCount = findingCount(findings);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "invalid";
  for (const key of Object.keys(payload)) {
    if (!ROOT_KEYS.has(key)) findings.push({ location: `$.${key}`, summary: "Root field is not allowlisted for this schema." });
  }
  for (const key of ROOT_KEYS) {
    if (!Object.hasOwn(payload, key)) findings.push({ location: `$.${key}`, summary: "Required root field is missing." });
  }
  if (typeof payload.generated_at !== "string" || payload.generated_at.length === 0) {
    findings.push({ location: "$.generated_at", summary: "generated_at must be a non-empty string." });
  }

  const policy = payload.policy;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    findings.push({ location: "$.policy", summary: "Policy must be a JSON object." });
  } else {
    for (const key of Object.keys(policy)) {
      if (!POLICY_KEYS.has(key)) findings.push({ location: `$.policy.${key}`, summary: "Policy field is not allowlisted for this schema." });
    }
    for (const [key, expected] of Object.entries(FIXED_SAFETY_POLICY)) {
      if (policy[key] !== expected) findings.push({ location: `$.policy.${key}`, summary: `Safety policy value must equal ${String(expected)}.` });
    }
    const excluded = policy.excluded_private_runtime_rows;
    if (!excluded || typeof excluded !== "object" || Array.isArray(excluded)) {
      findings.push({ location: "$.policy.excluded_private_runtime_rows", summary: "Excluded-private-runtime counts must be an object." });
    } else {
      for (const key of Object.keys(excluded)) {
        if (!EXCLUDED_PRIVATE_RUNTIME_KEYS.has(key)) findings.push({ location: `$.policy.excluded_private_runtime_rows.${key}`, summary: "Excluded-private-runtime count names an unknown collection." });
      }
      for (const key of EXCLUDED_PRIVATE_RUNTIME_KEYS) {
        if (!Number.isInteger(excluded[key]) || excluded[key] < 0) {
          findings.push({ location: `$.policy.excluded_private_runtime_rows.${key}`, summary: "Excluded-private-runtime count must be a non-negative integer." });
        }
      }
    }
  }

  const records = payload.records;
  if (!records || typeof records !== "object" || Array.isArray(records)) {
    findings.push({ location: "$.records", summary: "Records must be a JSON object." });
  } else {
    for (const key of Object.keys(records)) {
      if (!Object.hasOwn(ALLOWED_RECORD_KEYS, key)) findings.push({ location: `$.records.${key}`, summary: "Record collection is not allowlisted for this schema." });
    }
  }
  return findingCount(findings) === startFindingCount ? "valid" : "invalid";
}

function validateCollectionTruncation(payload, findings) {
  const metadata = payload?.policy?.collection_truncation;
  if (metadata === undefined) return "not_present";
  const startFindingCount = findingCount(findings);
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    findings.push({ location: "$.policy.collection_truncation", summary: "Collection truncation metadata must be an object." });
    return "invalid";
  }
  const requiredCollections = Object.keys(ALLOWED_RECORD_KEYS);
  for (const collection of Object.keys(metadata)) {
    if (!requiredCollections.includes(collection)) {
      findings.push({ location: `$.policy.collection_truncation.${collection}`, summary: "Collection truncation metadata names an unknown collection." });
    }
  }
  for (const collection of requiredCollections) {
    const location = `$.policy.collection_truncation.${collection}`;
    const entry = metadata[collection];
    const records = payload.records?.[collection];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      findings.push({ location, summary: "Required collection truncation metadata is missing or invalid." });
      continue;
    }
    const exportedCount = entry.exported_record_count;
    const eligibleCount = entry.eligible_record_count;
    const countExact = entry.eligible_record_count_exact;
    const maxRecords = entry.max_records;
    const status = entry.truncation_status;
    const truncated = entry.truncated;
    if (!Number.isInteger(exportedCount) || exportedCount < 0 || exportedCount !== records?.length) {
      findings.push({ location: `${location}.exported_record_count`, summary: "Exported record count must equal the collection array length." });
    }
    if (!Number.isInteger(eligibleCount) || eligibleCount < 0 || eligibleCount < (Number.isInteger(exportedCount) ? exportedCount : 0)) {
      findings.push({ location: `${location}.eligible_record_count`, summary: "Eligible record count must be an integer at least as large as exported count." });
    }
    if (typeof countExact !== "boolean") {
      findings.push({ location: `${location}.eligible_record_count_exact`, summary: "Eligible record count exactness must be boolean." });
    }
    if (maxRecords !== MAX_RECORDS) {
      findings.push({ location: `${location}.max_records`, summary: `Collection max_records must equal ${MAX_RECORDS}.` });
    }
    if (!TRUNCATION_STATUSES.has(status)) {
      findings.push({ location: `${location}.truncation_status`, summary: "Collection truncation status is not recognized." });
    }
    if (typeof truncated !== "boolean" || truncated !== (status === "truncated")) {
      findings.push({ location: `${location}.truncated`, summary: "Collection truncated flag must agree with truncation status." });
    }
    if (status === "complete" && (countExact !== true || eligibleCount !== exportedCount)) {
      findings.push({ location: `${location}.truncation_status`, summary: "Complete collections require exact equal eligible and exported counts." });
    }
    if (status === "truncated" && (exportedCount !== MAX_RECORDS || !Number.isInteger(eligibleCount) || eligibleCount <= MAX_RECORDS)) {
      findings.push({ location: `${location}.truncation_status`, summary: "Truncated collections must export the maximum and have more eligible records." });
    }
    if (status === "unknown_beyond_scan_limit" && (countExact !== false || (Number.isInteger(eligibleCount) && eligibleCount > MAX_RECORDS))) {
      findings.push({ location: `${location}.truncation_status`, summary: "Unknown truncation requires an inexact eligible count that does not already prove truncation." });
    }
  }
  return findingCount(findings) === startFindingCount ? "valid" : "invalid";
}

export function evidenceExchangeCompatibility(payload) {
  const kind = payload?.kind;
  const schemaVersion = payload?.schema_version;
  let compatibility = "compatible";
  if (kind !== EXCHANGE_KIND) {
    compatibility = "unrecognized_exchange_kind";
  } else if (!Number.isInteger(schemaVersion)) {
    compatibility = "unrecognized_schema_version";
  } else if (schemaVersion > EXCHANGE_SCHEMA_VERSION) {
    compatibility = "newer_than_supported";
  } else if (schemaVersion < EXCHANGE_SCHEMA_VERSION) {
    compatibility = "older_than_supported";
  }
  return {
    status: compatibility === "compatible" ? "safe_to_execute" : "manual_verification_required",
    compatibility,
    observed_kind: kind || null,
    observed_schema_version: Number.isInteger(schemaVersion) ? schemaVersion : null,
    supported_kind: EXCHANGE_KIND,
    current_schema_version: EXCHANGE_SCHEMA_VERSION,
    supported_import_versions: EVIDENCE_EXCHANGE_CONTRACT.supported_import_versions,
    compatibility_policy: EVIDENCE_EXCHANGE_CONTRACT.compatibility_policy,
    writes_performed: false,
    note: "Evidence exchange imports use exact schema matching; older or newer versions require a reviewed migration."
  };
}

export function validateEvidenceExchange(payload, options = {}) {
  const findings = createFindingCollector();
  const compatibility = evidenceExchangeCompatibility(payload);
  const complexity = withFindingPhase(findings, "complexity", () => inspectPayloadComplexityAndSafety(payload, findings));
  const payloadIsObject = Boolean(payload && typeof payload === "object" && !Array.isArray(payload));
  const nowMs = Number.isFinite(options.nowMs) ? options.nowMs : Date.now();
  const byteBudget = complexity.status === "valid"
    ? evidenceExchangeByteBudget(payload)
    : {
        policy: EVIDENCE_EXCHANGE_CONTRACT.payload_byte_budget_policy,
        payload_bytes: null,
        max_payload_bytes: MAX_BYTES,
        near_limit_threshold_bytes: Math.ceil(MAX_BYTES * NEAR_LIMIT_RATIO),
        remaining_payload_bytes: null,
        payload_utilization_percent: null,
        payload_byte_status: "unknown",
        serialization_performed: false
      };
  let truncationMetadataStatus = "not_present";
  let schemaShapeStatus = "invalid";
  let recordValidationStatus = "invalid";
  let temporalConsistency = temporalConsistencyState();
  let collectionOrdering = collectionOrderingState();
  let duplicateRecords = duplicateRecordState();
  if (complexity.status !== "valid") {
    const generatedAt = {
      policy: EVIDENCE_EXCHANGE_CONTRACT.generated_at_policy,
      status: "not_checked",
      parsed: false,
      future_skew_ms: null,
      max_future_skew_ms: MAX_GENERATED_AT_FUTURE_SKEW_MS
    };
    const findingBudget = findingBudgetState(findings);
    const findingAttribution = findingAttributionState(findings);
    const phaseExecution = validationPhaseExecution({
      payloadIsObject,
      compatibility,
      complexity,
      byteBudget,
      generatedAt,
      schemaShapeStatus: "not_checked",
      recordValidationStatus: "not_checked",
      temporalConsistency,
      collectionOrdering,
      duplicateRecords,
      truncationMetadataStatus: "not_checked",
      findingBudget
    });
    return {
      status: "manual_verification_required",
      findings,
      max_records_per_collection: MAX_RECORDS,
      max_bytes: MAX_BYTES,
      byte_budget: byteBudget,
      finding_budget: findingBudget,
      finding_attribution: findingAttribution,
      phase_execution: phaseExecution,
      complexity,
      generated_at: generatedAt,
      temporal_consistency: temporalConsistency,
      collection_ordering: collectionOrdering,
      duplicate_records: duplicateRecords,
      schema_shape_status: "not_checked",
      record_validation_status: "not_checked",
      truncation_metadata_status: "not_checked",
      compatibility,
      note: "Complexity limits stop validation before recursive or serialization-heavy work; findings identify fields only and never echo source text."
    };
  }
  const generatedAt = withFindingPhase(findings, "generated_at", () => validateGeneratedAt(payload, findings, nowMs));
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    withFindingPhase(findings, "schema_shape", () => {
      findings.push({ location: "$", summary: "Exchange payload must be a JSON object." });
    });
  } else {
    schemaShapeStatus = withFindingPhase(findings, "schema_shape", () => validateSchemaShape(payload, findings));
    withFindingPhase(findings, "compatibility", () => {
      if (payload.kind !== EXCHANGE_KIND) findings.push({ location: "$.kind", summary: "Exchange kind is not recognized." });
      if (payload.schema_version !== EXCHANGE_SCHEMA_VERSION) findings.push({ location: "$.schema_version", summary: "Exchange schema version is not supported." });
    });
    recordValidationStatus = withFindingPhase(findings, "record_validation", () => validateRecordCollections(payload, findings));
    temporalConsistency = withFindingPhase(findings, "temporal_consistency", () => validateTemporalConsistency(payload, generatedAt, recordValidationStatus, findings));
    collectionOrdering = withFindingPhase(findings, "collection_ordering", () => validateCollectionOrdering(payload, recordValidationStatus, findings));
    duplicateRecords = withFindingPhase(findings, "duplicate_records", () => validateDuplicateRecords(payload, recordValidationStatus, findings));
    truncationMetadataStatus = withFindingPhase(findings, "truncation_metadata", () => validateCollectionTruncation(payload, findings));
    if (byteBudget.payload_byte_status === "over_limit") {
      withFindingPhase(findings, "byte_budget", () => {
        findings.push({ location: "$", summary: `Exchange payload exceeds ${MAX_BYTES} bytes.` });
      });
    }
    if (byteBudget.payload_byte_status === "unknown") {
      withFindingPhase(findings, "byte_budget", () => {
        findings.push({ location: "$", summary: "Exchange payload could not be serialized safely." });
      });
    }
  }
  const findingBudget = findingBudgetState(findings);
  const findingAttribution = findingAttributionState(findings);
  const phaseExecution = validationPhaseExecution({
    payloadIsObject,
    compatibility,
    complexity,
    byteBudget,
    generatedAt,
    schemaShapeStatus,
    recordValidationStatus,
    temporalConsistency,
    collectionOrdering,
    duplicateRecords,
    truncationMetadataStatus,
    findingBudget
  });
  return {
    status: findingCount(findings) === 0 ? "safe_to_execute" : "manual_verification_required",
    findings,
    max_records_per_collection: MAX_RECORDS,
    max_bytes: MAX_BYTES,
    byte_budget: byteBudget,
    finding_budget: findingBudget,
    finding_attribution: findingAttribution,
    phase_execution: phaseExecution,
    complexity,
    generated_at: generatedAt,
    temporal_consistency: temporalConsistency,
    collection_ordering: collectionOrdering,
    duplicate_records: duplicateRecords,
    schema_shape_status: schemaShapeStatus,
    record_validation_status: recordValidationStatus,
    truncation_metadata_status: truncationMetadataStatus,
    compatibility,
    note: "Validation findings identify fields only and never echo sensitive source text."
  };
}

export function buildSanitizedEvidenceExport(db) {
  const decisions = sqlCollection(db, `
    SELECT decision_type, decision, reason, risk_level, required_approval, created_at
    FROM decisions
    ORDER BY created_at DESC, decision_type ASC, decision ASC, reason ASC, risk_level ASC, required_approval ASC
    LIMIT ?
  `, "SELECT COUNT(*) AS count FROM decisions");
  const publicEvidence = sqlCollection(db, `
    SELECT kind, path, redaction_status, created_at
    FROM evidence
    WHERE is_public_safe = 1 AND ${privateRuntimeSqlClause("path")}
    ORDER BY created_at DESC, kind ASC, path ASC, redaction_status ASC
    LIMIT ?
  `, `
    SELECT COUNT(*) AS count FROM evidence
    WHERE is_public_safe = 1 AND ${privateRuntimeSqlClause("path")}
  `, PRIVATE_RUNTIME_SQL_PARAMS);
  const qualityFindings = sqlCollection(db, `
    SELECT category, severity, summary, file_path, status, created_at
    FROM quality_findings
    WHERE ${privateRuntimeSqlClause("file_path")}
    ORDER BY created_at DESC, category ASC, severity ASC, status ASC, summary ASC, file_path ASC
    LIMIT ?
  `, `
    SELECT COUNT(*) AS count FROM quality_findings
    WHERE ${privateRuntimeSqlClause("file_path")}
  `, PRIVATE_RUNTIME_SQL_PARAMS);
  const references = sqlCollection(db, `
    SELECT category, name, url, status, freshness_status, lesson, pala_decision, last_checked_at
    FROM reference_sources
    ORDER BY category ASC, name ASC, status ASC, freshness_status ASC, url ASC,
      last_checked_at ASC, lesson ASC, pala_decision ASC
    LIMIT ?
  `, "SELECT COUNT(*) AS count FROM reference_sources");
  const decisionReview = buildDecisionReviewQueue(db, { maxQueue: MAX_RECORDS });
  const decisionReviewRows = decisionReview.queue.map((item) => ({
    decision_type: item.decision_type,
    decision: item.decision,
    risk_level: item.risk_level,
    required_approval: item.required_approval,
    evidence_status: item.evidence_status,
    created_at: item.created_at,
    base_priority: item.base_priority,
    priority: item.priority,
    age_days: item.age_days,
    max_review_age_days: item.max_review_age_days,
    escalation_status: item.escalation_status,
    review_reasons: item.review_reasons
  }));
  const decisionReviewTruncation = truncationMetadata(
    decisionReviewRows.length,
    decisionReview.review_candidate_count,
    !decisionReview.scan_truncated,
    decisionReview.queue_truncated
      ? "truncated"
      : decisionReview.scan_truncated
        ? "unknown_beyond_scan_limit"
        : "complete"
  );
  const collectionTruncation = {
    decisions: decisions.truncation,
    decision_review: decisionReviewTruncation,
    public_evidence: publicEvidence.truncation,
    quality_findings: qualityFindings.truncation,
    references: references.truncation
  };
  const publicEvidenceSourceCount = countRows(db, "SELECT COUNT(*) AS count FROM evidence WHERE is_public_safe = 1");
  const qualityFindingSourceCount = countRows(db, "SELECT COUNT(*) AS count FROM quality_findings");
  const payload = {
    kind: EXCHANGE_KIND,
    schema_version: EXCHANGE_SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    policy: {
      public_safe_only: true,
      raw_logs_excluded: true,
      private_paths_redacted: true,
      decision_review_summary_only: true,
      import_writes_allowed: false,
      collection_truncation: collectionTruncation,
      excluded_private_runtime_rows: {
        public_evidence: publicEvidenceSourceCount - publicEvidence.truncation.eligible_record_count,
        quality_findings: qualityFindingSourceCount - qualityFindings.truncation.eligible_record_count
      }
    },
    records: {
      decisions: decisions.records,
      decision_review: decisionReviewRows,
      public_evidence: publicEvidence.records,
      quality_findings: qualityFindings.records,
      references: references.records
    }
  };
  const sanitizedPayload = sortEvidenceCollections(JSON.parse(redact(payload)));
  const validation = validateEvidenceExchange(sanitizedPayload);
  return {
    status: validation.status,
    payload: sanitizedPayload,
    validation,
    digest_sha256: digest(sanitizedPayload),
    content_digest_sha256: evidenceExchangeContentDigest(sanitizedPayload),
    digest_availability: digestAvailability(true),
    byte_budget: validation.byte_budget,
    record_counts: recordCounts(sanitizedPayload),
    collection_truncation: sanitizedPayload.policy.collection_truncation,
    writes_performed: false,
    note: "Sanitized export is built from allowlisted local DB fields; raw logs and private DB fields are excluded."
  };
}

export function buildEvidenceExchangePreview(db) {
  const built = buildSanitizedEvidenceExport(db);
  const excluded = built.payload.policy.excluded_private_runtime_rows;
  const rows = Object.entries(built.record_counts).map(([collection, recordCount]) => ({
    collection,
    record_count: recordCount,
    max_records: built.validation.max_records_per_collection,
    eligible_record_count: built.collection_truncation[collection].eligible_record_count,
    eligible_record_count_exact: built.collection_truncation[collection].eligible_record_count_exact,
    truncation_status: built.collection_truncation[collection].truncation_status,
    truncated: built.collection_truncation[collection].truncated,
    excluded_private_runtime_rows: excluded[collection] || 0
  }));
  const truncatedCollectionCount = rows.filter((row) => row.truncation_status === "truncated").length;
  const unknownTruncationCollectionCount = rows.filter((row) => row.truncation_status === "unknown_beyond_scan_limit").length;
  const incompleteCollectionCount = truncatedCollectionCount + unknownTruncationCollectionCount;
  const completenessStatus = built.validation.status === "safe_to_execute" && incompleteCollectionCount === 0
    ? "complete"
    : "incomplete";
  const completeness = {
    policy: EVIDENCE_EXCHANGE_CONTRACT.completeness_policy,
    status: completenessStatus,
    incomplete_collection_count: incompleteCollectionCount,
    truncated_collection_count: truncatedCollectionCount,
    unknown_collection_count: unknownTruncationCollectionCount,
    validation_status: built.validation.status,
    truncation_metadata_status: built.validation.truncation_metadata_status,
    writes_performed: false
  };
  return {
    status: built.status,
    validation: built.validation,
    digest_sha256: built.digest_sha256,
    content_digest_sha256: built.content_digest_sha256,
    digest_availability: built.digest_availability,
    byte_budget: built.byte_budget,
    record_counts: built.record_counts,
    collection_truncation: built.collection_truncation,
    migration_capability: EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY,
    migration_readiness_capability: EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY,
    comparison_capability: EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY,
    assertion_capability: EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY,
    import_preflight_capability: EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY,
    import_readiness_capability: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY,
    target_path_capability: EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY,
    file_handle_capability: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY,
    completeness,
    rows,
    route_summary: {
      status: built.status,
      collection_count: rows.length,
      total_record_count: rows.reduce((total, row) => total + row.record_count, 0),
      truncated_collection_count: truncatedCollectionCount,
      unknown_truncation_collection_count: unknownTruncationCollectionCount,
      all_collection_counts_exact: unknownTruncationCollectionCount === 0,
      truncation_metadata_status: built.validation.truncation_metadata_status,
      schema_shape_policy: EVIDENCE_EXCHANGE_CONTRACT.schema_shape_policy,
      schema_shape_status: built.validation.schema_shape_status,
      record_validation_policy: EVIDENCE_EXCHANGE_CONTRACT.record_validation_policy,
      record_validation_status: built.validation.record_validation_status,
      complexity_policy: EVIDENCE_EXCHANGE_CONTRACT.complexity_policy,
      complexity_status: built.validation.complexity.status,
      observed_payload_depth: built.validation.complexity.observed_max_depth,
      observed_payload_nodes: built.validation.complexity.observed_node_count,
      generated_at_policy: built.validation.generated_at.policy,
      generated_at_status: built.validation.generated_at.status,
      generated_at_future_skew_ms: built.validation.generated_at.future_skew_ms,
      max_generated_at_future_skew_ms: built.validation.generated_at.max_future_skew_ms,
      temporal_consistency_policy: built.validation.temporal_consistency.policy,
      temporal_consistency_status: built.validation.temporal_consistency.status,
      checked_record_timestamp_count: built.validation.temporal_consistency.checked_record_timestamp_count,
      future_record_timestamp_count: built.validation.temporal_consistency.future_record_timestamp_count,
      max_record_ahead_ms: built.validation.temporal_consistency.max_record_ahead_ms,
      collection_ordering_policy: built.validation.collection_ordering.policy,
      collection_ordering_status: built.validation.collection_ordering.status,
      checked_ordering_collection_count: built.validation.collection_ordering.checked_collection_count,
      checked_adjacent_pair_count: built.validation.collection_ordering.checked_adjacent_pair_count,
      out_of_order_pair_count: built.validation.collection_ordering.out_of_order_pair_count,
      duplicate_record_policy: built.validation.duplicate_records.policy,
      duplicate_record_status: built.validation.duplicate_records.status,
      checked_duplicate_collection_count: built.validation.duplicate_records.checked_collection_count,
      checked_duplicate_record_count: built.validation.duplicate_records.checked_record_count,
      duplicate_record_count: built.validation.duplicate_records.duplicate_record_count,
      duplicate_group_count: built.validation.duplicate_records.duplicate_group_count,
      completeness_policy: completeness.policy,
      completeness_status: completeness.status,
      payload_byte_budget_policy: built.byte_budget.policy,
      payload_bytes: built.byte_budget.payload_bytes,
      max_payload_bytes: built.byte_budget.max_payload_bytes,
      remaining_payload_bytes: built.byte_budget.remaining_payload_bytes,
      payload_utilization_percent: built.byte_budget.payload_utilization_percent,
      payload_byte_status: built.byte_budget.payload_byte_status,
      finding_budget_policy: built.validation.finding_budget.policy,
      max_returned_validation_findings: built.validation.finding_budget.max_returned_findings,
      validation_finding_count: built.validation.findings.length,
      validation_total_finding_count: built.validation.finding_budget.total_finding_count,
      validation_returned_finding_count: built.validation.finding_budget.returned_finding_count,
      validation_omitted_finding_count: built.validation.finding_budget.omitted_finding_count,
      validation_findings_truncated: built.validation.finding_budget.findings_truncated,
      validation_phase_policy: built.validation.phase_execution.policy,
      validation_phase_execution_status: built.validation.phase_execution.status,
      validation_phase_count: built.validation.phase_execution.phase_count,
      executed_validation_phase_count: built.validation.phase_execution.executed_phase_count,
      skipped_validation_phase_count: built.validation.phase_execution.skipped_phase_count,
      validation_phase_skip_reasons: Object.entries(built.validation.phase_execution.phases)
        .filter(([, phase]) => phase.execution_status === "skipped")
        .map(([phase, state]) => `${phase}:${state.skip_reason}`)
        .join(",") || "none",
      finding_attribution_policy: built.validation.finding_attribution.policy,
      attributed_validation_finding_count: built.validation.finding_attribution.attributed_finding_count,
      unattributed_validation_finding_count: built.validation.finding_attribution.unattributed_finding_count,
      validation_finding_phase_counts: Object.entries(built.validation.finding_attribution.phases)
        .filter(([, count]) => count > 0)
        .map(([phase, count]) => `${phase}:${count}`)
        .join(",") || "none",
      private_runtime_rows_excluded: Object.values(excluded).reduce((total, count) => total + count, 0),
      schema_version: EVIDENCE_EXCHANGE_CONTRACT.current_schema_version,
      compatibility: built.validation.compatibility.compatibility,
      exact_digest_sha256: built.digest_sha256,
      content_digest_sha256: built.content_digest_sha256,
      digest_availability_policy: built.digest_availability.policy,
      exact_digest_status: built.digest_availability.exact_digest_status,
      content_digest_status: built.digest_availability.content_digest_status,
      migration_supported_from: EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.supported_from_versions.join(","),
      migration_target_version: EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.target_schema_version,
      migration_mode: EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.mode,
      migration_writes_allowed: EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.writes_allowed,
      migration_readiness_policy: EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.policy,
      migration_readiness_mode: EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.mode,
      migration_readiness_target_read_performed: EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.target_read_performed,
      migration_readiness_candidate_validation_performed: EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.candidate_validation_performed,
      comparison_policy: EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.policy,
      comparison_mode: EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.mode,
      comparison_target_read_performed: EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.target_read_performed,
      assertion_policy: EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.policy,
      assertion_mode: EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.mode,
      assertion_performed: EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.assertion_performed,
      import_preflight_policy: EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.policy,
      max_raw_file_bytes: EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.max_raw_file_bytes,
      import_target_stat_performed: EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.target_stat_performed,
      import_target_parse_performed: EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.target_parse_performed,
      import_readiness_policy: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.policy,
      import_readiness_mode: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.mode,
      import_readiness_target_read_performed: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.target_read_performed,
      import_readiness_comparison_performed: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.comparison_performed,
      target_path_policy: EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.policy,
      target_path_check_performed: EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.target_check_performed,
      file_handle_inspection_policy: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.policy,
      file_handle_close_failure_policy: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.close_failure_policy,
      file_handle_close_failure_reason: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.close_failure_reason,
      inspection_target_open_performed: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_open_performed,
      inspection_target_read_performed: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_read_performed,
      inspection_target_close_performed: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_close_performed,
      post_open_path_recheck_performed: EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.post_open_path_recheck_performed,
      payload_exposed: false,
      writes_performed: false
    },
    payload_exposed: false,
    writes_performed: false,
    note: "Read-only preview exposes counts, validation, digest, and exclusions only; the sanitized payload is not returned."
  };
}

export function planEvidenceExchangeMigration(payload) {
  const compatibility = evidenceExchangeCompatibility(payload);
  if (compatibility.compatibility === "compatible") {
    const sourceValidation = validateEvidenceExchange(payload);
    if (sourceValidation.status !== "safe_to_execute") {
      return {
        status: "manual_verification_required",
        compatibility,
        source_validation: sourceValidation,
        migration_required: false,
        blockers: ["current_schema_exchange_validation_failed"],
        candidate_payload_exposed: false,
        migration_performed: false,
        writes_performed: false,
        note: "The exchange declares the current schema but fails validation; no migration plan or write is allowed."
      };
    }
    return {
      status: "safe_to_execute",
      compatibility,
      source_validation: sourceValidation,
      migration_required: false,
      from_schema_version: EVIDENCE_EXCHANGE_CONTRACT.current_schema_version,
      to_schema_version: EVIDENCE_EXCHANGE_CONTRACT.current_schema_version,
      proposed_changes: [],
      candidate_payload_exposed: false,
      migration_performed: false,
      writes_performed: false,
      note: "Exchange already matches the current schema; no migration is required."
    };
  }
  if (
    compatibility.compatibility !== "older_than_supported"
    || payload?.kind !== EXCHANGE_KIND
    || payload?.schema_version !== 1
  ) {
    return {
      status: "manual_verification_required",
      compatibility,
      migration_required: true,
      blockers: ["automatic_migration_plan_not_supported_for_observed_exchange"],
      candidate_payload_exposed: false,
      migration_performed: false,
      writes_performed: false,
      note: "Only a validation-only schema v1 to v2 migration plan is supported."
    };
  }
  const candidate = {
    ...payload,
    schema_version: EXCHANGE_SCHEMA_VERSION,
    generated_at: typeof payload.generated_at === "string" && payload.generated_at.length > 0
      ? payload.generated_at
      : new Date().toISOString(),
    policy: {
      ...(payload.policy || {}),
      ...FIXED_SAFETY_POLICY,
      excluded_private_runtime_rows: {
        public_evidence: 0,
        quality_findings: 0,
        ...(payload.policy?.excluded_private_runtime_rows || {})
      }
    },
    records: {
      ...(payload.records || {}),
      decision_review: []
    }
  };
  const candidateValidation = validateEvidenceExchange(candidate);
  return {
    status: candidateValidation.status === "safe_to_execute" ? "dry_run_only" : "manual_verification_required",
    compatibility,
    migration_required: true,
    from_schema_version: 1,
    to_schema_version: EXCHANGE_SCHEMA_VERSION,
    proposed_changes: [
      "Set schema_version to 2.",
      "Add generated_at when missing.",
      "Add fixed sanitized-exchange safety policy values.",
      "Add an empty allowlisted decision_review collection.",
      "Re-export from the source project to populate decision_review summaries."
    ],
    decision_review_population: "requires_source_project_reexport",
    candidate_validation: candidateValidation,
    candidate_payload_exposed: false,
    migration_performed: false,
    writes_performed: false,
    note: "Validation-only migration plan; no candidate payload is returned and no file is written."
  };
}

function resolveExportTarget(target, projectRoot) {
  const allowedRoot = path.resolve(projectRoot, "docs/evidence/exports");
  const fullPath = path.resolve(projectRoot, String(target || ""));
  const relative = path.relative(allowedRoot, fullPath);
  const inside = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  return { fullPath, inside: inside && path.extname(fullPath).toLowerCase() === ".json" };
}

function inspectPathEntry(fullPath) {
  try {
    return { status: "safe_to_execute", exists: true, stats: fs.lstatSync(fullPath) };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "safe_to_execute", exists: false, stats: null };
    }
    return { status: "manual_verification_required", exists: false, stats: null };
  }
}

function ensureExportParentDirectories(fullPath, projectRoot) {
  const parentPath = path.dirname(fullPath);
  const relative = path.relative(projectRoot, parentPath);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return {
      status: "blocked",
      blockers: ["export_parent_outside_project_root"],
      created_parent_directories: [],
      writes_performed: false
    };
  }

  const created = [];
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    let entry = inspectPathEntry(current);
    if (entry.status !== "safe_to_execute") {
      return {
        status: "blocked",
        blockers: ["export_parent_inspection_failed"],
        created_parent_directories: created,
        writes_performed: created.length > 0
      };
    }
    if (!entry.exists) {
      const beforeCreateSafety = inspectTargetPathSafety(current, projectRoot);
      if (beforeCreateSafety.status !== "safe_to_execute") {
        return {
          status: "blocked",
          blockers: ["export_parent_path_not_realpath_contained_or_symlink_free"],
          created_parent_directories: created,
          writes_performed: created.length > 0
        };
      }
      try {
        fs.mkdirSync(current);
        created.push(toProjectPath(current, projectRoot));
      } catch (error) {
        if (error?.code !== "EEXIST") {
          return {
            status: "blocked",
            blockers: ["export_parent_create_failed"],
            created_parent_directories: created,
            writes_performed: created.length > 0
          };
        }
      }
      entry = inspectPathEntry(current);
    }
    const safety = inspectTargetPathSafety(current, projectRoot, { targetMustExist: true });
    if (
      entry.status !== "safe_to_execute"
      || entry.exists !== true
      || !entry.stats?.isDirectory()
      || entry.stats.isSymbolicLink()
      || safety.status !== "safe_to_execute"
    ) {
      return {
        status: "blocked",
        blockers: ["export_parent_not_realpath_contained_regular_directory"],
        created_parent_directories: created,
        writes_performed: created.length > 0
      };
    }
  }
  return {
    status: "safe_to_execute",
    blockers: [],
    created_parent_directories: created,
    writes_performed: created.length > 0
  };
}

function writeEvidenceExportAtomic(fullPath, fileContents, projectRoot) {
  const parentCreation = ensureExportParentDirectories(fullPath, projectRoot);
  if (parentCreation.status !== "safe_to_execute") {
    return {
      ...parentCreation,
      write_summary: {
        atomic_create_link: false,
        created_parent_directory_count: parentCreation.created_parent_directories.length,
        bytes_written: 0,
        overwrite_performed: false,
        target_identity_verified: false,
        target_post_write_verified: false
      }
    };
  }

  const relativePath = toProjectPath(fullPath, projectRoot);
  const targetBefore = inspectPathEntry(fullPath);
  const pathSafetyBefore = inspectTargetPathSafety(fullPath, projectRoot);
  if (targetBefore.status !== "safe_to_execute" || pathSafetyBefore.status !== "safe_to_execute") {
    return {
      status: "blocked",
      blockers: ["export_target_path_changed_before_write"],
      created_parent_directories: parentCreation.created_parent_directories,
      writes_performed: parentCreation.writes_performed,
      write_summary: {
        atomic_create_link: false,
        created_parent_directory_count: parentCreation.created_parent_directories.length,
        bytes_written: 0,
        overwrite_performed: false,
        target_identity_verified: false,
        target_post_write_verified: false
      }
    };
  }
  if (targetBefore.exists) {
    return {
      status: "needs_approval",
      blockers: ["export_target_already_exists"],
      created_parent_directories: parentCreation.created_parent_directories,
      writes_performed: parentCreation.writes_performed,
      write_summary: {
        atomic_create_link: false,
        created_parent_directory_count: parentCreation.created_parent_directories.length,
        bytes_written: 0,
        overwrite_performed: false,
        target_identity_verified: false,
        target_post_write_verified: false
      }
    };
  }

  const bytes = Buffer.byteLength(fileContents, "utf8");
  const tempPath = path.join(
    path.dirname(fullPath),
    `.${path.basename(fullPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let fileDescriptor;
  let tempExists = false;
  let createdTempStats = null;
  try {
    fileDescriptor = fs.openSync(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW_FLAG,
      0o600
    );
    tempExists = true;
    fs.writeFileSync(fileDescriptor, fileContents, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      throw new Error("export_temporary_source_verification_failed");
    }
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    const targetRechecked = inspectPathEntry(fullPath);
    const pathSafetyRechecked = inspectTargetPathSafety(fullPath, projectRoot);
    if (
      targetRechecked.status !== "safe_to_execute"
      || targetRechecked.exists
      || pathSafetyRechecked.status !== "safe_to_execute"
    ) {
      return {
        status: targetRechecked.exists ? "needs_approval" : "blocked",
        blockers: [targetRechecked.exists ? "export_target_already_exists" : "export_target_path_changed_before_publish"],
        created_parent_directories: parentCreation.created_parent_directories,
        writes_performed: true,
        write_summary: {
          atomic_create_link: false,
          created_parent_directory_count: parentCreation.created_parent_directories.length,
          bytes_written: 0,
          overwrite_performed: false,
          target_identity_verified: false,
          target_post_write_verified: false
        }
      };
    }
    fs.linkSync(tempPath, fullPath);
    const publishedSource = inspectPathEntry(tempPath);
    const written = inspectPathEntry(fullPath);
    const pathSafetyAfter = inspectTargetPathSafety(fullPath, projectRoot, { targetMustExist: true });
    const targetIdentityVerified = Boolean(
      publishedSource.status === "safe_to_execute"
      && publishedSource.exists
      && publishedSource.stats?.isFile()
      && !publishedSource.stats.isSymbolicLink()
      && written.status === "safe_to_execute"
      && written.exists
      && written.stats
      && sameFileIdentity(createdTempStats, publishedSource.stats)
      && sameFileIdentity(createdTempStats, written.stats)
    );
    if (
      written.status !== "safe_to_execute"
      || written.exists !== true
      || !written.stats?.isFile()
      || written.stats.isSymbolicLink()
      || written.stats.size !== bytes
      || !targetIdentityVerified
      || pathSafetyAfter.status !== "safe_to_execute"
    ) {
      return {
        status: "blocked",
        blockers: ["export_target_post_write_verification_failed"],
        created_parent_directories: parentCreation.created_parent_directories,
        writes_performed: true,
        write_summary: {
          atomic_create_link: true,
          created_parent_directory_count: parentCreation.created_parent_directories.length,
          bytes_written: bytes,
          overwrite_performed: false,
          target_identity_verified: targetIdentityVerified,
          target_post_write_verified: false
        }
      };
    }
    return {
      status: "safe_to_execute",
      blockers: [],
      created_parent_directories: parentCreation.created_parent_directories,
      writes_performed: true,
      export_path: relativePath,
      write_summary: {
        atomic_create_link: true,
        created_parent_directory_count: parentCreation.created_parent_directories.length,
        bytes_written: bytes,
        overwrite_performed: false,
        target_identity_verified: true,
        target_post_write_verified: true
      }
    };
  } catch (error) {
    return {
      status: error?.code === "EEXIST" ? "needs_approval" : "blocked",
      blockers: [error?.code === "EEXIST" ? "export_target_already_exists" : "export_atomic_create_failed"],
      created_parent_directories: parentCreation.created_parent_directories,
      writes_performed: parentCreation.writes_performed || tempExists,
      write_summary: {
        atomic_create_link: false,
        created_parent_directory_count: parentCreation.created_parent_directories.length,
        bytes_written: 0,
        overwrite_performed: false,
        target_identity_verified: false,
        target_post_write_verified: false
      }
    };
  } finally {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Cleanup continues below.
      }
    }
    if (tempExists) {
      unlinkIfSameFileIdentity(tempPath, createdTempStats);
    }
  }
}

export function writeSanitizedEvidenceExport(db, target, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const resolved = resolveExportTarget(target, projectRoot);
  if (!target || !resolved.inside) {
    return {
      status: "blocked",
      blockers: ["export_target_must_be_new_json_inside_docs_evidence_exports"],
      writes_performed: false,
      export_path: null
    };
  }
  const pathSafety = inspectTargetPathSafety(resolved.fullPath, projectRoot);
  if (pathSafety.status !== "safe_to_execute") {
    return {
      status: "blocked",
      blockers: ["export_target_path_not_realpath_contained_or_symlink_free"],
      path_safety: pathSafety,
      writes_performed: false,
      export_path: null
    };
  }
  const targetEntry = inspectPathEntry(resolved.fullPath);
  if (targetEntry.status !== "safe_to_execute") {
    return {
      status: "blocked",
      blockers: ["export_target_inspection_failed"],
      path_safety: pathSafety,
      writes_performed: false,
      export_path: null
    };
  }
  if (targetEntry.exists) {
    return {
      status: "needs_approval",
      blockers: ["export_target_already_exists"],
      path_safety: pathSafety,
      writes_performed: false,
      export_path: toProjectPath(resolved.fullPath, projectRoot)
    };
  }
  const built = buildSanitizedEvidenceExport(db);
  if (built.validation.status !== "safe_to_execute") {
    return { ...built, writes_performed: false, export_path: null };
  }
  const fileContents = `${JSON.stringify(built.payload, null, 2)}\n`;
  const rawFileBudget = rawFileByteBudget(Buffer.byteLength(fileContents, "utf8"));
  if (rawFileBudget.raw_file_byte_status === "over_limit") {
    return {
      status: "manual_verification_required",
      blockers: ["export_file_exceeds_raw_byte_limit"],
      validation: built.validation,
      byte_budget: built.byte_budget,
      raw_file_byte_budget: rawFileBudget,
      path_safety: pathSafety,
      writes_performed: false,
      export_path: null
    };
  }
  const writeResult = writeEvidenceExportAtomic(resolved.fullPath, fileContents, projectRoot);
  if (writeResult.status !== "safe_to_execute") {
    return {
      status: writeResult.status,
      blockers: writeResult.blockers,
      validation: built.validation,
      byte_budget: built.byte_budget,
      raw_file_byte_budget: rawFileBudget,
      path_safety: pathSafety,
      write_contract: EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT,
      write_summary: writeResult.write_summary,
      writes_performed: writeResult.writes_performed,
      export_path: null
    };
  }
  return {
    status: "safe_to_execute",
    validation: built.validation,
    digest_sha256: built.digest_sha256,
    content_digest_sha256: built.content_digest_sha256,
    digest_availability: built.digest_availability,
    byte_budget: built.byte_budget,
    raw_file_byte_budget: rawFileBudget,
    path_safety: pathSafety,
    record_counts: built.record_counts,
    collection_truncation: built.collection_truncation,
    write_contract: EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT,
    write_summary: writeResult.write_summary,
    writes_performed: writeResult.writes_performed,
    export_path: writeResult.export_path,
    note: "A new sanitized export was written; existing files are never overwritten."
  };
}

function fileInspectionState(overrides = {}) {
  return {
    policy: EVIDENCE_EXCHANGE_CONTRACT.file_handle_inspection_policy,
    target_open_performed: false,
    target_fstat_performed: false,
    target_read_performed: false,
    target_parse_performed: false,
    target_close_performed: false,
    target_close_succeeded: null,
    post_open_path_recheck_performed: false,
    regular_file: null,
    file_identity_match: null,
    content_stable_during_read: null,
    single_file_handle_used: false,
    nofollow_supported: NOFOLLOW_FLAG !== 0,
    ...overrides
  };
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function unlinkIfSameFileIdentity(fullPath, expectedStats) {
  if (!expectedStats) return false;
  try {
    const currentStats = fs.lstatSync(fullPath);
    if (!currentStats.isFile() || currentStats.isSymbolicLink() || !sameFileIdentity(expectedStats, currentStats)) {
      return false;
    }
    fs.unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function inspectAndReadEvidenceTarget(fullPath, projectRoot) {
  const initialPathSafety = inspectTargetPathSafety(fullPath, projectRoot, { targetMustExist: true });
  if (initialPathSafety.status !== "safe_to_execute") {
    return {
      status: "blocked",
      reason: "path_not_realpath_contained_or_symlink_free",
      path_safety: initialPathSafety,
      file_inspection: fileInspectionState()
    };
  }

  let pathStats;
  try {
    pathStats = fs.statSync(fullPath);
  } catch {
    return {
      status: "manual_verification_required",
      reason: "stat_failed",
      path_safety: initialPathSafety,
      file_inspection: fileInspectionState()
    };
  }
  if (!pathStats.isFile()) {
    return {
      status: "blocked",
      reason: "not_regular_file",
      path_safety: initialPathSafety,
      file_inspection: fileInspectionState({ regular_file: false })
    };
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(fullPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return {
      status: "manual_verification_required",
      reason: "open_failed",
      path_safety: initialPathSafety,
      file_inspection: fileInspectionState()
    };
  }

  const inspection = fileInspectionState({ target_open_performed: true });
  try {
    const openedStats = fs.fstatSync(fileDescriptor);
    inspection.target_fstat_performed = true;
    inspection.regular_file = openedStats.isFile();
    if (!inspection.regular_file) {
      return {
        status: "blocked",
        reason: "not_regular_file",
        path_safety: initialPathSafety,
        file_inspection: inspection
      };
    }

    const postOpenPathSafety = inspectTargetPathSafety(fullPath, projectRoot, { targetMustExist: true });
    inspection.post_open_path_recheck_performed = true;
    let currentPathStats;
    try {
      currentPathStats = fs.statSync(fullPath);
    } catch {
      currentPathStats = null;
    }
    inspection.file_identity_match = Boolean(currentPathStats && sameFileSnapshot(openedStats, currentPathStats));
    if (postOpenPathSafety.status !== "safe_to_execute" || !inspection.file_identity_match) {
      return {
        status: "blocked",
        reason: "changed_after_open",
        path_safety: postOpenPathSafety,
        file_inspection: inspection
      };
    }

    const rawBudget = rawFileByteBudget(openedStats.size);
    if (rawBudget.raw_file_byte_status === "over_limit") {
      return {
        status: "manual_verification_required",
        reason: "file_exceeds_raw_byte_limit",
        path_safety: postOpenPathSafety,
        raw_file_byte_budget: rawBudget,
        file_inspection: inspection
      };
    }

    let text;
    try {
      text = fs.readFileSync(fileDescriptor, "utf8");
      inspection.target_read_performed = true;
      inspection.single_file_handle_used = true;
    } catch {
      return {
        status: "manual_verification_required",
        reason: "read_failed",
        path_safety: postOpenPathSafety,
        raw_file_byte_budget: rawBudget,
        file_inspection: inspection
      };
    }

    const afterReadStats = fs.fstatSync(fileDescriptor);
    inspection.content_stable_during_read = sameFileSnapshot(openedStats, afterReadStats);
    if (!inspection.content_stable_during_read) {
      return {
        status: "blocked",
        reason: "changed_during_read",
        path_safety: postOpenPathSafety,
        raw_file_byte_budget: rawBudget,
        file_inspection: inspection
      };
    }

    try {
      const payload = JSON.parse(text);
      inspection.target_parse_performed = true;
      return {
        status: "safe_to_execute",
        payload,
        path_safety: postOpenPathSafety,
        raw_file_byte_budget: rawBudget,
        file_inspection: inspection
      };
    } catch {
      inspection.target_parse_performed = true;
      return {
        status: "manual_verification_required",
        reason: "invalid_json",
        path_safety: postOpenPathSafety,
        raw_file_byte_budget: rawBudget,
        file_inspection: inspection
      };
    }
  } finally {
    inspection.target_close_performed = true;
    try {
      fs.closeSync(fileDescriptor);
      inspection.target_close_succeeded = true;
    } catch {
      inspection.target_close_succeeded = false;
      return {
        status: "manual_verification_required",
        reason: EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_reason,
        path_safety: initialPathSafety,
        file_inspection: inspection
      };
    }
  }
}

export function inspectEvidenceMigration(target, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const fullPath = path.resolve(projectRoot, String(target || ""));
  const relative = path.relative(projectRoot, fullPath);
  const inside = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!target || !inside || path.extname(fullPath).toLowerCase() !== ".json") {
    return {
      status: "blocked",
      blockers: ["migration_target_must_be_project_local_json"],
      candidate_payload_exposed: false,
      migration_performed: false,
      file_inspection: fileInspectionState(),
      target_stat_performed: false,
      target_parse_performed: false,
      writes_performed: false
    };
  }
  const targetEntry = inspectPathEntry(fullPath);
  if (targetEntry.status !== "safe_to_execute") {
    return {
      status: "manual_verification_required",
      blockers: ["migration_target_inspection_failed"],
      target: toProjectPath(fullPath, projectRoot),
      candidate_payload_exposed: false,
      migration_performed: false,
      file_inspection: fileInspectionState(),
      target_stat_performed: false,
      target_parse_performed: false,
      writes_performed: false
    };
  }
  if (!targetEntry.exists) {
    return {
      status: "manual_verification_required",
      blockers: ["migration_target_missing"],
      target: toProjectPath(fullPath, projectRoot),
      candidate_payload_exposed: false,
      migration_performed: false,
      file_inspection: fileInspectionState(),
      target_stat_performed: false,
      target_parse_performed: false,
      writes_performed: false
    };
  }
  const inspected = inspectAndReadEvidenceTarget(fullPath, projectRoot);
  if (inspected.status !== "safe_to_execute") {
    return {
      status: inspected.status,
      blockers: [`migration_target_${inspected.reason}`],
      target: toProjectPath(fullPath, projectRoot),
      path_safety: inspected.path_safety,
      raw_file_byte_budget: inspected.raw_file_byte_budget || null,
      file_inspection: inspected.file_inspection,
      candidate_payload_exposed: false,
      migration_performed: false,
      target_open_performed: inspected.file_inspection.target_open_performed,
      target_stat_performed: inspected.file_inspection.target_fstat_performed,
      target_read_performed: inspected.file_inspection.target_read_performed,
      target_parse_performed: inspected.file_inspection.target_parse_performed,
      writes_performed: false
    };
  }
  return {
    ...planEvidenceExchangeMigration(inspected.payload),
    target: toProjectPath(fullPath, projectRoot),
    raw_file_byte_budget: inspected.raw_file_byte_budget,
    path_safety: inspected.path_safety,
    file_inspection: inspected.file_inspection,
    target_open_performed: inspected.file_inspection.target_open_performed,
    target_stat_performed: inspected.file_inspection.target_fstat_performed,
    target_read_performed: inspected.file_inspection.target_read_performed,
    target_parse_performed: inspected.file_inspection.target_parse_performed
  };
}

export function planEvidenceExchangeMigrationReadiness(target, options = {}) {
  const inspected = inspectEvidenceMigration(target, options);
  const common = {
    ...inspected,
    contract: EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY,
    target_read_performed: Boolean(inspected.target_read_performed),
    single_target_read: Boolean(inspected.file_inspection?.single_file_handle_used),
    candidate_payload_exposed: false,
    migration_performed: false,
    writes_performed: false,
    external_call_performed: false
  };
  if (!["safe_to_execute", "dry_run_only"].includes(inspected.status)) {
    return {
      ...common,
      readiness_status: "not_ready",
      approval_required: false,
      note: "Migration readiness requires one valid project-local source observation and a valid migration plan; no payload is returned and no write or migration is performed."
    };
  }
  const migrationRequired = inspected.migration_required === true;
  return {
    ...common,
    status: migrationRequired ? "needs_approval" : "safe_to_execute",
    blockers: migrationRequired ? ["real_evidence_migration_write_disabled_by_policy"] : [],
    readiness_status: migrationRequired ? "validated_migration_ready_for_review" : "already_current",
    approval_required: migrationRequired,
    note: migrationRequired
      ? "Read-only migration readiness validated one source observation and a candidate migration plan; the migration write path remains disabled by policy."
      : "Read-only migration readiness validated one source observation and found the exchange already matches the current schema; no migration is required."
  };
}

export function inspectEvidenceImport(target, options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const fullPath = path.resolve(projectRoot, String(target || ""));
  const relative = path.relative(projectRoot, fullPath);
  const inside = relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
  if (!target || !inside || path.extname(fullPath).toLowerCase() !== ".json") {
    return {
      status: "blocked",
      blockers: ["import_target_must_be_project_local_json"],
      digest_availability: digestAvailability(false, "not_computed_no_parsed_payload"),
      file_inspection: fileInspectionState(),
      target_stat_performed: false,
      target_parse_performed: false,
      writes_performed: false,
      import_performed: false
    };
  }
  const targetEntry = inspectPathEntry(fullPath);
  if (targetEntry.status !== "safe_to_execute") {
    return {
      status: "manual_verification_required",
      blockers: ["import_target_inspection_failed"],
      target: toProjectPath(fullPath, projectRoot),
      digest_availability: digestAvailability(false, "not_computed_no_parsed_payload"),
      file_inspection: fileInspectionState(),
      target_stat_performed: false,
      target_parse_performed: false,
      writes_performed: false,
      import_performed: false
    };
  }
  if (!targetEntry.exists) {
    return {
      status: "manual_verification_required",
      blockers: ["import_target_missing"],
      target: toProjectPath(fullPath, projectRoot),
      digest_availability: digestAvailability(false, "not_computed_no_parsed_payload"),
      file_inspection: fileInspectionState(),
      target_stat_performed: false,
      target_parse_performed: false,
      writes_performed: false,
      import_performed: false
    };
  }
  const inspected = inspectAndReadEvidenceTarget(fullPath, projectRoot);
  if (inspected.status !== "safe_to_execute") {
    return {
      status: inspected.status,
      blockers: [`import_target_${inspected.reason}`],
      target: toProjectPath(fullPath, projectRoot),
      path_safety: inspected.path_safety,
      raw_file_byte_budget: inspected.raw_file_byte_budget || null,
      digest_availability: digestAvailability(false, "not_computed_no_parsed_payload"),
      file_inspection: inspected.file_inspection,
      target_open_performed: inspected.file_inspection.target_open_performed,
      target_stat_performed: inspected.file_inspection.target_fstat_performed,
      target_read_performed: inspected.file_inspection.target_read_performed,
      target_parse_performed: inspected.file_inspection.target_parse_performed,
      writes_performed: false,
      import_performed: false
    };
  }
  const validation = validateEvidenceExchange(inspected.payload);
  const digestAvailable = validation.complexity.status === "valid" && validation.byte_budget.serialization_performed;
  return {
    status: validation.status,
    target: toProjectPath(fullPath, projectRoot),
    validation,
    digest_sha256: digestAvailable ? digest(inspected.payload) : null,
    content_digest_sha256: digestAvailable ? evidenceExchangeContentDigest(inspected.payload) : null,
    digest_availability: digestAvailability(digestAvailable, "complexity_or_serialization_failed"),
    byte_budget: validation.byte_budget,
    raw_file_byte_budget: inspected.raw_file_byte_budget,
    path_safety: inspected.path_safety,
    file_inspection: inspected.file_inspection,
    record_counts: recordCounts(inspected.payload),
    collection_truncation: inspected.payload.policy?.collection_truncation || null,
    writes_performed: false,
    import_performed: false,
    target_open_performed: inspected.file_inspection.target_open_performed,
    target_stat_performed: inspected.file_inspection.target_fstat_performed,
    target_read_performed: inspected.file_inspection.target_read_performed,
    target_parse_performed: inspected.file_inspection.target_parse_performed,
    note: "Import inspection validates a project-local sanitized exchange and never writes to SQLite, ledgers, state, evidence, or project files."
  };
}

function compareValidatedEvidenceTarget(db, inspected) {
  const current = buildSanitizedEvidenceExport(db);
  const collectionNames = [...new Set([
    ...Object.keys(current.record_counts),
    ...Object.keys(inspected.record_counts)
  ])].sort();
  const recordCountDeltas = collectionNames.map((collection) => {
    const currentCount = current.record_counts[collection] || 0;
    const targetCount = inspected.record_counts[collection] || 0;
    return {
      collection,
      current_count: currentCount,
      target_count: targetCount,
      delta: currentCount - targetCount
    };
  });
  const contentDigestMatch = current.content_digest_sha256 === inspected.content_digest_sha256;
  return {
    status: "safe_to_execute",
    target: inspected.target,
    comparison_policy: EVIDENCE_EXCHANGE_CONTRACT.comparison_policy,
    comparison_status: contentDigestMatch ? "unchanged" : "changed",
    comparison_performed: true,
    content_digest_match: contentDigestMatch,
    exact_digest_match: current.digest_sha256 === inspected.digest_sha256,
    current_digest_sha256: current.digest_sha256,
    target_digest_sha256: inspected.digest_sha256,
    current_content_digest_sha256: current.content_digest_sha256,
    target_content_digest_sha256: inspected.content_digest_sha256,
    current_digest_availability: current.digest_availability,
    target_digest_availability: inspected.digest_availability,
    target_path_safety: inspected.path_safety,
    record_count_deltas: recordCountDeltas,
    payload_exposed: false,
    import_performed: false,
    writes_performed: false,
    external_call_performed: false,
    note: "Validation-only comparison uses exact and stable content digests plus record-count deltas; no payload is returned and no write or import is performed."
  };
}

export function compareEvidenceExchangeTarget(db, target, options = {}) {
  const inspected = inspectEvidenceImport(target, options);
  if (inspected.status !== "safe_to_execute") {
    return {
      status: inspected.status,
      blockers: inspected.blockers || [],
      target: inspected.target || null,
      target_validation: inspected.validation || null,
      target_path_safety: inspected.path_safety || null,
      target_digest_availability: inspected.digest_availability || digestAvailability(false, "not_computed_no_parsed_payload"),
      comparison_policy: EVIDENCE_EXCHANGE_CONTRACT.comparison_policy,
      comparison_status: "unknown",
      comparison_performed: false,
      payload_exposed: false,
      import_performed: false,
      writes_performed: false,
      external_call_performed: false,
      note: "Comparison requires a valid project-local evidence exchange target; no payload is returned and no write or import is performed."
    };
  }
  return compareValidatedEvidenceTarget(db, inspected);
}

export function planEvidenceExchangeImport(db, target, options = {}) {
  const inspected = inspectEvidenceImport(target, options);
  if (inspected.status !== "safe_to_execute") {
    return {
      status: inspected.status,
      blockers: inspected.blockers || [],
      contract: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY,
      readiness_status: "not_ready",
      target: inspected.target || null,
      target_validation_status: inspected.validation?.status || inspected.status,
      target_path_safety: inspected.path_safety || null,
      target_digest_availability: inspected.digest_availability || digestAvailability(false, "not_computed_no_parsed_payload"),
      comparison_status: "unknown",
      comparison_performed: false,
      import_required: null,
      approval_required: false,
      target_read_performed: Boolean(inspected.target_read_performed),
      single_target_read: Boolean(inspected.file_inspection?.single_file_handle_used),
      payload_exposed: false,
      import_performed: false,
      writes_performed: false,
      external_call_performed: false,
      note: "Import readiness requires a valid project-local evidence exchange target; no payload is returned and no write or import is performed."
    };
  }
  const comparison = compareValidatedEvidenceTarget(db, inspected);
  const importRequired = comparison.content_digest_match !== true;
  return {
    status: importRequired ? "needs_approval" : "safe_to_execute",
    blockers: importRequired ? ["real_evidence_import_write_disabled_by_policy"] : [],
    contract: EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY,
    readiness_status: importRequired ? "validated_change_ready_for_review" : "already_current",
    target: inspected.target,
    target_validation_status: inspected.validation.status,
    target_path_safety: inspected.path_safety,
    target_digest_availability: inspected.digest_availability,
    comparison_policy: comparison.comparison_policy,
    comparison_status: comparison.comparison_status,
    comparison_performed: comparison.comparison_performed,
    content_digest_match: comparison.content_digest_match,
    exact_digest_match: comparison.exact_digest_match,
    current_digest_sha256: comparison.current_digest_sha256,
    target_digest_sha256: comparison.target_digest_sha256,
    current_content_digest_sha256: comparison.current_content_digest_sha256,
    target_content_digest_sha256: comparison.target_content_digest_sha256,
    record_count_deltas: comparison.record_count_deltas,
    import_required: importRequired,
    approval_required: importRequired,
    target_read_performed: inspected.target_read_performed,
    single_target_read: inspected.file_inspection.single_file_handle_used,
    payload_exposed: false,
    import_performed: false,
    writes_performed: false,
    external_call_performed: false,
    note: importRequired
      ? "Read-only import readiness validated one target observation and found a reviewed change; the import write path remains disabled by policy."
      : "Read-only import readiness validated one target observation and found current sanitized evidence already matches it; no import is required."
  };
}

export function assertEvidenceExchangeContentDigest(db, expectedDigest) {
  const normalizedExpected = String(expectedDigest || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalizedExpected)) {
    return {
      status: "manual_verification_required",
      blockers: ["expected_content_digest_missing_or_invalid"],
      content_assertion_policy: EVIDENCE_EXCHANGE_CONTRACT.content_assertion_policy,
      assertion_status: "unknown",
      assertion_performed: false,
      matches: null,
      expected_content_digest_sha256: null,
      current_content_digest_sha256: null,
      target_file_read: false,
      payload_exposed: false,
      writes_performed: false,
      external_call_performed: false,
      note: "A valid expected SHA-256 content digest is required; no file is read, no payload is returned, and no write is performed."
    };
  }
  const current = buildSanitizedEvidenceExport(db);
  const matches = current.content_digest_sha256 === normalizedExpected;
  return {
    status: matches ? "safe_to_execute" : "manual_verification_required",
    blockers: matches ? [] : ["content_digest_mismatch"],
    content_assertion_policy: EVIDENCE_EXCHANGE_CONTRACT.content_assertion_policy,
    assertion_status: matches ? "match" : "mismatch",
    assertion_performed: true,
    matches,
    expected_content_digest_sha256: normalizedExpected,
    current_content_digest_sha256: current.content_digest_sha256,
    target_file_read: false,
    payload_exposed: false,
    writes_performed: false,
    external_call_performed: false,
    note: "Content assertion compares the expected SHA-256 with the current stable sanitized-evidence digest; no file is read, no payload is returned, and no write is performed."
  };
}

export function checkEvidenceExchangeCompleteness(db) {
  const built = buildSanitizedEvidenceExport(db);
  const collections = Object.entries(built.collection_truncation).map(([collection, metadata]) => ({
    collection,
    ...metadata
  }));
  const incompleteCollections = collections.filter((item) => item.truncation_status !== "complete");
  const validationFailed = built.validation.status !== "safe_to_execute";
  const blockers = [
    ...(validationFailed ? ["evidence_exchange_validation_failed"] : []),
    ...incompleteCollections.map((item) => item.truncation_status === "truncated"
      ? `evidence_collection_truncated:${item.collection}`
      : `evidence_collection_count_unknown:${item.collection}`)
  ];
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    completeness_policy: EVIDENCE_EXCHANGE_CONTRACT.completeness_policy,
    completeness_status: blockers.length === 0 ? "complete" : "incomplete",
    validation_status: built.validation.status,
    truncation_metadata_status: built.validation.truncation_metadata_status,
    collection_count: collections.length,
    complete_collection_count: collections.length - incompleteCollections.length,
    truncated_collection_count: incompleteCollections.filter((item) => item.truncation_status === "truncated").length,
    unknown_collection_count: incompleteCollections.filter((item) => item.truncation_status === "unknown_beyond_scan_limit").length,
    incomplete_collections: incompleteCollections,
    blockers,
    target_file_read: false,
    payload_exposed: false,
    writes_performed: false,
    external_call_performed: false,
    note: "Read-only completeness check requires every sanitized evidence collection to be complete with exact counts; it returns no payload and performs no write."
  };
}
