import fs from "node:fs";
import path from "node:path";
import { assessGoal } from "./decision-engine.ts";
import { inspectDrift } from "./drift.ts";
import {
  inspectExternalSkillsDryRun,
  inspectI18n,
  inspectN8n,
  inspectRefactorReadiness,
  inspectSmartSuggestions,
  inspectWorker
} from "./operations.ts";
import { PROJECT_ROOT, PATHS, toProjectPath } from "./paths.ts";
import { inspectRepoPath } from "./repo-scan.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;

export const N8N_IMPORT_INSPECTION_CONTRACT = Object.freeze({
  policy: "realpath_contained_single_handle_max_1mb_json",
  max_file_bytes: 1_000_000,
  post_read_path_recheck: true,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_blocker: "workflow_target_close_failed",
  workflow_summary_policy: "counts_and_boolean_metadata_without_raw_workflow_fields",
  raw_workflow_name_exposed: false,
  payload_exposed: false,
  payload_exposed_on_failure: false,
  writes_allowed: false,
  import_allowed: false,
  activation_allowed: false
});

export const ARCHIVE_INVENTORY_CONTRACT = Object.freeze({
  policy: "bounded_directory_iterator_with_explicit_exactness",
  max_scan_entries: 1000,
  candidate_output_limit: 120,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  directory_close_failure_blocker: "archive_inventory_directory_close_failed",
  payload_exposed_on_failure: false,
  files_moved_allowed: false,
  files_deleted_allowed: false,
  writes_allowed: false
});

export const PLAN_SOURCE_TRUTH_CONTRACT = Object.freeze({
  policy: "plan_status_requires_complete_source_truth",
  incomplete_source_status: "manual_verification_required",
  known_finding_plan_status: "dry_run_only",
  payload_exposed: false,
  writes_allowed: false
});

export const ACTION_PLAN_USER_INPUT_CONTRACT = Object.freeze({
  policy: "bounded_complete_user_input_classification_with_payload_free_metadata",
  max_input_bytes: 4_096,
  oversized_input_status: "manual_verification_required",
  raw_goal_exposed: false,
  raw_target_exposed: false,
  payload_exposed: false,
  writes_allowed: false
});

function noExecution(extra = {}) {
  return {
    execution_performed: false,
    external_call_performed: false,
    destructive_action_performed: false,
    writes_performed: false,
    ...extra
  };
}

function inspectActionPlanUserInput(value) {
  let text;
  try {
    text = String(value ?? "");
  } catch {
    return {
      status: "manual_verification_required",
      reason: "normalization_failed",
      normalized: "",
      metadata: {
        input_present: null,
        input_bytes: null,
        input_bytes_exact: false,
        input_exceeds_byte_limit: null,
        raw_input_exposed: false,
        payload_exposed: false
      }
    };
  }

  let observedBytes = 0;
  let boundedText = "";
  for (const character of text) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (observedBytes + characterBytes > ACTION_PLAN_USER_INPUT_CONTRACT.max_input_bytes) {
      return {
        status: ACTION_PLAN_USER_INPUT_CONTRACT.oversized_input_status,
        reason: "exceeds_byte_limit",
        normalized: "",
        metadata: {
          input_present: null,
          input_bytes: null,
          input_bytes_exact: false,
          input_exceeds_byte_limit: true,
          raw_input_exposed: false,
          payload_exposed: false
        }
      };
    }
    boundedText += character;
    observedBytes += characterBytes;
  }

  const normalized = boundedText.trim();
  return {
    status: "safe_to_execute",
    reason: null,
    normalized,
    metadata: {
      input_present: normalized.length > 0,
      input_bytes: observedBytes,
      input_bytes_exact: true,
      input_exceeds_byte_limit: false,
      raw_input_exposed: false,
      payload_exposed: false
    }
  };
}

function isInsideProject(fullPath, projectRoot = PROJECT_ROOT) {
  const relative = path.relative(projectRoot, fullPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function n8nInspectionState(overrides = {}) {
  return {
    policy: N8N_IMPORT_INSPECTION_CONTRACT.policy,
    max_file_bytes: N8N_IMPORT_INSPECTION_CONTRACT.max_file_bytes,
    path_check_performed: false,
    realpath_check_performed: false,
    realpath_contained: null,
    target_symlink: null,
    regular_file: null,
    target_open_performed: false,
    target_fstat_performed: false,
    target_read_performed: false,
    target_parse_performed: false,
    target_close_performed: false,
    target_close_succeeded: null,
    post_open_path_recheck_performed: false,
    post_read_path_recheck_performed: false,
    file_identity_match: null,
    content_stable_during_read: null,
    single_file_handle_used: false,
    nofollow_supported: NOFOLLOW_FLAG !== 0,
    target_bytes: null,
    payload_exposed: false,
    writes_allowed: false,
    ...overrides
  };
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function inspectN8nWorkflowTarget(fullPath, projectRoot) {
  const inspection = n8nInspectionState({ path_check_performed: true });
  let targetLstat;
  try {
    targetLstat = fs.lstatSync(fullPath);
  } catch {
    return { status: "manual_verification_required", reason: "missing", target_inspection: inspection };
  }

  inspection.target_symlink = targetLstat.isSymbolicLink();
  if (inspection.target_symlink) {
    return { status: "blocked", reason: "symlink_not_allowed", target_inspection: inspection };
  }
  inspection.regular_file = targetLstat.isFile();
  if (!inspection.regular_file) {
    return { status: "blocked", reason: "not_regular_file", target_inspection: inspection };
  }

  try {
    const projectRealPath = fs.realpathSync(projectRoot);
    const targetRealPath = fs.realpathSync(fullPath);
    inspection.realpath_check_performed = true;
    inspection.realpath_contained = isInsideProject(targetRealPath, projectRealPath);
  } catch {
    return { status: "manual_verification_required", reason: "realpath_failed", target_inspection: inspection };
  }
  if (!inspection.realpath_contained) {
    return { status: "blocked", reason: "not_realpath_contained", target_inspection: inspection };
  }

  let pathStats;
  try {
    pathStats = fs.statSync(fullPath);
  } catch {
    return { status: "manual_verification_required", reason: "stat_failed", target_inspection: inspection };
  }
  inspection.target_bytes = pathStats.size;
  if (pathStats.size > N8N_IMPORT_INSPECTION_CONTRACT.max_file_bytes) {
    return { status: "manual_verification_required", reason: "file_exceeds_byte_limit", target_inspection: inspection };
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(fullPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
    inspection.target_open_performed = true;
  } catch {
    return { status: "manual_verification_required", reason: "open_failed", target_inspection: inspection };
  }

  try {
    let openedStats;
    try {
      openedStats = fs.fstatSync(fileDescriptor);
    } catch {
      return { status: "manual_verification_required", reason: "fstat_failed", target_inspection: inspection };
    }
    inspection.target_fstat_performed = true;
    inspection.regular_file = openedStats.isFile();
    inspection.target_bytes = openedStats.size;
    if (!inspection.regular_file) {
      return { status: "blocked", reason: "not_regular_file", target_inspection: inspection };
    }
    if (openedStats.size > N8N_IMPORT_INSPECTION_CONTRACT.max_file_bytes) {
      return { status: "manual_verification_required", reason: "file_exceeds_byte_limit", target_inspection: inspection };
    }

    let currentPathStats = null;
    try {
      const projectRealPath = fs.realpathSync(projectRoot);
      const targetRealPath = fs.realpathSync(fullPath);
      inspection.post_open_path_recheck_performed = true;
      inspection.realpath_contained = isInsideProject(targetRealPath, projectRealPath);
      currentPathStats = fs.statSync(fullPath);
    } catch {
      inspection.post_open_path_recheck_performed = true;
    }
    inspection.file_identity_match = Boolean(currentPathStats && sameFileSnapshot(openedStats, currentPathStats));
    if (!inspection.realpath_contained || !inspection.file_identity_match) {
      return { status: "blocked", reason: "changed_after_open", target_inspection: inspection };
    }

    let text;
    try {
      text = fs.readFileSync(fileDescriptor, "utf8");
      inspection.target_read_performed = true;
      inspection.single_file_handle_used = true;
    } catch {
      return { status: "manual_verification_required", reason: "read_failed", target_inspection: inspection };
    }

    let afterReadStats;
    try {
      afterReadStats = fs.fstatSync(fileDescriptor);
    } catch {
      return { status: "manual_verification_required", reason: "post_read_stat_failed", target_inspection: inspection };
    }
    inspection.content_stable_during_read = sameFileSnapshot(openedStats, afterReadStats);
    if (!inspection.content_stable_during_read) {
      return { status: "blocked", reason: "changed_during_read", target_inspection: inspection };
    }

    let afterReadPathStats = null;
    try {
      const projectRealPath = fs.realpathSync(projectRoot);
      const targetRealPath = fs.realpathSync(fullPath);
      inspection.post_read_path_recheck_performed = true;
      inspection.realpath_contained = isInsideProject(targetRealPath, projectRealPath);
      afterReadPathStats = fs.statSync(fullPath);
    } catch {
      inspection.post_read_path_recheck_performed = true;
    }
    inspection.file_identity_match = Boolean(afterReadPathStats && sameFileSnapshot(openedStats, afterReadPathStats));
    if (!inspection.realpath_contained || !inspection.file_identity_match) {
      return { status: "blocked", reason: "changed_after_read", target_inspection: inspection };
    }

    try {
      const payload = JSON.parse(text);
      inspection.target_parse_performed = true;
      return { status: "safe_to_execute", payload, target_inspection: inspection };
    } catch {
      inspection.target_parse_performed = true;
      return { status: "manual_verification_required", reason: "invalid_json", target_inspection: inspection };
    }
  } finally {
    inspection.target_close_performed = true;
    try {
      fs.closeSync(fileDescriptor);
      inspection.target_close_succeeded = true;
    } catch {
      inspection.target_close_succeeded = false;
      return { status: "manual_verification_required", reason: "close_failed", target_inspection: inspection };
    }
  }
}

export function buildWorkerRunPlan(options = {}) {
  const dryRun = Boolean(options.dryRun);
  const worker = inspectWorker(options);
  const blockers = worker.blockers;
  return {
    status: blockers.length > 0 ? "manual_verification_required" : dryRun ? "dry_run_only" : "needs_approval",
    dry_run: dryRun,
    blockers,
    worker,
    plan: blockers.length === 0
      ? ["preserve the verified smoke-only contract", "define one allowlisted bounded workload before enabling it", "require approval before starting any workload process", "capture bounded stdout/stderr evidence and stop after the approved window"]
      : ["implement a bounded local worker entry point", "add a smoke test", "rerun worker-check"],
    ...noExecution({ worker_started: false, workload_started: false })
  };
}

export function buildN8nPlan(options = {}) {
  const n8n = inspectN8n(options);
  const sourceTruthComplete = n8n.status === "safe_to_execute";
  return {
    status: sourceTruthComplete
      ? PLAN_SOURCE_TRUTH_CONTRACT.known_finding_plan_status
      : PLAN_SOURCE_TRUTH_CONTRACT.incomplete_source_status,
    contract: PLAN_SOURCE_TRUTH_CONTRACT,
    source_truth_complete: sourceTruthComplete,
    blockers: sourceTruthComplete
      ? []
      : [...new Set([...(n8n.blockers || []), "n8n_plan_source_truth_incomplete"])],
    n8n,
    plan: [
      "keep workflow JSON inside PROJECT_ROOT",
      "inspect the target through one bounded realpath-contained file handle",
      "validate nodes and connections locally without exposing the payload",
      "count credential-reference nodes without exposing credential values",
      "require approval before import or activation"
    ],
    note: sourceTruthComplete
      ? "n8n plan is based on a completed bounded local availability observation; no import or activation occurred."
      : "n8n source truth is incomplete; no import or activation plan is ready for reliance.",
    ...noExecution({ workflow_imported: false, workflow_activated: false })
  };
}

export function buildN8nImportPlan(options = {}) {
  const target = options.target ? String(options.target) : "";
  const dryRun = Boolean(options.dryRun);
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  if (!target) {
    return {
      status: "manual_verification_required",
      dry_run: dryRun,
      blockers: ["workflow_target_required"],
      target_inspection: n8nInspectionState(),
      plan: ["provide --target with a workflow JSON file inside PROJECT_ROOT"],
      ...noExecution({ workflow_imported: false, workflow_activated: false })
    };
  }

  const fullPath = path.resolve(projectRoot, target);
  const relativePath = toProjectPath(fullPath, projectRoot);
  if (!isInsideProject(fullPath, projectRoot) || path.extname(fullPath).toLowerCase() !== ".json") {
    return {
      status: "blocked",
      exitCode: 1,
      dry_run: dryRun,
      blockers: ["workflow_target_must_be_project_local_json"],
      target: isInsideProject(fullPath, projectRoot) ? relativePath : "<OUTSIDE_PROJECT_ROOT>",
      target_inspection: n8nInspectionState({ path_check_performed: true }),
      ...noExecution({ workflow_imported: false, workflow_activated: false })
    };
  }

  const findings = [];
  const inspected = inspectN8nWorkflowTarget(fullPath, projectRoot);
  if (inspected.reason === "missing") {
    findings.push({ file: relativePath, summary: "Workflow target does not exist." });
  } else if (inspected.reason === "invalid_json") {
    findings.push({ file: relativePath, summary: "Workflow target is not valid JSON." });
  }

  const blockerByReason = {
    symlink_not_allowed: "workflow_target_symlink_not_allowed",
    not_regular_file: "workflow_target_not_regular_file",
    not_realpath_contained: "workflow_target_not_realpath_contained",
    realpath_failed: "workflow_target_realpath_check_failed",
    file_exceeds_byte_limit: "workflow_target_exceeds_byte_limit",
    stat_failed: "workflow_target_stat_failed",
    open_failed: "workflow_target_open_failed",
    fstat_failed: "workflow_target_fstat_failed",
    changed_after_open: "workflow_target_changed_after_open",
    read_failed: "workflow_target_read_failed",
    post_read_stat_failed: "workflow_target_post_read_stat_failed",
    changed_during_read: "workflow_target_changed_during_read",
    changed_after_read: "workflow_target_changed_after_read",
    close_failed: N8N_IMPORT_INSPECTION_CONTRACT.close_failure_blocker
  };
  const blockers = blockerByReason[inspected.reason] ? [blockerByReason[inspected.reason]] : [];
  if (blockers.length > 0) {
    return {
      status: inspected.status,
      exitCode: inspected.status === "blocked" ? 1 : 0,
      dry_run: dryRun,
      blockers,
      target: relativePath,
      findings,
      workflow_summary: null,
      target_inspection: inspected.target_inspection,
      approval_required_before_import: true,
      payload_exposed: false,
      ...noExecution({ workflow_imported: false, workflow_activated: false })
    };
  }

  const payloadParsed = Object.hasOwn(inspected, "payload");
  const workflow = payloadParsed ? inspected.payload : null;
  const workflowIsObject = workflow !== null && typeof workflow === "object" && !Array.isArray(workflow);
  if (payloadParsed && !workflowIsObject) {
    findings.push({ file: relativePath, summary: "Workflow JSON root is not an object." });
  }
  if (workflowIsObject) {
    if (!Array.isArray(workflow?.nodes)) findings.push({ file: relativePath, summary: "Workflow JSON does not contain a nodes array." });
    if (!workflow?.connections || typeof workflow.connections !== "object" || Array.isArray(workflow.connections)) findings.push({ file: relativePath, summary: "Workflow JSON does not contain a connections object." });
  }

  return {
    status: findings.length > 0 ? "manual_verification_required" : dryRun ? "dry_run_only" : "needs_approval",
    dry_run: dryRun,
    blockers: [],
    target: relativePath,
    findings,
    workflow_summary: workflowIsObject && findings.length === 0
      ? {
          name_present: typeof workflow.name === "string" && workflow.name.length > 0,
          raw_name_exposed: false,
          node_count: workflow.nodes.length,
          connection_group_count: Object.keys(workflow.connections).length,
          credential_reference_node_count: workflow.nodes.filter((node) => node && typeof node === "object" && node.credentials && typeof node.credentials === "object").length,
          disabled_node_count: workflow.nodes.filter((node) => node?.disabled === true).length,
          active_declared: Boolean(workflow.active)
        }
      : null,
    target_inspection: inspected.target_inspection,
    approval_required_before_import: true,
    payload_exposed: false,
    ...noExecution({ workflow_imported: false, workflow_activated: false })
  };
}

export function buildAutopilotPlan(goal = "") {
  const inspectedGoal = inspectActionPlanUserInput(goal);
  const normalizedGoal = inspectedGoal.normalized;
  if (inspectedGoal.status !== "safe_to_execute") {
    return {
      status: inspectedGoal.status,
      contract: ACTION_PLAN_USER_INPUT_CONTRACT,
      goal_metadata: inspectedGoal.metadata,
      blockers: [inspectedGoal.reason === "exceeds_byte_limit"
        ? "autopilot_goal_exceeds_byte_limit"
        : "autopilot_goal_normalization_failed"],
      bounded_actions: [],
      ...noExecution({ autopilot_started: false })
    };
  }
  if (!normalizedGoal || normalizedGoal === "autopilot-plan" || normalizedGoal === "autopilot-run") {
    return {
      status: "manual_verification_required",
      contract: ACTION_PLAN_USER_INPUT_CONTRACT,
      goal_metadata: inspectedGoal.metadata,
      blockers: ["autopilot_goal_required"],
      bounded_actions: [],
      ...noExecution({ autopilot_started: false })
    };
  }
  const assessment = assessGoal(normalizedGoal);
  const risky = assessment.decision === "needs_approval";
  return {
    status: risky ? "needs_approval" : "dry_run_only",
    contract: ACTION_PLAN_USER_INPUT_CONTRACT,
    goal_metadata: inspectedGoal.metadata,
    assessment,
    blockers: risky ? ["goal_contains_approval_gated_action"] : [],
    bounded_actions: [
      "read repository rules and relevant memory",
      "inspect current local evidence and references",
      "make only PROJECT_ROOT-local changes",
      "run focused and full verification",
      "record evidence and stop before push, publish, delete, deploy, or global config writes"
    ],
    stop_conditions: ["unexpected destructive scope", "secret exposure", "external write", "verification regression"],
    ...noExecution({ autopilot_started: false })
  };
}

export function buildAutopilotRunGate(goal = "", options = {}) {
  const plan = buildAutopilotPlan(goal);
  const dryRun = Boolean(options.dryRun);
  if (plan.status === "manual_verification_required" || plan.status === "needs_approval") {
    return { ...plan, dry_run: dryRun };
  }
  return {
    ...plan,
    status: dryRun ? "dry_run_only" : "needs_approval",
    dry_run: dryRun,
    blockers: dryRun ? [] : ["explicit_approval_required_before_autopilot_execution"],
    note: "This command validates the bounded run gate; it does not execute an autonomous mutation loop."
  };
}

export function buildExternalSkillProposal(target = "", options = {}) {
  const inspectedTarget = inspectActionPlanUserInput(target);
  const inventory = inspectExternalSkillsDryRun(options);
  const suggestions = inspectSmartSuggestions(options);
  const localReadinessConfirmed = inventory.status === "dry_run_only";
  const suggestionTruthConfirmed = suggestions.status === "safe_to_execute" && suggestions.scan_complete === true;
  const targetInputConfirmed = inspectedTarget.status === "safe_to_execute";
  return {
    status: localReadinessConfirmed && suggestionTruthConfirmed && targetInputConfirmed ? "dry_run_only" : "manual_verification_required",
    contract: ACTION_PLAN_USER_INPUT_CONTRACT,
    target_metadata: inspectedTarget.metadata,
    local_inventory: inventory.local_skills,
    local_readiness_status: inventory.local_readiness_status,
    ready_skill_count: inventory.ready_skill_count,
    unready_skill_count: inventory.unready_skill_count,
    suggestion_source_status: suggestions.status,
    suggestion_scan_complete: suggestions.scan_complete,
    scan_complete: inventory.scan_complete && suggestions.scan_complete,
    blockers: [...new Set([
      ...(localReadinessConfirmed ? [] : [...(inventory.blockers || []), "local_skill_readiness_unconfirmed"]),
      ...(suggestionTruthConfirmed ? [] : [...(suggestions.blockers || []), "smart_suggestion_source_truth_incomplete"]),
      ...(targetInputConfirmed
        ? []
        : [inspectedTarget.reason === "exceeds_byte_limit"
          ? "external_skill_target_exceeds_byte_limit"
          : "external_skill_target_normalization_failed"])
    ])],
    proposals: suggestions.suggestions.map((suggestion) => ({
      need: suggestion.area,
      acceptance_gate: suggestion.action,
      install_requires_approval: true
    })),
    note: "Proposal is based on local evidence only; no marketplace search, fetch, or install was performed.",
    ...noExecution({ skill_installed: false })
  };
}

export function buildDriftFixPlan(options = {}) {
  const drift = inspectDrift(false, options);
  const actions = drift.failures.map((failure) => ({
    target: failure.evidence,
    action: `Restore the contract checked by: ${failure.name}`,
    verify_with: "pala drift-check"
  }));
  const sourceScanComplete = drift.scan_complete === true;
  return {
    status: !sourceScanComplete
      ? PLAN_SOURCE_TRUTH_CONTRACT.incomplete_source_status
      : actions.length === 0
        ? "safe_to_execute"
        : PLAN_SOURCE_TRUTH_CONTRACT.known_finding_plan_status,
    contract: PLAN_SOURCE_TRUTH_CONTRACT,
    source_scan_complete: sourceScanComplete,
    blockers: sourceScanComplete
      ? []
      : [...new Set([...(drift.blockers || []), "drift_fix_source_truth_incomplete"])],
    drift,
    actions,
    note: !sourceScanComplete
      ? "Drift source truth is incomplete; no repair plan is ready for reliance."
      : actions.length === 0
        ? "No drift repair is currently required."
        : "Repair plan only; no files were changed.",
    ...noExecution({ files_changed: false })
  };
}

export function buildArchivePlan(options = {}) {
  const requestedDays = Number(options.olderThanDays);
  const olderThanDays = Number.isFinite(requestedDays) && requestedDays > 0 ? Math.floor(requestedDays) : 30;
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const rawEvidenceDir = options.rawEvidenceDir || PATHS.rawEvidenceDir;
  const requestedScanLimit = Number(options.scanLimit);
  const scanLimit = Number.isInteger(requestedScanLimit) && requestedScanLimit > 0
    ? Math.min(requestedScanLimit, ARCHIVE_INVENTORY_CONTRACT.max_scan_entries)
    : ARCHIVE_INVENTORY_CONTRACT.max_scan_entries;
  const inventoryRoot = toProjectPath(rawEvidenceDir, projectRoot);
  const rootInspection = inspectRepoPath(rawEvidenceDir, {
    projectRoot,
    expectedKind: "directory"
  });
  if (rootInspection.blocker === "repo_path_outside_project_root") {
    return {
      status: "blocked",
      exitCode: 1,
      blockers: ["archive_inventory_root_outside_project"],
      inventory_policy: ARCHIVE_INVENTORY_CONTRACT.policy,
      inventory_root: "<OUTSIDE_PROJECT_ROOT>",
      root_inspection: rootInspection,
      scan_limit: scanLimit,
      scanned_entry_count: 0,
      scan_truncated: false,
      candidate_count: 0,
      candidate_count_exact: false,
      candidates: [],
      candidate_output_limit: ARCHIVE_INVENTORY_CONTRACT.candidate_output_limit,
      candidate_output_truncated: false,
      inspection_failure_count: 0,
      archive_target: ".pala/archive/",
      ...noExecution({ files_archived: false })
    };
  }

  if (rootInspection.status === "safe_to_execute" && !rootInspection.exists) {
    return {
      status: "safe_to_execute",
      blockers: [],
      older_than_days: olderThanDays,
      inventory_policy: ARCHIVE_INVENTORY_CONTRACT.policy,
      inventory_root: inventoryRoot,
      root_inspection: rootInspection,
      scan_selection_policy: "filesystem_order_first_n_then_name_sort",
      scan_limit: scanLimit,
      scanned_entry_count: 0,
      scan_truncated: false,
      candidate_count: 0,
      candidate_count_exact: true,
      candidates: [],
      candidate_output_limit: ARCHIVE_INVENTORY_CONTRACT.candidate_output_limit,
      candidate_output_truncated: false,
      inspection_failure_count: 0,
      inspection_failures: [],
      archive_target: ".pala/archive/",
      note: "Raw evidence directory does not exist; the bounded archive inventory is exactly empty.",
      ...noExecution({ files_archived: false })
    };
  }

  if (rootInspection.status !== "safe_to_execute" || rootInspection.kind !== "directory") {
    return {
      status: "blocked",
      exitCode: 1,
      blockers: ["archive_inventory_root_not_realpath_contained_regular_directory"],
      inventory_policy: ARCHIVE_INVENTORY_CONTRACT.policy,
      inventory_root: inventoryRoot,
      root_inspection: rootInspection,
      scan_limit: scanLimit,
      scanned_entry_count: 0,
      scan_truncated: false,
      candidate_count: 0,
      candidate_count_exact: false,
      candidates: [],
      candidate_output_limit: ARCHIVE_INVENTORY_CONTRACT.candidate_output_limit,
      candidate_output_truncated: false,
      inspection_failure_count: 0,
      archive_target: ".pala/archive/",
      ...noExecution({ files_archived: false })
    };
  }

  const scannedEntries = [];
  let scanTruncated = false;
  let scanFailed = false;
  let directoryCloseFailed = false;
  let directory;
  try {
    directory = fs.opendirSync(rawEvidenceDir);
    while (scannedEntries.length <= scanLimit) {
      const entry = directory.readSync();
      if (!entry) break;
      if (scannedEntries.length === scanLimit) {
        scanTruncated = true;
        break;
      }
      scannedEntries.push(entry);
    }
  } catch {
    scanFailed = true;
  } finally {
    if (directory) {
      try {
        directory.closeSync();
      } catch {
        directoryCloseFailed = true;
        scannedEntries.length = 0;
        scanTruncated = false;
      }
    }
  }

  const candidates = [];
  const inspectionFailures = [];
  for (const entry of scannedEntries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile()) continue;
    const fullPath = path.join(rawEvidenceDir, entry.name);
    try {
      const stat = fs.lstatSync(fullPath);
      if (stat.isFile() && !stat.isSymbolicLink() && stat.mtimeMs < cutoff) {
        candidates.push(toProjectPath(fullPath, projectRoot));
      }
    } catch {
      inspectionFailures.push({ file: toProjectPath(fullPath, projectRoot), summary: "Archive candidate metadata could not be inspected." });
    }
  }
  const blockers = [
    ...(scanTruncated ? ["archive_inventory_scan_truncated"] : []),
    ...(scanFailed ? ["archive_inventory_scan_failed"] : []),
    ...(directoryCloseFailed ? [ARCHIVE_INVENTORY_CONTRACT.directory_close_failure_blocker] : []),
    ...(inspectionFailures.length > 0 ? ["archive_inventory_inspection_failures"] : [])
  ];
  const candidateOutput = candidates.slice(0, ARCHIVE_INVENTORY_CONTRACT.candidate_output_limit);
  return {
    status: blockers.length > 0 ? "manual_verification_required" : candidates.length === 0 ? "safe_to_execute" : "dry_run_only",
    blockers,
    older_than_days: olderThanDays,
    inventory_policy: ARCHIVE_INVENTORY_CONTRACT.policy,
    inventory_root: inventoryRoot,
    root_inspection: rootInspection,
    scan_selection_policy: "filesystem_order_first_n_then_name_sort",
    scan_limit: scanLimit,
    scanned_entry_count: scannedEntries.length,
    scan_truncated: scanTruncated,
    candidate_count: candidates.length,
    candidate_count_exact: blockers.length === 0,
    candidates: candidateOutput,
    candidate_output_limit: ARCHIVE_INVENTORY_CONTRACT.candidate_output_limit,
    candidate_output_truncated: candidateOutput.length < candidates.length,
    inspection_failure_count: inspectionFailures.length,
    inspection_failures: inspectionFailures.slice(0, 20),
    archive_target: ".pala/archive/",
    note: blockers.length > 0
      ? "Archive inventory is incomplete; no files were moved or deleted."
      : candidates.length === 0
        ? "No old raw evidence is currently eligible."
        : "Archive inventory only; files were not moved or deleted.",
    ...noExecution({ files_archived: false })
  };
}

export function buildLocaleSyncPlan(options = {}) {
  const i18n = inspectI18n(options);
  const actions = i18n.failures.map((failure) => ({
    evidence: failure.evidence,
    action: `Restore locale contract: ${failure.name}`
  }));
  const sourceScanComplete = i18n.scan_complete === true;
  return {
    status: !sourceScanComplete
      ? PLAN_SOURCE_TRUTH_CONTRACT.incomplete_source_status
      : actions.length === 0
        ? "safe_to_execute"
        : PLAN_SOURCE_TRUTH_CONTRACT.known_finding_plan_status,
    contract: PLAN_SOURCE_TRUTH_CONTRACT,
    source_scan_complete: sourceScanComplete,
    blockers: sourceScanComplete
      ? []
      : [...new Set([...(i18n.blockers || []), "locale_sync_source_truth_incomplete"])],
    i18n,
    actions,
    note: !sourceScanComplete
      ? "Locale source truth is incomplete; no sync plan is ready for reliance."
      : actions.length === 0
        ? "Locale contract is already in sync."
        : "Locale sync plan only; no translation files were changed.",
    ...noExecution({ locale_sync_performed: false })
  };
}

export function buildRefactorPlan() {
  const readiness = inspectRefactorReadiness();
  return {
    status: readiness.blockers.length === 0 ? "dry_run_only" : "manual_verification_required",
    blockers: readiness.blockers,
    readiness,
    stages: [
      "establish a clean rollback baseline",
      "select one ownership boundary",
      "add or confirm focused tests",
      "make the smallest behavior-preserving change",
      "run quality-radar, drift-check, and full tests"
    ],
    ...noExecution({ refactor_performed: false })
  };
}
