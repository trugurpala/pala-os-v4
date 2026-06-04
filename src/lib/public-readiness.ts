import { createBoundedRepoTextReader, REPO_SCAN_CONTRACT, repoScanOptions } from "./repo-scan.ts";
import { inspectWorkflowContracts } from "./workflow-contract.ts";

export const PUBLIC_READY_FILES = [
  "README.md",
  "LICENSE",
  "NOTICE",
  "THIRD_PARTY_NOTICES.md",
  "SECURITY.md",
  "CONTRIBUTING.md",
  "CODE_OF_CONDUCT.md",
  "SUPPORT.md",
  "GOVERNANCE.md",
  "CHANGELOG.md",
  "ROADMAP.md",
  "docs/INSTALL.md",
  "docs/ARCHITECTURE.md",
  "docs/CLI.md",
  "docs/MEMORY.md",
  "docs/DECISION_ENGINE.md",
  "docs/TOKEN_ECONOMY.md",
  "docs/MCP_INSTALLER.md",
  "docs/MCP_CLIENTS.md",
  "docs/ADMIN.md",
  "docs/WORKER.md",
  "docs/PUBLIC_RELEASE.md",
  "docs/EVIDENCE_EXCHANGE.md",
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/PULL_REQUEST_TEMPLATE.md",
  ".github/workflows/ci.yml",
  ".github/workflows/security.yml",
  ".github/workflows/docs-drift.yml",
  ".github/workflows/scorecard.yml"
];

export const PUBLIC_READINESS_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_required_public_artifact_single_handle_scan",
  required_file_count: PUBLIC_READY_FILES.length,
  max_file_bytes: REPO_SCAN_CONTRACT.max_text_file_bytes,
  max_total_text_bytes: REPO_SCAN_CONTRACT.max_total_text_bytes,
  payload_exposed: false,
  writes_allowed: false,
  publish_allowed: false,
  push_allowed: false
});

export function inspectPublicReadiness(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const workflowContract = options.workflowContract || inspectWorkflowContracts(bounded);
  const missing = [];
  const empty = [];
  const unsafe = [];
  const blockers = [];
  const artifactInspections = [];

  for (const file of PUBLIC_READY_FILES) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      unsafe.push(file);
      blockers.push(inspected.blocker);
    } else if (!inspected.exists) {
      missing.push(file);
    } else if (!(inspected.text || "").trim()) {
      empty.push(file);
    }
    artifactInspections.push({
      file,
      status: inspected.status,
      exists: Boolean(inspected.exists),
      blocker: inspected.blocker || null,
      bytes: Number.isInteger(inspected.bytes) ? inspected.bytes : null,
      single_file_handle_used: inspected.single_file_handle_used === true,
      content_stable_during_read: inspected.content_stable_during_read === true,
      post_read_path_recheck_performed: inspected.post_read_path_recheck_performed === true,
      payload_exposed: false
    });
  }

  const textRead = textReader.summary();
  const uniqueBlockers = [...new Set([
    ...blockers.filter(Boolean),
    ...textRead.text_read_blockers,
    ...(workflowContract.scan_complete === false ? ["public_readiness_workflow_contract_scan_incomplete"] : [])
  ])];
  const scanComplete = uniqueBlockers.length === 0;
  const failures = [
    ...missing.map((file) => ({ name: `${file} is missing`, file, evidence: file })),
    ...empty.map((file) => ({ name: `${file} is empty`, file, evidence: file })),
    ...unsafe.map((file) => ({ name: `${file} could not be inspected safely`, file, evidence: file })),
    ...workflowContract.failures
  ];
  return {
    status: failures.length === 0 && scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: PUBLIC_READINESS_INSPECTION_CONTRACT,
    missing,
    empty,
    unsafe,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    artifact_inspections: artifactInspections,
    text_read: {
      ...textRead,
      payload_exposed: false
    },
    failures,
    required_files: PUBLIC_READY_FILES,
    workflow_contract: workflowContract,
    payload_exposed: false,
    writes_performed: false,
    publish_performed: false,
    push_performed: false,
    note: scanComplete
      ? "Bounded payload-free local public-readiness artifact check; it never publishes or pushes."
      : "Public-readiness PASS is blocked until every fixed artifact is read completely and safely."
  };
}
