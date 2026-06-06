import path from "node:path";
import { dbStatus, nowIso } from "./db.ts";
import { PATHS } from "./paths.ts";
import { STATE_FILE_IO_CONTRACT, readBoundedStateJson, writeBoundedStateJson } from "./state-file.ts";
import { inspectMasterWorkflow } from "./master-workflow.ts";

function first(db, sql) {
  return db.prepare(sql).get() || null;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function withoutValue(result) {
  const { value, ...metadata } = result;
  return metadata;
}

function summarizeFinalization(finalization) {
  if (!finalization || typeof finalization !== "object" || Array.isArray(finalization)) return null;
  const safeIdentifier = (value) => typeof value === "string" && /^[a-z][a-z0-9_:-]{0,119}$/i.test(value);
  const steps = {};
  if (finalization.steps && typeof finalization.steps === "object" && !Array.isArray(finalization.steps)) {
    for (const [name, value] of Object.entries(finalization.steps)) {
      if (!safeIdentifier(name) || !value || typeof value !== "object" || Array.isArray(value)) continue;
      steps[name] = {
        attempted: value.attempted === true,
        outcome: safeIdentifier(value.outcome) ? value.outcome : "unknown"
      };
    }
  }
  return {
    status: safeIdentifier(finalization.status) ? finalization.status : "manual_verification_required",
    blockers: Array.isArray(finalization.blockers)
      ? finalization.blockers.filter(safeIdentifier).slice(0, 20)
      : [],
    steps,
    payload_exposed_on_failure: false
  };
}

export function blockerIdsForVerificationFailure(name, pushBlockers = []) {
  if (name === "Active model and effort observed") return ["model_or_effort_unknown"];
  if (name === "Read-only admin privilege detection contract") return ["admin_privilege_detection_failed"];
  if (name === "Bounded local worker smoke contract") return ["worker_smoke_contract_failed"];
  if (name === "Bounded local external-skill readiness contract") return ["external_skill_readiness_contract_failed"];
  if (name === "Bounded smart-suggestion source truth contract") return ["smart_suggestion_source_truth_contract_failed"];
  if (name === "Plan source truth contract") return ["plan_source_truth_contract_failed"];
  if (name === "Bounded action-plan user-input metadata contract") return ["action_plan_user_input_contract_failed"];
  if (name === "Interactive mistake capture contract") return ["interactive_mistake_capture_contract_failed"];
  if (name === "Bounded contained memory registry append contract") return ["memory_registry_append_contract_failed"];
  if (name === "Bounded n8n import target inspection contract") return ["n8n_import_target_inspection_contract_failed"];
  if (name === "Bounded archive inventory contract") return ["archive_inventory_contract_failed"];
  if (name === "Fixed bounded ledger append contract") return ["ledger_append_contract_failed"];
  if (name === "Bounded atomic create-only raw evidence write contract") return ["raw_evidence_write_contract_failed"];
  if (name === "Bounded fixed public evidence atomic replace contract") return ["public_evidence_write_contract_failed"];
  if (name === "Bounded ledger safety scan contract") return ["ledger_safety_scan_contract_failed"];
  if (name === "Bounded contained atomic ledger repair contract") return ["ledger_repair_write_contract_failed"];
  if (name === "Bounded latest evidence lookup contract") return ["latest_evidence_lookup_contract_failed"];
  if (name === "Bounded repo quality scan contract") return ["repo_quality_scan_contract_failed"];
  if (name === "Bounded CLI path presence metadata contract") return ["cli_path_presence_metadata_contract_failed"];
  if (name === "Bounded quality required artifact path metadata contract") return ["quality_required_artifact_path_metadata_contract_failed"];
  if (name === "Bounded architecture path metadata contract") return ["architecture_path_metadata_contract_failed"];
  if (name === "Bounded i18n artifact path metadata contract") return ["i18n_artifact_path_metadata_contract_failed"];
  if (name === "Bounded git worktree and remote observation contract") return ["git_observation_contract_failed"];
  if (name === "Bounded memory registry scan contract") return ["memory_registry_scan_contract_failed"];
  if (name === "Bounded payload-free MCP fixture inspection contract") return ["mcp_fixture_inspection_contract_failed"];
  if (name === "Loopback-only bounded panel read contract") return ["panel_read_contract_failed"];
  if (name === "Bounded atomic dashboard generation contract") return ["dashboard_generation_contract_failed"];
  if (name === "Bounded raw-output-free runtime observation contract") return ["runtime_observation_contract_failed"];
  if (name === "Bounded runtime project asset path metadata contract") return ["runtime_project_asset_path_metadata_contract_failed"];
  if (name === "Bounded optional n8n CLI observation contract") return ["n8n_cli_observation_contract_failed"];
  if (name === "Bounded state JSON read and atomic refresh contract") return ["state_file_io_contract_failed"];
  if (name === "Bounded authorized database schema execution contract") return ["database_schema_execution_contract_failed"];
  if (name === "Fixed contained database path metadata contract") return ["database_path_metadata_contract_failed"];
  if (name === "Fixed contained create-only kernel bootstrap contract") return ["kernel_bootstrap_contract_failed"];
  if (name === "Bounded drift contract source-read contract") return ["drift_text_read_contract_failed"];
  if (name === "Bounded CLI contract source-read contract") return ["cli_text_read_contract_failed"];
  if (name === "Bounded CLAUDE sync dry-run inspection contract") return ["claude_sync_inspection_contract_failed"];
  if (name === "Bounded payload-free workflow inspection contract") return ["workflow_inspection_contract_failed"];
  if (name === "Bounded public readiness artifact inspection contract") return ["public_readiness_inspection_contract_failed"];
  if (name === "Atomic create-only evidence exchange export contract") return ["evidence_exchange_export_write_contract_failed"];
  if (name === "Memory registry scan complete and valid") return ["memory_registry_scan_incomplete_or_invalid"];
  if (name === "No unresolved sync state") return ["worktree_has_uncommitted_or_untracked_files"];
  if (name === "No unresolved push-readiness blockers") return pushBlockers.length > 0 ? pushBlockers : ["push_readiness_blocked"];
  const slug = String(name || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return [`verification_check_failed:${slug || "unknown"}`];
}

export function deriveProjectBlockers(input = {}) {
  const pushBlockers = Array.isArray(input.pushBlockers) ? input.pushBlockers : [];
  const syncBlockers = Array.isArray(input.syncBlockers)
    ? input.syncBlockers
    : input.syncStatus === "manual_verification_required"
      ? ["worktree_has_uncommitted_or_untracked_files"]
      : [];
  const blockers = [
    ...syncBlockers,
    ...pushBlockers,
    ...(input.modelObserved === "unknown" || !input.modelObserved || input.effortObserved === "unknown" || !input.effortObserved ? ["model_or_effort_unknown"] : []),
    ...(Array.isArray(input.finalFailures)
      ? input.finalFailures.flatMap((failure) => blockerIdsForVerificationFailure(failure, pushBlockers))
      : [])
  ].filter((blocker, index, all) => all.indexOf(blocker) === index);
  if (input.finalDecision && input.finalDecision !== "pass_allowed" && blockers.length === 0) {
    blockers.push("final_verify_requires_manual_verification");
  }
  return blockers;
}

export function buildOperationalSnapshot(db, input = {}) {
  const latestRun = first(db, `
    SELECT id, goal, status, risk_level, evidence_path, ended_at
    FROM runs ORDER BY started_at DESC LIMIT 1
  `);
  const latestDecision = first(db, `
    SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at
    FROM decisions ORDER BY created_at DESC LIMIT 1
  `);
  const latestFinalDecision = first(db, `
    SELECT decision, reason, risk_level, inputs_json, evidence_path, created_at
    FROM decisions WHERE decision_type = 'final-verify' ORDER BY created_at DESC LIMIT 1
  `);
  const latestSync = first(db, `
    SELECT status, summary, evidence_path, checked_at
    FROM sync_checks ORDER BY checked_at DESC LIMIT 1
  `);
  const latestPush = first(db, `
    SELECT status, blockers_json, evidence_path, checked_at
    FROM push_checks ORDER BY checked_at DESC LIMIT 1
  `);
  const latestModel = first(db, `
    SELECT m.observed_model, m.observed_effort, m.source, m.confidence, m.created_at,
      s.agent_surface, s.evidence_path AS runtime_evidence_path
    FROM model_effort_observations m
    LEFT JOIN operator_sessions s ON s.id = m.session_id
    ORDER BY m.created_at DESC LIMIT 1
  `);
  const openQualityFindings = first(db, `
    SELECT COUNT(*) AS count FROM quality_findings WHERE status = 'open'
  `)?.count || 0;

  const latestPushBlockers = latestPush ? parseJson(latestPush.blockers_json, []) : [];
  const latestSyncBlockers = latestSync?.summary?.startsWith("Git status observation incomplete: ")
    ? latestSync.summary
      .slice("Git status observation incomplete: ".length)
      .replace(/\.$/, "")
      .split(", ")
      .filter(Boolean)
    : latestSync?.status === "manual_verification_required"
      ? ["worktree_has_uncommitted_or_untracked_files"]
      : [];
  const latestFinalInputs = latestFinalDecision ? parseJson(latestFinalDecision.inputs_json, {}) : {};
  const projectBlockers = deriveProjectBlockers({
    syncStatus: latestSync?.status,
    syncBlockers: latestSyncBlockers,
    pushBlockers: latestPushBlockers,
    modelObserved: latestModel?.observed_model,
    effortObserved: latestModel?.observed_effort,
    finalDecision: latestFinalDecision?.decision,
    finalFailures: latestFinalInputs.failures
  });
  const infrastructureBlockers = Array.isArray(latestFinalInputs.failures)
    ? latestFinalInputs.failures.flatMap((failure) => blockerIdsForVerificationFailure(failure, latestPushBlockers))
    : [];
  const projectAcceptance = latestFinalDecision?.decision === "pass_allowed" && infrastructureBlockers.length === 0 ? "PASS" : "PARTIAL";
  const masterWorkflow = inspectMasterWorkflow();

  return {
    schema_version: 1,
    updated_at: nowIso(),
    rule: "Frontend reads truth. It does not create truth.",
    truth_sources: [".pala/db/pala.sqlite", ".pala/state", ".pala/ledger", ".pala/evidence", "docs/evidence"],
    current_command: input.command || null,
    current_command_record: input.commandRecord || null,
    current_finalization: summarizeFinalization(input.finalization),
    current_status: input.result?.status || null,
    command_acceptance_status: input.completion?.acceptance_status || "PARTIAL",
    project_acceptance_status: projectAcceptance,
    acceptance_status: projectAcceptance,
    infrastructure_acceptance: projectAcceptance,
    product_workflow_status: masterWorkflow.product_workflow_status,
    release_readiness: masterWorkflow.release_readiness,
    release_authorization: masterWorkflow.release_authorization,
    risk_summary: input.completion?.risk_summary || { level: "unknown", unresolved_blocker_count: 0, unresolved_blockers: [] },
    project_risk_summary: {
      level: projectBlockers.length > 0 ? "medium" : "low",
      unresolved_blocker_count: projectBlockers.length,
      unresolved_blockers: projectBlockers
    },
    next_action: input.completion?.next_action || "Run an evidence-backed local check.",
    raw_log_path: input.rawLogPath || null,
    changed_files_count: input.completion?.changed_files_count ?? null,
    db: dbStatus(db),
    latest_run: latestRun,
    latest_decision: latestDecision,
    latest_final_decision: latestFinalDecision,
    latest_sync: latestSync,
    latest_push: latestPush ? { ...latestPush, blockers: latestPushBlockers } : null,
    model_effort: latestModel || { observed_model: "unknown", observed_effort: "unknown", source: "unknown", confidence: "low", agent_surface: "unknown", runtime_evidence_path: null },
    open_quality_findings: openQualityFindings,
    missing_data_states: ["Unknown", "Not checked", "Partial", "Blocked", "Manual verification required", "Approval required"]
  };
}

export function refreshOperationalState(db, input = {}) {
  const snapshot = buildOperationalSnapshot(db, input);
  const dashboardPath = path.join(PATHS.stateDir, "dashboard-state.json");
  const latestCommandPath = path.join(PATHS.stateDir, "latest-command.json");
  const projectStatePath = path.join(PATHS.stateDir, "project-state.json");
  const towerStatePath = path.join(PATHS.stateDir, "control-tower-state.json");
  const projectStateRead = readBoundedStateJson(projectStatePath, { fallback: {} });
  const towerStateRead = readBoundedStateJson(towerStatePath, { fallback: {} });
  const existingProjectState = projectStateRead.value;
  const existingTowerState = towerStateRead.value;
  const existingRuntime = existingProjectState.runtime && typeof existingProjectState.runtime === "object" && !Array.isArray(existingProjectState.runtime)
    ? existingProjectState.runtime
    : {};

  const latestCommand = {
    schema_version: 1,
    updated_at: snapshot.updated_at,
    command: snapshot.current_command,
    command_record: snapshot.current_command_record,
    finalization: snapshot.current_finalization,
    status: snapshot.current_status,
    acceptance_status: snapshot.command_acceptance_status,
    raw_log_path: snapshot.raw_log_path,
    changed_files_count: snapshot.changed_files_count,
    risk_summary: snapshot.risk_summary,
    next_action: snapshot.next_action
  };
  const projectState = {
    ...existingProjectState,
    status: String(snapshot.project_acceptance_status || "PARTIAL").toLowerCase(),
    lastCommand: latestCommand,
    acceptance: {
      status: String(snapshot.project_acceptance_status || "PARTIAL").toLowerCase(),
      blockers: snapshot.project_risk_summary.unresolved_blockers
    },
    runtime: {
      ...existingRuntime,
      agentSurface: snapshot.model_effort.agent_surface || "unknown",
      modelObserved: snapshot.model_effort.observed_model || "unknown",
      effortObserved: snapshot.model_effort.observed_effort || "unknown",
      modelEffortStatus: snapshot.model_effort.observed_model !== "unknown" && snapshot.model_effort.observed_effort !== "unknown"
        ? "safe_to_execute"
        : "manual_verification_required"
    },
    updatedAt: snapshot.updated_at
  };
  const towerState = {
    ...existingTowerState,
    status: String(snapshot.project_acceptance_status || "PARTIAL").toLowerCase(),
    latestCommand: snapshot.current_command,
    latestEvidence: snapshot.raw_log_path,
    agentSurface: snapshot.model_effort.agent_surface || "unknown",
    modelObserved: snapshot.model_effort.observed_model || "unknown",
    effortObserved: snapshot.model_effort.observed_effort || "unknown",
    blockers: snapshot.project_risk_summary.unresolved_blockers,
    counts: snapshot.db.tables,
    updatedAt: snapshot.updated_at
  };
  const writes = [
    writeBoundedStateJson(dashboardPath, snapshot),
    writeBoundedStateJson(latestCommandPath, latestCommand),
    writeBoundedStateJson(projectStatePath, projectState),
    writeBoundedStateJson(towerStatePath, towerState)
  ];
  const reads = [withoutValue(projectStateRead), withoutValue(towerStateRead)];
  const blockers = [...new Set([...reads, ...writes].flatMap((item) => item.blockers || []))];

  return {
    dashboard_state_path: writes[0].path,
    latest_command_path: writes[1].path,
    project_state_path: writes[2].path,
    control_tower_state_path: writes[3].path,
    state_io: {
      status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
      contract: STATE_FILE_IO_CONTRACT,
      blockers,
      reads,
      writes
    }
  };
}
