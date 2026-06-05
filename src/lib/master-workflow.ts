import path from "node:path";
import { PROJECT_ROOT } from "./paths.ts";
import { readBoundedRepoText } from "./repo-scan.ts";

export const MASTER_WORKFLOW_PATH = ".pala/master-workflow.json";
export const MASTER_GATE_PATHS = Object.freeze([
  ".pala/gates/01-intake.json",
  ".pala/gates/02-research.json",
  ".pala/gates/03-figma-product.json",
  ".pala/gates/04-execution.json",
  ".pala/gates/05-evidence.json",
  ".pala/gates/06-tests.json",
  ".pala/gates/07-security.json",
  ".pala/gates/08-token-economy.json",
  ".pala/gates/09-drift-sync.json",
  ".pala/gates/10-release.json"
]);
export const MASTER_LEDGER_PATHS = Object.freeze([
  ".pala/ledger/evidence.jsonl",
  ".pala/ledger/decisions.jsonl",
  ".pala/ledger/token-cost.jsonl",
  ".pala/ledger/verification.jsonl"
]);

export const MASTER_WORKFLOW_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_fixed_master_workflow_and_ledger_truth_inspection",
  gate_count: MASTER_GATE_PATHS.length,
  ledger_count: MASTER_LEDGER_PATHS.length,
  max_file_bytes: 1_000_000,
  max_ledger_records_per_file: 500,
  dashboard_truth_source: ".pala/ledger",
  writes_allowed: false
});

function readText(relativePath, projectRoot) {
  return readBoundedRepoText(relativePath, {
    projectRoot,
    maxTextFileBytes: MASTER_WORKFLOW_INSPECTION_CONTRACT.max_file_bytes,
    maxTotalTextBytes: MASTER_WORKFLOW_INSPECTION_CONTRACT.max_file_bytes
  });
}

function parseJsonFile(relativePath, projectRoot) {
  const inspected = readText(relativePath, projectRoot);
  if (inspected.status !== "safe_to_execute" || !inspected.exists) {
    return { inspected, value: null, blocker: inspected.blocker || `${relativePath}_missing` };
  }
  try {
    return { inspected, value: JSON.parse(inspected.text), blocker: null };
  } catch {
    return { inspected, value: null, blocker: `${relativePath}_invalid_json` };
  }
}

function parseLedger(relativePath, projectRoot) {
  const inspected = readText(relativePath, projectRoot);
  if (inspected.status !== "safe_to_execute" || !inspected.exists) {
    return { inspected, records: [], blocker: inspected.blocker || `${relativePath}_missing` };
  }
  const lines = inspected.text.split(/\r?\n/).filter((line) => line.trim());
  try {
    return {
      inspected,
      records: lines.slice(-MASTER_WORKFLOW_INSPECTION_CONTRACT.max_ledger_records_per_file).map((line) => JSON.parse(line)),
      blocker: null
    };
  } catch {
    return { inspected, records: [], blocker: `${relativePath}_invalid_jsonl` };
  }
}

function latestGateRecords(records) {
  const latest = new Map();
  for (const record of records) {
    const gateId = typeof record?.gate_id === "string" ? record.gate_id : null;
    if (gateId) latest.set(gateId, record);
  }
  return latest;
}

function gatePassed(record) {
  return record?.status === "passed" || record?.status === "pass_allowed" || record?.passed === true;
}

export function hasExplicitHumanApproval(record) {
  return record?.approval?.approved === true
    && record.approval.approver_type === "human"
    && typeof record.approval.approved_by === "string"
    && record.approval.approved_by.trim().length > 0
    && typeof record.approval.evidence_path === "string"
    && /^(\.pala\/evidence\/raw\/[a-zA-Z0-9._-]+\.log|docs\/evidence\/[a-zA-Z0-9._/-]+\.md)$/.test(record.approval.evidence_path);
}

export function effectiveGateStatus(gateId, record) {
  const recordedStatus = record?.status || "not_checked";
  if (recordedStatus === "needs_approval") return "approval_required";
  if (["figma-product", "release"].includes(gateId) && recordedStatus === "manual_verification_required") {
    return "approval_required";
  }
  if (["figma-product", "release"].includes(gateId) && gatePassed(record) && !hasExplicitHumanApproval(record)) {
    return "approval_required";
  }
  return recordedStatus;
}

function tokenCostSummary(records) {
  const knownTokens = records.reduce((sum, record) => sum + Number(record?.known_tokens || 0), 0);
  const estimatedTokens = records.reduce((sum, record) => sum + Number(record?.estimated_tokens || 0), 0);
  const estimatedCost = records.reduce((sum, record) => sum + Number(record?.estimated_cost || 0), 0);
  return {
    record_count: records.length,
    known_tokens: knownTokens || null,
    estimated_tokens: estimatedTokens || null,
    estimated_cost: estimatedCost || null,
    confidence: records.length > 0 ? "ledger_reported" : "unknown"
  };
}

export function inspectMasterWorkflow(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const masterRead = parseJsonFile(MASTER_WORKFLOW_PATH, projectRoot);
  const gateReads = MASTER_GATE_PATHS.map((gatePath) => ({ path: gatePath, ...parseJsonFile(gatePath, projectRoot) }));
  const ledgerReads = MASTER_LEDGER_PATHS.map((ledgerPath) => ({ path: ledgerPath, ...parseLedger(ledgerPath, projectRoot) }));
  const dashboardSource = readText("src/lib/dashboard.ts", projectRoot);
  const panelDataSource = readText("src/lib/panel-data.ts", projectRoot);
  const blockers = [
    masterRead.blocker,
    ...gateReads.map((item) => item.blocker),
    ...ledgerReads.map((item) => item.blocker)
  ].filter(Boolean);
  const master = masterRead.value;
  const gates = gateReads.map((item) => item.value).filter(Boolean);
  const referencedPaths = Array.isArray(master?.gates) ? master.gates.map((gate) => gate?.path) : [];
  const referencedIds = Array.isArray(master?.gates) ? master.gates.map((gate) => gate?.id) : [];
  const checks = [
    { name: "all gate files exist", ok: gateReads.every((item) => item.value), evidence: MASTER_GATE_PATHS },
    { name: "master workflow references every gate", ok: MASTER_GATE_PATHS.every((gatePath) => referencedPaths.includes(gatePath)) && gates.every((gate) => referencedIds.includes(gate.id)), evidence: MASTER_WORKFLOW_PATH },
    { name: "evidence ledger exists", ok: ledgerReads.find((item) => item.path.endsWith("/evidence.jsonl"))?.inspected.exists === true, evidence: ".pala/ledger/evidence.jsonl" },
    { name: "token-cost ledger exists", ok: ledgerReads.find((item) => item.path.endsWith("/token-cost.jsonl"))?.inspected.exists === true, evidence: ".pala/ledger/token-cost.jsonl" },
    { name: "UI/Product tasks cannot pass without Figma gate", ok: master?.task_rules?.ui_product_requires_figma_gate === true && gates.find((gate) => gate.id === "execution")?.ui_product_requires?.includes("figma-product"), evidence: ".pala/gates/04-execution.json" },
    { name: "approval-gated PASS requires explicit human approval evidence", ok: master?.task_rules?.approval_gated_pass_requires_human_evidence === true && gates.filter((gate) => ["figma-product", "release"].includes(gate.id)).every((gate) => gate.approval_required_for_pass === true), evidence: ".pala/master-workflow.json/.pala/gates/03-figma-product.json/.pala/gates/10-release.json" },
    { name: "done status cannot pass without evidence", ok: master?.task_rules?.done_requires_evidence === true && gates.find((gate) => gate.id === "evidence")?.done_requires_evidence === true && gates.find((gate) => gate.id === "release")?.done_requires_evidence === true, evidence: ".pala/gates/05-evidence.json" },
    {
      name: "dashboard reads ledger data, not hardcoded fake data",
      ok: master?.task_rules?.dashboard_truth_source === ".pala/ledger"
        && dashboardSource.status === "safe_to_execute"
        && dashboardSource.text.includes("\"master-workflow\"")
        && panelDataSource.status === "safe_to_execute"
        && panelDataSource.text.includes("inspectMasterWorkflow()"),
      evidence: "src/lib/panel-data.ts"
    }
  ];
  for (const check of checks.filter((item) => !item.ok)) blockers.push(check.name);

  const ledgerByPath = new Map(ledgerReads.map((item) => [item.path, item.records]));
  const evidenceRecords = ledgerByPath.get(".pala/ledger/evidence.jsonl") || [];
  const verificationRecords = ledgerByPath.get(".pala/ledger/verification.jsonl") || [];
  const decisionRecords = ledgerByPath.get(".pala/ledger/decisions.jsonl") || [];
  const tokenRecords = ledgerByPath.get(".pala/ledger/token-cost.jsonl") || [];
  const latest = latestGateRecords([...evidenceRecords, ...verificationRecords, ...tokenRecords]);
  const gateStates = (Array.isArray(master?.gates) ? master.gates : []).map((gate) => {
    const record = latest.get(gate.id);
    const recordedStatus = record?.status || "not_checked";
    let status = effectiveGateStatus(gate.id, record);
    if (gate.id === "execution" && effectiveGateStatus("figma-product", latest.get("figma-product")) !== "passed") {
      status = "blocked";
    }
    return {
      order: gate.order,
      gate_id: gate.id,
      gate: gates.find((item) => item.id === gate.id)?.name || gate.id,
      status,
      recorded_status: recordedStatus,
      evidence_path: record?.evidence_path || null,
      manual_verification_required: status === "manual_verification_required",
      approval_required: status === "approval_required",
      explicit_human_approval: hasExplicitHumanApproval(record)
    };
  });
  const passedGates = gateStates.filter((gate) => gate.status === "passed").map((gate) => gate.gate_id);
  const blockedGates = gateStates.filter((gate) => gate.status === "blocked").map((gate) => gate.gate_id);
  const missingEvidence = gateStates.filter((gate) => !gate.evidence_path).map((gate) => gate.gate_id);
  const manualItems = [
    ...gateStates.filter((gate) => gate.manual_verification_required).map((gate) => `gate:${gate.gate_id}`),
    ...decisionRecords
      .filter((record) => ["manual_verification_required", "needs_approval"].includes(record?.decision))
      .slice(-20)
      .map((record) => record?.reason || record?.decision_type || "decision_review_required")
  ];
  const figmaGate = gateStates.find((gate) => gate.gate_id === "figma-product");
  const executionGate = gateStates.find((gate) => gate.gate_id === "execution");
  const releaseGate = gateStates.find((gate) => gate.gate_id === "release");
  const infrastructureAcceptance = blockers.length === 0 && checks.every((check) => check.ok) ? "PASS" : "PARTIAL";
  const productWorkflowStatus = executionGate?.status || "not_checked";
  const releaseReadiness = releaseGate?.recorded_status === "passed" ? "passed" : releaseGate?.recorded_status || "not_checked";
  const releaseAuthorization = releaseGate?.explicit_human_approval ? "approved" : "approval_required";

  return {
    status: infrastructureAcceptance === "PASS" ? "safe_to_execute" : "manual_verification_required",
    contract: MASTER_WORKFLOW_INSPECTION_CONTRACT,
    checks,
    failures: checks.filter((check) => !check.ok),
    blockers: [...new Set(blockers)],
    current_gate: gateStates.find((gate) => gate.status !== "passed")?.gate_id || "release",
    passed_gates: passedGates,
    blocked_gates: blockedGates,
    missing_evidence: missingEvidence,
    token_cost_summary: tokenCostSummary(tokenRecords),
    manual_verification_required_items: [...new Set(manualItems)],
    approval_required_items: gateStates.filter((gate) => gate.approval_required).map((gate) => `gate:${gate.gate_id}`),
    infrastructure_acceptance: infrastructureAcceptance,
    product_workflow_status: productWorkflowStatus,
    figma_product_status: figmaGate?.status || "not_checked",
    release_readiness: releaseReadiness,
    release_authorization: releaseAuthorization,
    gate_states: gateStates,
    truth_sources: MASTER_LEDGER_PATHS,
    dashboard_truth_source: ".pala/ledger",
    writes_performed: false
  };
}
