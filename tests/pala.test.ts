import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { PANEL_READ_CONTRACT, createPanelServer, panelStartupFailureResult, startPanelServer } from "../src/panel-server.ts";
import {
  ACTION_PLAN_USER_INPUT_CONTRACT,
  ARCHIVE_INVENTORY_CONTRACT,
  buildArchivePlan,
  buildAutopilotPlan,
  buildAutopilotRunGate,
  buildDriftFixPlan,
  buildExternalSkillProposal,
  buildLocaleSyncPlan,
  buildN8nImportPlan,
  N8N_IMPORT_INSPECTION_CONTRACT,
  PLAN_SOURCE_TRUTH_CONTRACT,
  buildN8nPlan,
  buildRefactorPlan,
  buildWorkerRunPlan
} from "../src/lib/action-plans.ts";
import { CONTROL_ROUTES, DASHBOARD_GENERATION_CONTRACT, dashboardState, generateDashboardRoutes } from "../src/lib/dashboard.ts";
import { DECISION_RECORD_CONTRACT, assessGoal, recordDecision } from "../src/lib/decision-engine.ts";
import { buildDecisionReviewQueue } from "../src/lib/decision-review.ts";
import { DATABASE_PATH_INSPECTION_CONTRACT, DATABASE_SCHEMA_EXECUTION_CONTRACT, DECISIONS, KERNEL_BOOTSTRAP_CONTRACT, bootstrapKernel, ensureKernel, executeDatabaseSchema, inspectDatabasePath, inspectDatabaseSchema, migrateDatabase } from "../src/lib/db.ts";
import { buildCompletionSummary } from "../src/lib/completion.ts";
import { CLI_COMMAND_RECORD_CONTRACT, buildCliCommandRecord } from "../src/lib/cli-command.ts";
import { CLI_FINALIZATION_CONTRACT, finalizeCliCommand } from "../src/lib/cli-finalization.ts";
import { CLI_OUTPUT_CONTRACT, cliFailureResult, topLevelCliFailureResult, unknownCliCommandResult, writeCliOutputAfterDatabaseClose, writeTopLevelCliFailure } from "../src/lib/cli-output.ts";
import { CONTRACT_TEXT_READ_CONTRACT, createContractTextReader } from "../src/lib/contract-text.ts";
import { DRIFT_TEXT_READ_CONTRACT, inspectDrift, inspectVersionContract } from "../src/lib/drift.ts";
import { LATEST_EVIDENCE_CONTRACT, PUBLIC_EVIDENCE_WRITE_CONTRACT, RAW_EVIDENCE_WRITE_CONTRACT, latestEvidence, writeEvidence, writePublicEvidence } from "../src/lib/evidence.ts";
import { EVIDENCE_EXCHANGE_CONTRACT, EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT, EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY, EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY, EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY, EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY, EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY, assertEvidenceExchangeContentDigest, buildEvidenceExchangePreview, buildSanitizedEvidenceExport, checkEvidenceExchangeCompleteness, compareEvidenceExchangeTarget, evidenceExchangeByteBudget, evidenceExchangeCompatibility, evidenceExchangeContentDigest, inspectEvidenceImport, inspectEvidenceMigration, planEvidenceExchangeImport, planEvidenceExchangeMigration, planEvidenceExchangeMigrationReadiness, validateEvidenceExchange, writeSanitizedEvidenceExport } from "../src/lib/evidence-exchange.ts";
import { LEDGER_APPEND_CONTRACT, appendLedger } from "../src/lib/ledger.ts";
import { LEDGER_MUTATION_LOCK_CONTRACT } from "../src/lib/ledger-lock.ts";
import { LEDGER_REPAIR_WRITE_CONTRACT, LEDGER_SAFETY_SCAN_CONTRACT, inspectLedgerSafety, repairLedgerSafety } from "../src/lib/ledger-safety.ts";
import { INTERACTIVE_MISTAKE_CONTRACT, collectInteractiveMistake } from "../src/lib/interactive-memory.ts";
import { CLAUDE_SYNC_INSPECTION_CONTRACT, MEMORY_REGISTRY_APPEND_CONTRACT, addMistake, appendMemoryRegistryRecord, claudeSyncDryRun, inspectMemoryRegistry, MEMORY_REGISTRY_SCAN_CONTRACT, memoryStatus, promoteRuleDryRun } from "../src/lib/memory.ts";
import { MCP_FIXTURE_FILES, MCP_FIXTURE_INSPECTION_CONTRACT, planMcpRepair } from "../src/lib/mcp-dry-run.ts";
import {
  EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT,
  I18N_ARTIFACT_INSPECTION_CONTRACT,
  N8N_CLI_OBSERVATION_CONTRACT,
  OPPORTUNITY_RADAR_INSPECTION_CONTRACT,
  SMART_SUGGESTION_INSPECTION_CONTRACT,
  WORKER_ENTRYPOINT_INSPECTION_CONTRACT,
  inspectAdmin,
  inspectExternalSkillsDryRun,
  inspectI18n,
  inspectLanguagePolicy,
  inspectN8n,
  inspectOpportunityRadar,
  inspectRefactorReadiness,
  inspectRollbackReadiness,
  inspectSmartSuggestions,
  inspectSurprises,
  inspectWorker
} from "../src/lib/operations.ts";
import { createPaths } from "../src/lib/paths.ts";
import { panelRouteData } from "../src/lib/panel-data.ts";
import { inspectPushReadiness } from "../src/lib/push-readiness.ts";
import { QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT, docsHonestyFindings, hasUnsupportedHypeClaim, hasUnsupportedPublishClaim, inspectHardcodedPaths, inspectQualityRadar, inspectQualityRequiredArtifacts, workspaceHygieneFindings } from "../src/lib/quality-radar.ts";
import { inspectPublicReadiness, PUBLIC_READINESS_INSPECTION_CONTRACT, PUBLIC_READY_FILES } from "../src/lib/public-readiness.ts";
import { REFERENCE_REFRESH_WRITE_CONTRACT, buildReferenceRefreshPlan, referenceCoverage, referenceRadarState, refreshReferenceRadar } from "../src/lib/reference-radar.ts";
import { ARCHITECTURE_PATH_INSPECTION_CONTRACT, CLAUDE_SKILL_INSPECTION_CONTRACT, buildCodeMap, inspectArchitecture, inspectClaudeAssets, inspectDuplicates, inspectExamples, inspectPlaybooks, inspectPrompts, inspectRepoInventory } from "../src/lib/repo-inspection.ts";
import { REPO_PATH_INSPECTION_CONTRACT, REPO_PATH_PRESENCE_CONTRACT, REPO_SCAN_CONTRACT, createBoundedRepoTextReader, inspectRepoPathPresence } from "../src/lib/repo-scan.ts";
import { redact } from "../src/lib/redaction.ts";
import { RUNTIME_OBSERVATION_CONTRACT, RUNTIME_PROJECT_ASSET_CONTRACT, detectAgentSurface, observeRuntime } from "../src/lib/runtime.ts";
import { buildOperationalSnapshot, deriveProjectBlockers } from "../src/lib/state-refresh.ts";
import { STATE_FILE_IO_CONTRACT, readBoundedStateJson, writeBoundedStateJson } from "../src/lib/state-file.ts";
import { gitStatusLines, inspectGitHead, inspectGitStatus, inspectSync, SYNC_OBSERVATION_CONTRACT } from "../src/lib/sync.ts";
import { tokenSummary } from "../src/lib/token-economy.ts";
import { WORKFLOW_INSPECTION_CONTRACT, inspectWorkflowContracts, inspectWorkflowMutations } from "../src/lib/workflow-contract.ts";
import { WORKER_PACKAGE_INSPECTION_CONTRACT, inspectWorkerPackage } from "../src/worker.ts";

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "./src/cli.ts", ...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runDashboardGenerationProcess(projectRoot, barrierPath, injectConcurrentDirectoryCreate = false) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import { generateDashboardRoutes } from "./src/lib/dashboard.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
if (process.env.PALA_DASHBOARD_INJECT_CONCURRENT_DIRECTORY_CREATE === "true") {
  const originalMkdirSync = fs.mkdirSync;
  let concurrentCreateInjected = false;
  fs.mkdirSync = (...args) => {
    originalMkdirSync(...args);
    if (!concurrentCreateInjected) {
      concurrentCreateInjected = true;
      const error = new Error("injected concurrent dashboard directory creation");
      error.code = "EEXIST";
      throw error;
    }
  };
}
while (!fs.existsSync(process.env.PALA_DASHBOARD_BARRIER)) Atomics.wait(waitArray, 0, 0, 1);
process.stdout.write(JSON.stringify(generateDashboardRoutes({ projectRoot: process.env.PALA_DASHBOARD_ROOT })));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_DASHBOARD_ROOT: projectRoot,
        PALA_DASHBOARD_BARRIER: barrierPath,
        PALA_DASHBOARD_INJECT_CONCURRENT_DIRECTORY_CREATE: String(injectConcurrentDirectoryCreate)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runStateWriteProcess(projectRoot, barrierPath, writerIndex) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import path from "node:path";
import { writeBoundedStateJson } from "./src/lib/state-file.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
while (!fs.existsSync(process.env.PALA_STATE_BARRIER)) Atomics.wait(waitArray, 0, 0, 1);
const target = path.join(process.env.PALA_STATE_ROOT, ".pala", "state", "dashboard-state.json");
const value = { writer: process.env.PALA_STATE_WRITER, padding: "x".repeat(Number(process.env.PALA_STATE_PADDING)) };
process.stdout.write(JSON.stringify(writeBoundedStateJson(target, value, { projectRoot: process.env.PALA_STATE_ROOT })));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_STATE_ROOT: projectRoot,
        PALA_STATE_BARRIER: barrierPath,
        PALA_STATE_WRITER: `writer-${writerIndex}`,
        PALA_STATE_PADDING: String(writerIndex * 17)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runKernelBootstrapProcess(projectRoot, barrierPath) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import { bootstrapKernel } from "./src/lib/db.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
const originalMkdirSync = fs.mkdirSync;
let concurrentCreateInjected = false;
fs.mkdirSync = (...args) => {
  originalMkdirSync(...args);
  if (!concurrentCreateInjected) {
    concurrentCreateInjected = true;
    const error = new Error("injected concurrent kernel directory creation");
    error.code = "EEXIST";
    throw error;
  }
};
while (!fs.existsSync(process.env.PALA_KERNEL_BARRIER)) Atomics.wait(waitArray, 0, 0, 1);
process.stdout.write(JSON.stringify(bootstrapKernel({ projectRoot: process.env.PALA_KERNEL_ROOT })));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_KERNEL_ROOT: projectRoot,
        PALA_KERNEL_BARRIER: barrierPath
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runMemoryRegistryAppendProcess(projectRoot, barrierPath, writerIndex) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import path from "node:path";
import { appendMemoryRegistryRecord } from "./src/lib/memory.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
const originalLinkSync = fs.linkSync;
fs.linkSync = (...args) => {
  if (path.basename(String(args[1])) === "mistake-registry.jsonl") {
    Atomics.wait(waitArray, 0, 0, 50);
  }
  return originalLinkSync(...args);
};
while (!fs.existsSync(process.env.PALA_MEMORY_BARRIER)) Atomics.wait(waitArray, 0, 0, 1);
process.stdout.write(appendMemoryRegistryRecord({
  id: process.env.PALA_MEMORY_WRITER,
  summary: "concurrent memory registry append",
  status: "captured"
}, { projectRoot: process.env.PALA_MEMORY_ROOT }));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_MEMORY_ROOT: projectRoot,
        PALA_MEMORY_BARRIER: barrierPath,
        PALA_MEMORY_WRITER: `writer-${writerIndex}`
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runLedgerRepairProcess(projectRoot, beforeRenameMarker) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import path from "node:path";
import { repairLedgerSafety } from "./src/lib/ledger-safety.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
const originalRenameSync = fs.renameSync;
fs.renameSync = (...args) => {
  if (path.basename(String(args[1])) === "events.jsonl") {
    fs.writeFileSync(process.env.PALA_LEDGER_REPAIR_MARKER, "ready", "utf8");
    Atomics.wait(waitArray, 0, 0, 150);
  }
  return originalRenameSync(...args);
};
process.stdout.write(JSON.stringify(repairLedgerSafety({
  apply: true,
  projectRoot: process.env.PALA_LEDGER_ROOT,
  ledgerDir: path.join(process.env.PALA_LEDGER_ROOT, ".pala", "ledger")
})));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_LEDGER_ROOT: projectRoot,
        PALA_LEDGER_REPAIR_MARKER: beforeRenameMarker
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runLedgerAppendAfterMarkerProcess(projectRoot, beforeRenameMarker) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import { appendLedger } from "./src/lib/ledger.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
while (!fs.existsSync(process.env.PALA_LEDGER_REPAIR_MARKER)) Atomics.wait(waitArray, 0, 0, 1);
process.stdout.write(appendLedger("events", { event: "concurrent-safe-event" }, {
  projectRoot: process.env.PALA_LEDGER_ROOT
}));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_LEDGER_ROOT: projectRoot,
        PALA_LEDGER_REPAIR_MARKER: beforeRenameMarker
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runPublicEvidenceWriteProcess(projectRoot, barrierPath, writerIndex) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import path from "node:path";
import { writePublicEvidence } from "./src/lib/evidence.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
const originalRenameSync = fs.renameSync;
let transientReplaceInjected = false;
fs.renameSync = (...args) => {
  if (path.basename(String(args[1])) === "official-compatibility-check.md" && !transientReplaceInjected) {
    transientReplaceInjected = true;
    const error = new Error("injected transient public evidence replace contention");
    error.code = "EACCES";
    throw error;
  }
  originalRenameSync(...args);
  if (path.basename(String(args[1])) !== "official-compatibility-check.md") return;
  fs.writeFileSync(
    path.join(process.env.PALA_PUBLIC_EVIDENCE_MARKERS, process.env.PALA_PUBLIC_EVIDENCE_WRITER),
    "published",
    "utf8"
  );
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && fs.readdirSync(process.env.PALA_PUBLIC_EVIDENCE_MARKERS).length < 12) {
    Atomics.wait(waitArray, 0, 0, 1);
  }
};
while (!fs.existsSync(process.env.PALA_PUBLIC_EVIDENCE_BARRIER)) Atomics.wait(waitArray, 0, 0, 1);
const markdown = [
  "# Compatibility",
  "",
  "writer=" + process.env.PALA_PUBLIC_EVIDENCE_WRITER,
  "secret=must-never-be-returned-" + process.env.PALA_PUBLIC_EVIDENCE_WRITER,
  "padding=" + "x".repeat(Number(process.env.PALA_PUBLIC_EVIDENCE_PADDING))
].join("\\n");
process.stdout.write(writePublicEvidence("official-compatibility-check.md", markdown, {
  projectRoot: process.env.PALA_PUBLIC_EVIDENCE_ROOT
}));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_PUBLIC_EVIDENCE_ROOT: projectRoot,
        PALA_PUBLIC_EVIDENCE_BARRIER: barrierPath,
        PALA_PUBLIC_EVIDENCE_MARKERS: path.join(projectRoot, ".public-evidence-markers"),
        PALA_PUBLIC_EVIDENCE_WRITER: `writer-${writerIndex}`,
        PALA_PUBLIC_EVIDENCE_PADDING: String(10_000 + writerIndex * 7_000)
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function runEvidenceExchangeExportProcess(projectRoot, barrierPath) {
  return new Promise((resolve) => {
    const script = `
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { migrateDatabase } from "./src/lib/db.ts";
import { writeSanitizedEvidenceExport } from "./src/lib/evidence-exchange.ts";
const waitArray = new Int32Array(new SharedArrayBuffer(4));
const db = new DatabaseSync(":memory:");
db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
migrateDatabase(db);
while (!fs.existsSync(process.env.PALA_EXCHANGE_EXPORT_BARRIER)) Atomics.wait(waitArray, 0, 0, 1);
const result = writeSanitizedEvidenceExport(db, "docs/evidence/exports/concurrent.json", {
  projectRoot: process.env.PALA_EXCHANGE_EXPORT_ROOT
});
db.close();
process.stdout.write(JSON.stringify(result));
`;
    const child = spawn(process.execPath, ["--no-warnings=ExperimentalWarning", "--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PALA_EXCHANGE_EXPORT_ROOT: projectRoot,
        PALA_EXCHANGE_EXPORT_BARRIER: barrierPath
      },
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("v28 decision engine uses the required vocabulary", () => {
  assert.deepEqual(DECISIONS, [
    "blocked",
    "needs_approval",
    "dry_run_only",
    "safe_local_write",
    "manual_verification_required",
    "pass_allowed"
  ]);
  assert.equal(assessGoal("write local documentation").decision, "safe_local_write");
  assert.equal(assessGoal("inspect mcp config").decision, "dry_run_only");
  assert.equal(assessGoal("git push the release").decision, "needs_approval");
});

test("decision records redact bounded inputs before DB, evidence, and ledger persistence", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  db.prepare(`
    INSERT INTO projects (id, root_path_hash, name, created_at, updated_at)
    VALUES ('decision-project', 'decision-hash', 'Decision', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO runs (id, project_id, started_at, goal, status)
    VALUES ('decision-run', 'decision-project', '2026-01-01T00:00:00.000Z', 'decision', 'running')
  `).run();
  const evidencePayloads = [];
  const ledgerPayloads = [];
  const dependencies = {
    writeEvidence: (_kind, payload) => {
      evidencePayloads.push(payload);
      return ".pala/evidence/raw/decision.log";
    },
    appendLedger: (_name, payload) => {
      ledgerPayloads.push(payload);
      return ".pala/ledger/decisions.jsonl";
    }
  };
  const recorded = recordDecision(db, {
    runId: "decision-run",
    decisionType: "sensitive-decision",
    inputs: {
      token: "must-never-be-returned",
      path: "C:\\Users\\Private\\project",
      nested: { authorization: "Bearer abcdefghijklmnop" }
    },
    tokenBudget: {
      estimated_tokens: 100,
      note: "token=must-never-be-returned C:\\Users\\Private\\budget.txt"
    },
    relatedRuleIds: [
      "core-rules:no-evidence-no-pass",
      "token=must-never-be-returned",
      "C:\\Users\\Private\\rule.txt"
    ],
    assessment: {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "token=must-never-be-returned C:\\Users\\Private\\project"
    }
  }, dependencies);

  assert.equal(DECISION_RECORD_CONTRACT.policy, "bounded_redacted_decision_record_before_persistence");
  assert.equal(DECISION_RECORD_CONTRACT.max_inputs_bytes, 100_000);
  assert.equal(DECISION_RECORD_CONTRACT.max_metadata_bytes, 25_000);
  assert.equal(DECISION_RECORD_CONTRACT.max_related_rule_count, 100);
  assert.equal(DECISION_RECORD_CONTRACT.max_related_rule_id_bytes, 256);
  assert.equal(DECISION_RECORD_CONTRACT.max_reason_bytes, 2_000);
  assert.equal(DECISION_RECORD_CONTRACT.raw_inputs_exposed, false);
  assert.equal(DECISION_RECORD_CONTRACT.raw_metadata_exposed, false);
  assert.equal(DECISION_RECORD_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(recorded.inputs_record.status, "safe_to_execute");
  assert.equal(recorded.metadata_record.status, "safe_to_execute");
  assert.equal(recorded.decision, "safe_local_write");
  const persisted = db.prepare("SELECT inputs_json, reason FROM decisions WHERE id = ?").get(recorded.id);
  const serialized = JSON.stringify({ recorded, persisted, evidencePayloads, ledgerPayloads });
  assert.doesNotMatch(serialized, /must-never-be-returned|Private|Users|abcdefghijklmnop/);

  const oversized = recordDecision(db, {
    runId: "decision-run",
    decisionType: "oversized-decision",
    inputs: { padding: "x".repeat(DECISION_RECORD_CONTRACT.max_inputs_bytes + 1) },
    assessment: {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "safe"
    }
  }, dependencies);
  assert.equal(oversized.inputs_record.status, "manual_verification_required");
  assert.equal(oversized.inputs.recording_status, "metadata_only");
  assert.equal(oversized.decision, "manual_verification_required");
  assert.equal(JSON.stringify(oversized).includes("x".repeat(1_000)), false);

  const circularInputs = {};
  circularInputs.self = circularInputs;
  const circular = recordDecision(db, {
    runId: "decision-run",
    decisionType: "circular-decision",
    inputs: circularInputs,
    assessment: {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "safe"
    }
  }, dependencies);
  assert.equal(circular.inputs_record.status, "manual_verification_required");
  assert.equal(circular.inputs.recording_status, "metadata_only");
  assert.equal(circular.decision, "manual_verification_required");

  const oversizedMetadata = recordDecision(db, {
    runId: "decision-run",
    decisionType: "oversized-metadata-decision",
    inputs: { safe: true },
    tokenBudget: { padding: "x".repeat(DECISION_RECORD_CONTRACT.max_metadata_bytes + 1) },
    relatedRuleIds: ["core-rules:no-evidence-no-pass"],
    assessment: {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "safe"
    }
  }, dependencies);
  assert.equal(oversizedMetadata.metadata_record.status, "manual_verification_required");
  assert.equal(oversizedMetadata.token_budget, null);
  assert.deepEqual(oversizedMetadata.related_rule_ids, [
    "core-rules:no-evidence-no-pass",
    "decision-engine-policy:no-invisible-decisions"
  ]);
  assert.equal(oversizedMetadata.decision, "manual_verification_required");
  assert.equal(JSON.stringify(oversizedMetadata).includes("x".repeat(1_000)), false);

  const circularMetadataValue = {};
  circularMetadataValue.self = circularMetadataValue;
  const circularMetadata = recordDecision(db, {
    runId: "decision-run",
    decisionType: "circular-metadata-decision",
    inputs: { safe: true },
    tokenBudget: circularMetadataValue,
    assessment: {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "safe"
    }
  }, dependencies);
  assert.equal(circularMetadata.metadata_record.status, "manual_verification_required");
  assert.equal(circularMetadata.token_budget, null);
  assert.equal(circularMetadata.decision, "manual_verification_required");
  db.close();
});

test("decision persistence reports evidence, ledger, and database outcomes without raw errors", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  db.prepare(`
    INSERT INTO projects (id, root_path_hash, name, created_at, updated_at)
    VALUES ('persistence-project', 'persistence-hash', 'Persistence', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO runs (id, project_id, started_at, goal, status)
    VALUES ('persistence-run', 'persistence-project', '2026-01-01T00:00:00.000Z', 'persistence', 'running')
  `).run();
  const input = {
    runId: "persistence-run",
    decisionType: "persistence-decision",
    inputs: { safe: true },
    assessment: {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "safe"
    }
  };

  const evidenceFailure = recordDecision(db, input, {
    writeEvidence: () => {
      throw new Error("must-never-be-exposed C:\\Users\\Private\\evidence.txt");
    },
    appendLedger: () => ".pala/ledger/decisions.jsonl"
  });
  assert.equal(DECISION_RECORD_CONTRACT.persistence_policy, "evidence_then_ledger_then_database_with_explicit_outcomes");
  assert.deepEqual(DECISION_RECORD_CONTRACT.persistence_step_outcomes, ["not_attempted", "confirmed", "unknown_after_attempt"]);
  assert.equal(DECISION_RECORD_CONTRACT.persistence_failure_policy, "manual_verification_required_without_raw_error");
  assert.equal(evidenceFailure.decision, "manual_verification_required");
  assert.equal(evidenceFailure.evidence_path, null);
  assert.equal(evidenceFailure.persistence.steps.evidence_write.outcome, "unknown_after_attempt");
  assert.equal(evidenceFailure.persistence.steps.ledger_append.outcome, "confirmed");
  assert.equal(evidenceFailure.persistence.steps.database_insert.outcome, "confirmed");
  assert.equal(
    db.prepare("SELECT decision FROM decisions WHERE id = ?").get(evidenceFailure.id).decision,
    "manual_verification_required"
  );
  assert.doesNotMatch(JSON.stringify(evidenceFailure), /must-never-be-exposed|Private|evidence\.txt|Error:/);

  const ledgerFailure = recordDecision(db, { ...input, decisionType: "ledger-persistence-decision" }, {
    writeEvidence: () => ".pala/evidence/raw/decision.log",
    appendLedger: () => {
      throw new Error("must-never-be-exposed-ledger");
    }
  });
  assert.equal(ledgerFailure.decision, "manual_verification_required");
  assert.equal(ledgerFailure.ledger_path, null);
  assert.equal(ledgerFailure.persistence.steps.evidence_write.outcome, "confirmed");
  assert.equal(ledgerFailure.persistence.steps.ledger_append.outcome, "unknown_after_attempt");
  assert.equal(ledgerFailure.persistence.steps.database_insert.outcome, "confirmed");
  assert.equal(
    db.prepare("SELECT decision FROM decisions WHERE id = ?").get(ledgerFailure.id).decision,
    "manual_verification_required"
  );
  assert.doesNotMatch(JSON.stringify(ledgerFailure), /must-never-be-exposed-ledger|Error:/);

  const databaseFailure = recordDecision(db, { ...input, decisionType: "database-persistence-decision" }, {
    writeEvidence: () => ".pala/evidence/raw/decision.log",
    appendLedger: () => ".pala/ledger/decisions.jsonl",
    insertDecision: () => {
      throw new Error("must-never-be-exposed-database");
    }
  });
  assert.equal(databaseFailure.decision, "manual_verification_required");
  assert.equal(databaseFailure.persistence.steps.evidence_write.outcome, "confirmed");
  assert.equal(databaseFailure.persistence.steps.ledger_append.outcome, "confirmed");
  assert.equal(databaseFailure.persistence.steps.database_insert.outcome, "unknown_after_attempt");
  assert.equal(databaseFailure.persistence.status, "manual_verification_required");
  assert.doesNotMatch(JSON.stringify(databaseFailure), /must-never-be-exposed-database|Error:/);
  db.close();
});

test("CLI output closes the database before exposing the success payload", () => {
  const calls = [];
  const output = { status: "safe_to_execute", secret: "must-never-be-exposed-after-close-failure" };

  assert.equal(CLI_OUTPUT_CONTRACT.policy, "close_database_before_stdout_json");
  assert.equal(CLI_OUTPUT_CONTRACT.database_close_failure_error, "cli_output_blocked:database_close_failed");
  assert.equal(CLI_OUTPUT_CONTRACT.top_level_failure_policy, "nonzero_without_raw_stack_or_pending_payload");
  assert.equal(CLI_OUTPUT_CONTRACT.payload_exposed_on_failure, false);
  assert.throws(
    () => writeCliOutputAfterDatabaseClose({
      close() {
        calls.push("close");
        throw new Error("injected CLI database close failure");
      }
    }, output, {
      write(payload) {
        calls.push(`write:${payload}`);
      }
    }),
    /cli_output_blocked:database_close_failed/
  );
  assert.deepEqual(calls, ["close"]);

  const writeResult = writeCliOutputAfterDatabaseClose({
    close() {
      calls.push("close-success");
    }
  }, output, {
    write(payload) {
      calls.push(`write-success:${payload}`);
    }
  });
  assert.equal(calls[1], "close-success");
  assert.equal(calls[2].startsWith("write-success:{"), true);
  assert.equal(calls[2].includes('"status": "safe_to_execute"'), true);
  assert.equal(writeResult.status, "safe_to_execute");
  assert.equal(writeResult.exitCode, null);
  assert.equal(writeResult.payload_replaced, false);
});

test("CLI output replaces circular and oversized results with bounded payload-free failures", () => {
  assert.equal(CLI_OUTPUT_CONTRACT.max_output_bytes, 5_000_000);
  assert.equal(CLI_OUTPUT_CONTRACT.serialization_preflight_before_database_close, true);
  assert.equal(CLI_OUTPUT_CONTRACT.serialization_failure_error, "cli_output_blocked:serialization_failed");
  assert.equal(CLI_OUTPUT_CONTRACT.output_byte_limit_error, "cli_output_blocked:output_exceeds_byte_limit");
  assert.equal(CLI_OUTPUT_CONTRACT.unsafe_output_policy, "payload_free_failure_json_after_database_close");

  const circular = { status: "safe_to_execute", secret: "must-never-be-exposed-circular" };
  circular.self = circular;
  const cases = [
    {
      output: circular,
      expectedError: CLI_OUTPUT_CONTRACT.serialization_failure_error,
      forbidden: /must-never-be-exposed-circular|Error:/
    },
    {
      output: { status: "safe_to_execute", secret: "x".repeat(CLI_OUTPUT_CONTRACT.max_output_bytes + 1) },
      expectedError: CLI_OUTPUT_CONTRACT.output_byte_limit_error,
      forbidden: /x{1000}|Error:/
    }
  ];

  for (const item of cases) {
    const calls = [];
    const result = writeCliOutputAfterDatabaseClose({
      close() {
        calls.push("close");
      }
    }, item.output, {
      write(payload) {
        calls.push(payload);
      }
    });
    assert.equal(calls[0], "close");
    assert.equal(calls.length, 2);
    const written = JSON.parse(calls[1]);
    assert.deepEqual(written, {
      status: "blocked",
      exit_code: 1,
      error: item.expectedError,
      payload_exposed_on_failure: false
    });
    assert.equal(result.status, "blocked");
    assert.equal(result.exitCode, 1);
    assert.equal(result.payload_replaced, true);
    assert.match(result.error, /^cli_output_blocked:/);
    assert.doesNotMatch(calls[1], item.forbidden);
  }
});

test("top-level CLI failures emit fixed payload-free JSON without raw stacks", () => {
  assert.equal(CLI_OUTPUT_CONTRACT.top_level_failure_error, "cli_top_level_failed");
  assert.equal(CLI_OUTPUT_CONTRACT.top_level_failure_output_policy, "fixed_payload_free_json_best_effort");
  const failure = new Error("must-never-be-exposed C:\\Users\\Private\\top-level.txt");
  failure.code = "EACCES";
  const result = topLevelCliFailureResult(failure);
  assert.deepEqual(result, {
    status: "blocked",
    exit_code: 1,
    error: "cli_top_level_failed",
    error_code: "EACCES",
    raw_error_exposed: false,
    stack_exposed: false,
    payload_exposed_on_failure: false
  });
  assert.doesNotMatch(JSON.stringify(result), /must-never-be-exposed|Private|top-level\.txt|Error:/);

  const writes = [];
  const written = writeTopLevelCliFailure(failure, {
    write(payload) {
      writes.push(payload);
    }
  });
  assert.equal(written.output_written, true);
  assert.deepEqual(JSON.parse(writes[0]), result);
  assert.doesNotMatch(writes[0], /must-never-be-exposed|Private|top-level\.txt|Error:/);

  const unwritten = writeTopLevelCliFailure(failure, {
    write() {
      throw new Error("must-never-be-exposed-write-failure");
    }
  });
  assert.equal(unwritten.output_written, false);
  assert.equal(unwritten.error, "cli_top_level_failed");
});

test("CLI command failures expose structured codes without raw errors or stacks", () => {
  const failure = new Error("must-never-be-exposed C:\\Users\\Private\\secret.txt");
  failure.code = "EACCES";
  const result = cliFailureResult(failure);

  assert.equal(CLI_OUTPUT_CONTRACT.command_failure_policy, "structured_payload_free_without_stack");
  assert.equal(CLI_OUTPUT_CONTRACT.command_failure_error, "cli_command_failed");
  assert.equal(CLI_OUTPUT_CONTRACT.raw_error_exposed, false);
  assert.equal(CLI_OUTPUT_CONTRACT.stack_exposed, false);
  assert.deepEqual(result, {
    status: "blocked",
    exitCode: 1,
    error: "cli_command_failed",
    error_code: "EACCES",
    raw_error_exposed: false,
    stack_exposed: false
  });
  assert.doesNotMatch(JSON.stringify(result), /must-never-be-exposed|Private|secret\.txt|Error:/);

  assert.equal(cliFailureResult({ code: "unsafe code with payload" }).error_code, null);
});

test("unknown CLI commands return a fixed payload-free result", () => {
  const result = unknownCliCommandResult(["pala help"]);

  assert.equal(CLI_OUTPUT_CONTRACT.unknown_command_policy, "structured_payload_free_without_raw_command");
  assert.equal(CLI_OUTPUT_CONTRACT.unknown_command_error, "unknown_command");
  assert.equal(CLI_OUTPUT_CONTRACT.raw_unknown_command_exposed, false);
  assert.deepEqual(result, {
    status: "blocked",
    exitCode: 1,
    error: "unknown_command",
    raw_unknown_command_exposed: false,
    known_commands: ["pala help"]
  });
});

test("unknown CLI command names never reach output, persistence, or evidence paths", async () => {
  const secretCommand = "unknown-must-never-be-returned";
  const result = await runCli([secretCommand, "C:\\Users\\Private\\secret.txt"]);
  assert.equal(result.code, 1);
  const output = JSON.parse(result.stdout);
  const serialized = JSON.stringify(output);
  assert.equal(output.error, "unknown_command");
  assert.equal(output.raw_unknown_command_exposed, false);
  assert.equal(output.command_record.command, "pala <UNKNOWN_COMMAND>");
  assert.match(path.basename(output.raw_log_path), /command-unknown\.log$/);
  assert.doesNotMatch(serialized, /unknown-must-never-be-returned|Private|secret\.txt/);
  assert.doesNotMatch(fs.readFileSync(output.raw_log_path, "utf8"), /unknown-must-never-be-returned|Private|secret\.txt/);

  const db = new DatabaseSync(path.join(process.cwd(), ".pala", "db", "pala.sqlite"), { readOnly: true });
  const run = db.prepare("SELECT goal FROM runs WHERE id = ?").get(output.run_id);
  const command = db.prepare("SELECT command FROM commands WHERE id = ?").get(output.command_id);
  db.close();
  assert.equal(run.goal, "pala <UNKNOWN_COMMAND>");
  assert.equal(command.command, "pala <UNKNOWN_COMMAND>");
});

test("CLI finalization reports explicit write outcomes without raw failure payloads", () => {
  const calls = [];
  const finalized = finalizeCliCommand({
    db: {},
    runId: "run-finalization",
    commandId: "command-finalization",
    commandKind: "command-status",
    command: "pala status",
    commandRecord: { command: "pala status" },
    result: { status: "safe_to_execute" },
    strict: false,
    worktreeObservation: {
      blockers: [],
      scan_complete: true,
      changed_files_count: 0,
      changed_files_count_exact: true,
      changed_files: [],
      changed_files_truncated: false,
      observation: null
    }
  }, {
    writeEvidence: () => {
      calls.push("raw-evidence");
      return ".pala/evidence/raw/finalization.log";
    },
    recordEvidence: () => {
      calls.push("database-evidence");
      return "evidence-id";
    },
    appendLedger: () => {
      calls.push("ledger");
      throw new Error("must-never-be-exposed C:\\Users\\Private\\ledger.txt");
    },
    finishCommand: (_db, _runId, _commandId, result) => {
      calls.push(`database-finish:${result.exitCode}`);
    },
    refreshOperationalState: () => {
      calls.push("state-refresh");
      return {
        state_io: {
          status: "safe_to_execute",
          blockers: []
        }
      };
    }
  });

  assert.equal(CLI_FINALIZATION_CONTRACT.policy, "explicit_outcome_cli_finalization_before_database_close");
  assert.deepEqual(CLI_FINALIZATION_CONTRACT.step_outcomes, ["not_attempted", "confirmed", "unknown_after_attempt"]);
  assert.equal(CLI_FINALIZATION_CONTRACT.payload_exposed_on_failure, false);
  assert.deepEqual(calls, [
    "raw-evidence",
    "database-evidence",
    "ledger",
    "database-finish:1",
    "state-refresh"
  ]);
  assert.equal(finalized.exitCode, 1);
  assert.equal(finalized.result.status, "manual_verification_required");
  assert.equal(finalized.finalization.status, "manual_verification_required");
  assert.deepEqual(finalized.finalization.blockers, ["cli_ledger_append_outcome_unknown"]);
  assert.equal(finalized.finalization.steps.raw_evidence.outcome, "confirmed");
  assert.equal(finalized.finalization.steps.database_evidence_record.outcome, "confirmed");
  assert.equal(finalized.finalization.steps.ledger_append.outcome, "unknown_after_attempt");
  assert.equal(finalized.finalization.steps.database_finish.outcome, "confirmed");
  assert.equal(finalized.finalization.steps.state_refresh.outcome, "confirmed");
  assert.doesNotMatch(JSON.stringify(finalized), /must-never-be-exposed|Private|ledger\.txt|Error:/);
});

test("CLI finalization skips raw-evidence-dependent writes after an unknown evidence outcome", () => {
  const calls = [];
  const finalized = finalizeCliCommand({
    db: {},
    runId: "run-finalization",
    commandId: "command-finalization",
    commandKind: "command-status",
    command: "pala status",
    commandRecord: { command: "pala status" },
    result: { status: "safe_to_execute" },
    strict: false,
    worktreeObservation: []
  }, {
    writeEvidence: () => {
      calls.push("raw-evidence");
      throw new Error("must-never-be-exposed");
    },
    recordEvidence: () => {
      calls.push("database-evidence");
    },
    appendLedger: () => {
      calls.push("ledger");
    },
    finishCommand: (_db, _runId, _commandId, result) => {
      calls.push(`database-finish:${result.exitCode}`);
    },
    refreshOperationalState: () => {
      calls.push("state-refresh");
      throw new Error("must-never-be-exposed-state");
    }
  });

  assert.deepEqual(calls, ["raw-evidence", "database-finish:1", "state-refresh", "database-finish:1"]);
  assert.equal(finalized.rawLogPath, null);
  assert.equal(finalized.stateRefresh, null);
  assert.deepEqual(finalized.finalization.blockers, [
    "cli_raw_evidence_write_outcome_unknown",
    "cli_state_refresh_outcome_unknown"
  ]);
  assert.equal(finalized.finalization.steps.raw_evidence.outcome, "unknown_after_attempt");
  assert.equal(finalized.finalization.steps.database_evidence_record.outcome, "not_attempted");
  assert.equal(finalized.finalization.steps.ledger_append.outcome, "not_attempted");
  assert.equal(finalized.finalization.steps.database_finish.outcome, "confirmed");
  assert.equal(finalized.finalization.steps.database_finish.attempt_count, 2);
  assert.equal(finalized.finalization.steps.state_refresh.outcome, "unknown_after_attempt");
  assert.doesNotMatch(JSON.stringify(finalized), /must-never-be-exposed|Error:/);
});

test("CLI command records are bounded and redact sensitive argument values", () => {
  const record = buildCliCommandRecord([
    "token-budget",
    "--goal",
    `token=must-never-be-returned ${"x".repeat(8_000)}`,
    "--api-key",
    "separate-secret-value",
    "C:\\Users\\Private\\project"
  ]);

  assert.equal(CLI_COMMAND_RECORD_CONTRACT.policy, "bounded_redacted_cli_command_record");
  assert.equal(CLI_COMMAND_RECORD_CONTRACT.max_argument_count, 100);
  assert.equal(CLI_COMMAND_RECORD_CONTRACT.max_argument_bytes, 1_024);
  assert.equal(CLI_COMMAND_RECORD_CONTRACT.max_command_bytes, 4_096);
  assert.equal(CLI_COMMAND_RECORD_CONTRACT.raw_arguments_exposed, false);
  assert.equal(record.command_bytes <= CLI_COMMAND_RECORD_CONTRACT.max_command_bytes, true);
  assert.equal(record.command_truncated, true);
  assert.equal(record.argument_count, 6);
  assert.equal(record.argument_count_exact, true);
  assert.doesNotMatch(record.command, /must-never-be-returned|separate-secret-value|Private|Users/);
  assert.match(record.command, /token=<REDACTED>|<REDACTED>|<USER_PATH>/);
});

test("CLI persists only the bounded redacted command record", async () => {
  const result = await runCli([
    "status",
    "--api-key",
    "separate-secret-value",
    "--goal",
    "token=must-never-be-returned",
    "C:\\Users\\Private\\project"
  ]);
  const output = JSON.parse(result.stdout);
  const forbidden = /must-never-be-returned|separate-secret-value|Private|Users/;
  assert.equal(result.code, 0);
  assert.equal(output.command_record.contract.policy, "bounded_redacted_cli_command_record");
  assert.doesNotMatch(JSON.stringify(output.command_record), forbidden);

  const db = new DatabaseSync(path.join(process.cwd(), ".pala", "db", "pala.sqlite"), { readOnly: true });
  const command = db.prepare("SELECT command FROM commands WHERE id = ?").get(output.command_id)?.command;
  const goal = db.prepare("SELECT goal FROM runs WHERE id = ?").get(output.run_id)?.goal;
  db.close();
  assert.doesNotMatch(String(command), forbidden);
  assert.doesNotMatch(String(goal), forbidden);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), output.raw_log_path), "utf8"), forbidden);
  assert.doesNotMatch(fs.readFileSync(path.join(process.cwd(), output.state_refresh.latest_command_path), "utf8"), forbidden);
});

test("MCP dry-run preserves fixture servers and writes nothing", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-"));
  const configPath = path.join(fixtureRoot, ".cursor", "mcp.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  const before = JSON.stringify({ mcpServers: { existing: { command: "existing-server" } } }, null, 2);
  fs.writeFileSync(configPath, before, "utf8");

  const plan = planMcpRepair({ clients: ["cursor"], fixtureRoot });

  assert.equal(plan.status, "dry_run_only");
  assert.equal(plan.writes_performed, false);
  assert.equal(plan.real_config_modified, false);
  assert.equal(plan.plans[0].existing_servers_preserved, true);
  assert.equal(plan.plans[0].unrelated_top_level_keys_preserved, true);
  assert.deepEqual(plan.plans[0].existing_server_names, ["existing"]);
  assert.equal(plan.plans[0].proposed_diff.payload_exposed, false);
  assert.equal(plan.plans[0].payload_exposed, false);
  assert.equal(fs.readFileSync(configPath, "utf8"), before);
});

test("MCP plans preserve all client fixtures and respect Pala entry ownership", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-all-"));
  for (const [client, relativePath] of Object.entries(MCP_FIXTURE_FILES)) {
    const configPath = path.join(fixtureRoot, relativePath);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({
      clientMarker: client,
      mcpServers: { existing: { command: `${client}-server` } }
    }, null, 2), "utf8");
  }
  const repair = planMcpRepair({ fixtureRoot, action: "repair" });
  assert.equal(repair.status, "dry_run_only");
  assert.equal(repair.plans.length, 4);
  for (const plan of repair.plans) {
    assert.equal(plan.existing_servers_preserved, true);
    assert.equal(plan.unrelated_top_level_keys_preserved, true);
    assert.equal(plan.pala_entry_action, "add");
    assert.equal(plan.proposed_diff.payload_exposed, false);
    assert.equal(plan.proposed_diff.proposed_server_names.includes("existing"), true);
    assert.equal(plan.proposed_diff.proposed_server_names.includes("pala"), true);
  }

  const cursorPath = path.join(fixtureRoot, MCP_FIXTURE_FILES.cursor);
  fs.writeFileSync(cursorPath, JSON.stringify({
    clientMarker: "cursor",
    mcpServers: {
      existing: { command: "cursor-server" },
      pala: { command: "pala-mcp", args: ["--stdio"], env: {} }
    }
  }, null, 2), "utf8");
  const remove = planMcpRepair({ fixtureRoot, clients: ["cursor"], action: "remove" });
  assert.equal(remove.status, "dry_run_only");
  assert.equal(remove.plans[0].pala_entry_action, "remove");
  assert.equal(remove.plans[0].proposed_diff.proposed_server_names.includes("pala"), false);
  assert.equal(remove.plans[0].proposed_diff.proposed_server_names.includes("existing"), true);
  assert.equal(remove.plans[0].proposed_diff.payload_exposed, false);

  fs.writeFileSync(cursorPath, JSON.stringify({
    clientMarker: "cursor",
    mcpServers: { pala: { command: "user-owned-server" } }
  }, null, 2), "utf8");
  const conflict = planMcpRepair({ fixtureRoot, clients: ["cursor"], action: "repair" });
  assert.equal(conflict.status, "manual_verification_required");
  assert.equal(conflict.plans[0].ownership_conflict, true);
  assert.equal(conflict.plans[0].pala_entry_action, "blocked_conflict");
  assert.equal(conflict.plans[0].proposed_change, false);

  const check = planMcpRepair({ fixtureRoot, clients: ["cursor"], action: "check" });
  assert.equal(check.status, "manual_verification_required");
  assert.equal(check.plans[0].proposed_change, false);
  assert.equal(check.plans[0].proposed_diff.action, "none");
  assert.equal(check.plans[0].proposed_diff.payload_exposed, false);
});

test("MCP fixture inspection is bounded, path-contained, and payload-free", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-bounded-"));
  const configPath = path.join(fixtureRoot, ".cursor", "mcp.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    token: "must-never-be-returned",
    mcpServers: {
      existing: {
        command: "server",
        env: { API_KEY: "secret-value" }
      }
    }
  }), "utf8");

  const safe = planMcpRepair({ fixtureRoot, clients: ["cursor"], action: "repair" });
  assert.equal(safe.status, "dry_run_only");
  assert.equal(safe.plans[0].fixture_inspection.scan_complete, true);
  assert.equal(safe.plans[0].fixture_inspection.single_file_handle_used, true);
  assert.equal(safe.plans[0].fixture_inspection.payload_exposed, false);
  assert.equal(safe.plans[0].payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(safe), /must-never-be-returned|secret-value/);

  const oversized = planMcpRepair({
    fixtureRoot,
    clients: ["cursor"],
    action: "check",
    maxFixtureBytes: 32
  });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.blockers.includes("cursor:fixture_file_exceeds_byte_limit"), true);
  assert.equal(oversized.plans[0].fixture_inspection.target_read_performed, false);
  assert.doesNotMatch(JSON.stringify(oversized), /must-never-be-returned|secret-value/);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-linked-"));
  fs.symlinkSync(path.dirname(configPath), path.join(linkedRoot, ".cursor"), process.platform === "win32" ? "junction" : "dir");
  const linked = planMcpRepair({ fixtureRoot: linkedRoot, clients: ["cursor"], action: "check" });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.blockers.includes("cursor:fixture_path_not_realpath_contained_or_symlink_free"), true);
  assert.equal(linked.plans[0].fixture_inspection.target_read_performed, false);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned|secret-value/);

  const missingLinkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-missing-linked-"));
  const emptyOutsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-empty-outside-"));
  fs.symlinkSync(emptyOutsideRoot, path.join(missingLinkedRoot, ".cursor"), process.platform === "win32" ? "junction" : "dir");
  const missingBelowLinkedParent = planMcpRepair({ fixtureRoot: missingLinkedRoot, clients: ["cursor"], action: "repair" });
  assert.equal(missingBelowLinkedParent.status, "manual_verification_required");
  assert.equal(missingBelowLinkedParent.blockers.includes("cursor:fixture_path_not_realpath_contained_or_symlink_free"), true);
  assert.equal(missingBelowLinkedParent.plans[0].fixture_inspection.target_exists, false);
  assert.equal(missingBelowLinkedParent.plans[0].fixture_inspection.target_read_performed, false);

  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.policy, "realpath_contained_single_handle_max_1mb_payload_free");
  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.path_metadata_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.writes_allowed, false);
});

test("MCP fixture inspection reports close failures without throwing or proposing from payloads", () => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-mcp-close-failure-"));
  const configPath = path.join(fixtureRoot, ".cursor", "mcp.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({
    private_marker: "must-not-escape",
    mcpServers: { existing: { command: "private-server" } }
  }), "utf8");

  const originalCloseSync = fs.closeSync;
  let closeFailureInjected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      const error = new Error("injected MCP fixture close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    assert.doesNotThrow(() => {
      result = planMcpRepair({ fixtureRoot, clients: ["cursor"], action: "repair" });
    });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureInjected, true);
  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.close_failure_blocker, "fixture_file_close_failed");
  assert.equal(MCP_FIXTURE_INSPECTION_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["cursor:fixture_file_close_failed"]);
  assert.equal(result.plans[0].fixture_inspection.target_close_performed, true);
  assert.equal(result.plans[0].fixture_inspection.target_close_succeeded, false);
  assert.equal(result.plans[0].proposed_change, false);
  assert.equal(result.plans[0].payload_exposed, false);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  assert.equal(JSON.stringify(result).includes("private-server"), false);
  assert.equal(result.writes_performed, false);
});

test("redaction removes local paths and secrets", () => {
  const windowsHome = ["C:", "Users", "Example"].join("\\");
  const fileUrlHome = ["file:///C:", "Users", "Example"].join("/");
  const output = redact(`${windowsHome}\\secret ${fileUrlHome}/project token=abc123 email@example.com`);
  assert.equal(output.includes(windowsHome), false);
  assert.equal(output.includes(fileUrlHome), false);
  assert.doesNotMatch(output, /abc123/);
  assert.doesNotMatch(output, /email@example\.com/);
});

test("ledger safety reports no personal paths or invalid JSON before export", () => {
  const inspected = inspectLedgerSafety();
  assert.equal(inspected.status, "safe_to_execute");
  assert.equal(inspected.scan_complete, true);
  assert.equal(inspected.file_scan_limit, 100);
  assert.equal(inspected.max_file_bytes, 10_000_000);
  assert.equal(inspected.line_scan_limit_per_file, 50_000);
  assert.equal(inspected.finding_limit, 200);
  assert.deepEqual(inspected.findings, []);
  const repair = repairLedgerSafety({ apply: false });
  assert.equal(repair.scan_complete, true);
  assert.equal(repair.writes_performed, false);
});

test("ledger safety scan is bounded, preserves true finding counts, and blocks repair when incomplete", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-safe-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(ledgerDir, "invalid.jsonl"), ["bad-1", "bad-2", "bad-3", "bad-4", "bad-5"].join("\n"), "utf8");
  const findings = inspectLedgerSafety({ projectRoot, ledgerDir, maxFindings: 2, maxFiles: 10, maxFileBytes: 10_000, maxLinesPerFile: 10 });
  assert.equal(findings.status, "manual_verification_required");
  assert.equal(findings.scan_complete, true);
  assert.equal(findings.root_inspection.status, "safe_to_execute");
  assert.equal(findings.root_inspection.exists, true);
  assert.equal(findings.root_inspection.kind, "directory");
  assert.equal(findings.root_inspection.payload_exposed, false);
  assert.equal(findings.finding_count, 5);
  assert.equal(findings.returned_finding_count, 2);
  assert.equal(findings.omitted_finding_count, 3);
  assert.equal(findings.findings_truncated, true);
  assert.equal(findings.payload_exposed, false);
  assert.equal(findings.writes_performed, false);

  const oversizedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-oversized-"));
  const oversizedDir = path.join(oversizedRoot, ".pala", "ledger");
  fs.mkdirSync(oversizedDir, { recursive: true });
  const oversizedPath = path.join(oversizedDir, "oversized.jsonl");
  fs.writeFileSync(oversizedPath, JSON.stringify({ value: "x".repeat(200) }), "utf8");
  const oversizedBefore = fs.readFileSync(oversizedPath, "utf8");
  const oversized = inspectLedgerSafety({ projectRoot: oversizedRoot, ledgerDir: oversizedDir, maxFileBytes: 20 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.scan_complete, false);
  assert.deepEqual(oversized.blockers, ["ledger_file_exceeds_byte_limit"]);
  assert.equal(oversized.oversized_file_count, 1);
  assert.equal(oversized.scanned_line_count, 0);
  const blockedRepair = repairLedgerSafety({ apply: false, projectRoot: oversizedRoot, ledgerDir: oversizedDir, maxFileBytes: 20 });
  assert.equal(blockedRepair.status, "manual_verification_required");
  assert.equal(blockedRepair.repair_blocked_by_incomplete_scan, true);
  assert.equal(blockedRepair.writes_performed, false);
  assert.deepEqual(blockedRepair.affected_ledger_files, []);
  assert.equal(fs.readFileSync(oversizedPath, "utf8"), oversizedBefore);

  const truncatedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-truncated-"));
  const truncatedDir = path.join(truncatedRoot, ".pala", "ledger");
  fs.mkdirSync(truncatedDir, { recursive: true });
  for (const name of ["a.jsonl", "b.jsonl", "c.jsonl"]) {
    fs.writeFileSync(path.join(truncatedDir, name), `${JSON.stringify({ ok: true })}\n`, "utf8");
  }
  const fileTruncated = inspectLedgerSafety({ projectRoot: truncatedRoot, ledgerDir: truncatedDir, maxFiles: 2 });
  assert.equal(fileTruncated.scan_complete, false);
  assert.equal(fileTruncated.file_scan_truncated, true);
  assert.equal(fileTruncated.ledger_file_count_exact, false);
  assert.equal(fileTruncated.blockers.includes("ledger_file_scan_truncated"), true);

  const lineTruncated = inspectLedgerSafety({ projectRoot: truncatedRoot, ledgerDir: truncatedDir, maxFiles: 10, maxLinesPerFile: 1 });
  assert.equal(lineTruncated.scan_complete, false);
  assert.equal(lineTruncated.line_scan_truncated_file_count, 3);
  assert.equal(lineTruncated.blockers.includes("ledger_line_scan_truncated"), true);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-missing-"));
  const missing = inspectLedgerSafety({
    projectRoot: missingRoot,
    ledgerDir: path.join(missingRoot, ".pala", "ledger")
  });
  assert.equal(missing.status, "safe_to_execute");
  assert.equal(missing.root_inspection.status, "safe_to_execute");
  assert.equal(missing.root_inspection.exists, false);
  assert.equal(missing.ledger_file_count_exact, true);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "secret.jsonl"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "ledger"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectLedgerSafety({
    projectRoot: linkedRoot,
    ledgerDir: path.join(linkedRoot, ".pala", "ledger")
  });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.root_inspection.status, "manual_verification_required");
  assert.equal(linked.root_inspection.blocker, "repo_path_not_realpath_contained_symlink_free");
  assert.equal(linked.root_inspection.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("ledger safety reports file close failures without throwing or scanning payloads", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-close-failure-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(ledgerDir, "events.jsonl"), `${JSON.stringify({ secret: "must-not-escape" })}\n`, "utf8");

  const originalCloseSync = fs.closeSync;
  let closeFailureInjected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      const error = new Error("injected ledger file close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    assert.doesNotThrow(() => {
      result = inspectLedgerSafety({ projectRoot, ledgerDir });
    });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureInjected, true);
  assert.equal(LEDGER_SAFETY_SCAN_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(LEDGER_SAFETY_SCAN_CONTRACT.close_failure_blocker, "ledger_file_close_failed");
  assert.equal(LEDGER_SAFETY_SCAN_CONTRACT.directory_close_failure_blocker, "ledger_directory_close_failed");
  assert.equal(LEDGER_SAFETY_SCAN_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["ledger_file_close_failed"]);
  assert.equal(result.scan_complete, false);
  assert.equal(result.checked_file_count, 0);
  assert.equal(result.finding_count, 0);
  assert.equal(result.payload_exposed, false);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  assert.equal(result.writes_performed, false);
});

test("ledger safety reports directory close failures without accepting ledger files", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-directory-close-failure-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  fs.writeFileSync(path.join(ledgerDir, "events.jsonl"), `${JSON.stringify({ secret: "must-not-escape" })}\n`, "utf8");

  const originalCloseSync = fs.Dir.prototype.closeSync;
  let closeFailureInjected = false;
  fs.Dir.prototype.closeSync = function closeSyncWithInjectedFailure() {
    originalCloseSync.call(this);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      const error = new Error("injected ledger directory close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    result = inspectLedgerSafety({ projectRoot, ledgerDir });
  } finally {
    fs.Dir.prototype.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureInjected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["ledger_directory_close_failed"]);
  assert.equal(result.scan_complete, false);
  assert.equal(result.scanned_entry_count, 0);
  assert.equal(result.ledger_file_count, 0);
  assert.equal(result.ledger_file_count_exact, false);
  assert.equal(result.checked_file_count, 0);
  assert.equal(result.finding_count, 0);
  assert.equal(result.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(result), /must-not-escape/);
  assert.equal(result.writes_performed, false);
});

test("ledger repair creates contained atomic backups before atomic replacement", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, "events.jsonl");
  fs.writeFileSync(ledgerPath, `${JSON.stringify({ message: "secret=must-never-remain" })}\n`, "utf8");

  const repaired = repairLedgerSafety({ apply: true, projectRoot, ledgerDir });
  assert.equal(repaired.status, "safe_to_execute");
  assert.equal(repaired.writes_performed, true);
  assert.equal(repaired.write_contract.policy, "bounded_project_contained_atomic_backup_then_replace");
  assert.equal(repaired.write_summary.backup_file_count, 1);
  assert.equal(repaired.write_summary.backup_identity_verified_count, 1);
  assert.equal(repaired.write_summary.atomic_replace_file_count, 1);
  assert.equal(repaired.write_summary.atomic_replace_identity_verified_count, 1);
  assert.equal(repaired.write_summary.failed_file_count, 0);
  assert.doesNotMatch(fs.readFileSync(ledgerPath, "utf8"), /must-never-remain/);
  const backupPath = path.join(projectRoot, repaired.backup_path, "events.jsonl");
  assert.match(fs.readFileSync(backupPath, "utf8"), /must-never-remain/);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-linked-"));
  const linkedLedgerDir = path.join(linkedRoot, ".pala", "ledger");
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-outside-"));
  fs.mkdirSync(linkedLedgerDir, { recursive: true });
  const linkedLedgerPath = path.join(linkedLedgerDir, "events.jsonl");
  const linkedOriginal = `${JSON.stringify({ message: "secret=must-never-remain" })}\n`;
  fs.writeFileSync(linkedLedgerPath, linkedOriginal, "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "private"), process.platform === "win32" ? "junction" : "dir");
  const blocked = repairLedgerSafety({ apply: true, projectRoot: linkedRoot, ledgerDir: linkedLedgerDir });
  assert.equal(blocked.status, "manual_verification_required");
  assert.equal(blocked.writes_performed, false);
  assert.equal(fs.readFileSync(linkedLedgerPath, "utf8"), linkedOriginal);
  assert.deepEqual(fs.readdirSync(outsideRoot), []);

  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.backup_create_only, true);
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match");
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.identity_safe_temp_cleanup, true);
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.backup_post_publish_identity_policy, "temporary_and_backup_dev_ino_match");
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.atomic_replace, true);
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.replacement_post_publish_identity_policy, "temporary_and_live_ledger_dev_ino_match");
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.concurrent_mutation_policy, "bounded_fixed_create_only_lock_serialized_ledger_mutations");
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.max_mutation_lock_attempts, 100);
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.stale_mutation_lock_reclamation_allowed, false);
  assert.equal(LEDGER_REPAIR_WRITE_CONTRACT.payload_exposed_on_failure, false);
  const source = fs.readFileSync(path.join(process.cwd(), "src", "lib", "ledger-safety.ts"), "utf8");
  assert.equal(source.includes("fs.mkdirSync(backupRoot, { recursive: true })"), false);
  assert.equal(source.includes("fs.copyFileSync"), false);
  assert.equal(source.includes("fs.writeFileSync(plan.fullPath"), false);
});

test("ledger repair rejects a same-size backup replacement before live ledger replacement", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-backup-replace-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, "events.jsonl");
  const original = `${JSON.stringify({ message: "secret=must-never-remain" })}\n`;
  fs.writeFileSync(ledgerPath, original, "utf8");

  const originalLinkSync = fs.linkSync;
  let replacementInjected = false;
  fs.linkSync = (...args) => {
    originalLinkSync(...args);
    const targetPath = String(args[1]);
    if (!targetPath.includes(`${path.sep}ledger-redaction-backups${path.sep}`) || path.basename(targetPath) !== "events.jsonl") return;
    const publishedBytes = fs.statSync(String(args[0])).size;
    fs.unlinkSync(targetPath);
    fs.writeFileSync(targetPath, "x".repeat(publishedBytes), "utf8");
    replacementInjected = true;
  };
  let result;
  try {
    result = repairLedgerSafety({ apply: true, projectRoot, ledgerDir });
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.equal(replacementInjected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["ledger_repair_backup_post_create_verification_failed"]);
  assert.equal(result.write_summary.backup_identity_verified_count, 0);
  assert.equal(result.write_summary.atomic_replace_file_count, 0);
  assert.equal(fs.readFileSync(ledgerPath, "utf8"), original);
  assert.equal(fs.existsSync(path.join(ledgerDir, ".ledger-mutation.write-lock")), false);
});

test("ledger repair rejects a same-size changed backup source and preserves the changed temp path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-backup-source-replace-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, "events.jsonl");
  const original = `${JSON.stringify({ message: "secret=must-never-remain" })}\n`;
  fs.writeFileSync(ledgerPath, original, "utf8");

  const originalLinkSync = fs.linkSync;
  let replacementTempPath = null;
  fs.linkSync = (...args) => {
    const sourcePath = String(args[0]);
    const targetPath = String(args[1]);
    if (targetPath.includes(`${path.sep}ledger-redaction-backups${path.sep}`) && path.basename(targetPath) === "events.jsonl") {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
    }
    originalLinkSync(...args);
  };
  let result;
  try {
    result = repairLedgerSafety({ apply: true, projectRoot, ledgerDir });
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["ledger_repair_backup_post_create_verification_failed"]);
  assert.equal(result.write_summary.atomic_replace_file_count, 0);
  assert.equal(fs.readFileSync(ledgerPath, "utf8"), original);
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("ledger repair rejects a same-size live-ledger replacement after atomic replace", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-live-replace-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, "events.jsonl");
  fs.writeFileSync(ledgerPath, `${JSON.stringify({ message: "secret=must-never-remain" })}\n`, "utf8");

  const originalRenameSync = fs.renameSync;
  let replacementInjected = false;
  fs.renameSync = (...args) => {
    const targetPath = String(args[1]);
    const publishedBytes = fs.statSync(String(args[0])).size;
    originalRenameSync(...args);
    if (path.resolve(targetPath) !== path.resolve(ledgerPath)) return;
    const safeJson = "{}";
    assert.equal(publishedBytes > safeJson.length + 1, true);
    fs.unlinkSync(ledgerPath);
    fs.writeFileSync(ledgerPath, `${safeJson}${" ".repeat(publishedBytes - safeJson.length - 1)}\n`, "utf8");
    replacementInjected = true;
  };
  let result;
  try {
    result = repairLedgerSafety({ apply: true, projectRoot, ledgerDir });
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.equal(replacementInjected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["ledger_repair_post_replace_verification_failed"]);
  assert.equal(result.write_summary.atomic_replace_file_count, 0);
  assert.equal(result.write_summary.atomic_replace_identity_verified_count, 0);
  assert.equal(result.write_summary.failed_file_count, 1);
  assert.equal(fs.existsSync(path.join(ledgerDir, ".ledger-mutation.write-lock")), false);
});

test("ledger append waits for explicit repair instead of being lost at atomic replace", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-repair-append-race-"));
  const ledgerDir = path.join(projectRoot, ".pala", "ledger");
  fs.mkdirSync(ledgerDir, { recursive: true });
  const ledgerPath = path.join(ledgerDir, "events.jsonl");
  fs.writeFileSync(ledgerPath, `${JSON.stringify({ message: "secret=must-never-remain" })}\n`, "utf8");
  const beforeRenameMarker = path.join(projectRoot, ".repair-before-rename");

  const repairPending = runLedgerRepairProcess(projectRoot, beforeRenameMarker);
  const appendPending = runLedgerAppendAfterMarkerProcess(projectRoot, beforeRenameMarker);
  const [repairResult, appendResult] = await Promise.all([repairPending, appendPending]);
  assert.equal(repairResult.code, 0, repairResult.stderr);
  assert.equal(appendResult.code, 0, appendResult.stderr);
  const repaired = JSON.parse(repairResult.stdout);
  assert.equal(repaired.status, "safe_to_execute", JSON.stringify(repaired.blockers));
  assert.equal(appendResult.stdout, ".pala/ledger/events.jsonl");

  const finalText = fs.readFileSync(ledgerPath, "utf8");
  assert.doesNotMatch(finalText, /must-never-remain/);
  assert.match(finalText, /concurrent-safe-event/);
  assert.equal(fs.existsSync(path.join(ledgerDir, ".ledger-mutation.write-lock")), false);
  assert.equal(LEDGER_MUTATION_LOCK_CONTRACT.policy, "bounded_fixed_create_only_lock_serialized_ledger_mutations");
});

test("latest evidence uses bounded inventory and single-handle prefix reads with explicit exactness", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-latest-evidence-"));
  const rawEvidenceDir = path.join(projectRoot, ".pala", "evidence", "raw");
  fs.mkdirSync(rawEvidenceDir, { recursive: true });
  const oldDate = new Date(Date.now() - 60_000);
  const latestDate = new Date();
  const oldPath = path.join(rawEvidenceDir, "old.log");
  const latestPath = path.join(rawEvidenceDir, "latest.log");
  fs.writeFileSync(oldPath, "old evidence", "utf8");
  fs.utimesSync(oldPath, oldDate, oldDate);
  fs.writeFileSync(latestPath, `latest-prefix-${"x".repeat(10_000)}-TAIL-MARKER`, "utf8");
  fs.utimesSync(latestPath, latestDate, latestDate);
  fs.writeFileSync(path.join(rawEvidenceDir, "ignored.txt"), "ignored", "utf8");

  const complete = latestEvidence({ projectRoot, rawEvidenceDir, scanLimit: 10, previewByteLimit: 64, previewCharLimit: 20 });
  assert.equal(complete.status, "safe_to_execute");
  assert.deepEqual(complete.blockers, []);
  assert.equal(complete.inventory_policy, "bounded_directory_iterator_latest_mtime_with_prefix_read");
  assert.equal(complete.root_inspection.status, "safe_to_execute");
  assert.equal(complete.root_inspection.exists, true);
  assert.equal(complete.root_inspection.kind, "directory");
  assert.equal(complete.root_inspection.payload_exposed, false);
  assert.equal(complete.scan_limit, 10);
  assert.equal(complete.scanned_entry_count, 3);
  assert.equal(complete.scan_truncated, false);
  assert.equal(complete.log_candidate_count, 2);
  assert.equal(complete.log_candidate_count_exact, true);
  assert.equal(complete.latest_exact, true);
  assert.equal(complete.path, ".pala/evidence/raw/latest.log");
  assert.equal(complete.read_policy, "single_handle_prefix_max_bytes_and_chars");
  assert.equal(complete.target_open_performed, true);
  assert.equal(complete.target_read_performed, true);
  assert.equal(complete.single_file_handle_used, true);
  assert.equal(complete.preview_bytes_read, 64);
  assert.equal(complete.preview.length, 20);
  assert.equal(complete.preview.includes("TAIL-MARKER"), false);
  assert.equal(complete.preview_complete, false);
  assert.equal(complete.writes_performed, false);
  assert.equal(LATEST_EVIDENCE_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(LATEST_EVIDENCE_CONTRACT.directory_close_failure_blocker, "raw_evidence_directory_close_failed");
  assert.equal(LATEST_EVIDENCE_CONTRACT.file_close_failure_blocker, "latest_evidence_file_close_failed");
  assert.equal(LATEST_EVIDENCE_CONTRACT.payload_exposed_on_failure, false);

  fs.writeFileSync(path.join(rawEvidenceDir, "third.log"), "third", "utf8");
  const truncated = latestEvidence({ projectRoot, rawEvidenceDir, scanLimit: 2, previewByteLimit: 64, previewCharLimit: 20 });
  assert.equal(truncated.status, "manual_verification_required");
  assert.equal(truncated.scan_truncated, true);
  assert.equal(truncated.root_inspection.status, "safe_to_execute");
  assert.equal(truncated.root_inspection.kind, "directory");
  assert.equal(truncated.log_candidate_count_exact, false);
  assert.equal(truncated.latest_exact, false);
  assert.equal(truncated.blockers.includes("raw_evidence_scan_truncated"), true);

  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-latest-empty-"));
  const empty = latestEvidence({ projectRoot: emptyRoot, rawEvidenceDir: path.join(emptyRoot, ".pala", "evidence", "raw") });
  assert.equal(empty.status, "manual_verification_required");
  assert.deepEqual(empty.blockers, ["no_raw_evidence_files"]);
  assert.equal(empty.root_inspection.status, "safe_to_execute");
  assert.equal(empty.root_inspection.exists, false);
  assert.equal(empty.path, null);
  assert.equal(empty.preview, null);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-latest-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-latest-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "secret.log"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "evidence", "raw"), process.platform === "win32" ? "junction" : "dir");
  const linked = latestEvidence({
    projectRoot: linkedRoot,
    rawEvidenceDir: path.join(linkedRoot, ".pala", "evidence", "raw")
  });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.root_inspection.status, "manual_verification_required");
  assert.equal(linked.root_inspection.blocker, "repo_path_not_realpath_contained_symlink_free");
  assert.equal(linked.root_inspection.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("latest evidence reports directory close failures without accepting candidates", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-latest-directory-close-failure-"));
  const rawEvidenceDir = path.join(projectRoot, ".pala", "evidence", "raw");
  fs.mkdirSync(rawEvidenceDir, { recursive: true });
  fs.writeFileSync(path.join(rawEvidenceDir, "must-not-be-accepted.log"), "must-never-be-returned", "utf8");

  const originalCloseSync = fs.Dir.prototype.closeSync;
  let injected = false;
  fs.Dir.prototype.closeSync = function closeSyncWithInjectedFailure() {
    originalCloseSync.call(this);
    if (!injected) {
      injected = true;
      const error = new Error("injected latest-evidence directory close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    result = latestEvidence({ projectRoot, rawEvidenceDir });
  } finally {
    fs.Dir.prototype.closeSync = originalCloseSync;
  }

  assert.equal(injected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.equal(result.blockers.includes("raw_evidence_directory_close_failed"), true);
  assert.equal(result.scanned_entry_count, 0);
  assert.equal(result.log_candidate_count, 0);
  assert.equal(result.log_candidate_count_exact, false);
  assert.equal(result.latest_exact, false);
  assert.equal(result.path, null);
  assert.equal(result.preview, null);
  assert.doesNotMatch(JSON.stringify(result), /must-never-be-returned/);
});

test("latest evidence reports file close failures without exposing the pending preview", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-latest-file-close-failure-"));
  const rawEvidenceDir = path.join(projectRoot, ".pala", "evidence", "raw");
  fs.mkdirSync(rawEvidenceDir, { recursive: true });
  fs.writeFileSync(path.join(rawEvidenceDir, "latest.log"), "must-never-be-returned", "utf8");

  const originalCloseSync = fs.closeSync;
  let injected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!injected) {
      injected = true;
      const error = new Error("injected latest-evidence file close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    result = latestEvidence({ projectRoot, rawEvidenceDir });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(injected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.equal(result.blockers.includes("latest_evidence_file_close_failed"), true);
  assert.equal(result.target_read_performed, true);
  assert.equal(result.preview_bytes_read, 0);
  assert.equal(result.preview_char_count, 0);
  assert.equal(result.preview_complete, false);
  assert.equal(result.preview, null);
  assert.doesNotMatch(JSON.stringify(result), /must-never-be-returned/);
});

test("raw evidence writes are bounded, create-only, atomic, and junction-safe", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-raw-evidence-write-"));
  const evidencePath = writeEvidence("test-kind", {
    status: "safe_to_execute",
    token: "must-never-be-returned"
  }, { projectRoot });
  assert.match(evidencePath, /^\.pala\/evidence\/raw\/.+-test-kind\.log$/);
  const written = fs.readFileSync(path.join(projectRoot, evidencePath), "utf8");
  assert.match(written, /"status": "safe_to_execute"/);
  assert.doesNotMatch(written, /must-never-be-returned/);

  const sensitiveKindPath = writeEvidence(
    "token=must-never-be-returned C:\\Users\\Private\\kind.txt",
    { status: "safe_to_execute" },
    { projectRoot }
  );
  const sensitiveKindFile = path.basename(sensitiveKindPath);
  const sensitiveKindWritten = fs.readFileSync(path.join(projectRoot, sensitiveKindPath), "utf8");
  assert.doesNotMatch(sensitiveKindFile, /must-never-be-returned|Private|Users|kind\.txt/i);
  assert.doesNotMatch(sensitiveKindWritten, /must-never-be-returned|Private|Users|kind\.txt/i);
  assert.match(sensitiveKindWritten, /redacted/i);

  const rawEvidenceDir = path.join(projectRoot, ".pala", "evidence", "raw");
  const beforeOversizedKindCount = fs.readdirSync(rawEvidenceDir).length;
  assert.throws(
    () => writeEvidence("x".repeat(RAW_EVIDENCE_WRITE_CONTRACT.max_kind_bytes + 1), { status: "blocked" }, { projectRoot }),
    /raw_evidence_write_blocked:kind_exceeds_byte_limit/
  );
  assert.equal(fs.readdirSync(rawEvidenceDir).length, beforeOversizedKindCount);

  assert.throws(
    () => writeEvidence("oversized", { padding: "x".repeat(RAW_EVIDENCE_WRITE_CONTRACT.max_file_bytes + 1) }, { projectRoot }),
    /raw_evidence_write_blocked:content_exceeds_byte_limit/
  );

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-raw-evidence-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-raw-evidence-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "evidence"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => writeEvidence("must-not-write", { status: "blocked" }, { projectRoot: linkedRoot }),
    /kernel_bootstrap_blocked|raw_evidence_write_blocked/
  );
  assert.deepEqual(fs.readdirSync(outsideRoot), []);

  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.policy, "bounded_project_contained_atomic_create_only_redacted_raw_evidence");
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.max_file_bytes, 5_000_000);
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.max_kind_bytes, 256);
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.kind_policy, "bounded_redacted_before_envelope_and_filename");
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.raw_kind_exposed, false);
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match");
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.identity_safe_temp_cleanup, true);
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.post_publish_identity_policy, "temporary_and_target_dev_ino_match");
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.atomic_create_link, true);
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.overwrite_allowed, false);
  assert.equal(RAW_EVIDENCE_WRITE_CONTRACT.payload_exposed_on_failure, false);
});

test("raw evidence write rejects a same-size target replacement after atomic publish", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-raw-evidence-post-publish-replace-"));
  const originalLinkSync = fs.linkSync;
  let replacementInjected = false;
  fs.linkSync = (...args) => {
    originalLinkSync(...args);
    const targetPath = String(args[1]);
    if (!path.basename(targetPath).endsWith("-identity-race.log")) return;
    const publishedBytes = fs.statSync(String(args[0])).size;
    fs.unlinkSync(targetPath);
    fs.writeFileSync(targetPath, "x".repeat(publishedBytes), "utf8");
    replacementInjected = true;
  };
  try {
    assert.throws(
      () => writeEvidence("identity-race", { status: "safe_to_execute" }, { projectRoot }),
      /raw_evidence_write_blocked:post_publish_verification_failed/
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.equal(replacementInjected, true);
  const rawDir = path.join(projectRoot, ".pala", "evidence", "raw");
  assert.equal(fs.readdirSync(rawDir).some((entry) => entry.endsWith(".tmp")), false);
});

test("raw evidence write rejects a same-size changed source and preserves the changed temp path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-raw-evidence-source-replace-"));
  const originalLinkSync = fs.linkSync;
  let replacementTempPath = null;
  fs.linkSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.basename(String(args[1])).endsWith("-source-identity-race.log")) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
    }
    originalLinkSync(...args);
  };
  try {
    assert.throws(
      () => writeEvidence("source-identity-race", { status: "safe_to_execute" }, { projectRoot }),
      /raw_evidence_write_blocked:post_publish_verification_failed/
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("public evidence writes are fixed, bounded, contained, and atomic", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-evidence-write-"));
  const publicPath = writePublicEvidence(
    "official-compatibility-check.md",
    "# Compatibility\n\nsecret=must-never-be-returned\n",
    { projectRoot }
  );
  assert.equal(publicPath, "docs/evidence/official-compatibility-check.md");
  const written = fs.readFileSync(path.join(projectRoot, publicPath), "utf8");
  assert.match(written, /# Compatibility/);
  assert.doesNotMatch(written, /must-never-be-returned/);

  assert.throws(
    () => writePublicEvidence("../outside.md", "must-not-write", { projectRoot }),
    /public_evidence_file_not_allowed/
  );
  assert.equal(fs.existsSync(path.join(projectRoot, "docs", "outside.md")), false);
  assert.throws(
    () => writePublicEvidence("official-compatibility-check.md", "x".repeat(PUBLIC_EVIDENCE_WRITE_CONTRACT.max_file_bytes + 1), { projectRoot }),
    /public_evidence_write_blocked:content_exceeds_byte_limit/
  );

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-evidence-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-evidence-outside-"));
  fs.mkdirSync(path.join(linkedRoot, "docs"), { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, "docs", "evidence"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => writePublicEvidence("official-compatibility-check.md", "must-not-write", { projectRoot: linkedRoot }),
    /kernel_bootstrap_blocked|public_evidence_write_blocked/
  );
  assert.deepEqual(fs.readdirSync(outsideRoot), []);

  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.policy, "bounded_fixed_project_contained_atomic_public_evidence_replace");
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.allowed_file_count, 1);
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.concurrent_write_policy, "last_writer_wins_rechecked_transient_atomic_replace_retry");
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.max_atomic_replace_attempts, 20);
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt");
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.identity_safe_temp_cleanup, true);
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.atomic_replace, true);
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.payload_exposed_on_failure, false);
});

test("public evidence retry rejects a changed temporary source and preserves its path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-evidence-source-replace-"));
  const publicPath = writePublicEvidence("official-compatibility-check.md", "# Compatibility\n\nwriter=seed", { projectRoot });
  const target = path.join(projectRoot, publicPath);
  const originalRenameSync = fs.renameSync;
  let replacementTempPath = null;
  fs.renameSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.resolve(String(args[1])) === path.resolve(target) && replacementTempPath === null) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
      const error = new Error("injected transient public evidence replace contention after source replacement");
      error.code = "EACCES";
      throw error;
    }
    originalRenameSync(...args);
  };
  try {
    assert.throws(
      () => writePublicEvidence("official-compatibility-check.md", "# Compatibility\n\nwriter=must-not-publish", { projectRoot }),
      /public_evidence_write_blocked:temporary_source_changed/
    );
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.match(fs.readFileSync(target, "utf8"), /writer=seed/);
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("concurrent public evidence writers tolerate competing atomic replacements", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-evidence-concurrent-"));
  const seeded = writePublicEvidence("official-compatibility-check.md", "# Compatibility\n\nwriter=seed", { projectRoot });
  assert.equal(seeded, "docs/evidence/official-compatibility-check.md");

  const barrierPath = path.join(projectRoot, ".public-evidence-write-start");
  fs.mkdirSync(path.join(projectRoot, ".public-evidence-markers"));
  const pending = Array.from({ length: 12 }, (_, index) => runPublicEvidenceWriteProcess(projectRoot, barrierPath, index));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const results = await Promise.all(pending);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, "docs/evidence/official-compatibility-check.md");
  }

  const evidenceDir = path.join(projectRoot, "docs", "evidence");
  const finalText = fs.readFileSync(path.join(evidenceDir, "official-compatibility-check.md"), "utf8");
  assert.match(finalText, /writer=writer-\d+/);
  assert.doesNotMatch(finalText, /must-never-be-returned/);
  assert.equal(fs.readdirSync(evidenceDir).some((entry) => entry.endsWith(".tmp")), false);
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.concurrent_write_policy, "last_writer_wins_rechecked_transient_atomic_replace_retry");
  assert.equal(PUBLIC_EVIDENCE_WRITE_CONTRACT.max_atomic_replace_attempts >= 2, true);
});

test("evidence exchange export rejects a same-size target replacement after atomic publish", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-exchange-post-publish-replace-"));
  const target = "docs/evidence/exports/replaced.json";
  const fullTarget = path.join(projectRoot, target);
  const originalLinkSync = fs.linkSync;
  let replacementInjected = false;
  fs.linkSync = (...args) => {
    originalLinkSync(...args);
    if (path.resolve(String(args[1])) !== path.resolve(fullTarget)) return;
    const publishedBytes = fs.statSync(String(args[0])).size;
    fs.unlinkSync(fullTarget);
    fs.writeFileSync(fullTarget, "x".repeat(publishedBytes), "utf8");
    replacementInjected = true;
  };
  let result;
  try {
    result = writeSanitizedEvidenceExport(db, target, { projectRoot });
  } finally {
    fs.linkSync = originalLinkSync;
    db.close();
  }

  assert.equal(replacementInjected, true);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, ["export_target_post_write_verification_failed"]);
  assert.equal(result.write_summary.target_post_write_verified, false);
  assert.equal(result.write_summary.target_identity_verified, false);
  assert.equal(result.writes_performed, true);
});

test("evidence exchange export rejects a same-size changed source and preserves the changed temp path", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-exchange-source-replace-"));
  const target = "docs/evidence/exports/source-replaced.json";
  const fullTarget = path.join(projectRoot, target);
  const originalLinkSync = fs.linkSync;
  let replacementTempPath = null;
  fs.linkSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.resolve(String(args[1])) === path.resolve(fullTarget)) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
    }
    originalLinkSync(...args);
  };
  let result;
  try {
    result = writeSanitizedEvidenceExport(db, target, { projectRoot });
  } finally {
    fs.linkSync = originalLinkSync;
    db.close();
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, ["export_target_post_write_verification_failed"]);
  assert.equal(result.write_summary.target_identity_verified, false);
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("concurrent create-only evidence exchange exports publish exactly one target", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-exchange-concurrent-export-"));
  const barrierPath = path.join(projectRoot, ".exchange-export-start");
  const pending = Array.from({ length: 12 }, () => runEvidenceExchangeExportProcess(projectRoot, barrierPath));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const processResults = await Promise.all(pending);
  const results = processResults.map((result) => {
    assert.equal(result.code, 0, result.stderr);
    return JSON.parse(result.stdout);
  });

  assert.equal(results.filter((result) => result.status === "safe_to_execute").length, 1);
  assert.equal(results.filter((result) => result.status === "needs_approval").length, 11);
  assert.equal(results.filter((result) => result.status === "blocked").length, 0);
  assert.equal(
    results.filter((result) => result.status === "needs_approval")
      .every((result) => result.blockers.includes("export_target_already_exists")),
    true
  );
  const exportDir = path.join(projectRoot, "docs", "evidence", "exports");
  assert.deepEqual(fs.readdirSync(exportDir), ["concurrent.json"]);
  const inspected = inspectEvidenceImport("docs/evidence/exports/concurrent.json", { projectRoot });
  assert.equal(inspected.status, "safe_to_execute");
  assert.equal(inspected.validation.status, "safe_to_execute");
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.concurrent_publish_policy, "atomic_create_only_one_winner_existing_target_needs_approval");
});

test("sanitized evidence exchange excludes private fields and validates import without writes", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, root_path_hash, name, created_at, updated_at)
    VALUES ('exchange-project', 'private-hash', 'Exchange', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO runs (id, project_id, started_at, goal, status)
    VALUES ('exchange-run', 'exchange-project', '2026-01-01T00:00:00.000Z', 'exchange', 'passed')
  `).run();
  const personalPath = ["C:", "Users", "Example", "private"].join("\\");
  db.prepare(`
    INSERT INTO decisions (id, run_id, decision_type, inputs_json, decision, reason, created_at)
    VALUES ('exchange-decision', 'exchange-run', 'exchange', '{"raw_log_path":"private"}', 'safe_local_write', ?, '2026-01-01T00:00:00.000Z')
  `).run(`Review ${personalPath} token=abc123`);
  db.prepare(`
    INSERT INTO decisions
      (id, run_id, decision_type, inputs_json, decision, reason, risk_level, required_approval, evidence_path, created_at)
    VALUES ('exchange-review', 'exchange-run', 'review-export', '{}', 'manual_verification_required', 'review me', 'medium', 0, '.pala/evidence/raw/private.log', '2026-01-02T00:00:00.000Z')
  `).run();
  const insertCompletedDecision = db.prepare(`
    INSERT INTO decisions (id, run_id, decision_type, inputs_json, decision, reason, created_at)
    VALUES (?, 'exchange-run', ?, '{}', 'pass_allowed', 'complete', '2026-01-03T00:00:00.000Z')
  `);
  for (let index = 0; index < 101; index += 1) {
    insertCompletedDecision.run(`exchange-complete-${index}`, `complete-${index}`);
  }

  const built = buildSanitizedEvidenceExport(db);
  const serialized = JSON.stringify(built.payload);
  assert.equal(built.status, "safe_to_execute");
  assert.equal(built.validation.findings.length, 0);
  assert.equal(built.validation.finding_budget.policy, "bounded_first_200_with_total_count");
  assert.equal(built.validation.finding_budget.max_returned_findings, 200);
  assert.equal(built.validation.finding_budget.total_finding_count, 0);
  assert.equal(built.validation.finding_budget.returned_finding_count, 0);
  assert.equal(built.validation.finding_budget.omitted_finding_count, 0);
  assert.equal(built.validation.finding_budget.findings_truncated, false);
  assert.equal(built.validation.phase_execution.policy, "explicit_executed_skipped_with_dependency_reason");
  assert.equal(built.validation.phase_execution.status, "complete");
  assert.equal(built.validation.phase_execution.skipped_phase_count, 0);
  assert.equal(built.validation.phase_execution.executed_phase_count, built.validation.phase_execution.phase_count);
  assert.equal(built.validation.phase_execution.phases.temporal_consistency.execution_status, "executed");
  assert.equal(built.validation.phase_execution.phases.temporal_consistency.skip_reason, null);
  assert.equal(built.validation.finding_attribution.policy, "counts_only_by_validation_phase");
  assert.equal(built.validation.finding_attribution.total_finding_count, 0);
  assert.equal(built.validation.finding_attribution.attributed_finding_count, 0);
  assert.equal(built.validation.finding_attribution.unattributed_finding_count, 0);
  assert.equal(serialized.includes(personalPath), false);
  assert.equal(serialized.includes("abc123"), false);
  assert.equal(serialized.includes("raw_log_path"), false);
  assert.equal(built.payload.schema_version, 2);
  assert.equal(built.payload.records.decision_review.length, 1);
  assert.equal(built.payload.records.decision_review[0].decision_type, "review-export");
  assert.equal(built.payload.records.decision_review[0].evidence_path, undefined);
  assert.equal(built.payload.records.decision_review[0].reason, undefined);
  assert.equal(built.record_counts.decisions, 100);
  assert.equal(built.collection_truncation.decisions.exported_record_count, 100);
  assert.equal(built.collection_truncation.decisions.eligible_record_count, 103);
  assert.equal(built.collection_truncation.decisions.eligible_record_count_exact, true);
  assert.equal(built.collection_truncation.decisions.truncation_status, "truncated");
  assert.equal(built.collection_truncation.decisions.truncated, true);
  assert.equal(built.payload.policy.collection_truncation.decisions.truncated, true);
  assert.equal(built.validation.truncation_metadata_status, "valid");
  assert.equal(built.validation.schema_shape_status, "valid");
  assert.equal(built.validation.record_validation_status, "valid");
  assert.equal(built.validation.complexity.status, "valid");
  assert.equal(built.validation.complexity.max_depth, 32);
  assert.equal(built.validation.complexity.max_nodes, 50_000);
  assert.equal(built.validation.complexity.observed_node_count > 0, true);
  assert.equal(built.validation.generated_at.status, "valid");
  assert.equal(built.validation.generated_at.max_future_skew_ms, 300_000);
  assert.equal(built.validation.temporal_consistency.status, "valid");
  assert.equal(built.validation.temporal_consistency.future_record_timestamp_count, 0);
  assert.equal(built.validation.temporal_consistency.checked_record_timestamp_count > 0, true);
  assert.equal(built.validation.collection_ordering.status, "valid");
  assert.equal(built.validation.collection_ordering.checked_collection_count, 5);
  assert.equal(built.validation.collection_ordering.checked_adjacent_pair_count > 0, true);
  assert.equal(built.validation.collection_ordering.out_of_order_pair_count, 0);
  assert.equal(built.validation.duplicate_records.status, "valid");
  assert.equal(built.validation.duplicate_records.checked_collection_count, 5);
  assert.equal(built.validation.duplicate_records.checked_record_count > 0, true);
  assert.equal(built.validation.duplicate_records.duplicate_record_count, 0);
  assert.equal(built.validation.duplicate_records.duplicate_group_count, 0);
  assert.equal(built.byte_budget.policy, "exact_utf8_json_bytes_with_80_percent_warning");
  assert.equal(built.byte_budget.payload_bytes, Buffer.byteLength(JSON.stringify(built.payload), "utf8"));
  assert.equal(built.byte_budget.max_payload_bytes, EVIDENCE_EXCHANGE_CONTRACT.max_bytes);
  assert.equal(built.byte_budget.remaining_payload_bytes, EVIDENCE_EXCHANGE_CONTRACT.max_bytes - built.byte_budget.payload_bytes);
  assert.equal(built.byte_budget.payload_byte_status, "within_budget");
  assert.equal(built.validation.byte_budget.payload_bytes, built.byte_budget.payload_bytes);
  assert.equal(built.digest_availability.policy, "explicit_exact_and_content_digest_availability");
  assert.equal(built.digest_availability.exact_digest_status, "available");
  assert.equal(built.digest_availability.content_digest_status, "available");
  const nearLimitBudget = evidenceExchangeByteBudget({ padding: "x".repeat(Math.ceil(EVIDENCE_EXCHANGE_CONTRACT.max_bytes * 0.8)) });
  assert.equal(nearLimitBudget.payload_byte_status, "near_limit");
  assert.equal(nearLimitBudget.remaining_payload_bytes > 0, true);
  const overLimitBudget = evidenceExchangeByteBudget({ padding: "x".repeat(EVIDENCE_EXCHANGE_CONTRACT.max_bytes) });
  assert.equal(overLimitBudget.payload_byte_status, "over_limit");
  assert.equal(overLimitBudget.remaining_payload_bytes < 0, true);
  const overLimitValidation = validateEvidenceExchange({
    ...built.payload,
    padding: "x".repeat(EVIDENCE_EXCHANGE_CONTRACT.max_bytes)
  });
  assert.equal(overLimitValidation.status, "manual_verification_required");
  assert.equal(overLimitValidation.byte_budget.payload_byte_status, "over_limit");
  assert.equal(overLimitValidation.findings.some((finding) => finding.summary.includes("exceeds 1000000 bytes")), true);
  const manyFindingsPayload = structuredClone(built.payload);
  for (const record of manyFindingsPayload.records.decisions) {
    record.unexpected_a = true;
    record.unexpected_b = true;
    record.unexpected_c = true;
  }
  const manyFindingsValidation = validateEvidenceExchange(manyFindingsPayload);
  assert.equal(manyFindingsValidation.status, "manual_verification_required");
  assert.equal(manyFindingsValidation.record_validation_status, "invalid");
  assert.equal(manyFindingsValidation.findings.length, 200);
  assert.equal(manyFindingsValidation.finding_budget.total_finding_count, 300);
  assert.equal(manyFindingsValidation.finding_budget.returned_finding_count, 200);
  assert.equal(manyFindingsValidation.finding_budget.omitted_finding_count, 100);
  assert.equal(manyFindingsValidation.finding_budget.findings_truncated, true);
  assert.equal(manyFindingsValidation.finding_attribution.total_finding_count, 300);
  assert.equal(manyFindingsValidation.finding_attribution.attributed_finding_count, 300);
  assert.equal(manyFindingsValidation.finding_attribution.unattributed_finding_count, 0);
  assert.equal(manyFindingsValidation.finding_attribution.phases.record_validation, 300);
  const inconsistentTruncation = structuredClone(built.payload);
  inconsistentTruncation.policy.collection_truncation.decisions.exported_record_count = 99;
  const inconsistentValidation = validateEvidenceExchange(inconsistentTruncation);
  assert.equal(inconsistentValidation.status, "manual_verification_required");
  assert.equal(inconsistentValidation.truncation_metadata_status, "invalid");
  assert.equal(inconsistentValidation.findings.some((finding) => finding.location === "$.policy.collection_truncation.decisions.exported_record_count"), true);
  const legacyV2WithoutTruncation = structuredClone(built.payload);
  delete legacyV2WithoutTruncation.policy.collection_truncation;
  const legacyV2Validation = validateEvidenceExchange(legacyV2WithoutTruncation);
  assert.equal(legacyV2Validation.status, "safe_to_execute");
  assert.equal(legacyV2Validation.truncation_metadata_status, "not_present");
  assert.equal(legacyV2Validation.schema_shape_status, "valid");
  const unknownRootPayload = structuredClone(built.payload);
  unknownRootPayload.unexpected = true;
  const unknownRootValidation = validateEvidenceExchange(unknownRootPayload);
  assert.equal(unknownRootValidation.schema_shape_status, "invalid");
  assert.equal(unknownRootValidation.findings.some((finding) => finding.location === "$.unexpected"), true);
  const unknownPolicyPayload = structuredClone(built.payload);
  unknownPolicyPayload.policy.unexpected = true;
  const unknownPolicyValidation = validateEvidenceExchange(unknownPolicyPayload);
  assert.equal(unknownPolicyValidation.schema_shape_status, "invalid");
  assert.equal(unknownPolicyValidation.findings.some((finding) => finding.location === "$.policy.unexpected"), true);
  const unsafePolicyPayload = structuredClone(built.payload);
  unsafePolicyPayload.policy.import_writes_allowed = true;
  const unsafePolicyValidation = validateEvidenceExchange(unsafePolicyPayload);
  assert.equal(unsafePolicyValidation.schema_shape_status, "invalid");
  assert.equal(unsafePolicyValidation.findings.some((finding) => finding.location === "$.policy.import_writes_allowed"), true);
  const unknownCollectionPayload = structuredClone(built.payload);
  unknownCollectionPayload.records.unexpected = [];
  const unknownCollectionValidation = validateEvidenceExchange(unknownCollectionPayload);
  assert.equal(unknownCollectionValidation.schema_shape_status, "invalid");
  assert.equal(unknownCollectionValidation.findings.some((finding) => finding.location === "$.records.unexpected"), true);
  const missingPolicyPayload = structuredClone(built.payload);
  delete missingPolicyPayload.policy;
  const missingPolicyValidation = validateEvidenceExchange(missingPolicyPayload);
  assert.equal(missingPolicyValidation.schema_shape_status, "invalid");
  assert.equal(missingPolicyValidation.findings.some((finding) => finding.location === "$.policy"), true);
  const invalidExcludedCountPayload = structuredClone(built.payload);
  invalidExcludedCountPayload.policy.excluded_private_runtime_rows.public_evidence = -1;
  const invalidExcludedCountValidation = validateEvidenceExchange(invalidExcludedCountPayload);
  assert.equal(invalidExcludedCountValidation.schema_shape_status, "invalid");
  assert.equal(invalidExcludedCountValidation.findings.some((finding) => finding.location === "$.policy.excluded_private_runtime_rows.public_evidence"), true);
  const invalidTimestampPayload = structuredClone(built.payload);
  invalidTimestampPayload.records.decisions[0].created_at = "not-a-timestamp";
  const invalidTimestampValidation = validateEvidenceExchange(invalidTimestampPayload);
  assert.equal(invalidTimestampValidation.record_validation_status, "invalid");
  assert.equal(invalidTimestampValidation.collection_ordering.status, "not_checked");
  assert.equal(invalidTimestampValidation.duplicate_records.status, "not_checked");
  assert.equal(invalidTimestampValidation.phase_execution.phases.temporal_consistency.execution_status, "skipped");
  assert.equal(invalidTimestampValidation.phase_execution.phases.temporal_consistency.skip_reason, "record_validation_invalid");
  assert.equal(invalidTimestampValidation.phase_execution.phases.collection_ordering.skip_reason, "record_validation_invalid");
  assert.equal(invalidTimestampValidation.phase_execution.phases.duplicate_records.skip_reason, "record_validation_invalid");
  assert.equal(invalidTimestampValidation.findings.some((finding) => finding.location === "$.records.decisions[0].created_at"), true);
  const invalidDecisionPayload = structuredClone(built.payload);
  invalidDecisionPayload.records.decisions[0].decision = "invented-decision";
  const invalidDecisionValidation = validateEvidenceExchange(invalidDecisionPayload);
  assert.equal(invalidDecisionValidation.record_validation_status, "invalid");
  assert.equal(invalidDecisionValidation.findings.some((finding) => finding.location === "$.records.decisions[0].decision"), true);
  const invalidApprovalPayload = structuredClone(built.payload);
  invalidApprovalPayload.records.decisions[0].required_approval = "yes";
  const invalidApprovalValidation = validateEvidenceExchange(invalidApprovalPayload);
  assert.equal(invalidApprovalValidation.record_validation_status, "invalid");
  assert.equal(invalidApprovalValidation.findings.some((finding) => finding.location === "$.records.decisions[0].required_approval"), true);
  const invalidReviewReasonsPayload = structuredClone(built.payload);
  invalidReviewReasonsPayload.records.decision_review[0].review_reasons = "manual";
  const invalidReviewReasonsValidation = validateEvidenceExchange(invalidReviewReasonsPayload);
  assert.equal(invalidReviewReasonsValidation.record_validation_status, "invalid");
  assert.equal(invalidReviewReasonsValidation.findings.some((finding) => finding.location === "$.records.decision_review[0].review_reasons"), true);
  const deeplyNestedPayload = structuredClone(built.payload);
  let deepCursor = {};
  deeplyNestedPayload.unexpected = deepCursor;
  for (let depth = 0; depth < 5_000; depth += 1) {
    deepCursor.child = {};
    deepCursor = deepCursor.child;
  }
  const deeplyNestedValidation = validateEvidenceExchange(deeplyNestedPayload);
  assert.equal(deeplyNestedValidation.status, "manual_verification_required");
  assert.equal(deeplyNestedValidation.complexity.status, "invalid");
  assert.equal(deeplyNestedValidation.complexity.depth_limit_exceeded, true);
  assert.equal(deeplyNestedValidation.byte_budget.payload_byte_status, "unknown");
  assert.equal(deeplyNestedValidation.byte_budget.serialization_performed, false);
  assert.equal(deeplyNestedValidation.schema_shape_status, "not_checked");
  assert.equal(deeplyNestedValidation.record_validation_status, "not_checked");
  const widePayload = structuredClone(built.payload);
  widePayload.unexpected = Array.from({ length: 50_010 }, () => null);
  const wideValidation = validateEvidenceExchange(widePayload);
  assert.equal(wideValidation.complexity.status, "invalid");
  assert.equal(wideValidation.complexity.node_limit_exceeded, true);
  const cyclicPayload = structuredClone(built.payload);
  cyclicPayload.unexpected = {};
  cyclicPayload.unexpected.self = cyclicPayload.unexpected;
  const cyclicValidation = validateEvidenceExchange(cyclicPayload);
  assert.equal(cyclicValidation.complexity.status, "invalid");
  assert.equal(cyclicValidation.complexity.cycle_detected, true);
  assert.equal(cyclicValidation.byte_budget.serialization_performed, false);
  assert.equal(cyclicValidation.generated_at.status, "not_checked");
  assert.equal(cyclicValidation.phase_execution.status, "partial");
  assert.equal(cyclicValidation.phase_execution.phases.complexity.execution_status, "executed");
  assert.equal(cyclicValidation.phase_execution.phases.byte_budget.execution_status, "skipped");
  assert.equal(cyclicValidation.phase_execution.phases.byte_budget.skip_reason, "complexity_invalid");
  assert.equal(cyclicValidation.finding_attribution.phases.complexity > 0, true);
  assert.equal(cyclicValidation.finding_attribution.unattributed_finding_count, 0);
  const generatedAtNow = Date.parse("2026-06-04T08:00:00.000Z");
  const withinSkewPayload = structuredClone(built.payload);
  withinSkewPayload.generated_at = "2026-06-04T08:04:00.000Z";
  assert.equal(validateEvidenceExchange(withinSkewPayload, { nowMs: generatedAtNow }).generated_at.status, "valid");
  const futureSkewPayload = structuredClone(built.payload);
  futureSkewPayload.generated_at = "2026-06-04T08:10:00.000Z";
  const futureSkewValidation = validateEvidenceExchange(futureSkewPayload, { nowMs: generatedAtNow });
  assert.equal(futureSkewValidation.generated_at.status, "future_skew");
  assert.equal(futureSkewValidation.generated_at.future_skew_ms, 600_000);
  assert.equal(futureSkewValidation.findings.some((finding) => finding.location === "$.generated_at"), true);
  const invalidGeneratedAtPayload = structuredClone(built.payload);
  invalidGeneratedAtPayload.generated_at = "not-a-timestamp";
  const invalidGeneratedAtValidation = validateEvidenceExchange(invalidGeneratedAtPayload, { nowMs: generatedAtNow });
  assert.equal(invalidGeneratedAtValidation.generated_at.status, "invalid");
  assert.equal(invalidGeneratedAtValidation.temporal_consistency.status, "not_checked");
  const temporalViolationPayload = structuredClone(built.payload);
  temporalViolationPayload.records.decisions[0].created_at = new Date(Date.parse(temporalViolationPayload.generated_at) + 60_000).toISOString();
  const temporalViolationValidation = validateEvidenceExchange(temporalViolationPayload);
  assert.equal(temporalViolationValidation.temporal_consistency.status, "record_after_generated_at");
  assert.equal(temporalViolationValidation.temporal_consistency.future_record_timestamp_count, 1);
  assert.equal(temporalViolationValidation.temporal_consistency.max_record_ahead_ms, 60_000);
  assert.equal(temporalViolationValidation.findings.some((finding) => finding.location === "$.records.decisions[0].created_at"), true);
  const outOfOrderPayload = structuredClone(built.payload);
  [outOfOrderPayload.records.decisions[0], outOfOrderPayload.records.decisions[1]] = [
    outOfOrderPayload.records.decisions[1],
    outOfOrderPayload.records.decisions[0]
  ];
  const outOfOrderValidation = validateEvidenceExchange(outOfOrderPayload);
  assert.equal(outOfOrderValidation.collection_ordering.status, "invalid");
  assert.equal(outOfOrderValidation.collection_ordering.out_of_order_pair_count, 1);
  assert.equal(outOfOrderValidation.collection_ordering.collections.decisions.status, "invalid");
  assert.equal(outOfOrderValidation.findings.some((finding) => finding.location === "$.records.decisions[1]"), true);
  const duplicateRecordPayload = structuredClone(built.payload);
  duplicateRecordPayload.records.decisions[1] = structuredClone(duplicateRecordPayload.records.decisions[0]);
  const duplicateRecordValidation = validateEvidenceExchange(duplicateRecordPayload);
  assert.equal(duplicateRecordValidation.duplicate_records.status, "duplicates_present");
  assert.equal(duplicateRecordValidation.duplicate_records.duplicate_record_count, 1);
  assert.equal(duplicateRecordValidation.duplicate_records.duplicate_group_count, 1);
  assert.equal(duplicateRecordValidation.duplicate_records.collections.decisions.status, "duplicates_present");
  assert.equal(duplicateRecordValidation.findings.some((finding) => finding.location === "$.records.decisions[1]"), true);
  const reorderedWithNewTimestamp = {
    records: built.payload.records,
    policy: built.payload.policy,
    schema_version: built.payload.schema_version,
    kind: built.payload.kind,
    generated_at: "2099-01-01T00:00:00.000Z"
  };
  assert.equal(built.content_digest_sha256, evidenceExchangeContentDigest(built.payload));
  assert.equal(built.content_digest_sha256, evidenceExchangeContentDigest(reorderedWithNewTimestamp));
  assert.notEqual(built.digest_sha256, built.content_digest_sha256);
  assert.notEqual(
    built.content_digest_sha256,
    evidenceExchangeContentDigest({ ...reorderedWithNewTimestamp, policy: { ...built.payload.policy, import_writes_allowed: true } })
  );
  const preview = buildEvidenceExchangePreview(db);
  assert.equal(preview.payload, undefined);
  assert.equal(preview.route_summary.payload_exposed, false);
  assert.equal(preview.route_summary.validation_finding_count, 0);
  assert.equal(preview.route_summary.finding_budget_policy, "bounded_first_200_with_total_count");
  assert.equal(preview.route_summary.max_returned_validation_findings, 200);
  assert.equal(preview.route_summary.validation_total_finding_count, 0);
  assert.equal(preview.route_summary.validation_returned_finding_count, 0);
  assert.equal(preview.route_summary.validation_omitted_finding_count, 0);
  assert.equal(preview.route_summary.validation_findings_truncated, false);
  assert.equal(preview.route_summary.validation_phase_policy, "explicit_executed_skipped_with_dependency_reason");
  assert.equal(preview.route_summary.validation_phase_execution_status, "complete");
  assert.equal(preview.route_summary.executed_validation_phase_count, preview.route_summary.validation_phase_count);
  assert.equal(preview.route_summary.skipped_validation_phase_count, 0);
  assert.equal(preview.route_summary.validation_phase_skip_reasons, "none");
  assert.equal(preview.route_summary.finding_attribution_policy, "counts_only_by_validation_phase");
  assert.equal(preview.route_summary.attributed_validation_finding_count, 0);
  assert.equal(preview.route_summary.unattributed_validation_finding_count, 0);
  assert.equal(preview.route_summary.validation_finding_phase_counts, "none");
  assert.equal(preview.route_summary.schema_version, 2);
  assert.deepEqual(preview.migration_capability.supported_from_versions, [1]);
  assert.equal(preview.migration_capability.target_schema_version, 2);
  assert.equal(preview.migration_capability.mode, "validation_only");
  assert.equal(preview.migration_capability.candidate_payload_exposed, false);
  assert.equal(preview.migration_capability.writes_allowed, false);
  assert.equal(preview.migration_readiness_capability.policy, "validated_source_schema_migration_readiness_approval_plan");
  assert.equal(preview.migration_readiness_capability.mode, "read_only_approval_plan");
  assert.equal(preview.migration_readiness_capability.target_read_performed, false);
  assert.equal(preview.migration_readiness_capability.candidate_validation_performed, false);
  assert.equal(preview.migration_readiness_capability.candidate_payload_exposed, false);
  assert.equal(preview.migration_readiness_capability.writes_allowed, false);
  assert.equal(preview.route_summary.migration_readiness_policy, "validated_source_schema_migration_readiness_approval_plan");
  assert.equal(preview.route_summary.migration_readiness_mode, "read_only_approval_plan");
  assert.equal(preview.route_summary.migration_readiness_target_read_performed, false);
  assert.equal(preview.route_summary.migration_readiness_candidate_validation_performed, false);
  assert.equal(preview.comparison_capability.policy, "digest_and_count_delta_only");
  assert.equal(preview.comparison_capability.mode, "validation_only");
  assert.equal(preview.comparison_capability.target_read_performed, false);
  assert.equal(preview.comparison_capability.payload_exposed, false);
  assert.equal(preview.comparison_capability.writes_allowed, false);
  assert.equal(preview.assertion_capability.policy, "expected_sha256_only_no_file_read");
  assert.equal(preview.assertion_capability.mode, "strict_capable_validation_only");
  assert.equal(preview.assertion_capability.assertion_performed, false);
  assert.equal(preview.assertion_capability.target_file_read, false);
  assert.equal(preview.assertion_capability.payload_exposed, false);
  assert.equal(preview.assertion_capability.writes_allowed, false);
  assert.equal(preview.import_preflight_capability.policy, "stat_before_read_with_2mb_limit");
  assert.equal(preview.import_preflight_capability.target_stat_performed, false);
  assert.equal(preview.import_preflight_capability.target_parse_performed, false);
  assert.equal(preview.import_preflight_capability.payload_exposed, false);
  assert.equal(preview.import_preflight_capability.writes_allowed, false);
  assert.equal(preview.import_readiness_capability.policy, "validated_target_digest_and_count_delta_approval_plan");
  assert.equal(preview.import_readiness_capability.mode, "read_only_approval_plan");
  assert.equal(preview.import_readiness_capability.target_read_performed, false);
  assert.equal(preview.import_readiness_capability.comparison_performed, false);
  assert.equal(preview.import_readiness_capability.payload_exposed, false);
  assert.equal(preview.import_readiness_capability.writes_allowed, false);
  assert.equal(preview.target_path_capability.policy, "realpath_contained_no_symlinks");
  assert.equal(preview.target_path_capability.target_check_performed, false);
  assert.equal(preview.target_path_capability.realpath_check_performed, false);
  assert.equal(preview.target_path_capability.symlink_check_performed, false);
  assert.equal(preview.target_path_capability.writes_allowed, false);
  assert.equal(preview.file_handle_capability.policy, "single_fd_fstat_read_with_post_open_path_recheck");
  assert.equal(preview.file_handle_capability.target_open_performed, false);
  assert.equal(preview.file_handle_capability.target_read_performed, false);
  assert.equal(preview.file_handle_capability.close_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(preview.file_handle_capability.close_failure_reason, "close_failed");
  assert.equal(preview.file_handle_capability.post_open_path_recheck_performed, false);
  assert.equal(typeof preview.file_handle_capability.nofollow_supported, "boolean");
  assert.equal(preview.route_summary.migration_supported_from, "1");
  assert.equal(preview.route_summary.migration_target_version, 2);
  assert.equal(preview.route_summary.migration_mode, "validation_only");
  assert.equal(preview.route_summary.migration_writes_allowed, false);
  assert.equal(preview.route_summary.comparison_policy, "digest_and_count_delta_only");
  assert.equal(preview.route_summary.comparison_mode, "validation_only");
  assert.equal(preview.route_summary.comparison_target_read_performed, false);
  assert.equal(preview.route_summary.assertion_policy, "expected_sha256_only_no_file_read");
  assert.equal(preview.route_summary.assertion_mode, "strict_capable_validation_only");
  assert.equal(preview.route_summary.assertion_performed, false);
  assert.equal(preview.route_summary.import_preflight_policy, "stat_before_read_with_2mb_limit");
  assert.equal(preview.route_summary.max_raw_file_bytes, 2_000_000);
  assert.equal(preview.route_summary.import_target_stat_performed, false);
  assert.equal(preview.route_summary.import_target_parse_performed, false);
  assert.equal(preview.route_summary.import_readiness_policy, "validated_target_digest_and_count_delta_approval_plan");
  assert.equal(preview.route_summary.import_readiness_mode, "read_only_approval_plan");
  assert.equal(preview.route_summary.import_readiness_target_read_performed, false);
  assert.equal(preview.route_summary.import_readiness_comparison_performed, false);
  assert.equal(preview.route_summary.target_path_policy, "realpath_contained_no_symlinks");
  assert.equal(preview.route_summary.target_path_check_performed, false);
  assert.equal(preview.route_summary.file_handle_inspection_policy, "single_fd_fstat_read_with_post_open_path_recheck");
  assert.equal(preview.route_summary.file_handle_close_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(preview.route_summary.file_handle_close_failure_reason, "close_failed");
  assert.equal(preview.route_summary.inspection_target_open_performed, false);
  assert.equal(preview.route_summary.inspection_target_read_performed, false);
  assert.equal(preview.route_summary.inspection_target_close_performed, false);
  assert.equal(preview.route_summary.post_open_path_recheck_performed, false);
  assert.equal(preview.route_summary.truncated_collection_count, 1);
  assert.equal(preview.route_summary.unknown_truncation_collection_count, 0);
  assert.equal(preview.route_summary.all_collection_counts_exact, true);
  assert.equal(preview.route_summary.truncation_metadata_status, "valid");
  assert.equal(preview.route_summary.schema_shape_policy, "allowlisted_keys_and_fixed_safety_policy_values");
  assert.equal(preview.route_summary.schema_shape_status, "valid");
  assert.equal(preview.route_summary.record_validation_policy, "required_fields_types_enums_and_timestamps");
  assert.equal(preview.route_summary.record_validation_status, "valid");
  assert.equal(preview.route_summary.complexity_policy, "iterative_max_depth_32_max_nodes_50000");
  assert.equal(preview.route_summary.complexity_status, "valid");
  assert.equal(preview.route_summary.observed_payload_depth, preview.validation.complexity.observed_max_depth);
  assert.equal(preview.route_summary.observed_payload_nodes, preview.validation.complexity.observed_node_count);
  assert.equal(preview.route_summary.generated_at_policy, "iso_timestamp_with_5_minute_future_skew_limit");
  assert.equal(preview.route_summary.generated_at_status, "valid");
  assert.equal(preview.route_summary.max_generated_at_future_skew_ms, 300_000);
  assert.equal(preview.route_summary.temporal_consistency_policy, "generated_at_not_before_valid_record_timestamps");
  assert.equal(preview.route_summary.temporal_consistency_status, "valid");
  assert.equal(preview.route_summary.future_record_timestamp_count, 0);
  assert.equal(preview.route_summary.collection_ordering_policy, "deterministic_per_collection_visible_field_order");
  assert.equal(preview.route_summary.collection_ordering_status, "valid");
  assert.equal(preview.route_summary.checked_ordering_collection_count, 5);
  assert.equal(preview.route_summary.out_of_order_pair_count, 0);
  assert.equal(preview.route_summary.duplicate_record_policy, "exact_canonical_record_identity_counts_only");
  assert.equal(preview.route_summary.duplicate_record_status, "valid");
  assert.equal(preview.route_summary.checked_duplicate_record_count > 0, true);
  assert.equal(preview.route_summary.duplicate_record_count, 0);
  assert.equal(preview.route_summary.duplicate_group_count, 0);
  assert.equal(preview.completeness.policy, "all_collections_complete_and_exact");
  assert.equal(preview.completeness.status, "incomplete");
  assert.equal(preview.completeness.incomplete_collection_count, 1);
  assert.equal(preview.route_summary.completeness_policy, "all_collections_complete_and_exact");
  assert.equal(preview.route_summary.completeness_status, "incomplete");
  assert.equal(preview.byte_budget.payload_bytes, built.byte_budget.payload_bytes);
  assert.equal(preview.route_summary.payload_byte_budget_policy, "exact_utf8_json_bytes_with_80_percent_warning");
  assert.equal(preview.route_summary.payload_bytes, built.byte_budget.payload_bytes);
  assert.equal(preview.route_summary.max_payload_bytes, EVIDENCE_EXCHANGE_CONTRACT.max_bytes);
  assert.equal(preview.route_summary.remaining_payload_bytes, built.byte_budget.remaining_payload_bytes);
  assert.equal(preview.route_summary.payload_byte_status, "within_budget");
  assert.equal(preview.content_digest_sha256, built.content_digest_sha256);
  assert.equal(preview.route_summary.exact_digest_sha256, preview.digest_sha256);
  assert.equal(preview.route_summary.content_digest_sha256, preview.content_digest_sha256);
  assert.equal(preview.digest_availability.exact_digest_status, "available");
  assert.equal(preview.route_summary.digest_availability_policy, "explicit_exact_and_content_digest_availability");
  assert.equal(preview.route_summary.exact_digest_status, "available");
  assert.equal(preview.route_summary.content_digest_status, "available");
  assert.equal(preview.rows.length, 5);
  assert.equal(preview.rows.find((row) => row.collection === "decisions").truncation_status, "truncated");
  assert.equal(preview.rows.find((row) => row.collection === "decisions").eligible_record_count, 103);
  const previewRoute = panelRouteData(db, "evidence-exchange");
  assert.equal(previewRoute.route_summary.payload_exposed, false);
  assert.deepEqual(previewRoute.migration_capability.supported_from_versions, [1]);
  assert.equal(previewRoute.migration_capability.candidate_payload_exposed, false);
  assert.equal(previewRoute.migration_capability.writes_allowed, false);
  assert.equal(previewRoute.migration_readiness_capability.policy, "validated_source_schema_migration_readiness_approval_plan");
  assert.equal(previewRoute.migration_readiness_capability.target_read_performed, false);
  assert.equal(previewRoute.migration_readiness_capability.candidate_validation_performed, false);
  assert.equal(previewRoute.migration_readiness_capability.candidate_payload_exposed, false);
  assert.equal(previewRoute.migration_readiness_capability.writes_allowed, false);
  assert.equal(previewRoute.comparison_capability.target_read_performed, false);
  assert.equal(previewRoute.comparison_capability.payload_exposed, false);
  assert.equal(previewRoute.comparison_capability.writes_allowed, false);
  assert.equal(previewRoute.assertion_capability.assertion_performed, false);
  assert.equal(previewRoute.assertion_capability.target_file_read, false);
  assert.equal(previewRoute.assertion_capability.writes_allowed, false);
  assert.equal(previewRoute.import_preflight_capability.target_stat_performed, false);
  assert.equal(previewRoute.import_preflight_capability.target_parse_performed, false);
  assert.equal(previewRoute.import_readiness_capability.policy, "validated_target_digest_and_count_delta_approval_plan");
  assert.equal(previewRoute.import_readiness_capability.target_read_performed, false);
  assert.equal(previewRoute.import_readiness_capability.comparison_performed, false);
  assert.equal(previewRoute.import_readiness_capability.writes_allowed, false);
  assert.equal(previewRoute.target_path_capability.target_check_performed, false);
  assert.equal(previewRoute.file_handle_capability.target_open_performed, false);
  assert.equal(previewRoute.content_digest_sha256, preview.content_digest_sha256);
  assert.equal(previewRoute.route_summary.content_digest_sha256, preview.content_digest_sha256);
  assert.equal(previewRoute.route_summary.truncation_metadata_status, "valid");
  assert.equal(previewRoute.route_summary.schema_shape_status, "valid");
  assert.equal(previewRoute.route_summary.record_validation_status, "valid");
  assert.equal(previewRoute.route_summary.complexity_status, "valid");
  assert.equal(previewRoute.route_summary.generated_at_status, "valid");
  assert.equal(previewRoute.route_summary.temporal_consistency_status, "valid");
  assert.equal(previewRoute.route_summary.collection_ordering_status, "valid");
  assert.equal(previewRoute.route_summary.duplicate_record_status, "valid");
  assert.equal(previewRoute.route_summary.validation_findings_truncated, false);
  assert.equal(previewRoute.route_summary.validation_phase_execution_status, "complete");
  assert.equal(previewRoute.route_summary.unattributed_validation_finding_count, 0);
  assert.equal(previewRoute.digest_availability.exact_digest_status, "available");
  assert.equal(previewRoute.completeness.status, "incomplete");
  assert.equal(previewRoute.route_summary.completeness_status, "incomplete");
  assert.equal(previewRoute.byte_budget.payload_bytes, preview.byte_budget.payload_bytes);
  assert.equal(previewRoute.route_summary.payload_byte_status, preview.byte_budget.payload_byte_status);
  assert.equal(previewRoute.collection_truncation.decisions.truncated, true);
  assert.equal(previewRoute.rows.length, 5);
  assert.equal(JSON.stringify(previewRoute).includes("\"payload\""), false);
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.current_schema_version, 2);
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.content_digest_policy, "canonical_without_generated_at");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.comparison_policy, "digest_and_count_delta_only");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.content_assertion_policy, "expected_sha256_only_no_file_read");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.collection_truncation_policy, "exact_counts_or_explicit_unknown");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.truncation_metadata_validation_policy, "validate_when_present");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.completeness_policy, "all_collections_complete_and_exact");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.payload_byte_budget_policy, "exact_utf8_json_bytes_with_80_percent_warning");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.raw_file_byte_preflight_policy, "stat_before_read_with_2mb_limit");
  assert.equal(EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.max_raw_file_bytes, 2_000_000);
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.target_path_policy, "realpath_contained_no_symlinks");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.target_existence_probe_policy, "single_lstat_with_enoent_only_missing_truth");
  assert.equal(EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.existence_probe_policy, "single_lstat_with_enoent_only_missing_truth");
  assert.equal(EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.target_check_performed, false);
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.file_handle_inspection_policy, "single_fd_fstat_read_with_post_open_path_recheck");
  assert.equal(EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_open_performed, false);
  assert.equal(EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.close_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.close_failure_reason, "close_failed");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.schema_shape_policy, "allowlisted_keys_and_fixed_safety_policy_values");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.record_validation_policy, "required_fields_types_enums_and_timestamps");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.complexity_policy, "iterative_max_depth_32_max_nodes_50000");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.digest_availability_policy, "explicit_exact_and_content_digest_availability");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.generated_at_policy, "iso_timestamp_with_5_minute_future_skew_limit");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.temporal_consistency_policy, "generated_at_not_before_valid_record_timestamps");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.collection_ordering_policy, "deterministic_per_collection_visible_field_order");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.duplicate_record_policy, "exact_canonical_record_identity_counts_only");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.finding_budget_policy, "bounded_first_200_with_total_count");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.phase_execution_policy, "explicit_executed_skipped_with_dependency_reason");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.finding_attribution_policy, "counts_only_by_validation_phase");
  const incomplete = checkEvidenceExchangeCompleteness(db);
  assert.equal(incomplete.status, "manual_verification_required");
  assert.equal(incomplete.completeness_status, "incomplete");
  assert.equal(incomplete.truncated_collection_count, 1);
  assert.equal(incomplete.unknown_collection_count, 0);
  assert.equal(incomplete.incomplete_collections.some((item) => item.collection === "decisions" && item.truncation_status === "truncated"), true);
  assert.equal(incomplete.payload_exposed, false);
  assert.equal(incomplete.writes_performed, false);
  const completeDb = new DatabaseSync(":memory:");
  completeDb.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(completeDb);
  const complete = checkEvidenceExchangeCompleteness(completeDb);
  assert.equal(complete.status, "safe_to_execute");
  assert.equal(complete.completeness_status, "complete");
  assert.deepEqual(complete.incomplete_collections, []);
  assert.equal(complete.writes_performed, false);
  completeDb.close();
  const matchingAssertion = assertEvidenceExchangeContentDigest(db, built.content_digest_sha256);
  assert.equal(matchingAssertion.status, "safe_to_execute");
  assert.equal(matchingAssertion.assertion_status, "match");
  assert.equal(matchingAssertion.assertion_performed, true);
  assert.equal(matchingAssertion.target_file_read, false);
  assert.equal(matchingAssertion.payload_exposed, false);
  assert.equal(matchingAssertion.writes_performed, false);
  const mismatchAssertion = assertEvidenceExchangeContentDigest(db, "0".repeat(64));
  assert.equal(mismatchAssertion.status, "manual_verification_required");
  assert.equal(mismatchAssertion.assertion_status, "mismatch");
  assert.equal(mismatchAssertion.matches, false);
  assert.equal(mismatchAssertion.writes_performed, false);
  const invalidAssertion = assertEvidenceExchangeContentDigest(db, "not-a-digest");
  assert.equal(invalidAssertion.status, "manual_verification_required");
  assert.equal(invalidAssertion.assertion_status, "unknown");
  assert.equal(invalidAssertion.assertion_performed, false);
  assert.equal(invalidAssertion.expected_content_digest_sha256, null);
  assert.equal(evidenceExchangeCompatibility({ kind: "pala-public-evidence-export", schema_version: 2 }).compatibility, "compatible");
  assert.equal(evidenceExchangeCompatibility({ kind: "pala-public-evidence-export", schema_version: 3 }).compatibility, "newer_than_supported");
  assert.equal(evidenceExchangeCompatibility({ kind: "pala-public-evidence-export", schema_version: 1 }).compatibility, "older_than_supported");
  const legacyPayload = {
    kind: "pala-public-evidence-export",
    schema_version: 1,
    records: {
      decisions: [],
      public_evidence: [],
      quality_findings: [],
      references: []
    }
  };
  const migration = planEvidenceExchangeMigration(legacyPayload);
  assert.equal(migration.status, "dry_run_only");
  assert.equal(migration.from_schema_version, 1);
  assert.equal(migration.to_schema_version, 2);
  assert.equal(migration.decision_review_population, "requires_source_project_reexport");
  assert.equal(migration.candidate_validation.schema_shape_status, "valid");
  assert.equal(migration.candidate_payload_exposed, false);
  assert.equal(migration.writes_performed, false);
  assert.equal(planEvidenceExchangeMigration({ ...legacyPayload, schema_version: 3 }).status, "manual_verification_required");
  assert.equal(planEvidenceExchangeMigration({ kind: "pala-public-evidence-export", schema_version: 2 }).status, "manual_verification_required");

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-exchange-"));
  const target = "docs/evidence/exports/test.json";
  const written = writeSanitizedEvidenceExport(db, target, { projectRoot: tempRoot });
  assert.equal(written.status, "safe_to_execute");
  assert.equal(written.writes_performed, true);
  assert.equal(written.content_digest_sha256, built.content_digest_sha256);
  assert.equal(written.collection_truncation.decisions.truncated, true);
  assert.equal(written.byte_budget.payload_bytes, built.byte_budget.payload_bytes);
  assert.equal(written.digest_availability.exact_digest_status, "available");
  assert.equal(written.write_contract.policy, "bounded_project_contained_atomic_create_only_evidence_export");
  assert.equal(written.write_summary.atomic_create_link, true);
  assert.equal(written.write_summary.created_parent_directory_count > 0, true);
  assert.equal(written.write_summary.bytes_written, fs.statSync(path.join(tempRoot, target)).size);
  assert.equal(written.write_summary.target_identity_verified, true);
  const originalExport = fs.readFileSync(path.join(tempRoot, target), "utf8");
  const refusedOverwrite = writeSanitizedEvidenceExport(db, target, { projectRoot: tempRoot });
  assert.equal(refusedOverwrite.status, "needs_approval");
  assert.equal(refusedOverwrite.writes_performed, false);
  assert.equal(fs.readFileSync(path.join(tempRoot, target), "utf8"), originalExport);
  assert.deepEqual(fs.readdirSync(path.dirname(path.join(tempRoot, target))), ["test.json"]);
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.atomic_create_link, true);
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.concurrent_parent_creation_policy, "rechecked_eexist_tolerant");
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.concurrent_publish_policy, "atomic_create_only_one_winner_existing_target_needs_approval");
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match");
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.identity_safe_temp_cleanup, true);
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.post_publish_identity_policy, "temporary_and_target_dev_ino_match");
  assert.equal(EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.overwrite_allowed, false);
  const exchangeSource = fs.readFileSync(path.join(process.cwd(), "src", "lib", "evidence-exchange.ts"), "utf8");
  assert.equal(exchangeSource.includes("fs.mkdirSync(path.dirname(resolved.fullPath), { recursive: true })"), false);
  assert.equal(exchangeSource.includes("fs.writeFileSync(resolved.fullPath"), false);
  assert.equal(exchangeSource.includes("fs." + "existsSync"), false);
  const cliSource = fs.readFileSync(path.join(process.cwd(), "src", "cli.ts"), "utf8");
  assert.equal(cliSource.includes("planEvidenceExchangeImport(ctx.db"), true);
  assert.equal(cliSource.includes("real_evidence_import_requires_approval_and_" + "is_not_implemented"), false);
  assert.equal(cliSource.includes("planEvidenceExchangeMigrationReadiness"), true);
  assert.equal(cliSource.includes("real_evidence_migration_requires_reviewed_" + "implementation"), false);
  const unchangedComparison = compareEvidenceExchangeTarget(db, target, { projectRoot: tempRoot });
  assert.equal(unchangedComparison.status, "safe_to_execute");
  assert.equal(unchangedComparison.comparison_status, "unchanged");
  assert.equal(unchangedComparison.content_digest_match, true);
  assert.equal(unchangedComparison.comparison_performed, true);
  assert.equal(unchangedComparison.payload_exposed, false);
  assert.equal(unchangedComparison.import_performed, false);
  assert.equal(unchangedComparison.writes_performed, false);
  assert.equal(Object.hasOwn(unchangedComparison, "payload"), false);
  const unchangedImportPlan = planEvidenceExchangeImport(db, target, { projectRoot: tempRoot });
  assert.equal(unchangedImportPlan.status, "safe_to_execute");
  assert.equal(unchangedImportPlan.readiness_status, "already_current");
  assert.equal(unchangedImportPlan.import_required, false);
  assert.equal(unchangedImportPlan.approval_required, false);
  assert.equal(unchangedImportPlan.comparison_performed, true);
  assert.equal(unchangedImportPlan.target_read_performed, true);
  assert.equal(unchangedImportPlan.single_target_read, true);
  assert.equal(unchangedImportPlan.payload_exposed, false);
  assert.equal(unchangedImportPlan.import_performed, false);
  assert.equal(unchangedImportPlan.writes_performed, false);
  assert.equal(Object.hasOwn(unchangedImportPlan, "payload"), false);
  assert.equal(EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.policy, "validated_target_digest_and_count_delta_approval_plan");
  assert.equal(EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.writes_allowed, false);
  const currentMigrationPlan = planEvidenceExchangeMigrationReadiness(target, { projectRoot: tempRoot });
  assert.equal(currentMigrationPlan.status, "safe_to_execute");
  assert.equal(currentMigrationPlan.readiness_status, "already_current");
  assert.equal(currentMigrationPlan.migration_required, false);
  assert.equal(currentMigrationPlan.approval_required, false);
  assert.equal(currentMigrationPlan.target_read_performed, true);
  assert.equal(currentMigrationPlan.single_target_read, true);
  assert.equal(currentMigrationPlan.candidate_payload_exposed, false);
  assert.equal(currentMigrationPlan.migration_performed, false);
  assert.equal(currentMigrationPlan.writes_performed, false);
  assert.equal(Object.hasOwn(currentMigrationPlan, "payload"), false);
  assert.equal(EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.policy, "validated_source_schema_migration_readiness_approval_plan");
  assert.equal(EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.writes_allowed, false);
  const inspected = inspectEvidenceImport(target, { projectRoot: tempRoot });
  assert.equal(inspected.status, "safe_to_execute");
  assert.equal(inspected.import_performed, false);
  assert.equal(inspected.writes_performed, false);
  assert.equal(inspected.content_digest_sha256, written.content_digest_sha256);
  assert.equal(inspected.collection_truncation.decisions.truncated, true);
  assert.equal(inspected.byte_budget.payload_bytes, built.byte_budget.payload_bytes);
  assert.equal(inspected.raw_file_byte_budget.raw_file_bytes, fs.statSync(path.join(tempRoot, target)).size);
  assert.equal(inspected.raw_file_byte_budget.raw_file_byte_status, "within_budget");
  assert.equal(inspected.digest_availability.exact_digest_status, "available");
  assert.equal(inspected.file_inspection.target_open_performed, true);
  assert.equal(inspected.file_inspection.target_fstat_performed, true);
  assert.equal(inspected.file_inspection.target_read_performed, true);
  assert.equal(inspected.file_inspection.target_parse_performed, true);
  assert.equal(inspected.file_inspection.target_close_performed, true);
  assert.equal(inspected.file_inspection.target_close_succeeded, true);
  assert.equal(inspected.file_inspection.regular_file, true);
  assert.equal(inspected.file_inspection.file_identity_match, true);
  assert.equal(inspected.file_inspection.single_file_handle_used, true);
  const changedPayload = JSON.parse(fs.readFileSync(path.join(tempRoot, target), "utf8"));
  changedPayload.records.references.push({
    category: "test",
    freshness_status: "current",
    last_checked_at: "2026-01-01T00:00:00.000Z",
    lesson: "Comparison fixture",
    name: "Comparison fixture",
    pala_decision: "observe",
    status: "active",
    url: "https://example.com/comparison"
  });
  changedPayload.policy.collection_truncation.references.exported_record_count += 1;
  changedPayload.policy.collection_truncation.references.eligible_record_count += 1;
  fs.writeFileSync(path.join(tempRoot, target), JSON.stringify(changedPayload), "utf8");
  const changedComparison = compareEvidenceExchangeTarget(db, target, { projectRoot: tempRoot });
  assert.equal(changedComparison.status, "safe_to_execute");
  assert.equal(changedComparison.comparison_status, "changed");
  assert.equal(changedComparison.content_digest_match, false);
  assert.equal(changedComparison.record_count_deltas.find((item) => item.collection === "references").delta, -1);
  const changedImportPlan = planEvidenceExchangeImport(db, target, { projectRoot: tempRoot });
  assert.equal(changedImportPlan.status, "needs_approval");
  assert.deepEqual(changedImportPlan.blockers, ["real_evidence_import_write_disabled_by_policy"]);
  assert.equal(changedImportPlan.readiness_status, "validated_change_ready_for_review");
  assert.equal(changedImportPlan.import_required, true);
  assert.equal(changedImportPlan.approval_required, true);
  assert.equal(changedImportPlan.comparison_performed, true);
  assert.equal(changedImportPlan.record_count_deltas.find((item) => item.collection === "references").delta, -1);
  assert.equal(changedImportPlan.payload_exposed, false);
  assert.equal(changedImportPlan.import_performed, false);
  assert.equal(changedImportPlan.writes_performed, false);
  const missingComparison = compareEvidenceExchangeTarget(db, "missing.json", { projectRoot: tempRoot });
  assert.equal(missingComparison.status, "manual_verification_required");
  assert.equal(missingComparison.comparison_performed, false);
  assert.equal(missingComparison.writes_performed, false);
  const missingImportPlan = planEvidenceExchangeImport(db, "missing.json", { projectRoot: tempRoot });
  assert.equal(missingImportPlan.status, "manual_verification_required");
  assert.equal(missingImportPlan.readiness_status, "not_ready");
  assert.equal(missingImportPlan.comparison_performed, false);
  assert.equal(missingImportPlan.writes_performed, false);
  fs.writeFileSync(path.join(tempRoot, "legacy.json"), JSON.stringify(legacyPayload), "utf8");
  const inspectedMigration = inspectEvidenceMigration("legacy.json", { projectRoot: tempRoot });
  assert.equal(inspectedMigration.status, "dry_run_only");
  assert.equal(inspectedMigration.migration_performed, false);
  assert.equal(inspectedMigration.writes_performed, false);
  const legacyMigrationPlan = planEvidenceExchangeMigrationReadiness("legacy.json", { projectRoot: tempRoot });
  assert.equal(legacyMigrationPlan.status, "needs_approval");
  assert.deepEqual(legacyMigrationPlan.blockers, ["real_evidence_migration_write_disabled_by_policy"]);
  assert.equal(legacyMigrationPlan.readiness_status, "validated_migration_ready_for_review");
  assert.equal(legacyMigrationPlan.migration_required, true);
  assert.equal(legacyMigrationPlan.approval_required, true);
  assert.equal(legacyMigrationPlan.target_read_performed, true);
  assert.equal(legacyMigrationPlan.single_target_read, true);
  assert.equal(legacyMigrationPlan.candidate_payload_exposed, false);
  assert.equal(legacyMigrationPlan.migration_performed, false);
  assert.equal(legacyMigrationPlan.writes_performed, false);
  assert.equal(Object.hasOwn(legacyMigrationPlan, "payload"), false);
  const missingMigrationPlan = planEvidenceExchangeMigrationReadiness("missing.json", { projectRoot: tempRoot });
  assert.equal(missingMigrationPlan.status, "manual_verification_required");
  assert.equal(missingMigrationPlan.readiness_status, "not_ready");
  assert.equal(missingMigrationPlan.approval_required, false);
  assert.equal(missingMigrationPlan.writes_performed, false);
  const oversizedTarget = "oversized.json";
  fs.writeFileSync(path.join(tempRoot, oversizedTarget), " ".repeat(EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.max_raw_file_bytes + 1), "utf8");
  const oversizedImport = inspectEvidenceImport(oversizedTarget, { projectRoot: tempRoot });
  assert.equal(oversizedImport.status, "manual_verification_required");
  assert.deepEqual(oversizedImport.blockers, ["import_target_file_exceeds_raw_byte_limit"]);
  assert.equal(oversizedImport.raw_file_byte_budget.raw_file_byte_status, "over_limit");
  assert.equal(oversizedImport.import_performed, false);
  assert.equal(oversizedImport.file_inspection.target_open_performed, true);
  assert.equal(oversizedImport.file_inspection.target_fstat_performed, true);
  assert.equal(oversizedImport.file_inspection.target_read_performed, false);
  assert.equal(oversizedImport.file_inspection.target_parse_performed, false);
  const oversizedMigration = inspectEvidenceMigration(oversizedTarget, { projectRoot: tempRoot });
  assert.equal(oversizedMigration.status, "manual_verification_required");
  assert.deepEqual(oversizedMigration.blockers, ["migration_target_file_exceeds_raw_byte_limit"]);
  assert.equal(oversizedMigration.raw_file_byte_budget.raw_file_byte_status, "over_limit");
  fs.writeFileSync(path.join(tempRoot, "invalid.json"), "{", "utf8");
  const invalidJsonImport = inspectEvidenceImport("invalid.json", { projectRoot: tempRoot });
  assert.equal(invalidJsonImport.status, "manual_verification_required");
  assert.equal(invalidJsonImport.digest_availability.exact_digest_status, "unavailable");
  assert.equal(invalidJsonImport.digest_availability.reason, "not_computed_no_parsed_payload");
  const deepJson = `${'{"child":'.repeat(40)}null${"}".repeat(40)}`;
  fs.writeFileSync(path.join(tempRoot, "deep.json"), deepJson, "utf8");
  const deepImport = inspectEvidenceImport("deep.json", { projectRoot: tempRoot });
  assert.equal(deepImport.status, "manual_verification_required");
  assert.equal(deepImport.validation.complexity.depth_limit_exceeded, true);
  assert.equal(deepImport.digest_availability.exact_digest_status, "unavailable");
  assert.equal(deepImport.digest_availability.reason, "complexity_or_serialization_failed");
  const deepComparison = compareEvidenceExchangeTarget(db, "deep.json", { projectRoot: tempRoot });
  assert.equal(deepComparison.comparison_performed, false);
  assert.equal(deepComparison.target_digest_availability.reason, "complexity_or_serialization_failed");
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-exchange-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "outside.json"), JSON.stringify(built.payload), "utf8");
  fs.symlinkSync(outsideRoot, path.join(tempRoot, "linked"), "junction");
  const linkedImport = inspectEvidenceImport("linked/outside.json", { projectRoot: tempRoot });
  assert.equal(linkedImport.status, "blocked");
  assert.deepEqual(linkedImport.blockers, ["import_target_path_not_realpath_contained_or_symlink_free"]);
  assert.equal(linkedImport.path_safety.symlink_detected, true);
  assert.equal(linkedImport.target_parse_performed, false);
  assert.equal(linkedImport.file_inspection.target_open_performed, false);
  const linkedMigration = inspectEvidenceMigration("linked/outside.json", { projectRoot: tempRoot });
  assert.equal(linkedMigration.status, "blocked");
  assert.deepEqual(linkedMigration.blockers, ["migration_target_path_not_realpath_contained_or_symlink_free"]);
  assert.equal(linkedMigration.target_parse_performed, false);
  const linkedComparison = compareEvidenceExchangeTarget(db, "linked/outside.json", { projectRoot: tempRoot });
  assert.equal(linkedComparison.status, "blocked");
  assert.equal(linkedComparison.comparison_performed, false);
  const exportLink = path.join(tempRoot, "docs", "evidence", "exports", "linked");
  fs.symlinkSync(outsideRoot, exportLink, "junction");
  const linkedExport = writeSanitizedEvidenceExport(db, "docs/evidence/exports/linked/escaped.json", { projectRoot: tempRoot });
  assert.equal(linkedExport.status, "blocked");
  assert.deepEqual(linkedExport.blockers, ["export_target_path_not_realpath_contained_or_symlink_free"]);
  assert.equal(linkedExport.writes_performed, false);
  assert.equal(fs.existsSync(path.join(outsideRoot, "escaped.json")), false);
  fs.mkdirSync(path.join(tempRoot, "directory.json"));
  const directoryImport = inspectEvidenceImport("directory.json", { projectRoot: tempRoot });
  assert.equal(directoryImport.status, "blocked");
  assert.deepEqual(directoryImport.blockers, ["import_target_not_regular_file"]);
  assert.equal(directoryImport.file_inspection.regular_file, false);
  assert.equal(directoryImport.file_inspection.target_read_performed, false);
  const directoryMigration = inspectEvidenceMigration("directory.json", { projectRoot: tempRoot });
  assert.equal(directoryMigration.status, "blocked");
  assert.deepEqual(directoryMigration.blockers, ["migration_target_not_regular_file"]);

  const unsafe = validateEvidenceExchange({
    kind: "pala-public-evidence-export",
    schema_version: 2,
    raw_log_path: personalPath,
    records: { decisions: [], decision_review: [], public_evidence: [], quality_findings: [], references: [] }
  });
  assert.equal(unsafe.status, "manual_verification_required");
  assert.equal(unsafe.findings.some((finding) => finding.location === "$.raw_log_path"), true);
  const mislabeledRawPath = validateEvidenceExchange({
    kind: "pala-public-evidence-export",
    schema_version: 2,
    records: {
      decisions: [],
      decision_review: [],
      public_evidence: [{ kind: "command", path: ".pala/evidence/raw/private.log", redaction_status: "redacted", created_at: "2026-01-01T00:00:00.000Z" }],
      quality_findings: [],
      references: []
    }
  });
  assert.equal(mislabeledRawPath.status, "manual_verification_required");
  assert.equal(mislabeledRawPath.findings.some((finding) => finding.summary === "Private/local runtime path is present."), true);
  db.close();
});

test("evidence exchange target inspections report close failures without throwing or exposing payloads", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-exchange-close-failure-"));
  const target = "exchange.json";
  fs.writeFileSync(path.join(projectRoot, target), JSON.stringify({ private_marker: "must-not-escape" }), "utf8");

  const originalCloseSync = fs.closeSync;
  let closeFailureCount = 0;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    closeFailureCount += 1;
    const error = new Error("injected evidence target close failure");
    error.code = "EIO";
    throw error;
  };
  let imported;
  let migrated;
  try {
    assert.doesNotThrow(() => {
      imported = inspectEvidenceImport(target, { projectRoot });
    });
    assert.doesNotThrow(() => {
      migrated = inspectEvidenceMigration(target, { projectRoot });
    });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureCount, 2);
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_reason, "close_failed");
  for (const [result, prefix] of [[imported, "import"], [migrated, "migration"]]) {
    assert.equal(result.status, "manual_verification_required");
    assert.deepEqual(result.blockers, [`${prefix}_target_close_failed`]);
    assert.equal(result.file_inspection.target_close_performed, true);
    assert.equal(result.file_inspection.target_close_succeeded, false);
    assert.equal(result.file_inspection.target_parse_performed, true);
    assert.equal(result.writes_performed, false);
    assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  }
  assert.equal(imported.import_performed, false);
  assert.equal(imported.digest_availability.exact_digest_status, "unavailable");
  assert.equal(migrated.migration_performed, false);
  assert.equal(migrated.candidate_payload_exposed, false);
});

test("docs honesty accepts explicit unpublished notices and rejects publish claims", () => {
  assert.equal(hasUnsupportedPublishClaim("NPM package is not published yet."), false);
  assert.equal(hasUnsupportedPublishClaim("PyPI package has not been published."), false);
  assert.equal(hasUnsupportedPublishClaim("Pala OS is published to npm."), true);
  assert.equal(hasUnsupportedPublishClaim("npm install -g pala"), true);
  assert.equal(hasUnsupportedHypeClaim("Pala is the best coding agent.", "best coding agent"), true);
  assert.equal(hasUnsupportedHypeClaim("Pala is not the best coding agent.", "best coding agent"), false);
  assert.deepEqual(docsHonestyFindings(), []);
  assert.deepEqual(workspaceHygieneFindings(), []);
});

test("semantic drift checks cross-file version and operating contracts", () => {
  const current = inspectVersionContract();
  assert.equal(current.status, "safe_to_execute");
  assert.equal(inspectVersionContract({ packageVersion: "0.28.0", manifestVersion: "v27", readmeText: "Pala OS v28" }).status, "manual_verification_required");
  const drift = inspectDrift(false);
  assert.deepEqual(drift.failures, []);
  assert.equal(drift.checks.some((check) => check.name === "Workflow contracts pass"), true);
  assert.equal(drift.checks.some((check) => check.name === "Dashboard read-only API and bounded route controls are documented and generated"), true);
  assert.equal(drift.checks.some((check) => check.name === "Dashboard route generation is fixed, contained, and atomic"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence exchange export writes are contained and create-only"), true);
  assert.equal(drift.checks.some((check) => check.name === "Benchmark refresh queue contract is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Decision review queue contract is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Decision review aging policy is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence exchange migration plan is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence exchange migration capability is dashboard-visible without payloads or writes"), true);
  assert.equal(drift.checks.some((check) => check.name === "Stable evidence content digest is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence exchange change detector is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence exchange comparison capability is dashboard-visible without target reads"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence content digest assertion is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence content assertion capability is dashboard-visible without running assertions"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence exchange collection truncation truth is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence truncation metadata consistency validation is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence truncation metadata validation status is dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence completeness gate is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence completeness status is dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence payload byte budget truth is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence raw-file preflight is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence target path safety is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence single-handle file inspection is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence strict schema shape is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence record values are documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence payload complexity guard is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence digest availability is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence generated_at time truth is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence temporal consistency is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence collection ordering is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence duplicate-record truth is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence validation findings are bounded and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence validation phase execution is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Evidence validation finding attribution is documented and dashboard-visible"), true);
  assert.equal(drift.checks.some((check) => check.name === "Bounded local worker smoke contract is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Local skill readiness is bounded and external-refresh-safe"), true);
  assert.equal(drift.checks.some((check) => check.name === "Smart suggestions and opportunity radar require complete source truth"), true);
  assert.equal(drift.checks.some((check) => check.name === "Plan-only commands require complete source truth"), true);
  assert.equal(drift.checks.some((check) => check.name === "Read-only cross-platform privilege detection is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Interactive mistake capture contract is documented and implemented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Memory registry appends are bounded, contained, and safe"), true);
  assert.equal(drift.checks.some((check) => check.name === "n8n import target inspection is bounded and documented"), true);
  assert.equal(drift.checks.some((check) => check.name === "Archive inventory is bounded and exactness-aware"), true);
  assert.equal(drift.checks.some((check) => check.name === "Ledger appends are fixed, bounded, and single-handle"), true);
  assert.equal(drift.checks.some((check) => check.name === "Raw evidence writes are bounded, contained, and create-only"), true);
  assert.equal(drift.checks.some((check) => check.name === "Public evidence writes are fixed, bounded, and atomic"), true);
  assert.equal(drift.checks.some((check) => check.name === "Ledger safety scan is bounded and repair-gated"), true);
  assert.equal(drift.checks.some((check) => check.name === "Ledger repair writes are contained, backed up, and atomic"), true);
  assert.equal(drift.checks.some((check) => check.name === "Latest evidence lookup is bounded and exactness-aware"), true);
  assert.equal(drift.checks.some((check) => check.name === "MCP fixture inspection is bounded and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "Panel file serving is loopback-only and bounded"), true);
  assert.equal(drift.checks.some((check) => check.name === "Runtime command observations are bounded and raw-output-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "Optional n8n CLI observation is bounded and raw-output-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "State JSON reads and refresh writes are bounded and atomic"), true);
  assert.equal(drift.checks.some((check) => check.name === "Database schema initialization is bounded and authorized"), true);
  assert.equal(drift.checks.some((check) => check.name === "Database path observation is contained and payload-free"), true);
  assert.equal(drift.database_path_inspection.status, "safe_to_execute");
  assert.equal(drift.database_path_inspection.payload_exposed, false);
  assert.equal(drift.checks.some((check) => check.name === "Kernel bootstrap is fixed, contained, and create-only"), true);
  assert.equal(drift.checks.some((check) => check.name === "Drift contract text reads are bounded and complete"), true);
  assert.equal(drift.checks.some((check) => check.name === "CLI contract source reads are bounded and surfaced"), true);
  assert.equal(drift.checks.some((check) => check.name === "CLAUDE sync dry-run is bounded and proposal-gated"), true);
  assert.equal(drift.checks.some((check) => check.name === "Workflow contract scan is bounded and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "Public readiness artifact inspection is bounded and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "Architecture layer paths are contained and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "i18n artifact paths are contained and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "Runtime project asset paths are contained and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "Quality required artifact paths are contained and payload-free"), true);
  assert.equal(drift.checks.some((check) => check.name === "CLI path presence decisions use contained metadata"), true);
});

test("version and drift contract source reads are bounded and never fake PASS", () => {
  assert.equal(DRIFT_TEXT_READ_CONTRACT.policy, "bounded_cached_contract_text_reads_with_shared_budget");
  assert.equal(DRIFT_TEXT_READ_CONTRACT.max_file_bytes, 2_000_000);
  assert.equal(DRIFT_TEXT_READ_CONTRACT.max_total_text_bytes, 20_000_000);
  assert.equal(DRIFT_TEXT_READ_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(DRIFT_TEXT_READ_CONTRACT.payload_exposed, false);
  assert.equal(DRIFT_TEXT_READ_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(DRIFT_TEXT_READ_CONTRACT.writes_allowed, false);
  assert.equal(CONTRACT_TEXT_READ_CONTRACT, DRIFT_TEXT_READ_CONTRACT);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-drift-root-"));
  fs.writeFileSync(path.join(projectRoot, "package.json"), "{\"version\":\"0.28.0\"}\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, "manifest.json"), "{\"version\":\"v28\"}\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Pala OS v28\n", "utf8");
  const cachedReader = createContractTextReader({ projectRoot, maxTextFileBytes: 256, maxTotalTextBytes: 1024 });
  assert.match(cachedReader.read("README.md"), /Pala OS v28/);
  assert.match(cachedReader.read("README.md"), /Pala OS v28/);
  assert.equal(cachedReader.summary().text_file_read_count, 1);
  const safe = inspectVersionContract({ projectRoot, maxTextFileBytes: 256, maxTotalTextBytes: 1024 });
  assert.equal(safe.status, "safe_to_execute");
  assert.equal(safe.scan_complete, true);
  assert.equal(safe.text_read.text_file_read_count, 3);
  assert.equal(safe.text_read.payload_exposed, false);

  fs.writeFileSync(path.join(projectRoot, "README.md"), "must-never-be-returned".repeat(16), "utf8");
  const oversized = inspectVersionContract({ projectRoot, maxTextFileBytes: 64, maxTotalTextBytes: 512 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.scan_complete, false);
  assert.equal(oversized.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.doesNotMatch(JSON.stringify(oversized), /must-never-be-returned/);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-drift-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-drift-outside-"));
  fs.writeFileSync(path.join(linkedRoot, "package.json"), "{\"version\":\"0.28.0\"}\n", "utf8");
  fs.writeFileSync(path.join(linkedRoot, "manifest.json"), "{\"version\":\"v28\"}\n", "utf8");
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, "README.md"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectVersionContract({ projectRoot: linkedRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.scan_complete, false);
  assert.equal(linked.text_read.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);

  const missingLinkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-drift-missing-linked-"));
  const emptyOutsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-drift-empty-outside-"));
  fs.symlinkSync(emptyOutsideRoot, path.join(missingLinkedRoot, "docs"), process.platform === "win32" ? "junction" : "dir");
  const missingLinkedReader = createContractTextReader({ projectRoot: missingLinkedRoot });
  assert.equal(missingLinkedReader.exists("docs/missing.md"), false);
  assert.equal(missingLinkedReader.summary().scan_complete, false);
  assert.equal(missingLinkedReader.summary().blockers.includes("repo_text_file_not_realpath_contained_regular_file"), true);
});

test("public readiness covers the phase contract and current artifacts", () => {
  for (const required of [
    "THIRD_PARTY_NOTICES.md",
    "docs/CLI.md",
    "docs/MEMORY.md",
    "docs/DECISION_ENGINE.md",
    "docs/TOKEN_ECONOMY.md",
    "docs/MCP_INSTALLER.md",
    "docs/EVIDENCE_EXCHANGE.md",
    "docs/WORKER.md",
    "docs/ADMIN.md",
    "docs/PUBLIC_RELEASE.md"
  ]) {
    assert.equal(PUBLIC_READY_FILES.includes(required), true, `${required} must be part of the public readiness gate`);
  }
  const current = inspectPublicReadiness();
  assert.equal(current.status, "safe_to_execute");
  assert.equal(current.scan_complete, true);
  assert.equal(current.artifact_inspections.length, PUBLIC_READY_FILES.length);
  assert.equal(current.payload_exposed, false);
  assert.deepEqual(current.missing, []);
  assert.deepEqual(current.workflow_contract.failures, []);
});

test("public readiness artifacts are bounded, contained, non-empty, and payload-free", () => {
  assert.equal(PUBLIC_READINESS_INSPECTION_CONTRACT.policy, "bounded_required_public_artifact_single_handle_scan");
  assert.equal(PUBLIC_READINESS_INSPECTION_CONTRACT.required_file_count, PUBLIC_READY_FILES.length);
  assert.equal(PUBLIC_READINESS_INSPECTION_CONTRACT.max_file_bytes, 2_000_000);
  assert.equal(PUBLIC_READINESS_INSPECTION_CONTRACT.max_total_text_bytes, 20_000_000);
  assert.equal(PUBLIC_READINESS_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(PUBLIC_READINESS_INSPECTION_CONTRACT.writes_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-root-"));
  for (const file of PUBLIC_READY_FILES) {
    const fullPath = path.join(projectRoot, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "artifact\n", "utf8");
  }
  const workflowContract = { status: "safe_to_execute", failures: [], scan_complete: true, payload_exposed: false };
  const safe = inspectPublicReadiness({ projectRoot, workflowContract, maxTextFileBytes: 128, maxTotalTextBytes: 10_000 });
  assert.equal(safe.status, "safe_to_execute");
  assert.equal(safe.scan_complete, true);
  assert.equal(safe.artifact_inspections.length, PUBLIC_READY_FILES.length);
  assert.equal(safe.artifact_inspections.every((item) => item.payload_exposed === false), true);
  assert.equal(safe.payload_exposed, false);

  fs.writeFileSync(path.join(projectRoot, "README.md"), "", "utf8");
  const empty = inspectPublicReadiness({ projectRoot, workflowContract, maxTextFileBytes: 128, maxTotalTextBytes: 10_000 });
  assert.equal(empty.status, "manual_verification_required");
  assert.deepEqual(empty.empty, ["README.md"]);

  fs.writeFileSync(path.join(projectRoot, "README.md"), "must-never-be-returned".repeat(16), "utf8");
  const oversized = inspectPublicReadiness({ projectRoot, workflowContract, maxTextFileBytes: 64, maxTotalTextBytes: 10_000 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.scan_complete, false);
  assert.equal(oversized.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.equal(oversized.unsafe.includes("README.md"), true);
  assert.doesNotMatch(JSON.stringify(oversized), /must-never-be-returned/);

  fs.unlinkSync(path.join(projectRoot, "README.md"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-public-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "README.md"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectPublicReadiness({ projectRoot, workflowContract });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.scan_complete, false);
  assert.equal(linked.unsafe.includes("README.md"), true);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("workflow contracts keep CI local, strict, and non-publishing", async () => {
  const contracts = inspectWorkflowContracts();
  assert.equal(contracts.status, "safe_to_execute");
  assert.deepEqual(contracts.failures, []);
  assert.equal(contracts.scan_complete, true);
  assert.equal(contracts.payload_exposed, false);
  assert.equal(contracts.file_inspections.every((item) => item.payload_exposed === false), true);
  assert.equal(contracts.writes_performed, false);
  assert.equal(contracts.external_call_performed, false);
  assert.equal(contracts.checks.some((check) => check.name.includes("benchmark-refresh --dry-run")), true);
  assert.equal(contracts.checks.some((check) => check.name.includes("evidence schema-check --strict")), true);
  assert.equal(contracts.checks.some((check) => check.name.includes("decision-review --strict")), true);
  const result = await runCli(["workflow-check", "--strict"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).acceptance_status, "PASS");
});

test("workflow mutation scan rejects real release actions without flagging readiness words", () => {
  const safe = inspectWorkflowMutations([
    "on:",
    "  push:",
    "steps:",
    "  - run: npm run pala -- push-check"
  ].join("\n"));
  assert.deepEqual(safe, {
    forbidden_run_step_count: 0,
    forbidden_action_count: 0,
    mutation_payload_exposed: false
  });

  const unsafe = inspectWorkflowMutations([
    "steps:",
    "  - run: git push origin main",
    "  - uses: softprops/action-gh-release@v2"
  ].join("\n"));
  assert.equal(unsafe.forbidden_run_step_count, 1);
  assert.equal(unsafe.forbidden_action_count, 1);

  const multiline = inspectWorkflowMutations([
    "steps:",
    "  - name: Publish",
    "    run: |",
    "      npm test",
    "      npm publish",
    "  - name: Release",
    "    uses: softprops/action-gh-release@v2"
  ].join("\n"));
  assert.equal(multiline.forbidden_run_step_count, 1);
  assert.equal(multiline.forbidden_action_count, 1);

  const secretBearing = inspectWorkflowMutations("steps:\n  - run: git push origin main token=must-never-be-returned");
  assert.equal(secretBearing.forbidden_run_step_count, 1);
  assert.doesNotMatch(JSON.stringify(secretBearing), /must-never-be-returned/);
});

test("workflow contract reads are bounded, project-contained, and payload-free", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-workflow-bounded-"));
  const workflowDir = path.join(projectRoot, ".github", "workflows");
  fs.mkdirSync(workflowDir, { recursive: true });
  fs.writeFileSync(path.join(workflowDir, "ci.yml"), `secret=must-never-be-returned\n${"x".repeat(128)}`, "utf8");

  const oversized = inspectWorkflowContracts({
    projectRoot,
    maxFileBytes: 32,
    maxTotalTextBytes: 64
  });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.scan_complete, false);
  assert.equal(oversized.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.equal(oversized.payload_exposed, false);
  assert.equal(oversized.file_inspections.find((item) => item.file === ".github/workflows/ci.yml").target_read_performed, false);
  assert.doesNotMatch(JSON.stringify(oversized), /must-never-be-returned|x{32}/);

  assert.equal(WORKFLOW_INSPECTION_CONTRACT.policy, "bounded_project_contained_single_handle_workflow_contract_scan");
  assert.equal(WORKFLOW_INSPECTION_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(WORKFLOW_INSPECTION_CONTRACT.max_total_text_bytes, 2_000_000);
  assert.equal(WORKFLOW_INSPECTION_CONTRACT.mutation_payload_exposed, false);
  assert.equal(WORKFLOW_INSPECTION_CONTRACT.writes_allowed, false);
});

test("mini-kernel and dashboard phase-contract files exist", () => {
  ensureKernel();
  const required = [
    ".pala/rules/core-rules.md",
    ".pala/rules/no-fake-done.md",
    ".pala/rules/no-delete-no-push.md",
    ".pala/rules/source-of-truth.yaml",
    ".pala/rules/local-persistence-policy.md",
    ".pala/rules/mistake-to-rule-policy.md",
    ".pala/rules/decision-engine-policy.md",
    ".pala/rules/token-economy-policy.md",
    ".pala/rules/current-source-reference-law.md",
    ".pala/rules/operator-console-usage-policy.md",
    ".pala/ledger/events.jsonl",
    ".pala/ledger/handoffs.jsonl",
    ".pala/ledger/decisions.jsonl",
    ".pala/ledger/mistakes.jsonl",
    ".pala/ledger/token-economy.jsonl",
    ".pala/ledger/reference-refresh.jsonl",
    "control/overview/index.html",
    "control/evidence/index.html",
    "control/drift/index.html",
    "control/sync/index.html",
    "control/push-readiness/index.html",
    "control/token-economy/index.html",
    "control/memory/index.html",
    "control/decisions/index.html",
    "control/quality-radar/index.html",
    "control/references/index.html",
    "control/mcp/index.html",
    "control/architecture/index.html"
  ];
  assert.deepEqual(required.filter((file) => !fs.existsSync(path.join(process.cwd(), file))), []);
});

test("ledger append is allowlisted, bounded, contained, and single-handle", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-append-"));
  const ledgerPath = appendLedger("events", { event: "test", secret: "token=must-never-be-returned" }, { projectRoot });
  assert.equal(ledgerPath, ".pala/ledger/events.jsonl");
  const written = fs.readFileSync(path.join(projectRoot, ledgerPath), "utf8");
  assert.match(written, /"event":"test"/);
  assert.doesNotMatch(written, /must-never-be-returned/);
  assert.throws(
    () => appendLedger("../outside", { event: "escape" }, { projectRoot }),
    /ledger_name_not_allowed/
  );
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "outside.jsonl")), false);

  const originalWriteSync = fs.writeSync;
  fs.writeSync = () => 0;
  try {
    assert.throws(
      () => appendLedger("events", { event: "short-write" }, { projectRoot }),
      /ledger_append_blocked:short_write/
    );
  } finally {
    fs.writeSync = originalWriteSync;
  }
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "ledger", ".ledger-mutation.write-lock")), false);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "ledger"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => appendLedger("events", { event: "must-not-write" }, { projectRoot: linkedRoot }),
    /kernel_bootstrap_blocked|ledger_append_blocked/
  );
  assert.deepEqual(fs.readdirSync(outsideRoot), []);

  const blockedLockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-lock-blocked-"));
  ensureKernel({ projectRoot: blockedLockRoot });
  fs.mkdirSync(path.join(blockedLockRoot, ".pala", "ledger", ".ledger-mutation.write-lock"));
  assert.throws(
    () => appendLedger("events", { event: "must-not-write" }, { projectRoot: blockedLockRoot }),
    /ledger_append_blocked:mutation_lock_unavailable/
  );
  assert.equal(fs.readFileSync(path.join(blockedLockRoot, ".pala", "ledger", "events.jsonl"), "utf8"), "");

  assert.equal(LEDGER_APPEND_CONTRACT.policy, "fixed_allowlisted_project_contained_single_handle_append");
  assert.equal(LEDGER_APPEND_CONTRACT.allowed_file_count, 6);
  assert.equal(LEDGER_APPEND_CONTRACT.max_record_bytes, 1_000_000);
  assert.equal(LEDGER_APPEND_CONTRACT.concurrent_mutation_policy, "bounded_fixed_create_only_lock_serialized_ledger_mutations");
  assert.equal(LEDGER_APPEND_CONTRACT.max_mutation_lock_attempts, 100);
  assert.equal(LEDGER_APPEND_CONTRACT.stale_mutation_lock_reclamation_allowed, false);
  assert.equal(LEDGER_APPEND_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(fs.readFileSync(path.join(process.cwd(), "src", "lib", "ledger.ts"), "utf8").includes("appendFileSync"), false);
});

test("ledger append reports file close failure instead of claiming success", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-ledger-append-close-failure-"));
  ensureKernel({ projectRoot });
  const originalOpenSync = fs.openSync;
  const originalCloseSync = fs.closeSync;
  let ledgerFileDescriptor;
  fs.openSync = (filePath, flags, ...args) => {
    const fileDescriptor = originalOpenSync(filePath, flags, ...args);
    if (path.basename(String(filePath)) === "events.jsonl" && (flags & fs.constants.O_APPEND) !== 0) {
      ledgerFileDescriptor = fileDescriptor;
    }
    return fileDescriptor;
  };
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (fileDescriptor === ledgerFileDescriptor) {
      ledgerFileDescriptor = undefined;
      throw new Error("injected ledger append file close failure");
    }
  };
  let error;
  try {
    error = assert.throws(
      () => appendLedger("events", { event: "close-failure", secret: "must-never-be-returned" }, { projectRoot }),
      /ledger_append_blocked:file_close_failed/
    );
  } finally {
    fs.openSync = originalOpenSync;
    fs.closeSync = originalCloseSync;
  }

  assert.equal(LEDGER_APPEND_CONTRACT.close_failure_error, "ledger_append_blocked:file_close_failed");
  assert.doesNotMatch(String(error), /must-never-be-returned/);
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "ledger", ".ledger-mutation.write-lock")), false);
});

test("completion summary forbids PASS while blockers remain", () => {
  const blocked = buildCompletionSummary(
    {
      status: "manual_verification_required",
      decision: { decision: "pass_allowed", risk_level: "low" },
      root_blockers: ["no_git_remote_configured"],
      release_blockers: ["no_git_remote_configured"],
      failures: [{ name: "No unresolved push-readiness blockers" }]
    },
    ["?? README.md"],
    ".pala/evidence/raw/example.log"
  );
  assert.equal(blocked.acceptance_status, "PARTIAL");
  assert.equal(blocked.risk_summary.unresolved_blocker_count, 1);
  assert.deepEqual(blocked.risk_summary.unresolved_blockers, ["no_git_remote_configured"]);
  assert.deepEqual(blocked.changed_files, ["?? README.md"]);

  const passed = buildCompletionSummary(
    { status: "safe_to_execute", decision: { decision: "pass_allowed", risk_level: "low", evidence_path: ".pala/evidence/raw/decision.log" } },
    [],
    ".pala/evidence/raw/verify.log"
  );
  assert.equal(passed.acceptance_status, "PASS");
  assert.equal(passed.risk_summary.unresolved_blocker_count, 0);
  assert.equal(buildCompletionSummary({ status: "safe_to_execute" }, [], ".pala/evidence/raw/check.log").acceptance_status, "PASS");
});

test("read-only control helpers expose structured local truth", () => {
  const paths = createPaths(path.join(os.tmpdir(), "pala-test-root"));
  assert.match(paths.dbPath, /pala\.sqlite$/);
  assert.equal(inspectArchitecture().status, "safe_to_execute");
  const codeMap = buildCodeMap();
  assert.equal(codeMap.routed_commands.includes("workflow-check"), true);
  assert.equal(codeMap.routed_commands.includes("worker-run"), true);
  assert.equal(codeMap.declared_commands.includes("pala workflow-check"), true);
  assert.equal(inspectDrift().failures.length, 0);
  assert.equal(inspectClaudeAssets("skills").status, "safe_to_execute");
  assert.equal(inspectClaudeAssets("hooks").hook_activated, false);
  assert.equal(inspectClaudeAssets("agents").agent_run_performed, false);
  assert.equal(inspectExamples().findings.length, 0);
  assert.equal(inspectPlaybooks().findings.length, 0);
  assert.equal(inspectPrompts().findings.length, 0);
  assert.equal(Array.isArray(gitStatusLines()), true);
  assert.equal(inspectPushReadiness().pushed, false);
  assert.equal(memoryStatus().mistakes, 0);
  assert.equal(memoryStatus().templates >= 1, true);
  assert.equal(claudeSyncDryRun().writes_performed, false);
  assert.equal(typeof latestEvidence, "function");
  assert.equal(typeof appendLedger, "function");
  assert.equal(typeof observeRuntime, "function");
});

test("local skill readiness inspection is bounded, evidence-backed, and never fetches or installs", () => {
  assert.equal(CLAUDE_SKILL_INSPECTION_CONTRACT.policy, "bounded_project_skill_readiness_scan");
  assert.equal(CLAUDE_SKILL_INSPECTION_CONTRACT.max_skill_bytes, 4000);
  assert.equal(CLAUDE_SKILL_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(CLAUDE_SKILL_INSPECTION_CONTRACT.writes_allowed, false);
  assert.equal(EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.policy, "bounded_local_skill_readiness_without_external_fetch_or_install");
  assert.equal(EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.external_fetch_allowed, false);
  assert.equal(EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.install_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-local-skills-"));
  const skillDir = path.join(projectRoot, ".claude", "skills", "ready-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
    "---",
    "description: Use for bounded local verification.",
    "---",
    "",
    "# Ready Skill",
    "",
    "Inspect local evidence, report blockers, and preserve the no-write boundary."
  ].join("\n"), "utf8");

  const ready = inspectClaudeAssets("skills", { projectRoot });
  assert.equal(ready.status, "safe_to_execute");
  assert.equal(ready.contract.policy, "bounded_project_skill_readiness_scan");
  assert.equal(ready.scan_contract.policy, "bounded_realpath_contained_inventory_with_single_handle_text_reads");
  assert.equal(ready.ready_skill_count, 1);
  assert.equal(ready.unready_skill_count, 0);
  assert.equal(ready.skill_readiness[0].ready, true);
  assert.equal(ready.skill_readiness[0].checks.every((check) => check.ok), true);
  assert.equal(ready.scan_complete, true);
  assert.equal(ready.payload_exposed, false);
  assert.equal(ready.writes_performed, false);

  const refresh = inspectExternalSkillsDryRun({ projectRoot });
  assert.equal(refresh.status, "dry_run_only");
  assert.equal(refresh.local_readiness_status, "safe_to_execute");
  assert.equal(refresh.local_skill_count, 1);
  assert.equal(refresh.ready_skill_count, 1);
  assert.equal(refresh.unready_skill_count, 0);
  assert.equal(refresh.external_fetch_performed, false);
  assert.equal(refresh.install_performed, false);
  assert.equal(refresh.writes_performed, false);
});

test("local skill readiness fails closed for malformed, placeholder, and unsafe skill roots", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-local-skills-invalid-"));
  const skillDir = path.join(projectRoot, ".claude", "skills", "invalid-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
    "---",
    "allowed-tools: Read",
    "---",
    "",
    "# Placeholder Skill",
    "",
    "placeholder"
  ].join("\n"), "utf8");

  const malformed = inspectClaudeAssets("skills", { projectRoot });
  assert.equal(malformed.status, "manual_verification_required");
  assert.equal(malformed.ready_skill_count, 0);
  assert.equal(malformed.unready_skill_count, 1);
  assert.equal(malformed.skill_readiness[0].ready, false);
  assert.equal(malformed.failures.some((failure) => failure.name.includes("description")), true);
  assert.equal(malformed.failures.some((failure) => failure.name.includes("placeholder")), true);
  assert.equal(inspectExternalSkillsDryRun({ projectRoot }).status, "manual_verification_required");
  const malformedProposal = buildExternalSkillProposal("", { projectRoot });
  assert.equal(malformedProposal.status, "manual_verification_required");
  assert.equal(malformedProposal.local_readiness_status, "manual_verification_required");
  assert.equal(malformedProposal.blockers.includes("local_skill_readiness_unconfirmed"), true);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-local-skills-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "SKILL.md"), "must-never-be-returned", "utf8");
  fs.rmSync(path.join(projectRoot, ".claude", "skills"), { recursive: true, force: true });
  fs.symlinkSync(outsideRoot, path.join(projectRoot, ".claude", "skills"), process.platform === "win32" ? "junction" : "dir");

  const unsafe = inspectExternalSkillsDryRun({ projectRoot });
  assert.equal(unsafe.status, "manual_verification_required");
  assert.equal(unsafe.scan_complete, false);
  assert.equal(unsafe.blockers.includes("repo_scan_root_not_realpath_contained_regular_directory"), true);
  assert.doesNotMatch(JSON.stringify(unsafe), /must-never-be-returned/);
});

test("git worktree and remote observations are bounded and never fake a clean state on process failure", () => {
  const dirty = inspectSync({
    statusObservation: {
      status: 0,
      stdout: " M src/a.ts\0?? new.txt\0",
      stderr: "",
      error: null,
      signal: null
    },
    maxReturnedChangedFiles: 1
  });
  assert.equal(dirty.status, "manual_verification_required");
  assert.equal(dirty.scan_complete, true);
  assert.equal(dirty.changed_files_count, 2);
  assert.equal(dirty.changed_files_count_exact, true);
  assert.equal(dirty.changed_files.length, 1);
  assert.equal(dirty.changed_files_truncated, true);
  assert.deepEqual(dirty.blockers, ["worktree_has_uncommitted_or_untracked_files"]);

  const failed = inspectSync({
    statusObservation: {
      status: 128,
      stdout: "",
      stderr: "fatal: not a git repository",
      error: null,
      signal: null
    }
  });
  assert.equal(failed.status, "manual_verification_required");
  assert.equal(failed.scan_complete, false);
  assert.equal(failed.changed_files_count, null);
  assert.equal(failed.changed_files_count_exact, false);
  assert.deepEqual(failed.blockers, ["git_status_process_failed"]);
  assert.equal(Object.hasOwn(failed, "stdout"), false);
  assert.equal(Object.hasOwn(failed, "stderr"), false);

  const overflow = inspectGitStatus({
    statusObservation: {
      status: null,
      stdout: "?? partial.txt\0",
      stderr: "",
      error: { code: "ENOBUFS" },
      signal: "SIGTERM"
    }
  });
  assert.equal(overflow.status, "manual_verification_required");
  assert.equal(overflow.scan_complete, false);
  assert.equal(overflow.changed_files_count, null);
  assert.deepEqual(overflow.blockers, ["git_status_output_limit_exceeded"]);

  const unknownRemote = inspectPushReadiness({
    statusObservation: { status: 0, stdout: "", stderr: "", error: null, signal: null },
    remoteObservation: { status: 128, stdout: "", stderr: "failed", error: null, signal: null }
  });
  assert.equal(unknownRemote.status, "blocked");
  assert.equal(unknownRemote.remote_count, null);
  assert.equal(unknownRemote.remote_count_exact, false);
  assert.equal(unknownRemote.blockers.includes("git_remote_process_failed"), true);
  assert.equal(unknownRemote.blockers.includes("no_git_remote_configured"), false);

  const ready = inspectPushReadiness({
    statusObservation: { status: 0, stdout: "", stderr: "", error: null, signal: null },
    remoteObservation: { status: 0, stdout: "origin\n", stderr: "", error: null, signal: null }
  });
  assert.equal(ready.status, "safe_to_execute");
  assert.equal(ready.changed_files_count, 0);
  assert.equal(ready.remote_count, 1);
  assert.deepEqual(ready.blockers, []);

  assert.equal(SYNC_OBSERVATION_CONTRACT.status_policy, "bounded_git_porcelain_v1_z_with_explicit_process_truth");
  assert.equal(SYNC_OBSERVATION_CONTRACT.raw_output_exposed, false);
  assert.equal(SYNC_OBSERVATION_CONTRACT.writes_allowed, false);
});

test("git HEAD observation is bounded and accepts only a validated commit hash", () => {
  const commit = "a".repeat(40);
  const valid = inspectGitHead({
    headObservation: { status: 0, stdout: `${commit}\n`, stderr: "", error: null, signal: null }
  });
  assert.equal(valid.status, "safe_to_execute");
  assert.equal(valid.scan_complete, true);
  assert.equal(valid.commit_available, true);
  assert.equal(valid.commit_sha, commit);
  assert.equal(valid.raw_output_exposed, false);

  const invalid = inspectGitHead({
    headObservation: {
      status: 0,
      stdout: "must-never-be-returned",
      stderr: "secret=must-never-be-returned",
      error: null,
      signal: null
    }
  });
  assert.equal(invalid.status, "manual_verification_required");
  assert.equal(invalid.scan_complete, false);
  assert.equal(invalid.commit_sha, null);
  assert.deepEqual(invalid.blockers, ["git_head_output_invalid"]);
  assert.doesNotMatch(JSON.stringify(invalid), /must-never-be-returned/);

  const overflow = inspectGitHead({
    headObservation: {
      status: null,
      stdout: "b".repeat(512),
      stderr: "",
      error: { code: "ENOBUFS" },
      signal: "SIGTERM"
    }
  });
  assert.equal(overflow.status, "manual_verification_required");
  assert.deepEqual(overflow.blockers, ["git_head_output_limit_exceeded"]);
  assert.equal(overflow.commit_sha, null);

  const rollback = inspectRollbackReadiness({
    headObservation: { status: 0, stdout: `${commit}\n`, stderr: "", error: null, signal: null },
    statusObservation: { status: 0, stdout: "", stderr: "", error: null, signal: null }
  });
  assert.equal(rollback.status, "safe_to_execute");
  assert.equal(rollback.baseline_commit_available, true);
  assert.equal(rollback.baseline_commit, commit);
  assert.equal(rollback.raw_output_exposed, false);
  assert.equal(Object.hasOwn(rollback, "stdout"), false);
  assert.equal(Object.hasOwn(rollback, "stderr"), false);

  assert.equal(SYNC_OBSERVATION_CONTRACT.head_policy, "bounded_git_rev_parse_head_with_validated_hash");
  assert.equal(SYNC_OBSERVATION_CONTRACT.max_head_output_bytes, 256);
});

test("memory registry scans are bounded and never expose invalid raw lines", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-scan-"));
  const registryDir = path.join(tempRoot, ".pala", "memory");
  const registryPath = path.join(registryDir, "mistake-registry.jsonl");
  fs.mkdirSync(registryDir, { recursive: true });
  const validRecords = [
    { id: "one", status: "template", summary: "Template" },
    { id: "two", status: "captured", summary: "Captured" },
    { id: "three", status: "captured", summary: "Another" }
  ];
  fs.writeFileSync(registryPath, `${validRecords.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");

  const truncated = inspectMemoryRegistry({ projectRoot: tempRoot, maxLines: 2 });
  assert.equal(truncated.status, "manual_verification_required");
  assert.equal(truncated.scan_complete, false);
  assert.equal(truncated.record_count_exact, false);
  assert.equal(truncated.blockers.includes("memory_registry_line_scan_truncated"), true);

  const boundedOutput = inspectMemoryRegistry({ projectRoot: tempRoot, maxReturnedRecords: 1 });
  assert.equal(boundedOutput.status, "safe_to_execute");
  assert.equal(boundedOutput.scan_complete, true);
  assert.equal(boundedOutput.record_count, 3);
  assert.equal(boundedOutput.record_count_exact, true);
  assert.equal(boundedOutput.records.length, 1);
  assert.equal(boundedOutput.records_truncated, true);

  const sensitiveInvalidLine = "not-json secret=must-never-be-returned";
  fs.writeFileSync(registryPath, `${JSON.stringify(validRecords[0])}\n${sensitiveInvalidLine}\n`, "utf8");
  const invalid = inspectMemoryRegistry({ projectRoot: tempRoot });
  assert.equal(invalid.status, "manual_verification_required");
  assert.equal(invalid.scan_complete, true);
  assert.equal(invalid.finding_count, 1);
  assert.equal(invalid.invalid_line_count, 1);
  assert.doesNotMatch(JSON.stringify(invalid), /must-never-be-returned/);

  const oversized = inspectMemoryRegistry({ projectRoot: tempRoot, maxFileBytes: 16 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.scan_complete, false);
  assert.deepEqual(oversized.blockers, ["memory_registry_file_exceeds_byte_limit"]);
  assert.equal(oversized.target_read_performed, false);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-linked-"));
  const linkedPalaDir = path.join(linkedRoot, ".pala");
  const emptyOutsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-empty-outside-"));
  fs.mkdirSync(linkedPalaDir);
  fs.symlinkSync(emptyOutsideRoot, path.join(linkedPalaDir, "memory"), process.platform === "win32" ? "junction" : "dir");
  const missingBelowLinkedParent = inspectMemoryRegistry({ projectRoot: linkedRoot });
  assert.equal(missingBelowLinkedParent.status, "manual_verification_required");
  assert.equal(missingBelowLinkedParent.blockers.includes("memory_registry_not_realpath_contained_regular_file"), true);
  assert.equal(missingBelowLinkedParent.target_exists, false);
  assert.equal(missingBelowLinkedParent.target_read_performed, false);

  const promotion = promoteRuleDryRun({ projectRoot: tempRoot });
  assert.equal(promotion.status, "manual_verification_required");
  assert.equal(promotion.writes_performed, false);
  assert.deepEqual(promotion.proposed_rules, []);
  assert.equal(promotion.blockers.includes("memory_registry_not_safe_for_promotion"), true);

  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.policy, "bounded_single_handle_jsonl_without_invalid_raw_line_exposure");
  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.path_metadata_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.invalid_raw_line_exposed, false);
  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.writes_allowed, false);
});

test("memory registry scan reports close failures without throwing or returning records", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-close-failure-"));
  const registryDir = path.join(projectRoot, ".pala", "memory");
  const registryPath = path.join(registryDir, "mistake-registry.jsonl");
  fs.mkdirSync(registryDir, { recursive: true });
  fs.writeFileSync(registryPath, `${JSON.stringify({ id: "private", summary: "must-not-escape", status: "captured" })}\n`, "utf8");

  const originalCloseSync = fs.closeSync;
  let closeFailureInjected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      const error = new Error("injected memory registry close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    assert.doesNotThrow(() => {
      result = inspectMemoryRegistry({ projectRoot });
    });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureInjected, true);
  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.close_failure_blocker, "memory_registry_file_close_failed");
  assert.equal(MEMORY_REGISTRY_SCAN_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["memory_registry_file_close_failed"]);
  assert.equal(result.scan_complete, false);
  assert.deepEqual(result.records, []);
  assert.equal(result.record_count, null);
  assert.equal(result.target_read_performed, true);
  assert.equal(result.single_file_handle_used, true);
  assert.equal(result.invalid_raw_line_exposed, false);
  assert.equal(JSON.stringify(result).includes("must-not-escape"), false);
  assert.equal(result.writes_performed, false);
});

test("memory registry appends are bounded, contained, and create-or-append safe", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-append-"));
  const registryPath = appendMemoryRegistryRecord({
    id: "mistake-1",
    summary: "token=must-never-be-returned",
    status: "captured"
  }, { projectRoot });
  assert.equal(registryPath, ".pala/memory/mistake-registry.jsonl");
  appendMemoryRegistryRecord({
    id: "mistake-2",
    summary: "second",
    status: "captured"
  }, { projectRoot });
  const lines = fs.readFileSync(path.join(projectRoot, registryPath), "utf8").trim().split(/\r?\n/);
  assert.equal(lines.length, 2);
  assert.doesNotMatch(lines[0], /must-never-be-returned/);
  assert.equal(JSON.parse(lines[0]).id, "mistake-1");
  assert.equal(JSON.parse(lines[1]).id, "mistake-2");

  const originalWriteSync = fs.writeSync;
  fs.writeSync = () => 0;
  try {
    assert.throws(
      () => appendMemoryRegistryRecord({ id: "short-write", status: "captured" }, { projectRoot }),
      /memory_registry_append_blocked:short_write/
    );
  } finally {
    fs.writeSync = originalWriteSync;
  }
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock")), false);

  assert.throws(
    () => appendMemoryRegistryRecord({ summary: "x".repeat(MEMORY_REGISTRY_APPEND_CONTRACT.max_record_bytes + 1) }, { projectRoot }),
    /memory_registry_append_blocked:record_exceeds_byte_limit/
  );

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-append-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-append-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "memory"), process.platform === "win32" ? "junction" : "dir");
  assert.throws(
    () => appendMemoryRegistryRecord({ id: "must-not-write" }, { projectRoot: linkedRoot }),
    /kernel_bootstrap_blocked|memory_registry_append_blocked/
  );
  assert.deepEqual(fs.readdirSync(outsideRoot), []);

  const blockedLockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-append-lock-blocked-"));
  ensureKernel({ projectRoot: blockedLockRoot });
  fs.mkdirSync(path.join(blockedLockRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock"));
  assert.throws(
    () => appendMemoryRegistryRecord({ id: "must-not-write" }, { projectRoot: blockedLockRoot }),
    /memory_registry_append_blocked:write_lock_path_not_safe/
  );
  assert.equal(fs.existsSync(path.join(blockedLockRoot, ".pala", "memory", "mistake-registry.jsonl")), false);

  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.policy, "fixed_project_contained_create_or_single_handle_memory_registry_append");
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.max_record_bytes, 1_000_000);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.max_registry_bytes, MEMORY_REGISTRY_SCAN_CONTRACT.max_file_bytes);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.concurrent_write_policy, "bounded_fixed_create_only_lock_serialized_create_or_append");
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts, 100);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.stale_write_lock_reclamation_allowed, false);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.atomic_create_link, true);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.first_create_temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match");
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.first_create_identity_safe_temp_cleanup, true);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.first_create_post_publish_identity_policy, "temporary_and_registry_dev_ino_match");
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(fs.readFileSync(path.join(process.cwd(), "src", "lib", "memory.ts"), "utf8").includes("appendFileSync"), false);
});

test("memory registry existing append reports file close failure instead of claiming success", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-append-close-failure-"));
  appendMemoryRegistryRecord({ id: "existing", status: "captured" }, { projectRoot });
  const originalOpenSync = fs.openSync;
  const originalCloseSync = fs.closeSync;
  let registryFileDescriptor;
  fs.openSync = (filePath, flags, ...args) => {
    const fileDescriptor = originalOpenSync(filePath, flags, ...args);
    if (path.basename(String(filePath)) === "mistake-registry.jsonl" && (flags & fs.constants.O_APPEND) !== 0) {
      registryFileDescriptor = fileDescriptor;
    }
    return fileDescriptor;
  };
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (fileDescriptor === registryFileDescriptor) {
      registryFileDescriptor = undefined;
      throw new Error("injected memory registry append file close failure");
    }
  };
  let error;
  try {
    error = assert.throws(
      () => appendMemoryRegistryRecord({
        id: "close-failure",
        summary: "must-never-be-returned",
        status: "captured"
      }, { projectRoot }),
      /memory_registry_append_blocked:file_close_failed/
    );
  } finally {
    fs.openSync = originalOpenSync;
    fs.closeSync = originalCloseSync;
  }

  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.close_failure_error, "memory_registry_append_blocked:file_close_failed");
  assert.doesNotMatch(String(error), /must-never-be-returned/);
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock")), false);
});

test("memory registry first create rejects a same-size target replacement", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-create-replace-"));
  const registryPath = path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl");
  const originalLinkSync = fs.linkSync;
  let replacementInjected = false;
  fs.linkSync = (...args) => {
    originalLinkSync(...args);
    if (path.resolve(String(args[1])) !== path.resolve(registryPath)) return;
    const publishedBytes = fs.statSync(String(args[0])).size;
    fs.unlinkSync(registryPath);
    fs.writeFileSync(registryPath, "x".repeat(publishedBytes), "utf8");
    replacementInjected = true;
  };
  try {
    assert.throws(
      () => appendMemoryRegistryRecord({ id: "identity-race", status: "captured" }, { projectRoot }),
      /memory_registry_append_blocked:post_create_verification_failed/
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.equal(replacementInjected, true);
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock")), false);
  assert.equal(fs.readdirSync(path.dirname(registryPath)).some((entry) => entry.endsWith(".tmp")), false);
});

test("memory registry first create rejects a same-size changed source and preserves the changed temp path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-create-source-replace-"));
  const registryPath = path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl");
  const originalLinkSync = fs.linkSync;
  let replacementTempPath = null;
  fs.linkSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.resolve(String(args[1])) === path.resolve(registryPath)) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
    }
    originalLinkSync(...args);
  };
  try {
    assert.throws(
      () => appendMemoryRegistryRecord({ id: "source-identity-race", status: "captured" }, { projectRoot }),
      /memory_registry_append_blocked:post_create_verification_failed/
    );
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(fs.existsSync(replacementTempPath), true);
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock")), false);
});

test("concurrent memory registry create-or-append preserves every bounded record", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-append-concurrent-"));
  const barrierPath = path.join(projectRoot, ".memory-append-start");
  const pending = Array.from({ length: 12 }, (_, index) => runMemoryRegistryAppendProcess(projectRoot, barrierPath, index));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const results = await Promise.all(pending);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, ".pala/memory/mistake-registry.jsonl");
  }

  const inspection = inspectMemoryRegistry({ projectRoot });
  assert.equal(inspection.status, "safe_to_execute", JSON.stringify(inspection.blockers));
  assert.equal(inspection.record_count, 12);
  assert.equal(inspection.record_count_exact, true);
  assert.deepEqual(
    inspection.records.map((record) => record.id).sort(),
    Array.from({ length: 12 }, (_, index) => `writer-${index}`).sort()
  );
  const memoryDir = path.join(projectRoot, ".pala", "memory");
  assert.equal(fs.readdirSync(memoryDir).some((entry) => entry.endsWith(".tmp") || entry.endsWith(".write-lock")), false);
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.concurrent_write_policy, "bounded_fixed_create_only_lock_serialized_create_or_append");
});

test("memory registry write lock tolerates bounded disappearance and safe successor races", () => {
  const disappearingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-lock-disappearing-"));
  bootstrapKernel({ projectRoot: disappearingRoot });
  const disappearingLock = path.join(disappearingRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock");
  fs.writeFileSync(disappearingLock, "holder", "utf8");

  const originalRealpathSync = fs.realpathSync;
  let disappearanceInjected = false;
  fs.realpathSync = (...args) => {
    if (path.resolve(String(args[0])) === path.resolve(disappearingLock) && !disappearanceInjected) {
      fs.unlinkSync(disappearingLock);
      disappearanceInjected = true;
      const error = new Error("injected lock disappearance");
      error.code = "ENOENT";
      throw error;
    }
    return originalRealpathSync(...args);
  };
  try {
    assert.doesNotThrow(() => appendMemoryRegistryRecord(
      { id: "after-disappearance", status: "captured" },
      { projectRoot: disappearingRoot }
    ));
  } finally {
    fs.realpathSync = originalRealpathSync;
  }
  assert.equal(disappearanceInjected, true);
  assert.equal(fs.existsSync(disappearingLock), false);

  const successorRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-memory-lock-successor-"));
  bootstrapKernel({ projectRoot: successorRoot });
  const successorLock = path.join(successorRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock");
  const originalUnlinkSync = fs.unlinkSync;
  let successorInjected = false;
  fs.unlinkSync = (...args) => {
    originalUnlinkSync(...args);
    if (path.resolve(String(args[0])) === path.resolve(successorLock) && !successorInjected) {
      fs.writeFileSync(successorLock, "successor", "utf8");
      successorInjected = true;
    }
  };
  try {
    assert.doesNotThrow(() => appendMemoryRegistryRecord(
      { id: "before-successor", status: "captured" },
      { projectRoot: successorRoot }
    ));
  } finally {
    fs.unlinkSync = originalUnlinkSync;
  }
  assert.equal(successorInjected, true);
  assert.equal(fs.existsSync(successorLock), true);
  fs.unlinkSync(successorLock);

  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.transient_lock_observation_policy, "bounded_retry_on_existing_lock_inspection_race");
  assert.equal(MEMORY_REGISTRY_APPEND_CONTRACT.post_release_success_policy, "released_identity_absent_or_safe_successor");
});

test("CLAUDE sync dry-run uses bounded project-contained text truth", () => {
  const safeRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-claude-sync-safe-"));
  fs.writeFileSync(path.join(safeRoot, "CLAUDE.md"), "Pala OS is not a coding agent.\nsecret=must-never-be-returned\n", "utf8");
  const safe = claudeSyncDryRun({ projectRoot: safeRoot });
  assert.equal(safe.status, "dry_run_only");
  assert.equal(safe.inspection.status, "safe_to_execute");
  assert.equal(safe.inspection.single_file_handle_used, true);
  assert.equal(safe.inspection.payload_exposed, false);
  assert.equal(safe.proposal_blocked, false);
  assert.doesNotMatch(JSON.stringify(safe), /must-never-be-returned/);

  const oversized = claudeSyncDryRun({ projectRoot: safeRoot, maxFileBytes: 32 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.equal(oversized.inspection.target_read_performed, false);
  assert.equal(oversized.proposal_blocked, true);
  assert.deepEqual(oversized.missing_lines, []);
  assert.equal(oversized.proposed_diff, "");
  assert.doesNotMatch(JSON.stringify(oversized), /must-never-be-returned/);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-claude-sync-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-claude-sync-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, "CLAUDE.md"), process.platform === "win32" ? "junction" : "dir");
  const linked = claudeSyncDryRun({ projectRoot: linkedRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.blockers.includes("repo_text_file_not_realpath_contained_regular_file"), true);
  assert.equal(linked.proposal_blocked, true);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);

  assert.equal(CLAUDE_SYNC_INSPECTION_CONTRACT.policy, "bounded_project_contained_single_handle_claude_md_dry_run");
  assert.equal(CLAUDE_SYNC_INSPECTION_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(CLAUDE_SYNC_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(CLAUDE_SYNC_INSPECTION_CONTRACT.writes_allowed, false);
});

test("architecture layers use bounded contained path metadata instead of existence-only truth", () => {
  assert.equal(REPO_PATH_INSPECTION_CONTRACT.policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(REPO_PATH_INSPECTION_CONTRACT.missing_path_ancestor_check, true);
  assert.equal(REPO_PATH_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(REPO_PATH_INSPECTION_CONTRACT.writes_allowed, false);
  assert.equal(ARCHITECTURE_PATH_INSPECTION_CONTRACT.policy, "bounded_fixed_architecture_path_metadata_scan");
  assert.equal(ARCHITECTURE_PATH_INSPECTION_CONTRACT.required_path_count, 7);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-architecture-root-"));
  for (const directory of [
    "src",
    ".pala/schema",
    ".pala/rules",
    ".pala/state",
    ".pala/ledger",
    ".pala/evidence",
    "control/overview",
    "tests",
    "docs"
  ]) {
    fs.mkdirSync(path.join(projectRoot, directory), { recursive: true });
  }
  for (const file of [
    "src/cli.ts",
    ".pala/schema/001_init.sql",
    ".pala/rules/core-rules.md",
    ".pala/state/project-state.json",
    ".pala/ledger/events.jsonl",
    "control/overview/index.html",
    "tests/example.test.ts"
  ]) {
    fs.writeFileSync(path.join(projectRoot, file), "artifact\n", "utf8");
  }
  fs.writeFileSync(path.join(projectRoot, "docs", "ARCHITECTURE.md"), "Frontend reads truth. It does not create truth.\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, "package.json"), "{\"scripts\":{\"pala\":\"./src/cli.ts\"}}\n", "utf8");

  const safe = inspectArchitecture({ projectRoot });
  assert.equal(safe.status, "safe_to_execute");
  assert.equal(safe.path_inspections.length, 7);
  assert.equal(safe.path_inspections.every((item) => item.payload_exposed === false), true);

  fs.unlinkSync(path.join(projectRoot, ".pala", "rules", "core-rules.md"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-architecture-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, ".pala", "rules", "core-rules.md"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectArchitecture({ projectRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.scan_complete, false);
  assert.equal(linked.blockers.includes("repo_path_not_realpath_contained_symlink_free"), true);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("repo path presence never treats unsafe metadata as present", () => {
  assert.equal(REPO_PATH_PRESENCE_CONTRACT.policy, "repo_path_presence_from_contained_metadata_only");
  assert.equal(REPO_PATH_PRESENCE_CONTRACT.path_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(REPO_PATH_PRESENCE_CONTRACT.payload_exposed, false);
  assert.equal(REPO_PATH_PRESENCE_CONTRACT.writes_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-path-presence-"));
  fs.writeFileSync(path.join(projectRoot, "safe.txt"), "artifact\n", "utf8");
  const safe = inspectRepoPathPresence("safe.txt", { projectRoot, expectedKind: "file" });
  assert.equal(safe.status, "safe_to_execute");
  assert.equal(safe.present, true);
  assert.equal(safe.payload_exposed, false);

  const missing = inspectRepoPathPresence("missing.txt", { projectRoot, expectedKind: "file" });
  assert.equal(missing.status, "safe_to_execute");
  assert.equal(missing.present, false);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-path-presence-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "linked.txt"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectRepoPathPresence("linked.txt", { projectRoot, expectedKind: "file" });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.present, false);
  assert.equal(linked.blocker, "repo_path_not_realpath_contained_symlink_free");
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);

  fs.symlinkSync(outsideRoot, path.join(projectRoot, "linked-parent"), process.platform === "win32" ? "junction" : "dir");
  const missingBelowLinkedParent = inspectRepoPathPresence("linked-parent/missing.txt", { projectRoot, expectedKind: "file" });
  assert.equal(missingBelowLinkedParent.status, "manual_verification_required");
  assert.equal(missingBelowLinkedParent.present, false);
  assert.equal(missingBelowLinkedParent.blocker, "repo_path_not_realpath_contained_symlink_free");
});

test("repo quality scans are bounded, exactness-aware, and never fake PASS on unread content", () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-repo-scan-"));
  fs.mkdirSync(path.join(tempRoot, "src"), { recursive: true });
  fs.mkdirSync(path.join(tempRoot, "docs"), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, "src", "a.ts"), "export const a = 'same duplicate payload long enough to inspect';\n", "utf8");
  fs.writeFileSync(path.join(tempRoot, "src", "b.ts"), "export const b = 'different payload long enough to inspect';\n", "utf8");
  fs.writeFileSync(path.join(tempRoot, "docs", "path.md"), "C:\\Users\\private-user\\secret.txt\n", "utf8");

  const truncated = inspectRepoInventory({ projectRoot: tempRoot, maxScanEntries: 2 });
  assert.equal(truncated.status, "manual_verification_required");
  assert.equal(truncated.scan_complete, false);
  assert.equal(truncated.scan_truncated, true);
  assert.equal(truncated.scanned_entry_count <= 2, true);
  assert.equal(truncated.files.length <= 2, true);
  assert.equal(truncated.blockers.includes("repo_scan_entry_limit_reached"), true);

  const duplicateScan = inspectDuplicates({ projectRoot: tempRoot, maxScanEntries: 2 });
  assert.equal(duplicateScan.status, "manual_verification_required");
  assert.equal(duplicateScan.scan_complete, false);
  assert.equal(duplicateScan.blockers.includes("repo_scan_entry_limit_reached"), true);

  const oversized = inspectDuplicates({ projectRoot: tempRoot, maxTextFileBytes: 16 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.scan_complete, false);
  assert.equal(oversized.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.equal(Object.hasOwn(oversized, "text"), false);

  const aggregateLimited = inspectDuplicates({
    projectRoot: tempRoot,
    maxTextFileBytes: 100,
    maxTotalTextBytes: 40
  });
  assert.equal(aggregateLimited.status, "manual_verification_required");
  assert.equal(aggregateLimited.scan_complete, false);
  assert.equal(aggregateLimited.blockers.includes("repo_text_total_byte_limit_reached"), true);
  assert.equal(aggregateLimited.total_text_bytes_read <= 40, true);
  assert.equal(aggregateLimited.text_read_budget_complete, false);

  const hardcoded = inspectHardcodedPaths({ projectRoot: tempRoot });
  assert.equal(hardcoded.status, "manual_verification_required");
  assert.equal(hardcoded.scan_complete, true);
  assert.equal(hardcoded.finding_count, 1);
  assert.equal(hardcoded.findings[0].file, "docs/path.md");

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-repo-scan-linked-"));
  const emptyOutsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-repo-scan-empty-outside-"));
  fs.symlinkSync(emptyOutsideRoot, path.join(linkedRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
  const missingBelowLinkedRoot = inspectRepoInventory({
    projectRoot: linkedRoot,
    startDir: path.join(linkedRoot, "linked", "missing")
  });
  assert.equal(missingBelowLinkedRoot.status, "manual_verification_required");
  assert.equal(missingBelowLinkedRoot.scan_complete, false);
  assert.equal(missingBelowLinkedRoot.blockers.includes("repo_scan_root_not_realpath_contained_regular_directory"), true);
  assert.equal(missingBelowLinkedRoot.root_inspection.status, "manual_verification_required");
  assert.equal(missingBelowLinkedRoot.root_inspection.payload_exposed, false);

  assert.equal(REPO_SCAN_CONTRACT.policy, "bounded_realpath_contained_inventory_with_single_handle_text_reads");
  assert.equal(REPO_SCAN_CONTRACT.path_metadata_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(REPO_SCAN_CONTRACT.missing_path_ancestor_check, true);
  assert.equal(REPO_SCAN_CONTRACT.max_total_text_bytes, 20_000_000);
  assert.equal(REPO_SCAN_CONTRACT.post_read_path_recheck, true);
  assert.equal(REPO_SCAN_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(REPO_SCAN_CONTRACT.directory_close_failure_blocker, "repo_directory_close_failed");
  assert.equal(REPO_SCAN_CONTRACT.payload_exposed, false);
  assert.equal(REPO_SCAN_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(REPO_SCAN_CONTRACT.writes_allowed, false);
});

test("repo inventory reports directory close failures without throwing or accepting entries", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-repo-directory-close-failure-"));
  fs.writeFileSync(path.join(projectRoot, "must-not-be-accepted.txt"), "bounded content", "utf8");
  const originalCloseSync = fs.Dir.prototype.closeSync;
  let injected = false;
  fs.Dir.prototype.closeSync = function closeSyncWithInjectedFailure() {
    originalCloseSync.call(this);
    if (!injected) {
      injected = true;
      const error = new Error("injected repo directory close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let inspected;
  try {
    inspected = inspectRepoInventory({ projectRoot });
  } finally {
    fs.Dir.prototype.closeSync = originalCloseSync;
  }

  assert.equal(injected, true);
  assert.equal(inspected.status, "manual_verification_required");
  assert.equal(inspected.scan_complete, false);
  assert.equal(inspected.blockers.includes("repo_directory_close_failed"), true);
  assert.equal(inspected.scanned_entry_count, 0);
  assert.deepEqual(inspected.files, []);
});

test("repo text reader reports close failures without throwing", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-repo-close-failure-"));
  fs.writeFileSync(path.join(projectRoot, "safe.txt"), "bounded content", "utf8");
  const reader = createBoundedRepoTextReader({ projectRoot });
  const originalCloseSync = fs.closeSync;
  let injected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!injected) {
      injected = true;
      const error = new Error("injected close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let inspected;
  try {
    inspected = reader.read("safe.txt");
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(injected, true);
  assert.equal(inspected.status, "manual_verification_required");
  assert.equal(inspected.blocker, "repo_text_file_close_failed");
  assert.equal(inspected.payload_exposed_on_failure, false);
  assert.equal(Object.hasOwn(inspected, "text"), false);
  const summary = reader.summary();
  assert.equal(summary.text_read_blockers.includes("repo_text_file_close_failed"), true);
  assert.equal(summary.text_read_budget_complete, true);
});

test("quality required artifacts use contained payload-free path metadata", () => {
  assert.equal(QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.policy, "bounded_fixed_quality_required_artifact_path_metadata_scan");
  assert.equal(QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.required_path_count, 4);
  assert.equal(QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.writes_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-quality-artifacts-"));
  for (const file of [
    "docs/evidence/current-sources.md",
    "docs/evidence/v28-web-research.md",
    "control/overview/index.html",
    "tests/pala.test.ts"
  ]) {
    const fullPath = path.join(projectRoot, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, "artifact\n", "utf8");
  }
  const safe = inspectQualityRequiredArtifacts({ projectRoot });
  assert.equal(safe.status, "safe_to_execute");
  assert.equal(safe.scan_complete, true);
  assert.equal(safe.inspections.length, 4);
  assert.equal(safe.inspections.every((item) => item.payload_exposed === false), true);
  assert.deepEqual(safe.missing, []);
  assert.deepEqual(safe.unsafe, []);

  fs.unlinkSync(path.join(projectRoot, "docs", "evidence", "current-sources.md"));
  const missing = inspectQualityRequiredArtifacts({ projectRoot });
  assert.equal(missing.status, "manual_verification_required");
  assert.equal(missing.scan_complete, true);
  assert.deepEqual(missing.missing, ["docs/evidence/current-sources.md"]);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-quality-artifacts-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "docs", "evidence", "current-sources.md"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectQualityRequiredArtifacts({ projectRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.scan_complete, false);
  assert.equal(linked.unsafe.includes("docs/evidence/current-sources.md"), true);
  assert.equal(linked.blockers.includes("repo_path_not_realpath_contained_symlink_free"), true);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);

  const radar = inspectQualityRadar({ projectRoot });
  assert.equal(radar.required_artifacts.status, "manual_verification_required");
  assert.equal(radar.required_artifacts.payload_exposed, false);
  assert.equal(radar.findings.some((finding) => finding.file === "docs/evidence/current-sources.md"), true);
});

test("operational inspections remain read-only and honest", () => {
  const admin = inspectAdmin();
  assert.equal(admin.status, "safe_to_execute");
  assert.equal(["standard", "elevated"].includes(admin.privilege), true);
  assert.equal(admin.elevation_requested, false);
  assert.equal(admin.writes_performed, false);
  assert.equal(inspectLanguagePolicy().status, "safe_to_execute");
  assert.equal(inspectI18n().locale_sync_performed, false);
  assert.equal(inspectN8n().workflow_activated, false);
  const worker = inspectWorker();
  assert.equal(worker.status, "safe_to_execute");
  assert.deepEqual(worker.blockers, []);
  assert.equal(worker.configured, true);
  assert.equal(worker.entrypoint_inspection.status, "safe_to_execute");
  assert.equal(worker.entrypoint_inspection.payload_exposed, false);
  assert.deepEqual(worker.worker_files, ["src/worker.ts"]);
  assert.equal(worker.smoke_check.policy, "single_bounded_local_read_only_smoke_process");
  assert.equal(worker.smoke_check.performed, true);
  assert.equal(worker.smoke_check.process_started, true);
  assert.equal(worker.smoke_check.completed, true);
  assert.equal(worker.smoke_check.timed_out, false);
  assert.equal(worker.smoke_check.exit_code, 0);
  assert.equal(worker.smoke_check.output_parsed, true);
  assert.equal(worker.smoke_check.contract_valid, true);
  assert.equal(worker.smoke_check.reported_status, "safe_to_execute");
  assert.equal(worker.worker_started, false);
  assert.equal(worker.workload_started, false);
  assert.equal(worker.external_call_performed, false);
  assert.equal(worker.writes_performed, false);
  assert.equal(worker.destructive_action_performed, false);
  assert.equal(inspectRollbackReadiness().rollback_performed, false);
  assert.equal(inspectRefactorReadiness().refactor_performed, false);
  assert.equal(inspectSurprises().finding_count, 0);
  assert.equal(inspectSmartSuggestions().writes_performed, false);
  assert.equal(inspectExternalSkillsDryRun().install_performed, false);
  assert.equal(inspectOpportunityRadar().external_fetch_performed, false);
});

test("smart suggestions and opportunity radar require complete bounded local source truth", () => {
  assert.equal(SMART_SUGGESTION_INSPECTION_CONTRACT.policy, "bounded_local_advisory_from_explicit_source_truth");
  assert.equal(SMART_SUGGESTION_INSPECTION_CONTRACT.source_count, 7);
  assert.equal(SMART_SUGGESTION_INSPECTION_CONTRACT.max_suggestions, 7);
  assert.equal(SMART_SUGGESTION_INSPECTION_CONTRACT.incomplete_source_policy, "manual_verification_required");
  assert.equal(SMART_SUGGESTION_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(SMART_SUGGESTION_INSPECTION_CONTRACT.writes_allowed, false);
  assert.equal(OPPORTUNITY_RADAR_INSPECTION_CONTRACT.policy, "bounded_local_opportunities_from_smart_suggestion_truth");
  assert.equal(OPPORTUNITY_RADAR_INSPECTION_CONTRACT.external_fetch_allowed, false);

  const current = inspectSmartSuggestions();
  assert.equal(current.status, "safe_to_execute");
  assert.equal(current.scan_complete, true);
  assert.deepEqual(current.incomplete_sources, []);
  assert.equal(current.suggestions.length <= SMART_SUGGESTION_INSPECTION_CONTRACT.max_suggestions, true);
  assert.equal(current.payload_exposed, false);
  assert.equal(current.external_fetch_performed, false);
  assert.equal(current.writes_performed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-smart-suggestions-"));
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  const skillDir = path.join(projectRoot, ".claude", "skills", "ready-skill");
  fs.mkdirSync(skillDir, { recursive: true });
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), [
    "---",
    "description: Use for bounded local verification.",
    "---",
    "",
    "# Ready Skill",
    "",
    "Inspect local evidence, report blockers, and preserve the no-write boundary."
  ].join("\n"), "utf8");
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-smart-suggestions-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.md"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "docs", "recipes"), process.platform === "win32" ? "junction" : "dir");
  const options = {
    projectRoot,
    headObservation: { status: 0, stdout: `${"a".repeat(40)}\n`, stderr: "", error: null, signal: null },
    statusObservation: { status: 0, stdout: "", stderr: "", error: null, signal: null }
  };

  const incomplete = inspectSmartSuggestions(options);
  assert.equal(incomplete.status, "manual_verification_required");
  assert.equal(incomplete.scan_complete, false);
  assert.deepEqual(incomplete.incomplete_sources, ["tests", "playbooks"]);
  assert.deepEqual(incomplete.blockers, [
    "smart_suggestion_source_incomplete:tests",
    "smart_suggestion_source_incomplete:playbooks"
  ]);
  assert.equal(incomplete.source_statuses.playbooks.scan_complete, false);
  assert.equal(incomplete.suggestions.some((suggestion) => suggestion.area === "playbooks"), true);
  assert.doesNotMatch(JSON.stringify(incomplete), /must-never-be-returned/);

  const opportunity = inspectOpportunityRadar(options);
  assert.equal(opportunity.status, "manual_verification_required");
  assert.equal(opportunity.scan_complete, false);
  assert.deepEqual(opportunity.blockers, [
    "smart_suggestion_source_incomplete:tests",
    "smart_suggestion_source_incomplete:playbooks"
  ]);
  assert.equal(opportunity.external_fetch_performed, false);
  assert.equal(opportunity.writes_performed, false);
  assert.doesNotMatch(JSON.stringify(opportunity), /must-never-be-returned/);

  const proposal = buildExternalSkillProposal("", options);
  assert.equal(proposal.status, "manual_verification_required");
  assert.equal(proposal.local_readiness_status, "safe_to_execute");
  assert.equal(proposal.suggestion_source_status, "manual_verification_required");
  assert.equal(proposal.blockers.includes("local_skill_readiness_unconfirmed"), false);
  assert.equal(proposal.blockers.includes("smart_suggestion_source_truth_incomplete"), true);
  assert.equal(proposal.blockers.includes("smart_suggestion_source_incomplete:playbooks"), true);
  assert.doesNotMatch(JSON.stringify(proposal), /must-never-be-returned/);
});

test("i18n artifacts use contained payload-free path metadata", () => {
  assert.equal(I18N_ARTIFACT_INSPECTION_CONTRACT.policy, "bounded_fixed_i18n_artifact_path_metadata_scan");
  assert.equal(I18N_ARTIFACT_INSPECTION_CONTRACT.required_path_count, 2);
  assert.equal(I18N_ARTIFACT_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(I18N_ARTIFACT_INSPECTION_CONTRACT.writes_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-i18n-root-"));
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Pala OS\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, "README-KULLANIM.md"), "# Kullanim\n", "utf8");
  const safe = inspectI18n({ projectRoot });
  assert.equal(safe.status, "safe_to_execute");
  assert.equal(safe.artifact_inspections.length, 2);
  assert.equal(safe.artifact_inspections.every((item) => item.payload_exposed === false), true);

  fs.unlinkSync(path.join(projectRoot, "README-KULLANIM.md"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-i18n-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "README-KULLANIM.md"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectI18n({ projectRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.scan_complete, false);
  assert.equal(linked.blockers.includes("repo_path_not_realpath_contained_symlink_free"), true);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("admin inspection detects Windows and POSIX privilege without requesting elevation or exposing probe output", () => {
  const windowsStandard = inspectAdmin({
    platform: "win32",
    windowsObservation: { status: 0, stdout: "standard\n", stderr: "", error: null }
  });
  assert.equal(windowsStandard.status, "safe_to_execute");
  assert.equal(windowsStandard.privilege, "standard");
  assert.equal(windowsStandard.detection.policy, "windows_principal_administrator_role_read_only");
  assert.equal(windowsStandard.detection.performed, true);
  assert.equal(windowsStandard.detection.process_started, true);
  assert.equal(windowsStandard.detection.output_valid, true);
  assert.equal(Object.hasOwn(windowsStandard.detection, "stdout"), false);
  assert.equal(Object.hasOwn(windowsStandard.detection, "stderr"), false);

  const windowsElevated = inspectAdmin({
    platform: "win32",
    windowsObservation: { status: 0, stdout: "elevated\n", stderr: "", error: null }
  });
  assert.equal(windowsElevated.status, "safe_to_execute");
  assert.equal(windowsElevated.privilege, "elevated");

  const invalidWindows = inspectAdmin({
    platform: "win32",
    windowsObservation: { status: 0, stdout: "maybe\n", stderr: "diagnostic", error: null }
  });
  assert.equal(invalidWindows.status, "manual_verification_required");
  assert.equal(invalidWindows.privilege, "unknown");
  assert.deepEqual(invalidWindows.blockers, ["windows_privilege_probe_invalid_output"]);
  assert.equal(invalidWindows.detection.stderr_present, true);
  assert.equal(Object.hasOwn(invalidWindows.detection, "stderr"), false);

  const posixStandard = inspectAdmin({ platform: "linux", uid: 1000 });
  assert.equal(posixStandard.status, "safe_to_execute");
  assert.equal(posixStandard.privilege, "standard");
  assert.equal(posixStandard.detection.policy, "posix_getuid");
  assert.equal(posixStandard.detection.process_started, false);
  assert.equal(posixStandard.elevation_requested, false);
  assert.equal(posixStandard.external_call_performed, false);
  assert.equal(posixStandard.writes_performed, false);
  assert.equal(posixStandard.destructive_action_performed, false);
});

test("optional n8n CLI observation is bounded and distinguishes missing from failed", () => {
  const installed = inspectN8n({
    versionObservation: {
      status: 0,
      stdout: "n8n 2.0 token=must-never-be-returned\nsecond raw line",
      stderr: "",
      error: null,
      signal: null
    }
  });
  assert.equal(installed.status, "safe_to_execute");
  assert.equal(installed.installed, true);
  assert.equal(installed.observation.output_valid, true);
  assert.match(installed.observation.summary, /token=<REDACTED>/);
  assert.equal(installed.observation.raw_output_exposed, false);
  assert.doesNotMatch(JSON.stringify(installed), /must-never-be-returned|second raw line/);

  const missing = inspectN8n({
    versionObservation: {
      status: null,
      stdout: "",
      stderr: "must-never-be-returned",
      error: { code: "ENOENT" },
      signal: null
    }
  });
  assert.equal(missing.status, "safe_to_execute");
  assert.equal(missing.installed, false);
  assert.equal(missing.observation.process_started, false);
  assert.deepEqual(missing.blockers, []);
  assert.doesNotMatch(JSON.stringify(missing), /must-never-be-returned/);

  const windowsMissing = inspectN8n({
    platform: "win32",
    discoveryObservation: {
      status: 1,
      stdout: "",
      stderr: "INFO: must-never-be-returned",
      error: null,
      signal: null
    }
  });
  assert.equal(windowsMissing.status, "safe_to_execute");
  assert.equal(windowsMissing.installed, false);
  assert.equal(windowsMissing.discovery.performed, true);
  assert.equal(windowsMissing.discovery.exit_code, 1);
  assert.equal(windowsMissing.discovery.raw_output_exposed, false);
  assert.doesNotMatch(JSON.stringify(windowsMissing), /must-never-be-returned/);

  const windowsDiscoveryTimeout = inspectN8n({
    platform: "win32",
    discoveryObservation: {
      status: null,
      stdout: "must-never-be-returned",
      stderr: "",
      error: { code: "ETIMEDOUT" },
      signal: "SIGTERM"
    }
  });
  assert.equal(windowsDiscoveryTimeout.status, "manual_verification_required");
  assert.equal(windowsDiscoveryTimeout.installed, null);
  assert.deepEqual(windowsDiscoveryTimeout.blockers, ["n8n_cli_discovery_timed_out"]);
  assert.doesNotMatch(JSON.stringify(windowsDiscoveryTimeout), /must-never-be-returned/);

  const timedOut = inspectN8n({
    versionObservation: {
      status: null,
      stdout: "must-never-be-returned",
      stderr: "",
      error: { code: "ETIMEDOUT" },
      signal: "SIGTERM"
    }
  });
  assert.equal(timedOut.status, "manual_verification_required");
  assert.equal(timedOut.installed, null);
  assert.equal(timedOut.observation.timed_out, true);
  assert.deepEqual(timedOut.blockers, ["n8n_cli_version_timed_out"]);
  assert.doesNotMatch(JSON.stringify(timedOut), /must-never-be-returned/);

  const overflow = inspectN8n({
    maxOutputBytes: 32,
    versionObservation: {
      status: null,
      stdout: "x".repeat(64),
      stderr: "",
      error: { code: "ENOBUFS" },
      signal: "SIGTERM"
    }
  });
  assert.equal(overflow.status, "manual_verification_required");
  assert.equal(overflow.installed, null);
  assert.deepEqual(overflow.blockers, ["n8n_cli_version_output_limit_exceeded"]);
  assert.doesNotMatch(JSON.stringify(overflow), /x{32}/);

  assert.equal(N8N_CLI_OBSERVATION_CONTRACT.policy, "bounded_optional_n8n_version_metadata_with_redacted_first_line");
  assert.equal(N8N_CLI_OBSERVATION_CONTRACT.windows_discovery_policy, "bounded_windows_where_n8n_cmd_presence_only");
  assert.equal(N8N_CLI_OBSERVATION_CONTRACT.timeout_ms, 5000);
  assert.equal(N8N_CLI_OBSERVATION_CONTRACT.max_output_bytes, 16_000);
  assert.equal(N8N_CLI_OBSERVATION_CONTRACT.raw_output_exposed, false);
  assert.equal(N8N_CLI_OBSERVATION_CONTRACT.writes_allowed, false);
});

test("action plans inspect real local state without executing mutations", () => {
  const plans = [
    buildWorkerRunPlan({ dryRun: true }),
    buildN8nPlan(),
    buildN8nImportPlan({ dryRun: true, target: "missing-workflow.json" }),
    buildAutopilotPlan("improve local verification"),
    buildAutopilotRunGate("improve local verification", { dryRun: true }),
    buildExternalSkillProposal(),
    buildDriftFixPlan(),
    buildArchivePlan({ olderThanDays: 1 }),
    buildLocaleSyncPlan(),
    buildRefactorPlan()
  ];
  for (const plan of plans) {
    assert.equal(plan.execution_performed, false);
    assert.equal(plan.external_call_performed, false);
    assert.equal(plan.destructive_action_performed, false);
  }
  assert.equal(plans[0].status, "dry_run_only");
  assert.deepEqual(plans[0].blockers, []);
  assert.equal(plans[0].worker.smoke_check.contract_valid, true);
  assert.equal(plans[0].worker.workload_started, false);
  assert.equal(plans[2].findings[0].summary, "Workflow target does not exist.");
  assert.equal(plans[4].autopilot_started, false);
});

test("action-plan user inputs are bounded for classification and never returned raw", () => {
  const privateGoal = "improve local verification for C:\\Users\\Private\\repo token=must-never-be-returned";
  const autopilot = buildAutopilotPlan(privateGoal);
  assert.equal(ACTION_PLAN_USER_INPUT_CONTRACT.policy, "bounded_complete_user_input_classification_with_payload_free_metadata");
  assert.equal(ACTION_PLAN_USER_INPUT_CONTRACT.max_input_bytes, 4_096);
  assert.equal(ACTION_PLAN_USER_INPUT_CONTRACT.raw_goal_exposed, false);
  assert.equal(ACTION_PLAN_USER_INPUT_CONTRACT.raw_target_exposed, false);
  assert.equal(ACTION_PLAN_USER_INPUT_CONTRACT.payload_exposed, false);
  assert.equal(ACTION_PLAN_USER_INPUT_CONTRACT.writes_allowed, false);
  assert.equal(autopilot.goal_metadata.input_present, true);
  assert.equal(autopilot.goal_metadata.input_bytes, Buffer.byteLength(privateGoal, "utf8"));
  assert.equal(autopilot.goal_metadata.input_bytes_exact, true);
  assert.equal(autopilot.goal_metadata.input_exceeds_byte_limit, false);
  assert.equal(autopilot.goal_metadata.raw_input_exposed, false);
  assert.equal(Object.hasOwn(autopilot, "goal"), false);
  assert.doesNotMatch(JSON.stringify(autopilot), /must-never-be-returned|C:\\\\Users\\\\Private/);

  const proposal = buildExternalSkillProposal(privateGoal);
  assert.equal(proposal.target_metadata.input_present, true);
  assert.equal(proposal.target_metadata.input_bytes, Buffer.byteLength(privateGoal, "utf8"));
  assert.equal(proposal.target_metadata.input_bytes_exact, true);
  assert.equal(proposal.target_metadata.raw_input_exposed, false);
  assert.equal(Object.hasOwn(proposal, "target"), false);
  assert.doesNotMatch(JSON.stringify(proposal), /must-never-be-returned|C:\\\\Users\\\\Private/);

  const oversizedGoal = buildAutopilotPlan("x".repeat(ACTION_PLAN_USER_INPUT_CONTRACT.max_input_bytes + 1));
  assert.equal(oversizedGoal.status, "manual_verification_required");
  assert.deepEqual(oversizedGoal.blockers, ["autopilot_goal_exceeds_byte_limit"]);
  assert.equal(oversizedGoal.goal_metadata.input_bytes, null);
  assert.equal(oversizedGoal.goal_metadata.input_bytes_exact, false);
  assert.equal(oversizedGoal.goal_metadata.input_exceeds_byte_limit, true);
  assert.equal(oversizedGoal.goal_metadata.raw_input_exposed, false);

  const oversizedTarget = buildExternalSkillProposal("y".repeat(ACTION_PLAN_USER_INPUT_CONTRACT.max_input_bytes + 1));
  assert.equal(oversizedTarget.status, "manual_verification_required");
  assert.equal(oversizedTarget.blockers.includes("external_skill_target_exceeds_byte_limit"), true);
  assert.equal(oversizedTarget.target_metadata.input_bytes_exact, false);
  assert.equal(oversizedTarget.target_metadata.input_exceeds_byte_limit, true);
  assert.equal(oversizedTarget.target_metadata.raw_input_exposed, false);
});

test("drift-fix and locale-sync plans require complete source truth", () => {
  assert.equal(PLAN_SOURCE_TRUTH_CONTRACT.policy, "plan_status_requires_complete_source_truth");
  assert.equal(PLAN_SOURCE_TRUTH_CONTRACT.incomplete_source_status, "manual_verification_required");
  assert.equal(PLAN_SOURCE_TRUTH_CONTRACT.known_finding_plan_status, "dry_run_only");
  assert.equal(PLAN_SOURCE_TRUTH_CONTRACT.payload_exposed, false);
  assert.equal(PLAN_SOURCE_TRUTH_CONTRACT.writes_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-plan-source-truth-"));
  fs.writeFileSync(path.join(projectRoot, "README.md"), "# Pala OS\n", "utf8");

  const knownMissing = buildLocaleSyncPlan({ projectRoot });
  assert.equal(knownMissing.status, "dry_run_only");
  assert.equal(knownMissing.source_scan_complete, true);
  assert.deepEqual(knownMissing.blockers, []);
  assert.equal(knownMissing.actions.some((action) => action.evidence === "README-KULLANIM.md"), true);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-plan-source-truth-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "README-KULLANIM.md"), process.platform === "win32" ? "junction" : "dir");

  const unsafeLocale = buildLocaleSyncPlan({ projectRoot });
  assert.equal(unsafeLocale.status, "manual_verification_required");
  assert.equal(unsafeLocale.source_scan_complete, false);
  assert.equal(unsafeLocale.blockers.includes("locale_sync_source_truth_incomplete"), true);
  assert.doesNotMatch(JSON.stringify(unsafeLocale), /must-never-be-returned/);

  const unsafeDrift = buildDriftFixPlan({ projectRoot });
  assert.equal(unsafeDrift.status, "manual_verification_required");
  assert.equal(unsafeDrift.source_scan_complete, false);
  assert.equal(unsafeDrift.blockers.includes("drift_fix_source_truth_incomplete"), true);
  assert.doesNotMatch(JSON.stringify(unsafeDrift), /must-never-be-returned/);
});

test("n8n and worker plans preserve upstream inspection truth and options", () => {
  const n8nUnknown = buildN8nPlan({
    versionObservation: {
      status: null,
      stdout: "must-never-be-returned",
      stderr: "",
      error: { code: "ETIMEDOUT" },
      signal: "SIGTERM"
    }
  });
  assert.equal(n8nUnknown.status, "manual_verification_required");
  assert.equal(n8nUnknown.source_truth_complete, false);
  assert.equal(n8nUnknown.blockers.includes("n8n_cli_version_timed_out"), true);
  assert.equal(n8nUnknown.blockers.includes("n8n_plan_source_truth_incomplete"), true);
  assert.equal(n8nUnknown.external_call_performed, false);
  assert.equal(n8nUnknown.writes_performed, false);
  assert.doesNotMatch(JSON.stringify(n8nUnknown), /must-never-be-returned/);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-plan-root-"));
  const workerMissing = buildWorkerRunPlan({ dryRun: true, projectRoot });
  assert.equal(workerMissing.status, "manual_verification_required");
  assert.equal(workerMissing.worker.configured, false);
  assert.equal(workerMissing.blockers.includes("worker_entrypoint_not_implemented"), true);
  assert.equal(workerMissing.worker_started, false);
  assert.equal(workerMissing.workload_started, false);
});

test("n8n import dry-run uses bounded single-handle project-local JSON inspection", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-n8n-safe-"));
  const privateWorkflowName = "must-never-be-returned C:\\Users\\Private\\workflow secret-token";
  const workflow = {
    name: privateWorkflowName,
    active: false,
    nodes: [
      { name: "Start", type: "n8n-nodes-base.manualTrigger", disabled: false },
      { name: "HTTP", type: "n8n-nodes-base.httpRequest", credentials: { httpBasicAuth: { id: "private", name: "private" } } }
    ],
    connections: { Start: { main: [[{ node: "HTTP", type: "main", index: 0 }]] } }
  };
  fs.writeFileSync(path.join(projectRoot, "workflow.json"), JSON.stringify(workflow), "utf8");

  const valid = buildN8nImportPlan({ dryRun: true, target: "workflow.json", projectRoot });
  assert.equal(valid.status, "dry_run_only");
  assert.deepEqual(valid.blockers, []);
  assert.equal(valid.target, "workflow.json");
  assert.equal(valid.target_inspection.policy, "realpath_contained_single_handle_max_1mb_json");
  assert.equal(valid.target_inspection.max_file_bytes, 1_000_000);
  assert.equal(valid.target_inspection.realpath_contained, true);
  assert.equal(valid.target_inspection.regular_file, true);
  assert.equal(valid.target_inspection.target_open_performed, true);
  assert.equal(valid.target_inspection.target_read_performed, true);
  assert.equal(valid.target_inspection.target_parse_performed, true);
  assert.equal(valid.target_inspection.target_close_performed, true);
  assert.equal(valid.target_inspection.target_close_succeeded, true);
  assert.equal(valid.target_inspection.single_file_handle_used, true);
  assert.equal(valid.target_inspection.file_identity_match, true);
  assert.equal(valid.target_inspection.content_stable_during_read, true);
  assert.equal(valid.target_inspection.post_read_path_recheck_performed, true);
  assert.equal(valid.target_inspection.payload_exposed, false);
  assert.equal(valid.target_inspection.writes_allowed, false);
  assert.equal(N8N_IMPORT_INSPECTION_CONTRACT.post_read_path_recheck, true);
  assert.equal(N8N_IMPORT_INSPECTION_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(N8N_IMPORT_INSPECTION_CONTRACT.close_failure_blocker, "workflow_target_close_failed");
  assert.equal(N8N_IMPORT_INSPECTION_CONTRACT.workflow_summary_policy, "counts_and_boolean_metadata_without_raw_workflow_fields");
  assert.equal(N8N_IMPORT_INSPECTION_CONTRACT.raw_workflow_name_exposed, false);
  assert.equal(valid.workflow_summary.name_present, true);
  assert.equal(valid.workflow_summary.raw_name_exposed, false);
  assert.equal(valid.workflow_summary.node_count, 2);
  assert.equal(valid.workflow_summary.connection_group_count, 1);
  assert.equal(valid.workflow_summary.credential_reference_node_count, 1);
  assert.equal(JSON.stringify(valid).includes("private"), false);
  assert.equal(JSON.stringify(valid).includes(privateWorkflowName), false);
  assert.equal(Object.hasOwn(valid.workflow_summary, "name"), false);
  assert.equal(valid.writes_performed, false);

  fs.writeFileSync(path.join(projectRoot, "unnamed.json"), JSON.stringify({
    active: false,
    nodes: [],
    connections: {}
  }), "utf8");
  const unnamed = buildN8nImportPlan({ dryRun: true, target: "unnamed.json", projectRoot });
  assert.equal(unnamed.status, "dry_run_only");
  assert.equal(unnamed.workflow_summary.name_present, false);
  assert.equal(unnamed.workflow_summary.raw_name_exposed, false);
  assert.equal(Object.hasOwn(unnamed.workflow_summary, "name"), false);

  fs.writeFileSync(path.join(projectRoot, "oversized.json"), " ".repeat(1_000_001), "utf8");
  const oversized = buildN8nImportPlan({ dryRun: true, target: "oversized.json", projectRoot });
  assert.equal(oversized.status, "manual_verification_required");
  assert.equal(oversized.blockers.includes("workflow_target_exceeds_byte_limit"), true);
  assert.equal(oversized.target_inspection.target_open_performed, false);
  assert.equal(oversized.target_inspection.target_read_performed, false);
  assert.equal(oversized.target_inspection.target_parse_performed, false);

  fs.writeFileSync(path.join(projectRoot, "invalid.json"), "{not-json", "utf8");
  const invalid = buildN8nImportPlan({ dryRun: true, target: "invalid.json", projectRoot });
  assert.equal(invalid.status, "manual_verification_required");
  assert.equal(invalid.findings[0].summary, "Workflow target is not valid JSON.");
  assert.equal(invalid.target_inspection.target_read_performed, true);
  assert.equal(invalid.target_inspection.target_parse_performed, true);

  fs.writeFileSync(path.join(projectRoot, "primitive.json"), "null", "utf8");
  const primitive = buildN8nImportPlan({ dryRun: true, target: "primitive.json", projectRoot });
  assert.equal(primitive.status, "manual_verification_required");
  assert.equal(primitive.findings.some((finding) => finding.summary === "Workflow JSON root is not an object."), true);

  fs.mkdirSync(path.join(projectRoot, "directory.json"));
  const directory = buildN8nImportPlan({ dryRun: true, target: "directory.json", projectRoot });
  assert.equal(directory.status, "blocked");
  assert.equal(directory.blockers.includes("workflow_target_not_regular_file"), true);
  assert.equal(directory.target_inspection.target_read_performed, false);

  fs.writeFileSync(path.join(projectRoot, "workflow.txt"), "{}", "utf8");
  const wrongExtension = buildN8nImportPlan({ dryRun: true, target: "workflow.txt", projectRoot });
  assert.equal(wrongExtension.status, "blocked");
  assert.deepEqual(wrongExtension.blockers, ["workflow_target_must_be_project_local_json"]);
  assert.equal(wrongExtension.target_inspection.target_open_performed, false);

  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-n8n-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "outside.json"), JSON.stringify(workflow), "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "linked"), process.platform === "win32" ? "junction" : "dir");
  const linked = buildN8nImportPlan({ dryRun: true, target: "linked/outside.json", projectRoot });
  assert.equal(linked.status, "blocked");
  assert.equal(linked.blockers.includes("workflow_target_not_realpath_contained"), true);
  assert.equal(linked.target_inspection.target_read_performed, false);
});

test("n8n import inspection fails closed when the target identity changes after read", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-n8n-post-read-race-"));
  const target = path.join(projectRoot, "workflow.json");
  fs.writeFileSync(target, JSON.stringify({
    name: "Safe local workflow",
    active: false,
    nodes: [],
    connections: {}
  }), "utf8");

  const originalReadFileSync = fs.readFileSync;
  let replacementInjected = false;
  fs.readFileSync = (...args) => {
    const text = originalReadFileSync(...args);
    if (typeof args[0] === "number" && !replacementInjected) {
      fs.unlinkSync(target);
      fs.writeFileSync(target, "x".repeat(Buffer.byteLength(text, "utf8")), "utf8");
      replacementInjected = true;
    }
    return text;
  };
  let result;
  try {
    result = buildN8nImportPlan({ dryRun: true, target: "workflow.json", projectRoot });
  } finally {
    fs.readFileSync = originalReadFileSync;
  }

  assert.equal(replacementInjected, true);
  assert.equal(result.status, "blocked");
  assert.deepEqual(result.blockers, ["workflow_target_changed_after_read"]);
  assert.equal(result.target_inspection.target_read_performed, true);
  assert.equal(result.target_inspection.post_read_path_recheck_performed, true);
  assert.equal(result.target_inspection.file_identity_match, false);
  assert.equal(result.target_inspection.target_parse_performed, false);
  assert.equal(result.payload_exposed, false);
  assert.equal(result.writes_performed, false);
});

test("n8n import inspection reports metadata observation failures without throwing", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-n8n-metadata-race-"));
  const target = path.join(projectRoot, "workflow.json");
  const workflowText = JSON.stringify({ name: "Safe local workflow", active: false, nodes: [], connections: {} });
  fs.writeFileSync(target, workflowText, "utf8");

  const originalStatSync = fs.statSync;
  let statFailureInjected = false;
  fs.statSync = (...args) => {
    if (path.resolve(String(args[0])) === path.resolve(target) && !statFailureInjected) {
      statFailureInjected = true;
      const error = new Error("injected pre-open stat failure");
      error.code = "EACCES";
      throw error;
    }
    return originalStatSync(...args);
  };
  let preOpenFailure;
  try {
    preOpenFailure = buildN8nImportPlan({ dryRun: true, target: "workflow.json", projectRoot });
  } finally {
    fs.statSync = originalStatSync;
  }
  assert.equal(statFailureInjected, true);
  assert.equal(preOpenFailure.status, "manual_verification_required");
  assert.deepEqual(preOpenFailure.blockers, ["workflow_target_stat_failed"]);
  assert.equal(preOpenFailure.target_inspection.target_open_performed, false);
  assert.equal(preOpenFailure.writes_performed, false);

  const originalFstatSync = fs.fstatSync;
  let fstatCallCount = 0;
  fs.fstatSync = (...args) => {
    fstatCallCount += 1;
    if (fstatCallCount === 2) {
      const error = new Error("injected post-read fstat failure");
      error.code = "EIO";
      throw error;
    }
    return originalFstatSync(...args);
  };
  let postReadFailure;
  try {
    postReadFailure = buildN8nImportPlan({ dryRun: true, target: "workflow.json", projectRoot });
  } finally {
    fs.fstatSync = originalFstatSync;
  }
  assert.equal(fstatCallCount >= 2, true);
  assert.equal(postReadFailure.status, "manual_verification_required");
  assert.deepEqual(postReadFailure.blockers, ["workflow_target_post_read_stat_failed"]);
  assert.equal(postReadFailure.target_inspection.target_read_performed, true);
  assert.equal(postReadFailure.target_inspection.target_parse_performed, false);
  assert.equal(postReadFailure.writes_performed, false);
});

test("n8n import inspection reports close failures without throwing or exposing payloads", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-n8n-close-failure-"));
  const target = path.join(projectRoot, "workflow.json");
  fs.writeFileSync(target, JSON.stringify({
    name: "Safe local workflow",
    active: false,
    nodes: [],
    connections: {}
  }), "utf8");

  const originalCloseSync = fs.closeSync;
  let closeFailureInjected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      const error = new Error("injected workflow target close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    assert.doesNotThrow(() => {
      result = buildN8nImportPlan({ dryRun: true, target: "workflow.json", projectRoot });
    });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureInjected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["workflow_target_close_failed"]);
  assert.equal(result.workflow_summary, null);
  assert.equal(result.target_inspection.target_close_performed, true);
  assert.equal(result.target_inspection.target_close_succeeded, false);
  assert.equal(result.payload_exposed, false);
  assert.equal(JSON.stringify(result).includes("Safe local workflow"), false);
  assert.equal(result.writes_performed, false);
});

test("archive plan reports bounded inventory exactness without moving or deleting files", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-archive-safe-"));
  const rawEvidenceDir = path.join(projectRoot, ".pala", "evidence", "raw");
  fs.mkdirSync(rawEvidenceDir, { recursive: true });
  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  const newDate = new Date();
  for (const name of ["a-old.log", "b-old.log"]) {
    const target = path.join(rawEvidenceDir, name);
    fs.writeFileSync(target, name, "utf8");
    fs.utimesSync(target, oldDate, oldDate);
  }
  const newTarget = path.join(rawEvidenceDir, "c-new.log");
  fs.writeFileSync(newTarget, "new", "utf8");
  fs.utimesSync(newTarget, newDate, newDate);

  const complete = buildArchivePlan({ olderThanDays: 30, rawEvidenceDir, projectRoot, scanLimit: 10 });
  assert.equal(complete.status, "dry_run_only");
  assert.deepEqual(complete.blockers, []);
  assert.equal(complete.inventory_policy, "bounded_directory_iterator_with_explicit_exactness");
  assert.equal(complete.root_inspection.status, "safe_to_execute");
  assert.equal(complete.root_inspection.exists, true);
  assert.equal(complete.root_inspection.kind, "directory");
  assert.equal(complete.root_inspection.payload_exposed, false);
  assert.equal(complete.scan_limit, 10);
  assert.equal(complete.scanned_entry_count, 3);
  assert.equal(complete.scan_truncated, false);
  assert.equal(complete.candidate_count, 2);
  assert.equal(complete.candidate_count_exact, true);
  assert.deepEqual(complete.candidates, [".pala/evidence/raw/a-old.log", ".pala/evidence/raw/b-old.log"]);
  assert.equal(complete.candidate_output_limit, 120);
  assert.equal(complete.candidate_output_truncated, false);
  assert.equal(complete.inspection_failure_count, 0);
  assert.equal(complete.files_archived, false);
  assert.equal(complete.writes_performed, false);
  assert.equal(ARCHIVE_INVENTORY_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(ARCHIVE_INVENTORY_CONTRACT.directory_close_failure_blocker, "archive_inventory_directory_close_failed");
  assert.equal(ARCHIVE_INVENTORY_CONTRACT.payload_exposed_on_failure, false);

  const truncated = buildArchivePlan({ olderThanDays: 30, rawEvidenceDir, projectRoot, scanLimit: 2 });
  assert.equal(truncated.status, "manual_verification_required");
  assert.deepEqual(truncated.blockers, ["archive_inventory_scan_truncated"]);
  assert.equal(truncated.scanned_entry_count, 2);
  assert.equal(truncated.scan_truncated, true);
  assert.equal(truncated.candidate_count_exact, false);
  assert.equal(truncated.candidate_count <= 2, true);
  assert.equal(truncated.files_archived, false);
  assert.equal(truncated.destructive_action_performed, false);
  assert.equal(truncated.writes_performed, false);

  const missing = buildArchivePlan({
    olderThanDays: 30,
    rawEvidenceDir: path.join(projectRoot, ".pala", "evidence", "missing"),
    projectRoot
  });
  assert.equal(missing.status, "safe_to_execute");
  assert.equal(missing.root_inspection.status, "safe_to_execute");
  assert.equal(missing.root_inspection.exists, false);
  assert.equal(missing.candidate_count_exact, true);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-archive-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-archive-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala", "evidence"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "secret.log"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "evidence", "raw"), process.platform === "win32" ? "junction" : "dir");
  const linked = buildArchivePlan({
    olderThanDays: 30,
    rawEvidenceDir: path.join(linkedRoot, ".pala", "evidence", "raw"),
    projectRoot: linkedRoot
  });
  assert.equal(linked.status, "blocked");
  assert.equal(linked.root_inspection.status, "manual_verification_required");
  assert.equal(linked.root_inspection.blocker, "repo_path_not_realpath_contained_symlink_free");
  assert.equal(linked.root_inspection.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("archive plan reports directory close failures without accepting candidates", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-archive-directory-close-failure-"));
  const rawEvidenceDir = path.join(projectRoot, ".pala", "evidence", "raw");
  fs.mkdirSync(rawEvidenceDir, { recursive: true });
  const oldTarget = path.join(rawEvidenceDir, "must-not-be-accepted.log");
  fs.writeFileSync(oldTarget, "bounded evidence", "utf8");
  const oldDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);
  fs.utimesSync(oldTarget, oldDate, oldDate);

  const originalCloseSync = fs.Dir.prototype.closeSync;
  let injected = false;
  fs.Dir.prototype.closeSync = function closeSyncWithInjectedFailure() {
    originalCloseSync.call(this);
    if (!injected) {
      injected = true;
      const error = new Error("injected archive directory close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    result = buildArchivePlan({ olderThanDays: 30, rawEvidenceDir, projectRoot });
  } finally {
    fs.Dir.prototype.closeSync = originalCloseSync;
  }

  assert.equal(injected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["archive_inventory_directory_close_failed"]);
  assert.equal(result.scanned_entry_count, 0);
  assert.equal(result.candidate_count, 0);
  assert.equal(result.candidate_count_exact, false);
  assert.deepEqual(result.candidates, []);
  assert.equal(result.files_archived, false);
  assert.equal(result.destructive_action_performed, false);
  assert.equal(result.writes_performed, false);
});

test("bounded local worker entrypoint completes one read-only smoke task and rejects unsupported modes", () => {
  const smoke = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "./src/worker.ts", "--smoke-check"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true
  });
  assert.equal(smoke.status, 0, smoke.stderr);
  const output = JSON.parse(smoke.stdout);
  assert.equal(output.status, "safe_to_execute");
  assert.equal(output.mode, "smoke_check");
  assert.equal(output.contract.policy, "single_bounded_local_read_only_task");
  assert.equal(output.contract.max_runtime_ms, 2000);
  assert.equal(output.contract.arbitrary_commands_allowed, false);
  assert.equal(output.contract.external_calls_allowed, false);
  assert.equal(output.contract.writes_allowed, false);
  assert.equal(output.contract.destructive_actions_allowed, false);
  assert.equal(output.package_inspection.status, "safe_to_execute");
  assert.equal(output.package_inspection.single_file_handle_used, true);
  assert.equal(output.package_inspection.parse_valid, true);
  assert.equal(output.package_inspection.script_configured, true);
  assert.equal(output.package_inspection.payload_exposed, false);
  assert.equal(output.workload_started, false);
  assert.equal(output.external_call_performed, false);
  assert.equal(output.writes_performed, false);
  assert.equal(output.destructive_action_performed, false);
  assert.deepEqual(output.failures, []);

  const unsupported = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", "./src/worker.ts", "--unsupported"], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 3000,
    windowsHide: true
  });
  assert.equal(unsupported.status, 1);
  const blocked = JSON.parse(unsupported.stdout);
  assert.equal(blocked.status, "blocked");
  assert.deepEqual(blocked.blockers, ["unsupported_worker_mode"]);
  assert.equal(blocked.workload_started, false);
  assert.equal(blocked.writes_performed, false);
});

test("worker inspection reports missing and malformed local smoke contracts without exposing output", () => {
  assert.equal(WORKER_ENTRYPOINT_INSPECTION_CONTRACT.policy, "fixed_worker_entrypoint_path_metadata_scan");
  assert.equal(WORKER_ENTRYPOINT_INSPECTION_CONTRACT.path_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(WORKER_ENTRYPOINT_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(WORKER_ENTRYPOINT_INSPECTION_CONTRACT.writes_allowed, false);

  const missingRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-missing-"));
  const missing = inspectWorker({ projectRoot: missingRoot });
  assert.equal(missing.status, "manual_verification_required");
  assert.equal(missing.configured, false);
  assert.equal(missing.entrypoint_inspection.status, "safe_to_execute");
  assert.equal(missing.entrypoint_inspection.exists, false);
  assert.equal(missing.smoke_check.performed, false);
  assert.deepEqual(missing.blockers, ["worker_entrypoint_not_implemented", "worker_smoke_script_not_configured"]);

  const malformedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-malformed-"));
  fs.mkdirSync(path.join(malformedRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(malformedRoot, "package.json"), JSON.stringify({
    scripts: {
      "worker:smoke": "node --no-warnings=ExperimentalWarning ./src/worker.ts --smoke-check"
    }
  }), "utf8");
  fs.writeFileSync(path.join(malformedRoot, "src", "worker.ts"), "process.stdout.write('not-json');\n", "utf8");
  const malformed = inspectWorker({ projectRoot: malformedRoot });
  assert.equal(malformed.status, "manual_verification_required");
  assert.equal(malformed.configured, true);
  assert.equal(malformed.smoke_check.performed, true);
  assert.equal(malformed.smoke_check.output_parsed, false);
  assert.equal(malformed.smoke_check.contract_valid, false);
  assert.equal(Object.hasOwn(malformed.smoke_check, "stdout"), false);
  assert.equal(Object.hasOwn(malformed.smoke_check, "stderr"), false);
  assert.equal(malformed.blockers.includes("worker_smoke_invalid_json"), true);

  const spoofedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-spoofed-"));
  fs.mkdirSync(path.join(spoofedRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(spoofedRoot, "package.json"), fs.readFileSync(path.join(malformedRoot, "package.json"), "utf8"), "utf8");
  fs.writeFileSync(path.join(spoofedRoot, "src", "worker.ts"), [
    "process.stdout.write(JSON.stringify({",
    "  status: 'safe_to_execute',",
    "  mode: 'smoke_check',",
    "  contract: { protocol_version: 1, policy: 'single_bounded_local_read_only_task', max_runtime_ms: 2000, arbitrary_commands_allowed: false, external_calls_allowed: false, writes_allowed: false, destructive_actions_allowed: false },",
    "  checks: [], failures: [], workload_started: false, external_call_performed: false, writes_performed: false, destructive_action_performed: false",
    "}));"
  ].join("\n"), "utf8");
  const spoofed = inspectWorker({ projectRoot: spoofedRoot });
  assert.equal(spoofed.status, "manual_verification_required");
  assert.equal(spoofed.smoke_check.output_parsed, true);
  assert.equal(spoofed.smoke_check.contract_valid, false);
  assert.equal(spoofed.blockers.includes("worker_smoke_contract_mismatch"), true);

  const timeoutRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-timeout-"));
  fs.mkdirSync(path.join(timeoutRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(timeoutRoot, "package.json"), fs.readFileSync(path.join(malformedRoot, "package.json"), "utf8"), "utf8");
  fs.writeFileSync(path.join(timeoutRoot, "src", "worker.ts"), "setInterval(() => {}, 1000);\n", "utf8");
  const timedOut = inspectWorker({ projectRoot: timeoutRoot });
  assert.equal(timedOut.status, "manual_verification_required");
  assert.equal(timedOut.smoke_check.timed_out, true);
  assert.equal(timedOut.smoke_check.timeout_ms, 2000);
  assert.equal(timedOut.smoke_check.elapsed_ms >= 1900, true);
  assert.equal(timedOut.blockers.includes("worker_smoke_timed_out"), true);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-outside-"));
  fs.writeFileSync(path.join(linkedRoot, "package.json"), fs.readFileSync(path.join(malformedRoot, "package.json"), "utf8"), "utf8");
  fs.writeFileSync(path.join(outsideRoot, "worker.ts"), "process.stdout.write('{}');\n", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, "src"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectWorker({ projectRoot: linkedRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.configured, false);
  assert.equal(linked.smoke_check.performed, false);
  assert.equal(linked.entrypoint_inspection.status, "manual_verification_required");
  assert.equal(linked.entrypoint_inspection.payload_exposed, false);
  assert.equal(linked.blockers.includes("repo_path_not_realpath_contained_symlink_free"), true);

  const oversizedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-oversized-package-"));
  fs.mkdirSync(path.join(oversizedRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(oversizedRoot, "src", "worker.ts"), "process.stdout.write('{}');\n", "utf8");
  fs.writeFileSync(path.join(oversizedRoot, "package.json"), `{\"secret\":\"must-never-be-returned\",\"padding\":\"${"x".repeat(128)}\"}`, "utf8");
  const oversizedPackage = inspectWorkerPackage(oversizedRoot, { maxFileBytes: 32 });
  assert.equal(oversizedPackage.status, "manual_verification_required");
  assert.equal(oversizedPackage.target_read_performed, false);
  assert.equal(oversizedPackage.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.doesNotMatch(JSON.stringify(oversizedPackage), /must-never-be-returned|x{32}/);
  const oversizedWorker = inspectWorker({ projectRoot: oversizedRoot, maxWorkerPackageBytes: 32 });
  assert.equal(oversizedWorker.configured, false);
  assert.equal(oversizedWorker.smoke_check.performed, false);
  assert.equal(oversizedWorker.blockers.includes("repo_text_file_exceeds_byte_limit"), true);
  assert.doesNotMatch(JSON.stringify(oversizedWorker), /must-never-be-returned|x{32}/);

  const linkedPackageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-linked-package-"));
  const outsidePackageRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-worker-outside-package-"));
  fs.mkdirSync(path.join(linkedPackageRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(linkedPackageRoot, "src", "worker.ts"), "process.stdout.write('{}');\n", "utf8");
  fs.writeFileSync(path.join(outsidePackageRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsidePackageRoot, path.join(linkedPackageRoot, "package.json"), process.platform === "win32" ? "junction" : "dir");
  const linkedPackage = inspectWorkerPackage(linkedPackageRoot);
  assert.equal(linkedPackage.status, "manual_verification_required");
  assert.equal(linkedPackage.blockers.includes("repo_text_file_not_realpath_contained_regular_file"), true);
  assert.equal(linkedPackage.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(linkedPackage), /must-never-be-returned/);

  assert.equal(WORKER_PACKAGE_INSPECTION_CONTRACT.policy, "bounded_project_contained_single_handle_worker_package_json");
  assert.equal(WORKER_PACKAGE_INSPECTION_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(WORKER_PACKAGE_INSPECTION_CONTRACT.payload_exposed, false);
  assert.equal(WORKER_PACKAGE_INSPECTION_CONTRACT.writes_allowed, false);
});

test("dashboard, reference, and token summaries read SQLite truth", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  const dashboard = dashboardState(db);
  assert.equal(dashboard.rule, "Frontend reads truth. It does not create truth.");
  assert.equal(dashboard.counts.evidence, 0);
  assert.equal(dashboard.route_generation.status, "safe_to_execute");
  assert.equal(dashboard.route_generation.write_summary.atomic_replace_file_count, CONTROL_ROUTES.length + 2);
  assert.deepEqual(dashboard.route_generation.file_failures, []);
  const snapshot = buildOperationalSnapshot(db, {
    command: "pala test",
    result: { status: "safe_to_execute" },
    completion: { acceptance_status: "PARTIAL", changed_files_count: 0, risk_summary: { level: "low", unresolved_blocker_count: 0, unresolved_blockers: [] } },
    finalization: {
      status: "manual_verification_required",
      blockers: ["cli_state_refresh_outcome_unknown"],
      payload_exposed_on_failure: false
    }
  });
  assert.equal(snapshot.current_command, "pala test");
  assert.equal(snapshot.rule, dashboard.rule);
  assert.equal(snapshot.command_acceptance_status, "PARTIAL");
  assert.equal(snapshot.project_acceptance_status, "PARTIAL");
  assert.equal(snapshot.current_finalization.status, "manual_verification_required");
  assert.deepEqual(snapshot.current_finalization.blockers, ["cli_state_refresh_outcome_unknown"]);
  assert.deepEqual(snapshot.project_risk_summary.unresolved_blockers, ["model_or_effort_unknown"]);
  assert.equal(snapshot.model_effort.agent_surface, "unknown");
  const references = referenceRadarState(db);
  assert.equal(references.status, "stale_recheck_required");
  assert.equal(referenceCoverage(db).gaps.length, 6);
  assert.equal(panelRouteData(db, "decisions").row_count, 0);
  assert.equal(panelRouteData(db, "unknown-route").status, "manual_verification_required");
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, root_path_hash, name, created_at, updated_at)
    VALUES ('page-project', 'page-hash', 'Page test', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO runs (id, project_id, started_at, goal, status)
    VALUES ('run-page', 'page-project', '2026-01-01T00:00:00.000Z', 'page test', 'passed')
  `).run();
  for (let index = 0; index < 3; index += 1) {
    db.prepare(`
      INSERT INTO decisions (id, run_id, decision_type, inputs_json, decision, reason, created_at)
      VALUES (?, ?, ?, '{}', 'safe_local_write', ?, ?)
    `).run(`page-${index}`, "run-page", `page-${index}`, index === 1 ? "needle reason" : "ordinary reason", `2026-01-0${index + 1}T00:00:00.000Z`);
  }
  const firstDecisionPage = panelRouteData(db, "decisions", { limit: 2 });
  assert.equal(firstDecisionPage.row_count, 2);
  assert.equal(firstDecisionPage.total_count, 3);
  assert.equal(firstDecisionPage.has_more, true);
  assert.equal(panelRouteData(db, "decisions", { limit: 2, offset: 2 }).row_count, 1);
  assert.equal(panelRouteData(db, "decisions", { query: "needle" }).row_count, 1);
  assert.equal(panelRouteData(db, "decisions", { limit: 999 }).limit, 100);
  assert.equal(panelRouteData(db, "decisions", { limit: null, offset: null }).limit, 20);
  assert.equal(panelRouteData(db, "decisions", { limit: null, offset: null }).offset, 0);
  const tokens = tokenSummary(db);
  assert.equal(tokens.exact_cost_available, false);
  assert.equal(tokens.confidence, "unknown");
  db.close();
});

test("dashboard route generation is project-contained, atomic, and blocks junction targets", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-dashboard-generation-"));
  const generated = generateDashboardRoutes({ projectRoot });
  assert.equal(generated.status, "safe_to_execute");
  assert.equal(generated.blockers.length, 0);
  assert.equal(generated.routes.length, CONTROL_ROUTES.length);
  assert.equal(generated.output_file_count, CONTROL_ROUTES.length + 2);
  assert.equal(generated.output_file_count_exact, true);
  assert.equal(generated.inspection_summary.unsafe_path_count, 0);
  assert.deepEqual(generated.unsafe_paths, []);
  assert.equal(generated.write_summary.safe_file_count, CONTROL_ROUTES.length + 2);
  assert.equal(generated.write_summary.atomic_replace_file_count, CONTROL_ROUTES.length + 2);
  assert.equal(generated.write_summary.temporary_source_identity_verified_file_count, CONTROL_ROUTES.length + 2);
  assert.equal(generated.write_summary.failed_file_count, 0);
  assert.deepEqual(generated.file_failures, []);
  assert.equal(generated.payload_exposed, false);
  assert.equal(generated.writes_performed, true);
  assert.match(fs.readFileSync(path.join(projectRoot, "control", "overview", "index.html"), "utf8"), /Frontend reads truth/);
  assert.equal(
    fs.readdirSync(path.join(projectRoot, "control"), { recursive: true }).some((entry) => String(entry).endsWith(".tmp")),
    false
  );

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-dashboard-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-dashboard-outside-"));
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, "control"), process.platform === "win32" ? "junction" : "dir");
  const blocked = generateDashboardRoutes({ projectRoot: linkedRoot });
  assert.equal(blocked.status, "manual_verification_required");
  assert.equal(blocked.blockers.includes("dashboard_output_directory_not_safe"), true);
  assert.equal(blocked.output_file_count, 0);
  assert.equal(blocked.output_file_count_exact, true);
  assert.equal(blocked.inspection_summary.unsafe_path_count > 0, true);
  assert.equal(blocked.unsafe_paths.some((item) => item.path === "control"), true);
  assert.equal(blocked.payload_exposed, false);
  assert.equal(blocked.writes_performed, false);
  assert.deepEqual(fs.readdirSync(outsideRoot), []);

  assert.equal(DASHBOARD_GENERATION_CONTRACT.policy, "bounded_fixed_project_contained_atomic_dashboard_generation");
  assert.equal(DASHBOARD_GENERATION_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(DASHBOARD_GENERATION_CONTRACT.max_reported_unsafe_paths, 70);
  assert.equal(DASHBOARD_GENERATION_CONTRACT.concurrent_directory_creation_policy, "rechecked_eexist_tolerant");
  assert.equal(DASHBOARD_GENERATION_CONTRACT.concurrent_generation_policy, "rechecked_transient_atomic_replace_retry");
  assert.equal(DASHBOARD_GENERATION_CONTRACT.max_atomic_replace_attempts, 20);
  assert.equal(DASHBOARD_GENERATION_CONTRACT.temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt");
  assert.equal(DASHBOARD_GENERATION_CONTRACT.identity_safe_temp_cleanup, true);
  assert.equal(DASHBOARD_GENERATION_CONTRACT.atomic_replace, true);
  assert.equal(DASHBOARD_GENERATION_CONTRACT.path_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(DASHBOARD_GENERATION_CONTRACT.payload_exposed, false);
});

test("dashboard generation retry rejects a changed temporary source and preserves its path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-dashboard-source-replace-"));
  const seeded = generateDashboardRoutes({ projectRoot });
  assert.equal(seeded.status, "safe_to_execute");
  const target = path.join(projectRoot, "control", "overview", "index.html");
  const originalTarget = fs.readFileSync(target, "utf8");
  const originalRenameSync = fs.renameSync;
  let replacementTempPath = null;
  fs.renameSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.resolve(String(args[1])) === path.resolve(target) && replacementTempPath === null) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
      const error = new Error("injected transient dashboard replace contention after source replacement");
      error.code = "EACCES";
      throw error;
    }
    originalRenameSync(...args);
  };
  let generated;
  try {
    generated = generateDashboardRoutes({ projectRoot });
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(generated.status, "manual_verification_required");
  assert.equal(generated.blockers.includes("dashboard_output_temporary_source_changed"), true);
  assert.equal(generated.file_failures.some((item) => item.blocker === "dashboard_output_temporary_source_changed"), true);
  assert.equal(fs.readFileSync(target, "utf8"), originalTarget);
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("concurrent dashboard route generation tolerates competing atomic replacements", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-dashboard-concurrent-"));
  const seeded = generateDashboardRoutes({ projectRoot });
  assert.equal(seeded.status, "safe_to_execute");
  const barrierPath = path.join(projectRoot, ".dashboard-generation-start");
  const pending = Array.from({ length: 12 }, () => runDashboardGenerationProcess(projectRoot, barrierPath));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const results = await Promise.all(pending);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    const generated = JSON.parse(result.stdout);
    assert.equal(generated.status, "safe_to_execute", JSON.stringify(generated.file_failures));
    assert.equal(generated.write_summary.failed_file_count, 0);
    assert.equal(generated.output_file_count, DASHBOARD_GENERATION_CONTRACT.output_file_count);
    assert.equal(generated.write_summary.atomic_replace_attempt_count >= DASHBOARD_GENERATION_CONTRACT.output_file_count, true);
  }
  assert.equal(DASHBOARD_GENERATION_CONTRACT.concurrent_generation_policy, "rechecked_transient_atomic_replace_retry");
  assert.equal(DASHBOARD_GENERATION_CONTRACT.max_atomic_replace_attempts >= 2, true);
});

test("concurrent first dashboard generation tolerates competing directory creation", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-dashboard-concurrent-create-"));
  const barrierPath = path.join(projectRoot, ".dashboard-generation-start");
  const pending = Array.from({ length: 12 }, () => runDashboardGenerationProcess(projectRoot, barrierPath, true));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const results = await Promise.all(pending);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    const generated = JSON.parse(result.stdout);
    assert.equal(generated.status, "safe_to_execute", JSON.stringify(generated.blockers));
    assert.equal(generated.write_summary.failed_file_count, 0);
    assert.equal(generated.output_file_count, DASHBOARD_GENERATION_CONTRACT.output_file_count);
  }
  assert.equal(fs.existsSync(path.join(projectRoot, "control", "overview", "index.html")), true);
  assert.equal(DASHBOARD_GENERATION_CONTRACT.concurrent_directory_creation_policy, "rechecked_eexist_tolerant");
});

test("reference refresh plan emits bounded stale-source warnings without external work", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  const insert = db.prepare(`
    INSERT INTO reference_sources
      (id, category, name, url, last_checked_at, status, freshness_status, lesson, pala_decision, risk, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insert.run(
    "ref-fast-old",
    "ai_coding_agents",
    "Fast old source",
    "https://example.com/fast-old",
    "2026-04-01T00:00:00.000Z",
    "checked",
    "checked",
    "lesson",
    "decision",
    "reference_only",
    "docs/evidence/current-sources.md"
  );
  insert.run(
    "ref-slow-fresh",
    "developer_portal_control_tower",
    "Slow fresh source",
    "https://example.com/slow-fresh",
    "2026-05-15T00:00:00.000Z",
    "checked",
    "checked",
    "lesson",
    "decision",
    "reference_only",
    "docs/evidence/current-sources.md"
  );
  insert.run(
    "ref-unchecked",
    "token_economy",
    "Unchecked source",
    "https://example.com/unchecked",
    null,
    "not_checked",
    "not_checked",
    "lesson",
    "decision",
    "reference_only",
    "docs/evidence/current-sources.md"
  );

  const bounded = buildReferenceRefreshPlan(db, {
    now: "2026-06-04T00:00:00.000Z",
    maxQueue: 1
  });
  assert.equal(bounded.status, "stale_recheck_required");
  assert.equal(bounded.stale_source_count, 2);
  assert.equal(bounded.refresh_queue.length, 1);
  assert.equal(bounded.queue_truncated, true);
  assert.equal(bounded.refresh_queue[0].name, "Unchecked source");
  assert.deepEqual(bounded.refresh_queue[0].stale_reasons, [
    "freshness_status_not_checked",
    "last_checked_at_missing_or_invalid"
  ]);

  const full = buildReferenceRefreshPlan(db, {
    now: "2026-06-04T00:00:00.000Z",
    maxQueue: 10
  });
  const fastOld = full.refresh_queue.find((item) => item.name === "Fast old source");
  assert.equal(fastOld.age_days, 64);
  assert.equal(fastOld.max_age_days, 30);
  assert.deepEqual(fastOld.stale_reasons, ["age_exceeds_policy"]);
  assert.equal(full.external_fetch_performed, false);
  assert.equal(full.writes_performed, false);
  assert.ok(full.category_gaps.length > 0);
  const dashboardQueue = panelRouteData(db, "benchmarks", { limit: 10 });
  assert.equal(dashboardQueue.route_summary.stale_source_count, 2);
  assert.equal(dashboardQueue.rows.length, 2);
  assert.equal(dashboardQueue.rows[0].name, "Unchecked source");
  assert.equal(dashboardQueue.empty_state, null);
  db.close();
});

test("reference refresh state uses bounded atomic IO and blocks unsafe targets", () => {
  assert.equal(STATE_FILE_IO_CONTRACT.allowed_file_count, 5);
  assert.equal(REFERENCE_REFRESH_WRITE_CONTRACT.ledger_outcome_policy, "not_attempted_confirmed_or_unknown_after_attempt");
  assert.equal(REFERENCE_REFRESH_WRITE_CONTRACT.ledger_failure_blocker, "reference_refresh_ledger_write_outcome_unknown");

  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-reference-state-"));
  fs.mkdirSync(path.join(projectRoot, ".pala", "state"), { recursive: true });
  const ledgerEvents = [];
  const safe = refreshReferenceRadar(db, {
    dryRun: true,
    projectRoot,
    appendLedger: (name, event) => {
      ledgerEvents.push({ name, event });
      return ".pala/ledger/reference-refresh.jsonl";
    }
  });
  assert.equal(safe.state_io.status, "safe_to_execute");
  assert.equal(safe.state_io.atomic_replace, true);
  assert.equal(safe.state_io.payload_exposed_on_failure, false);
  assert.equal(safe.ledger_write_attempted, true);
  assert.equal(safe.ledger_write_outcome, "confirmed");
  assert.equal(safe.ledger_write_performed, true);
  assert.equal(ledgerEvents.length, 1);
  const safeRead = readBoundedStateJson(path.join(projectRoot, ".pala", "state", "reference-radar-state.json"), {
    projectRoot,
    fallback: {}
  });
  assert.equal(safeRead.status, "safe_to_execute");
  assert.equal(safeRead.single_file_handle_used, true);

  const uncertainRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-reference-uncertain-"));
  fs.mkdirSync(path.join(uncertainRoot, ".pala", "state"), { recursive: true });
  const uncertain = refreshReferenceRadar(db, {
    dryRun: true,
    projectRoot: uncertainRoot,
    appendLedger: () => {
      throw new Error("injected ledger close failure after possible write");
    }
  });
  assert.equal(uncertain.operation_status, "manual_verification_required");
  assert.equal(uncertain.ledger_write_attempted, true);
  assert.equal(uncertain.ledger_write_outcome, "unknown_after_attempt");
  assert.equal(uncertain.ledger_write_performed, false);
  assert.equal(uncertain.blockers.includes("reference_refresh_ledger_write_outcome_unknown"), true);
  assert.equal(uncertain.payload_exposed_on_failure, false);

  const missingPathRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-reference-missing-path-"));
  fs.mkdirSync(path.join(missingPathRoot, ".pala", "state"), { recursive: true });
  const missingPath = refreshReferenceRadar(db, {
    dryRun: true,
    projectRoot: missingPathRoot,
    appendLedger: () => null
  });
  assert.equal(missingPath.ledger_write_attempted, true);
  assert.equal(missingPath.ledger_write_outcome, "unknown_after_attempt");
  assert.equal(missingPath.ledger_write_performed, false);
  assert.equal(missingPath.ledger_path, null);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-reference-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-reference-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "state"), process.platform === "win32" ? "junction" : "dir");
  let unsafeLedgerWrites = 0;
  const unsafe = refreshReferenceRadar(db, {
    dryRun: true,
    projectRoot: linkedRoot,
    appendLedger: () => {
      unsafeLedgerWrites += 1;
      return "must-not-be-used";
    }
  });
  assert.equal(unsafe.state_io.status, "manual_verification_required");
  assert.equal(unsafe.ledger_write_attempted, false);
  assert.equal(unsafe.ledger_write_outcome, "not_attempted");
  assert.equal(unsafe.ledger_write_performed, false);
  assert.equal(unsafeLedgerWrites, 0);
  assert.equal(fs.existsSync(path.join(outsideRoot, "reference-radar-state.json")), false);
  assert.doesNotMatch(JSON.stringify(unsafe), /must-never-be-returned/);
  db.close();
});

test("decision review queue is bounded, deduplicated, and approval-aware", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  db.prepare(`
    INSERT INTO projects (id, root_path_hash, name, created_at, updated_at)
    VALUES ('review-project', 'review-hash', 'Review', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
  `).run();
  db.prepare(`
    INSERT INTO runs (id, project_id, started_at, goal, status)
    VALUES ('review-run', 'review-project', '2026-01-01T00:00:00.000Z', 'review', 'passed')
  `).run();
  const insert = db.prepare(`
    INSERT INTO decisions
      (id, run_id, decision_type, inputs_json, decision, reason, confidence, risk_level, required_approval, evidence_path, created_at)
    VALUES (?, 'review-run', ?, '{}', ?, ?, 'medium', ?, ?, ?, ?)
  `);
  insert.run("review-safe", "safe-task", "safe_local_write", "safe", "low", 0, "docs/evidence/safe.md", "2026-01-01T00:00:00.000Z");
  insert.run("review-approval", "publish-task", "needs_approval", "approval needed", "high", 1, "docs/evidence/approval.md", "2026-01-02T00:00:00.000Z");
  insert.run("review-manual-old", "verify-task", "manual_verification_required", "old manual", "medium", 0, "docs/evidence/old.md", "2026-01-03T00:00:00.000Z");
  insert.run("review-manual-new", "verify-task", "manual_verification_required", "new manual", "medium", 0, "docs/evidence/new.md", "2026-01-04T00:00:00.000Z");
  insert.run("review-dry", "dry-task", "dry_run_only", "follow up", "medium", 0, null, "2026-01-05T00:00:00.000Z");

  const queue = buildDecisionReviewQueue(db, {
    maxQueue: 2,
    now: "2026-01-05T00:00:00.000Z"
  });
  assert.equal(queue.status, "safe_to_execute");
  assert.equal(queue.queue_status, "review_required");
  assert.equal(queue.review_candidate_count, 3);
  assert.equal(queue.queue.length, 2);
  assert.equal(queue.queue_truncated, true);
  assert.equal(queue.scan_truncated, false);
  assert.equal(queue.queue[0].decision_type, "publish-task");
  assert.equal(queue.queue[0].priority, "critical");
  assert.equal(queue.queue[0].age_days, 3);
  assert.equal(queue.queue[0].max_review_age_days, 1);
  assert.equal(queue.queue[0].escalation_status, "overdue");
  assert.deepEqual(queue.queue[0].review_reasons, ["explicit_approval_required", "review_age_exceeds_threshold"]);
  assert.equal(queue.approval_required_count, 1);
  assert.equal(queue.missing_evidence_count, 1);
  assert.equal(queue.overdue_count, 1);
  assert.equal(queue.writes_performed, false);
  const aged = buildDecisionReviewQueue(db, {
    maxQueue: 10,
    now: "2026-02-15T00:00:00.000Z"
  });
  assert.equal(aged.overdue_count, 3);
  assert.equal(aged.queue.find((item) => item.decision_type === "dry-task").priority, "high");
  const route = panelRouteData(db, "decision-review");
  assert.equal(route.route_summary.review_candidate_count, 3);
  assert.equal(route.route_summary.scan_truncated, false);
  assert.equal(route.rows.length, 3);
  db.close();
});

test("benchmark refresh CLI records a bounded local-only refresh plan", async () => {
  const result = await runCli(["benchmark-refresh", "--dry-run"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "dry_run_only");
  assert.equal(output.radar.refresh_plan.external_fetch_performed, false);
  assert.equal(output.radar.refresh_plan.writes_performed, false);
  assert.equal(output.radar.refresh_plan.queue_limit, 25);
  assert.equal(Array.isArray(output.radar.refresh_plan.refresh_queue), true);
  assert.equal(output.radar.operation_status, "safe_to_execute");
  assert.equal(output.radar.state_io.status, "safe_to_execute");
  assert.equal(output.radar.state_io.atomic_replace, true);
  assert.equal(output.radar.state_io.payload_exposed_on_failure, false);
  assert.equal(output.radar.ledger_write_performed, true);
  assert.equal(output.decision.decision_type, "benchmark-refresh");
});

test("decision review CLI reports a bounded read-only queue", async () => {
  const result = await runCli(["decision-review", "--limit", "3", "--strict"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "safe_to_execute");
  assert.equal(output.acceptance_status, "PASS");
  assert.equal(output.writes_performed, false);
  assert.equal(output.queue.length <= 3, true);
  assert.equal(output.queue.every((item) => Array.isArray(item.review_reasons)), true);
});

test("project blockers report root causes without derivative final-verify duplicates", () => {
  assert.deepEqual(deriveProjectBlockers({
    syncStatus: "manual_verification_required",
    pushBlockers: ["worktree_has_uncommitted_or_untracked_files", "no_git_remote_configured"],
    modelObserved: "unknown",
    effortObserved: "unknown",
    finalDecision: "manual_verification_required",
    finalFailures: [
      "Active model and effort observed",
      "No unresolved sync state",
      "No unresolved push-readiness blockers"
    ]
  }), [
    "worktree_has_uncommitted_or_untracked_files",
    "no_git_remote_configured",
    "model_or_effort_unknown"
  ]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Workflow contracts pass"]
  }), ["verification_check_failed:workflow_contracts_pass"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded contained atomic ledger repair contract"]
  }), ["ledger_repair_write_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded payload-free MCP fixture inspection contract"]
  }), ["mcp_fixture_inspection_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Loopback-only bounded panel read contract"]
  }), ["panel_read_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded public readiness artifact inspection contract"]
  }), ["public_readiness_inspection_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded architecture path metadata contract"]
  }), ["architecture_path_metadata_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded i18n artifact path metadata contract"]
  }), ["i18n_artifact_path_metadata_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded runtime project asset path metadata contract"]
  }), ["runtime_project_asset_path_metadata_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded quality required artifact path metadata contract"]
  }), ["quality_required_artifact_path_metadata_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded CLI path presence metadata contract"]
  }), ["cli_path_presence_metadata_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded raw-output-free runtime observation contract"]
  }), ["runtime_observation_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded optional n8n CLI observation contract"]
  }), ["n8n_cli_observation_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded state JSON read and atomic refresh contract"]
  }), ["state_file_io_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded authorized database schema execution contract"]
  }), ["database_schema_execution_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded drift contract source-read contract"]
  }), ["drift_text_read_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded CLI contract source-read contract"]
  }), ["cli_text_read_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded CLAUDE sync dry-run inspection contract"]
  }), ["claude_sync_inspection_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded payload-free workflow inspection contract"]
  }), ["workflow_inspection_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded local external-skill readiness contract"]
  }), ["external_skill_readiness_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded smart-suggestion source truth contract"]
  }), ["smart_suggestion_source_truth_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Plan source truth contract"]
  }), ["plan_source_truth_contract_failed"]);
  assert.deepEqual(deriveProjectBlockers({
    modelObserved: "example",
    effortObserved: "high",
    finalDecision: "manual_verification_required",
    finalFailures: ["Bounded action-plan user-input metadata contract"]
  }), ["action_plan_user_input_contract_failed"]);
});

test("v28 schema exposes operator and model effort tables", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(fs.readFileSync(path.join(process.cwd(), ".pala", "schema", "001_init.sql"), "utf8"));
  migrateDatabase(db);
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  for (const required of [
    "projects",
    "runs",
    "commands",
    "evidence",
    "decisions",
    "mistakes",
    "lessons",
    "approvals",
    "token_usage",
    "drift_checks",
    "sync_checks",
    "push_checks",
    "mcp_config_checks",
    "reference_sources",
    "quality_findings"
  ]) {
    assert.equal(tables.has(required), true, `${required} table must exist`);
  }
  assert.equal(tables.has("operator_sessions"), true);
  assert.equal(tables.has("model_effort_observations"), true);
  assert.equal(tables.has("schema_migrations"), true);
  db.close();
});

test("database schema initialization uses bounded contained reads and an authorizer", () => {
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.policy, "bounded_project_contained_single_handle_schema_with_authorized_sqlite_execution");
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.authorizer_required, true);
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.attach_allowed, false);
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.load_extension_allowed, false);
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.payload_exposed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-schema-root-"));
  fs.mkdirSync(path.join(projectRoot, ".pala", "schema"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, ".pala", "schema", "001_init.sql"),
    "PRAGMA foreign_keys = ON; CREATE TABLE IF NOT EXISTS safe_table (id TEXT PRIMARY KEY);",
    "utf8"
  );
  const inspection = inspectDatabaseSchema({ projectRoot });
  assert.equal(inspection.status, "safe_to_execute");
  assert.equal(inspection.single_file_handle_used, true);
  assert.equal(inspection.content_stable_during_read, true);
  assert.equal(inspection.payload_exposed, false);
  assert.equal(Object.hasOwn(inspection, "sql"), false);

  const db = new DatabaseSync(":memory:");
  const executed = executeDatabaseSchema(db, { projectRoot });
  assert.equal(executed.status, "safe_to_execute");
  assert.equal(executed.execution_performed, true);
  assert.equal(executed.authorizer_used, true);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM safe_table").get().count, 0);
  db.close();

  const maliciousRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-schema-malicious-"));
  const outsideDb = path.join(maliciousRoot, "must-not-exist.sqlite");
  fs.mkdirSync(path.join(maliciousRoot, ".pala", "schema"), { recursive: true });
  fs.writeFileSync(
    path.join(maliciousRoot, ".pala", "schema", "001_init.sql"),
    `ATTACH DATABASE '${outsideDb.replace(/'/g, "''")}' AS outside_db;`,
    "utf8"
  );
  const maliciousDb = new DatabaseSync(":memory:");
  assert.throws(
    () => executeDatabaseSchema(maliciousDb, { projectRoot: maliciousRoot }),
    /database_schema_execution_not_authorized/
  );
  maliciousDb.close();
  assert.equal(fs.existsSync(outsideDb), false);

  fs.writeFileSync(path.join(projectRoot, ".pala", "schema", "001_init.sql"), "x".repeat(128), "utf8");
  const oversized = inspectDatabaseSchema({ projectRoot, maxFileBytes: 64 });
  assert.equal(oversized.status, "manual_verification_required");
  assert.deepEqual(oversized.blockers, ["database_schema_exceeds_byte_limit"]);
  assert.equal(oversized.payload_exposed, false);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-schema-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-schema-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "001_init.sql"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "schema"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectDatabaseSchema({ projectRoot: linkedRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("database schema descriptor close failure blocks inspection and execution without exposing SQL", () => {
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.close_failure_blocker, "database_schema_file_close_failed");
  assert.equal(DATABASE_SCHEMA_EXECUTION_CONTRACT.payload_exposed_on_failure, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-schema-close-failure-"));
  fs.mkdirSync(path.join(projectRoot, ".pala", "schema"), { recursive: true });
  fs.writeFileSync(
    path.join(projectRoot, ".pala", "schema", "001_init.sql"),
    "CREATE TABLE safe_table (id TEXT PRIMARY KEY);",
    "utf8"
  );
  const db = new DatabaseSync(":memory:");
  const originalCloseSync = fs.closeSync;
  let inspection;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    throw new Error("injected schema file close failure");
  };
  try {
    inspection = inspectDatabaseSchema({ projectRoot });
    assert.throws(
      () => executeDatabaseSchema(db, { projectRoot }),
      /database_schema_read_blocked:database_schema_file_close_failed/
    );
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(inspection.status, "manual_verification_required");
  assert.deepEqual(inspection.blockers, ["database_schema_file_close_failed"]);
  assert.equal(inspection.payload_exposed, false);
  assert.doesNotMatch(JSON.stringify(inspection), /CREATE TABLE|safe_table/);
  assert.equal(
    db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'safe_table'").get().count,
    0
  );
  db.close();
});

test("database status exposes bounded payload-free schema inspection", async () => {
  const result = await runCli(["db", "status", "--strict"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "safe_to_execute");
  assert.equal(output.db.path_inspection.status, "safe_to_execute");
  assert.equal(output.db.path_inspection.exists, true);
  assert.equal(output.db.path_inspection.kind, "file");
  assert.equal(output.db.path_inspection.expected_kind, "file");
  assert.equal(output.db.path_inspection.payload_exposed, false);
  assert.equal(output.db.path_inspection.writes_performed, false);
  assert.equal(output.db.exists, output.db.path_inspection.exists);
  assert.equal(output.schema_inspection.status, "safe_to_execute");
  assert.equal(output.schema_inspection.single_file_handle_used, true);
  assert.equal(output.schema_inspection.authorizer_used, false);
  assert.equal(output.schema_inspection.execution_performed, false);
  assert.equal(output.schema_inspection.payload_exposed, false);
  assert.equal(Object.hasOwn(output.schema_inspection, "sql"), false);
  assert.equal(fs.readFileSync(path.join(process.cwd(), "src", "lib", "db.ts"), "utf8").includes("fs." + "existsSync"), false);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-db-path-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-db-path-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "db"), process.platform === "win32" ? "junction" : "dir");
  const linked = inspectDatabasePath({ projectRoot: linkedRoot });
  assert.equal(linked.status, "manual_verification_required");
  assert.equal(linked.exists, false);
  assert.equal(linked.payload_exposed, false);
  assert.equal(linked.writes_performed, false);
  assert.equal(DATABASE_PATH_INSPECTION_CONTRACT.policy, "fixed_project_contained_database_path_metadata_only");
});

test("optional Claude PreToolUse guard smoke test blocks risky Bash only", () => {
  const hook = path.join(process.cwd(), ".claude", "hooks", "pretooluse-guard.mjs");
  const safe = spawnSync(process.execPath, [hook], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { command: "git status --short" } })
  });
  const risky = spawnSync(process.execPath, [hook], {
    encoding: "utf8",
    input: JSON.stringify({ tool_input: { command: "git push origin main" } })
  });
  assert.equal(safe.status, 0);
  assert.equal(risky.status, 2);
  assert.match(risky.stderr, /Pala guard blocked risky command/);
});

test("parallel read-only CLI commands wait for SQLite instead of failing locked", async () => {
  const results = await Promise.all([
    runCli(["architecture-check"]),
    runCli(["prompt-radar"]),
    runCli(["examples-check"])
  ]);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /database is locked/i);
    assert.match(result.stdout, /"raw_log_path"/);
  }
});

test("kernel bootstrap is fixed, project-contained, create-only, and junction-safe", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-kernel-bootstrap-"));
  const created = bootstrapKernel({ projectRoot });
  assert.equal(created.status, "safe_to_execute");
  assert.equal(created.blockers.length, 0);
  assert.equal(created.directory_summary.safe_directory_count, KERNEL_BOOTSTRAP_CONTRACT.directory_count);
  assert.equal(created.file_summary.created_file_count, KERNEL_BOOTSTRAP_CONTRACT.initialized_file_count);
  assert.equal(created.file_summary.failed_file_count, 0);
  assert.equal(created.payload_exposed, false);
  assert.equal(created.writes_performed, true);
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "ledger", "events.jsonl")), true);
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "state", "project-state.json")), true);

  fs.writeFileSync(path.join(projectRoot, ".pala", "state", "project-state.json"), "sentinel\n", "utf8");
  const repeated = bootstrapKernel({ projectRoot });
  assert.equal(repeated.status, "safe_to_execute");
  assert.equal(repeated.file_summary.created_file_count, 0);
  assert.equal(repeated.file_summary.existing_file_count, KERNEL_BOOTSTRAP_CONTRACT.initialized_file_count);
  assert.equal(fs.readFileSync(path.join(projectRoot, ".pala", "state", "project-state.json"), "utf8"), "sentinel\n");

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-kernel-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-kernel-outside-"));
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala"), process.platform === "win32" ? "junction" : "dir");
  const blocked = bootstrapKernel({ projectRoot: linkedRoot });
  assert.equal(blocked.status, "manual_verification_required");
  assert.equal(blocked.blockers.includes("kernel_bootstrap_path_not_safe"), true);
  assert.equal(blocked.writes_performed, false);
  assert.deepEqual(fs.readdirSync(outsideRoot), []);
  assert.throws(() => ensureKernel({ projectRoot: linkedRoot }), /kernel_bootstrap_blocked/);

  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.policy, "fixed_project_contained_create_only_kernel_bootstrap");
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.path_metadata_policy, "realpath_contained_symlink_free_path_metadata_only");
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.concurrent_directory_creation_policy, "rechecked_eexist_tolerant");
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.create_only, true);
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.initialized_file_temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match");
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.initialized_file_identity_safe_temp_cleanup, true);
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.initialized_file_post_publish_identity_policy, "temporary_and_initialized_file_dev_ino_match");
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.existing_files_overwritten, false);
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.payload_exposed, false);
});

test("kernel bootstrap rejects a same-size initialized-file replacement", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-kernel-file-replace-"));
  const targetPath = path.join(projectRoot, ".pala", "state", "project-state.json");
  const originalLinkSync = fs.linkSync;
  let replacementInjected = false;
  fs.linkSync = (...args) => {
    originalLinkSync(...args);
    if (path.resolve(String(args[1])) !== path.resolve(targetPath)) return;
    const publishedBytes = fs.statSync(String(args[0])).size;
    fs.unlinkSync(targetPath);
    fs.writeFileSync(targetPath, "x".repeat(publishedBytes), "utf8");
    replacementInjected = true;
  };
  let result;
  try {
    result = bootstrapKernel({ projectRoot });
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.equal(replacementInjected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["kernel_bootstrap_file_post_create_verification_failed"]);
  assert.equal(result.file_summary.failed_file_count, 1);
  assert.equal(fs.readdirSync(path.dirname(targetPath)).some((entry) => entry.endsWith(".tmp")), false);
});

test("kernel bootstrap rejects a same-size changed initialized-file source and preserves the changed temp path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-kernel-file-source-replace-"));
  const targetPath = path.join(projectRoot, ".pala", "state", "project-state.json");
  const originalLinkSync = fs.linkSync;
  let replacementTempPath = null;
  fs.linkSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.resolve(String(args[1])) === path.resolve(targetPath)) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
    }
    originalLinkSync(...args);
  };
  let result;
  try {
    result = bootstrapKernel({ projectRoot });
  } finally {
    fs.linkSync = originalLinkSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["kernel_bootstrap_file_post_create_verification_failed"]);
  assert.equal(result.file_summary.failed_file_count, 1);
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("concurrent first kernel bootstrap tolerates competing directory creation", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-kernel-concurrent-create-"));
  const barrierPath = path.join(projectRoot, ".kernel-bootstrap-start");
  const pending = Array.from({ length: 12 }, () => runKernelBootstrapProcess(projectRoot, barrierPath));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const results = await Promise.all(pending);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    const bootstrapped = JSON.parse(result.stdout);
    assert.equal(bootstrapped.status, "safe_to_execute", JSON.stringify(bootstrapped.blockers));
    assert.equal(bootstrapped.directory_summary.safe_directory_count, KERNEL_BOOTSTRAP_CONTRACT.directory_count);
    assert.equal(bootstrapped.file_summary.failed_file_count, 0);
  }
  assert.equal(fs.existsSync(path.join(projectRoot, ".pala", "ledger", "events.jsonl")), true);
  assert.equal(KERNEL_BOOTSTRAP_CONTRACT.concurrent_directory_creation_policy, "rechecked_eexist_tolerant");
});

test("CLI refreshes dashboard and latest-command state after each routed command", async () => {
  const result = await runCli(["dashboard-truth-check"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.route_generation.status, "safe_to_execute");
  assert.equal(output.route_generation.output_file_count, CONTROL_ROUTES.length + 2);
  assert.equal(output.route_generation.write_summary.atomic_replace_file_count, CONTROL_ROUTES.length + 2);
  assert.deepEqual(output.route_generation.file_failures, []);
  assert.equal(output.state_refresh.dashboard_state_path, ".pala/state/dashboard-state.json");
  assert.equal(output.state_refresh.state_io.status, "safe_to_execute");
  assert.equal(output.state_refresh.state_io.contract.policy, "bounded_project_contained_single_handle_state_json_with_atomic_replace");
  assert.equal(output.state_refresh.state_io.reads.every((item) => item.payload_exposed_on_failure === false), true);
  assert.equal(output.state_refresh.state_io.writes.every((item) => item.atomic_replace === true), true);
  const latest = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".pala", "state", "latest-command.json"), "utf8"));
  assert.equal(latest.command, "pala dashboard-truth-check");
  assert.equal(latest.raw_log_path, output.raw_log_path);
  const overview = fs.readFileSync(path.join(process.cwd(), "control", "overview", "index.html"), "utf8");
  assert.match(overview, /data-pala-snapshot="\.pala\/state\/dashboard-state\.json"/);
  assert.match(overview, /data-pala-api="\/api\/state"/);
  assert.match(overview, /data-pala-route-api="\/api\/route"/);
  assert.match(overview, /\.\.\/control\.js/);
  assert.match(overview, /id="route-filter"/);
  assert.match(overview, /id="route-summary"/);
  const controlJs = fs.readFileSync(path.join(process.cwd(), "control", "control.js"), "utf8");
  assert.match(controlJs, /route_summary/);
  const controlCss = fs.readFileSync(path.join(process.cwd(), "control", "control.css"), "utf8");
  assert.match(controlCss, /\.route-toolbar/);
  assert.match(controlCss, /table \{ width: max-content; min-width: 100%;/);
  assert.match(controlCss, /th, td \{ min-width: 120px;/);
  assert.match(controlCss, /@media \(max-width: 680px\)[\s\S]*\.route-toolbar \{ align-items: stretch; flex-direction: column; \}/);
});

test("CLI contract source reads are bounded, cached, and surfaced", async () => {
  const result = await runCli(["dashboard-truth-check", "--strict"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "safe_to_execute");
  assert.equal(output.cli_text_read.policy, "bounded_cached_contract_text_reads_with_shared_budget");
  assert.equal(output.cli_text_read.scan_complete, true);
  assert.equal(output.cli_text_read.text_file_read_count > 0, true);
  assert.equal(output.cli_text_read.total_text_bytes_read <= output.cli_text_read.max_total_text_bytes, true);
  assert.equal(output.cli_text_read.payload_exposed, false);
  assert.equal(output.cli_text_read.writes_performed, false);
});

test("status reads project state through the bounded state JSON contract", async () => {
  const result = await runCli(["status", "--strict"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.status, "safe_to_execute");
  assert.equal(output.project_state_read.status, "safe_to_execute");
  assert.equal(output.project_state_read.single_file_handle_used, true);
  assert.equal(output.project_state_read.payload_exposed_on_failure, false);
  assert.equal(output.state_refresh.state_io.status, "safe_to_execute");
});

test("state JSON IO is bounded, project-contained, symlink-safe, and atomic", () => {
  assert.equal(fs.readFileSync(path.join(process.cwd(), "src", "lib", "state-file.ts"), "utf8").includes("fs." + "existsSync"), false);
  assert.equal(STATE_FILE_IO_CONTRACT.policy, "bounded_project_contained_single_handle_state_json_with_atomic_replace");
  assert.equal(STATE_FILE_IO_CONTRACT.max_file_bytes, 1_000_000);
  assert.equal(STATE_FILE_IO_CONTRACT.allowed_file_count, 5);
  assert.equal(STATE_FILE_IO_CONTRACT.existence_probe_policy, "single_lstat_with_enoent_only_missing_truth");
  assert.equal(STATE_FILE_IO_CONTRACT.concurrent_write_policy, "last_writer_wins_rechecked_transient_atomic_replace_retry");
  assert.equal(STATE_FILE_IO_CONTRACT.max_atomic_replace_attempts, 20);
  assert.equal(STATE_FILE_IO_CONTRACT.temporary_source_identity_policy, "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt");
  assert.equal(STATE_FILE_IO_CONTRACT.identity_safe_temp_cleanup, true);
  assert.equal(STATE_FILE_IO_CONTRACT.atomic_replace, true);
  assert.equal(STATE_FILE_IO_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(STATE_FILE_IO_CONTRACT.close_failure_blocker, "state_file_close_failed");
  assert.equal(STATE_FILE_IO_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(STATE_FILE_IO_CONTRACT.writes_outside_state_dir_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-state-root-"));
  const stateDir = path.join(projectRoot, ".pala", "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const target = path.join(stateDir, "project-state.json");
  const written = writeBoundedStateJson(target, { status: "partial" }, { projectRoot, maxFileBytes: 128 });
  assert.equal(written.status, "safe_to_execute");
  assert.equal(written.atomic_replace, true);
  assert.equal(written.atomic_replace_attempt_count, 1);
  assert.equal(written.post_replace_target_safe, true);
  assert.equal(written.temporary_source_identity_verified, true);
  assert.equal(written.bytes_written > 0, true);

  const read = readBoundedStateJson(target, { projectRoot, maxFileBytes: 128, fallback: { fallback: true } });
  assert.equal(read.status, "safe_to_execute");
  assert.deepEqual(read.value, { status: "partial" });
  assert.equal(read.single_file_handle_used, true);
  assert.equal(read.content_stable_during_read, true);
  assert.equal(read.payload_exposed_on_failure, false);

  fs.writeFileSync(target, "must-never-be-returned".repeat(16), "utf8");
  const oversized = readBoundedStateJson(target, { projectRoot, maxFileBytes: 64, fallback: { fallback: true } });
  assert.equal(oversized.status, "manual_verification_required");
  assert.deepEqual(oversized.value, { fallback: true });
  assert.deepEqual(oversized.blockers, ["state_file_exceeds_byte_limit"]);
  assert.doesNotMatch(JSON.stringify(oversized), /must-never-be-returned/);

  fs.writeFileSync(target, "{\"secret\":\"must-never-be-returned\"", "utf8");
  const invalid = readBoundedStateJson(target, { projectRoot, maxFileBytes: 128, fallback: { fallback: true } });
  assert.equal(invalid.status, "manual_verification_required");
  assert.deepEqual(invalid.value, { fallback: true });
  assert.deepEqual(invalid.blockers, ["state_file_invalid_json"]);
  assert.doesNotMatch(JSON.stringify(invalid), /must-never-be-returned/);

  const linkedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-state-linked-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-state-outside-"));
  fs.mkdirSync(path.join(linkedRoot, ".pala"), { recursive: true });
  fs.writeFileSync(path.join(outsideRoot, "project-state.json"), "{\"outside\":\"must-never-be-returned\"}\n", "utf8");
  fs.symlinkSync(outsideRoot, path.join(linkedRoot, ".pala", "state"), process.platform === "win32" ? "junction" : "dir");
  const linkedTarget = path.join(linkedRoot, ".pala", "state", "project-state.json");
  const linkedRead = readBoundedStateJson(linkedTarget, { projectRoot: linkedRoot, fallback: {} });
  assert.equal(linkedRead.status, "manual_verification_required");
  assert.doesNotMatch(JSON.stringify(linkedRead), /must-never-be-returned/);
  const linkedWrite = writeBoundedStateJson(linkedTarget, { overwritten: true }, { projectRoot: linkedRoot });
  assert.equal(linkedWrite.status, "manual_verification_required");
  assert.match(fs.readFileSync(path.join(outsideRoot, "project-state.json"), "utf8"), /must-never-be-returned/);
});

test("state JSON read reports descriptor close failure without exposing the parsed value", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-state-close-failure-"));
  const stateDir = path.join(projectRoot, ".pala", "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const target = path.join(stateDir, "project-state.json");
  fs.writeFileSync(target, JSON.stringify({ secret: "must-never-be-returned" }), "utf8");

  const originalCloseSync = fs.closeSync;
  let closeFailureInjected = false;
  fs.closeSync = (fileDescriptor) => {
    originalCloseSync(fileDescriptor);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      const error = new Error("injected state file close failure");
      error.code = "EIO";
      throw error;
    }
  };
  let result;
  try {
    result = readBoundedStateJson(target, { projectRoot, fallback: { fallback: true } });
  } finally {
    fs.closeSync = originalCloseSync;
  }

  assert.equal(closeFailureInjected, true);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["state_file_close_failed"]);
  assert.deepEqual(result.value, { fallback: true });
  assert.equal(result.single_file_handle_used, true);
  assert.equal(result.content_stable_during_read, false);
  assert.equal(result.parse_valid, false);
  assert.equal(result.payload_exposed_on_failure, false);
  assert.doesNotMatch(JSON.stringify(result), /must-never-be-returned/);
  assert.equal(result.writes_performed, false);
});

test("state JSON retry rejects a changed temporary source and preserves its path", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-state-source-replace-"));
  const stateDir = path.join(projectRoot, ".pala", "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const target = path.join(stateDir, "dashboard-state.json");
  const seeded = writeBoundedStateJson(target, { writer: "seed" }, { projectRoot });
  assert.equal(seeded.status, "safe_to_execute");

  const originalRenameSync = fs.renameSync;
  let replacementTempPath = null;
  fs.renameSync = (...args) => {
    const sourcePath = String(args[0]);
    if (path.resolve(String(args[1])) === path.resolve(target) && replacementTempPath === null) {
      const publishedBytes = fs.statSync(sourcePath).size;
      fs.unlinkSync(sourcePath);
      fs.writeFileSync(sourcePath, "x".repeat(publishedBytes), "utf8");
      replacementTempPath = sourcePath;
      const error = new Error("injected transient state replace contention after source replacement");
      error.code = "EACCES";
      throw error;
    }
    originalRenameSync(...args);
  };
  let result;
  try {
    result = writeBoundedStateJson(target, { writer: "must-not-publish" }, { projectRoot });
  } finally {
    fs.renameSync = originalRenameSync;
  }

  assert.notEqual(replacementTempPath, null);
  assert.equal(result.status, "manual_verification_required");
  assert.deepEqual(result.blockers, ["state_write_temporary_source_changed"]);
  assert.equal(result.atomic_replace_retry_count, 1);
  assert.equal(result.temporary_source_identity_verified, false);
  assert.equal(readBoundedStateJson(target, { projectRoot }).value.writer, "seed");
  assert.equal(fs.existsSync(replacementTempPath), true);
});

test("concurrent state JSON writers tolerate competing atomic replacements", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-state-concurrent-"));
  const stateDir = path.join(projectRoot, ".pala", "state");
  fs.mkdirSync(stateDir, { recursive: true });
  const target = path.join(stateDir, "dashboard-state.json");
  const seeded = writeBoundedStateJson(target, { writer: "seed" }, { projectRoot });
  assert.equal(seeded.status, "safe_to_execute");

  const barrierPath = path.join(projectRoot, ".state-write-start");
  const pending = Array.from({ length: 12 }, (_, index) => runStateWriteProcess(projectRoot, barrierPath, index));
  await new Promise((resolve) => setTimeout(resolve, 100));
  fs.writeFileSync(barrierPath, "go", "utf8");
  const results = await Promise.all(pending);
  for (const result of results) {
    assert.equal(result.code, 0, result.stderr);
    const written = JSON.parse(result.stdout);
    assert.equal(written.status, "safe_to_execute", JSON.stringify(written.blockers));
    assert.equal(written.atomic_replace, true);
    assert.equal(written.atomic_replace_attempt_count >= 1, true);
  }

  const finalRead = readBoundedStateJson(target, { projectRoot });
  assert.equal(finalRead.status, "safe_to_execute");
  assert.match(finalRead.value.writer, /^writer-\d+$/);
  assert.equal(fs.readdirSync(stateDir).some((entry) => entry.endsWith(".tmp")), false);
  assert.equal(STATE_FILE_IO_CONTRACT.concurrent_write_policy, "last_writer_wins_rechecked_transient_atomic_replace_retry");
  assert.equal(STATE_FILE_IO_CONTRACT.max_atomic_replace_attempts, 20);
});

test("memory and MCP operator checks do not invent writes", async () => {
  const syncClaude = JSON.parse((await runCli(["memory", "sync-claude", "--dry-run"])).stdout);
  assert.equal(syncClaude.writes_performed, false);
  const interactiveMistake = JSON.parse((await runCli(["memory", "add-mistake", "--interactive"])).stdout);
  assert.equal(interactiveMistake.status, "manual_verification_required");
  assert.equal(interactiveMistake.writes_performed, false);
  assert.deepEqual(interactiveMistake.blockers, ["interactive_terminal_required"]);
  assert.equal(interactiveMistake.prompt_performed, false);
  assert.equal(interactiveMistake.mistake, undefined);
  const mixedMode = JSON.parse((await runCli(["memory", "add-mistake", "--interactive", "--summary", "must not be written"])).stdout);
  assert.equal(mixedMode.status, "blocked");
  assert.deepEqual(mixedMode.blockers, ["interactive_and_inline_inputs_cannot_be_combined"]);
  assert.equal(mixedMode.writes_performed, false);
  assert.equal(mixedMode.mistake, undefined);
  const setupCheck = JSON.parse((await runCli(["setup", "--check", "--all"])).stdout);
  assert.equal(setupCheck.status, "safe_to_execute");
  assert.equal(setupCheck.real_config_modified, false);
  assert.throws(() => addMistake(null, {}), /summary is required/i);
});

test("interactive mistake collection is TTY-gated, validated, and confirmation-gated before writes", async () => {
  assert.equal(INTERACTIVE_MISTAKE_CONTRACT.close_before_safe_result, true);
  assert.equal(INTERACTIVE_MISTAKE_CONTRACT.close_failure_blocker, "interactive_prompt_close_failed");
  assert.equal(INTERACTIVE_MISTAKE_CONTRACT.payload_exposed_on_failure, false);
  const answers = ["A focused regression", "testing", "Missing boundary test", "high", "Add the boundary test first", "yes"];
  const prompts = [];
  const ready = await collectInteractiveMistake({
    isTTY: true,
    ask: async (prompt) => {
      prompts.push(prompt);
      return answers.shift();
    }
  });
  assert.equal(ready.status, "safe_to_execute");
  assert.equal(ready.prompt_performed, true);
  assert.equal(ready.prompt_count, 6);
  assert.equal(ready.capture_confirmed, true);
  assert.equal(ready.writes_performed, false);
  assert.deepEqual(ready.input, {
    summary: "A focused regression",
    category: "testing",
    rootCause: "Missing boundary test",
    severity: "high",
    preventionRule: "Add the boundary test first"
  });
  assert.equal(prompts.length, 6);

  const closeSuccessAnswers = ["Summary", "", "", "", "", "yes"];
  let closeConfirmed = false;
  const closeSuccess = await collectInteractiveMistake({
    isTTY: true,
    createInterface: () => ({
      question: async () => closeSuccessAnswers.shift(),
      close: () => {
        closeConfirmed = true;
      }
    })
  });
  assert.equal(closeConfirmed, true);
  assert.equal(closeSuccess.status, "safe_to_execute");
  assert.equal(closeSuccess.prompt_close_status, "confirmed");
  assert.equal(closeSuccess.capture_confirmed, true);
  assert.equal(closeSuccess.input.summary, "Summary");

  const nonTty = await collectInteractiveMistake({ isTTY: false });
  assert.equal(nonTty.status, "manual_verification_required");
  assert.deepEqual(nonTty.blockers, ["interactive_terminal_required"]);
  assert.equal(nonTty.prompt_performed, false);
  assert.equal(nonTty.writes_performed, false);

  const invalidSeverityAnswers = ["Summary", "", "", "urgent", "", "yes"];
  const invalidSeverity = await collectInteractiveMistake({
    isTTY: true,
    ask: async () => invalidSeverityAnswers.shift()
  });
  assert.equal(invalidSeverity.status, "manual_verification_required");
  assert.deepEqual(invalidSeverity.blockers, ["invalid_mistake_severity"]);
  assert.equal(invalidSeverity.capture_confirmed, false);
  assert.equal(invalidSeverity.writes_performed, false);
  assert.equal(invalidSeverity.input, undefined);

  const declinedAnswers = ["Summary", "", "", "", "", "no"];
  const declined = await collectInteractiveMistake({
    isTTY: true,
    ask: async () => declinedAnswers.shift()
  });
  assert.equal(declined.status, "blocked");
  assert.deepEqual(declined.blockers, ["interactive_capture_not_confirmed"]);
  assert.equal(declined.capture_confirmed, false);
  assert.equal(declined.writes_performed, false);
  assert.equal(declined.input, undefined);

  const closeFailureAnswers = ["must-never-be-returned", "", "", "", "", "yes"];
  let closeAttempted = false;
  const closeFailure = await collectInteractiveMistake({
    isTTY: true,
    createInterface: () => ({
      question: async () => closeFailureAnswers.shift(),
      close: () => {
        closeAttempted = true;
        throw new Error("must-never-be-returned");
      }
    })
  });
  assert.equal(closeAttempted, true);
  assert.equal(closeFailure.status, "manual_verification_required");
  assert.deepEqual(closeFailure.blockers, ["interactive_prompt_close_failed"]);
  assert.equal(closeFailure.prompt_close_status, "failed");
  assert.equal(closeFailure.capture_confirmed, false);
  assert.equal(closeFailure.input, undefined);
  assert.equal(closeFailure.payload_exposed_on_failure, false);
  assert.doesNotMatch(JSON.stringify(closeFailure), /must-never-be-returned/);
});

test("evidence exchange CLI dry-runs never expose payloads or import writes", async () => {
  const exported = JSON.parse((await runCli(["evidence", "export", "--dry-run"])).stdout);
  assert.equal(exported.status, "dry_run_only");
  assert.equal(exported.writes_performed, false);
  assert.equal(exported.payload, undefined);
  assert.equal(exported.validation.status, "safe_to_execute");
  assert.equal(typeof exported.collection_truncation.decisions.truncation_status, "string");
  assert.equal(typeof exported.digest_sha256, "string");
  assert.equal(typeof exported.content_digest_sha256, "string");
  assert.notEqual(exported.digest_sha256, exported.content_digest_sha256);
  assert.equal(exported.byte_budget.policy, "exact_utf8_json_bytes_with_80_percent_warning");
  assert.equal(exported.byte_budget.payload_byte_status, "within_budget");

  const imported = JSON.parse((await runCli(["evidence", "import", "--dry-run", "--target", "missing-exchange.json"])).stdout);
  assert.equal(imported.status, "manual_verification_required");
  assert.equal(imported.import_performed, false);
  assert.equal(imported.writes_performed, false);
  assert.equal(imported.digest_availability.reason, "not_computed_no_parsed_payload");

  const importPlan = JSON.parse((await runCli(["evidence", "import", "--target", "missing-exchange.json"])).stdout);
  assert.equal(importPlan.status, "manual_verification_required");
  assert.equal(importPlan.contract.policy, "validated_target_digest_and_count_delta_approval_plan");
  assert.equal(importPlan.readiness_status, "not_ready");
  assert.equal(importPlan.comparison_performed, false);
  assert.equal(importPlan.dry_run, false);
  assert.equal(importPlan.import_performed, false);
  assert.equal(importPlan.writes_performed, false);

  const schema = JSON.parse((await runCli(["evidence", "schema-check", "--strict"])).stdout);
  assert.equal(schema.acceptance_status, "PASS");
  assert.equal(schema.contract.current_schema_version, 2);
  assert.equal(schema.compatibility_policy, "exact_match_only");
  assert.equal(schema.contract.payload_byte_budget_policy, "exact_utf8_json_bytes_with_80_percent_warning");

  const migration = JSON.parse((await runCli(["evidence", "migrate", "--dry-run", "--target", "missing-legacy.json"])).stdout);
  assert.equal(migration.status, "manual_verification_required");
  assert.equal(migration.migration_performed, false);
  assert.equal(migration.writes_performed, false);
  const migrationPlan = JSON.parse((await runCli(["evidence", "migrate", "--target", "missing-legacy.json"])).stdout);
  assert.equal(migrationPlan.status, "manual_verification_required");
  assert.equal(migrationPlan.contract.policy, "validated_source_schema_migration_readiness_approval_plan");
  assert.equal(migrationPlan.readiness_status, "not_ready");
  assert.equal(migrationPlan.approval_required, false);
  assert.equal(migrationPlan.dry_run, false);
  assert.equal(migrationPlan.migration_performed, false);
  assert.equal(migrationPlan.writes_performed, false);

  const comparison = JSON.parse((await runCli(["evidence", "compare", "--dry-run", "--target", "missing-exchange.json"])).stdout);
  assert.equal(comparison.status, "manual_verification_required");
  assert.equal(comparison.comparison_performed, false);
  assert.equal(comparison.payload_exposed, false);
  assert.equal(comparison.writes_performed, false);

  const assertionResult = await runCli(["evidence", "assert-content", "--content-digest", "0".repeat(64), "--strict"]);
  const assertion = JSON.parse(assertionResult.stdout);
  assert.equal(assertionResult.code, 1);
  assert.equal(assertion.status, "manual_verification_required");
  assert.equal(assertion.assertion_status, "mismatch");
  assert.equal(assertion.target_file_read, false);
  assert.equal(assertion.payload_exposed, false);
  assert.equal(assertion.writes_performed, false);

  const completeness = JSON.parse((await runCli(["evidence", "completeness-check"])).stdout);
  assert.equal(["safe_to_execute", "manual_verification_required"].includes(completeness.status), true);
  assert.equal(Array.isArray(completeness.incomplete_collections), true);
  assert.equal(completeness.payload_exposed, false);
  assert.equal(completeness.writes_performed, false);
});

test("strict CLI mode returns nonzero unless command acceptance is PASS", async () => {
  const passed = await runCli(["docs-honesty-check", "--strict"]);
  assert.equal(passed.code, 0, passed.stderr);
  assert.equal(JSON.parse(passed.stdout).strict, true);

  const admin = await runCli(["admin-check", "--strict"]);
  assert.equal(admin.code, 0, admin.stderr);
  assert.equal(JSON.parse(admin.stdout).detection.output_valid, true);

  const partial = await runCli(["benchmark-refresh", "--dry-run", "--strict"]);
  assert.equal(partial.code, 1);
  const output = JSON.parse(partial.stdout);
  assert.equal(output.strict, true);
  assert.equal(output.acceptance_status, "PARTIAL");
});

test("volatile state, ledgers, and archives are gitignored runtime files", () => {
  for (const file of [
    ".pala/state/dashboard-state.json",
    ".pala/ledger/events.jsonl",
    ".pala/archive/example.log"
  ]) {
    assert.equal(spawnSync("git", ["check-ignore", "--quiet", file], { cwd: process.cwd() }).status, 0, file);
  }
  assert.notEqual(spawnSync("git", ["check-ignore", "--quiet", ".pala/memory/mistake-registry.jsonl"], { cwd: process.cwd() }).status, 0);
});

test("final verify reports evidence blockers without internal schema errors", async () => {
  const result = await runCli(["verify"]);
  assert.equal(result.code, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.notEqual(output.status, "blocked");
  assert.equal(Array.isArray(output.failures), true);
  assert.equal(output.checks.some((check) => check.name === "Local ledgers contain no personal paths or secret-like values before export"), true);
  assert.equal(output.checks.some((check) => check.name === "Fixed bounded ledger append contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded atomic create-only raw evidence write contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded fixed public evidence atomic replace contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded ledger safety scan contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded contained atomic ledger repair contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded latest evidence lookup contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Fixed contained database path metadata contract"), true);
  assert.equal(output.db.path_inspection.status, "safe_to_execute");
  assert.equal(output.db.path_inspection.payload_exposed, false);
  assert.equal(output.checks.some((check) => check.name === "Fixed contained create-only kernel bootstrap contract"), true);
  assert.equal(output.kernel_bootstrap.status, "safe_to_execute");
  assert.equal(output.checks.some((check) => check.name === "Dashboard consumes read-only state API"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded atomic dashboard generation contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Workflow contracts pass"), true);
  assert.equal(output.checks.some((check) => check.name === "Sanitized evidence exchange contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Atomic create-only evidence exchange export contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence exchange schema compatibility contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Decision review queue contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Decision review aging policy contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence exchange migration plan contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence exchange migration dashboard capability contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Stable evidence content digest contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence exchange comparison contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence exchange comparison dashboard capability contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence content digest assertion contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence content assertion dashboard capability contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence exchange collection truncation contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence truncation metadata validation contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence truncation metadata dashboard status contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence completeness check contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence completeness dashboard status contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence payload byte budget contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence raw-file preflight contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence target path safety contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence single-handle file inspection contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence strict schema shape contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence record validation contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence payload complexity guard contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence digest availability contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence generated_at time truth contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence temporal consistency contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence collection ordering contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence duplicate-record truth contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence validation finding budget contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence validation phase execution contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Evidence validation finding attribution contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded local worker smoke contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded local external-skill readiness contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded smart-suggestion source truth contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Plan source truth contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded action-plan user-input metadata contract"), true);
  assert.equal(output.plan_source_truth.n8n_plan_source_truth_complete, true);
  assert.equal(output.plan_source_truth.n8n_plan_status, "dry_run_only");
  assert.equal(output.checks.some((check) => check.name === "Read-only admin privilege detection contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Interactive mistake capture contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded contained memory registry append contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded n8n import target inspection contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded archive inventory contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded payload-free MCP fixture inspection contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Loopback-only bounded panel read contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded raw-output-free runtime observation contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded optional n8n CLI observation contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded state JSON read and atomic refresh contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded authorized database schema execution contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded drift contract source-read contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded CLI contract source-read contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded CLAUDE sync dry-run inspection contract"), true);
  assert.equal(output.cli_text_read.scan_complete, true);
  assert.equal(output.cli_text_read.payload_exposed, false);
  assert.equal(output.checks.some((check) => check.name === "Bounded payload-free workflow inspection contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded public readiness artifact inspection contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded architecture path metadata contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded i18n artifact path metadata contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded runtime project asset path metadata contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded quality required artifact path metadata contract"), true);
  assert.equal(output.checks.some((check) => check.name === "Bounded CLI path presence metadata contract"), true);
  assert.equal(output.risk_summary.unresolved_blocker_count, output.root_blockers.length);
  assert.equal(new Set(output.root_blockers).size, output.root_blockers.length);
  assert.doesNotMatch(result.stdout, /no such column/i);
});

test("runtime surface detection does not confuse an installed CLI with the active agent", () => {
  const installedClaude = [{ command: "claude --version", exit_code: 0, output: "example" }];
  assert.deepEqual(detectAgentSurface(installedClaude, {}), {
    agent_surface: "unknown",
    source: "installed_cli_is_not_active_surface_evidence"
  });
  assert.deepEqual(detectAgentSurface([], { CODEX_INTERNAL_ORIGINATOR_OVERRIDE: "Codex Desktop" }), {
    agent_surface: "codex-desktop",
    source: "environment_marker"
  });
});

test("runtime project assets use contained payload-free path metadata", () => {
  assert.equal(RUNTIME_PROJECT_ASSET_CONTRACT.policy, "bounded_fixed_runtime_project_asset_path_metadata_scan");
  assert.equal(RUNTIME_PROJECT_ASSET_CONTRACT.required_path_count, 5);
  assert.equal(RUNTIME_PROJECT_ASSET_CONTRACT.payload_exposed, false);
  assert.equal(RUNTIME_PROJECT_ASSET_CONTRACT.writes_allowed, false);

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-runtime-assets-"));
  fs.mkdirSync(path.join(projectRoot, ".claude", "hooks"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, ".claude", "skills"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, ".claude", "agents"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, ".claude", "settings.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, ".claude", "settings.recommended-after-smoke.json"), "{}\n", "utf8");
  fs.writeFileSync(path.join(projectRoot, ".claude", "hooks", "pretooluse-guard.mjs"), "export {};\n", "utf8");
  const commandRunner = () => ({ status: 0, stdout: "v1\n", stderr: "", error: null, signal: null });
  const safe = observeRuntime({ projectRoot, commandRunner });
  assert.equal(safe.project_asset_status, "safe_to_execute");
  assert.equal(safe.project_asset_inspections.length, 5);
  assert.equal(safe.project_asset_inspections.every((item) => item.payload_exposed === false), true);

  fs.rmdirSync(path.join(projectRoot, ".claude", "skills"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-runtime-assets-outside-"));
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, ".claude", "skills"), process.platform === "win32" ? "junction" : "dir");
  const linked = observeRuntime({ projectRoot, commandRunner });
  assert.equal(linked.project_asset_status, "manual_verification_required");
  assert.equal(linked.project_assets.skills, false);
  assert.equal(linked.project_asset_blockers.some((blocker) => blocker.includes("repo_path_not_realpath_contained_symlink_free")), true);
  assert.doesNotMatch(JSON.stringify(linked), /must-never-be-returned/);
});

test("runtime observations are bounded and never expose raw process output", () => {
  const runtime = observeRuntime({
    maxOutputBytes: 64,
    commandRunner: (command, args) => {
      const display = `${command} ${args.join(" ")}`.trim();
      if (display === "git --version") {
        return {
          status: null,
          stdout: "must-never-be-returned",
          stderr: "secret=must-never-be-returned",
          error: { code: "ETIMEDOUT" },
          signal: "SIGTERM"
        };
      }
      if (display === "claude mcp --help") {
        return {
          status: null,
          stdout: "x".repeat(128),
          stderr: "",
          error: { code: "ENOBUFS" },
          signal: null
        };
      }
      return {
        status: 0,
        stdout: "v1 token=must-never-be-returned\nsecond raw line",
        stderr: "",
        error: null,
        signal: null
      };
    }
  });

  assert.equal(RUNTIME_OBSERVATION_CONTRACT.policy, "bounded_fixed_command_process_metadata_with_redacted_first_line");
  assert.equal(RUNTIME_OBSERVATION_CONTRACT.timeout_ms, 5000);
  assert.equal(RUNTIME_OBSERVATION_CONTRACT.max_output_bytes, 64_000);
  assert.equal(RUNTIME_OBSERVATION_CONTRACT.max_summary_chars, 160);
  assert.equal(RUNTIME_OBSERVATION_CONTRACT.raw_output_exposed, false);
  assert.equal(runtime.process_observation_status, "manual_verification_required");
  assert.equal(runtime.observations.length, 5);
  assert.equal(runtime.observations.every((item) => item.raw_output_exposed === false), true);
  assert.equal(runtime.observations.every((item) => !Object.hasOwn(item, "output") && !Object.hasOwn(item, "stdout") && !Object.hasOwn(item, "stderr")), true);
  assert.equal(runtime.observations.some((item) => item.timed_out), true);
  assert.equal(runtime.observations.some((item) => item.output_limit_exceeded), true);
  assert.match(runtime.observations[0].summary, /token=<REDACTED>/);
  assert.doesNotMatch(JSON.stringify(runtime), /must-never-be-returned|second raw line|x{32}/);
});

test("panel server exposes read-only dashboard state and generated routes", async () => {
  const server = createPanelServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const stateResponse = await fetch(`${base}/api/state`);
    assert.equal(stateResponse.status, 200);
    assert.match(stateResponse.headers.get("content-security-policy"), /default-src 'self'/);
    assert.equal(stateResponse.headers.get("x-frame-options"), "DENY");
    assert.equal((await stateResponse.json()).rule, "Frontend reads truth. It does not create truth.");
    const pageResponse = await fetch(`${base}/control/overview/`);
    assert.equal(pageResponse.status, 200);
    assert.match(await pageResponse.text(), /data-pala-api="\/api\/state"/);
    const routeDataResponse = await fetch(`${base}/api/route/decisions`);
    assert.equal(routeDataResponse.status, 200);
    const routeData = await routeDataResponse.json();
    assert.equal(Array.isArray(routeData.rows), true);
    assert.equal(routeData.limit, 20);
    const pagedResponse = await fetch(`${base}/api/route/decisions?limit=1&offset=0&q=final`);
    const paged = await pagedResponse.json();
    assert.equal(pagedResponse.status, 200);
    assert.equal(paged.limit, 1);
    assert.equal(paged.rows.length <= 1, true);
    assert.equal(paged.writes_performed, undefined);
    const exchangeResponse = await fetch(`${base}/api/route/evidence-exchange`);
    const exchange = await exchangeResponse.json();
    assert.equal(exchangeResponse.status, 200);
    assert.equal(exchange.payload_exposed, false);
    assert.equal(exchange.route_summary.payload_exposed, false);
    assert.deepEqual(exchange.migration_capability.supported_from_versions, [1]);
    assert.equal(exchange.migration_capability.mode, "validation_only");
    assert.equal(exchange.migration_capability.candidate_payload_exposed, false);
    assert.equal(exchange.migration_capability.writes_allowed, false);
    assert.equal(exchange.migration_readiness_capability.policy, "validated_source_schema_migration_readiness_approval_plan");
    assert.equal(exchange.migration_readiness_capability.mode, "read_only_approval_plan");
    assert.equal(exchange.migration_readiness_capability.target_read_performed, false);
    assert.equal(exchange.migration_readiness_capability.candidate_validation_performed, false);
    assert.equal(exchange.migration_readiness_capability.candidate_payload_exposed, false);
    assert.equal(exchange.migration_readiness_capability.writes_allowed, false);
    assert.equal(exchange.comparison_capability.policy, "digest_and_count_delta_only");
    assert.equal(exchange.comparison_capability.target_read_performed, false);
    assert.equal(exchange.comparison_capability.payload_exposed, false);
    assert.equal(exchange.comparison_capability.writes_allowed, false);
    assert.equal(exchange.assertion_capability.policy, "expected_sha256_only_no_file_read");
    assert.equal(exchange.assertion_capability.assertion_performed, false);
    assert.equal(exchange.assertion_capability.target_file_read, false);
    assert.equal(exchange.assertion_capability.writes_allowed, false);
    assert.equal(exchange.import_preflight_capability.policy, "stat_before_read_with_2mb_limit");
    assert.equal(exchange.import_preflight_capability.target_stat_performed, false);
    assert.equal(exchange.import_preflight_capability.target_parse_performed, false);
    assert.equal(exchange.import_preflight_capability.writes_allowed, false);
    assert.equal(exchange.target_path_capability.policy, "realpath_contained_no_symlinks");
    assert.equal(exchange.target_path_capability.target_check_performed, false);
    assert.equal(exchange.target_path_capability.realpath_check_performed, false);
    assert.equal(exchange.target_path_capability.symlink_check_performed, false);
    assert.equal(exchange.file_handle_capability.policy, "single_fd_fstat_read_with_post_open_path_recheck");
    assert.equal(exchange.file_handle_capability.target_open_performed, false);
    assert.equal(exchange.file_handle_capability.target_read_performed, false);
    assert.equal(exchange.file_handle_capability.post_open_path_recheck_performed, false);
    assert.equal(typeof exchange.digest_sha256, "string");
    assert.equal(typeof exchange.content_digest_sha256, "string");
    assert.equal(exchange.route_summary.exact_digest_sha256, exchange.digest_sha256);
    assert.equal(exchange.route_summary.content_digest_sha256, exchange.content_digest_sha256);
    assert.equal(exchange.route_summary.truncation_metadata_status, "valid");
    assert.equal(exchange.validation.schema_shape_status, "valid");
    assert.equal(exchange.route_summary.schema_shape_status, "valid");
    assert.equal(exchange.validation.record_validation_status, "valid");
    assert.equal(exchange.route_summary.record_validation_status, "valid");
    assert.equal(exchange.validation.complexity.status, "valid");
    assert.equal(exchange.route_summary.complexity_status, "valid");
    assert.equal(exchange.digest_availability.exact_digest_status, "available");
    assert.equal(exchange.route_summary.exact_digest_status, "available");
    assert.equal(exchange.validation.generated_at.status, "valid");
    assert.equal(exchange.route_summary.generated_at_status, "valid");
    assert.equal(exchange.validation.temporal_consistency.status, "valid");
    assert.equal(exchange.route_summary.temporal_consistency_status, "valid");
    assert.equal(exchange.validation.collection_ordering.status, "valid");
    assert.equal(exchange.route_summary.collection_ordering_status, "valid");
    assert.equal(exchange.validation.duplicate_records.status, "valid");
    assert.equal(exchange.route_summary.duplicate_record_status, "valid");
    assert.equal(exchange.validation.finding_budget.findings_truncated, false);
    assert.equal(exchange.route_summary.validation_findings_truncated, false);
    assert.equal(exchange.validation.phase_execution.status, "complete");
    assert.equal(exchange.route_summary.validation_phase_execution_status, "complete");
    assert.equal(exchange.validation.finding_attribution.unattributed_finding_count, 0);
    assert.equal(exchange.route_summary.unattributed_validation_finding_count, 0);
    assert.equal(exchange.completeness.policy, "all_collections_complete_and_exact");
    assert.equal(["complete", "incomplete"].includes(exchange.completeness.status), true);
    assert.equal(exchange.route_summary.completeness_status, exchange.completeness.status);
    assert.equal(exchange.byte_budget.payload_bytes, exchange.route_summary.payload_bytes);
    assert.equal(exchange.byte_budget.payload_byte_status, exchange.route_summary.payload_byte_status);
    assert.equal(exchange.route_summary.payload_byte_budget_policy, "exact_utf8_json_bytes_with_80_percent_warning");
    assert.equal(typeof exchange.collection_truncation.decisions.truncation_status, "string");
    assert.equal(JSON.stringify(exchange).includes("\"payload\""), false);
    assert.equal((await fetch(`${base}/api/state`, { method: "POST" })).status, 405);
    assert.equal((await fetch(`${base}/api/route/not-a-route`)).status, 404);
    assert.equal((await fetch(`${base}/control/%2e%2e/%2e%2e/README.md`)).status, 404);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("panel server enforces loopback-only bounded realpath-contained reads", async () => {
  assert.equal(PANEL_READ_CONTRACT.policy, "loopback_read_only_realpath_contained_single_handle_max_bytes");
  assert.deepEqual(PANEL_READ_CONTRACT.allowed_hosts, ["127.0.0.1", "::1"]);
  assert.equal(PANEL_READ_CONTRACT.max_state_file_bytes, 1_000_000);
  assert.equal(PANEL_READ_CONTRACT.max_static_file_bytes, 1_000_000);
  assert.equal(PANEL_READ_CONTRACT.metadata_failure_policy, "structured_fail_closed_no_throw");
  assert.equal(PANEL_READ_CONTRACT.close_failure_reason, "file_close_failed");
  assert.equal(PANEL_READ_CONTRACT.startup_failure_policy, "structured_payload_free_without_raw_error");
  assert.equal(PANEL_READ_CONTRACT.startup_failure_error, "panel_start_failed");
  assert.equal(PANEL_READ_CONTRACT.raw_startup_error_exposed, false);
  assert.equal(PANEL_READ_CONTRACT.payload_exposed_on_failure, false);
  assert.equal(PANEL_READ_CONTRACT.writes_allowed, false);
  assert.throws(
    () => startPanelServer({ host: "0.0.0.0", port: 0 }),
    /loopback host/
  );

  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-root-"));
  const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-outside-"));
  fs.mkdirSync(path.join(projectRoot, "control"), { recursive: true });
  fs.mkdirSync(path.join(projectRoot, ".pala"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "control", "safe.txt"), "safe", "utf8");
  fs.writeFileSync(path.join(projectRoot, "control", "oversized.txt"), "x".repeat(64), "utf8");
  fs.writeFileSync(path.join(outsideRoot, "secret.txt"), "must-never-be-returned", "utf8");
  fs.writeFileSync(path.join(outsideRoot, "dashboard-state.json"), JSON.stringify({ token: "must-never-be-returned" }), "utf8");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, "control", "linked"), process.platform === "win32" ? "junction" : "dir");
  fs.symlinkSync(outsideRoot, path.join(projectRoot, ".pala", "state"), process.platform === "win32" ? "junction" : "dir");

  const server = createPanelServer({
    projectRoot,
    ensureRoutes: false,
    maxStateFileBytes: 32,
    maxStaticFileBytes: 32
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const safe = await fetch(`${base}/control/safe.txt`);
    assert.equal(safe.status, 200);
    assert.equal(await safe.text(), "safe");

    const safeHead = await fetch(`${base}/control/safe.txt`, { method: "HEAD" });
    assert.equal(safeHead.status, 200);
    assert.equal(await safeHead.text(), "");

    const linked = await fetch(`${base}/control/linked/secret.txt`);
    assert.equal(linked.status, 403);
    assert.doesNotMatch(await linked.text(), /must-never-be-returned/);

    const oversized = await fetch(`${base}/control/oversized.txt`);
    assert.equal(oversized.status, 413);
    assert.doesNotMatch(await oversized.text(), /x{16}/);

    const state = await fetch(`${base}/api/state`);
    assert.equal(state.status, 503);
    assert.doesNotMatch(await state.text(), /must-never-be-returned/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("panel startup failures expose only fixed errors and validated codes", () => {
  const failure = new Error("must-never-be-exposed C:\\Users\\Private\\panel.txt");
  failure.code = "EADDRINUSE";
  assert.deepEqual(panelStartupFailureResult(failure), {
    status: "blocked",
    error: "panel_start_failed",
    error_code: "EADDRINUSE",
    raw_error_exposed: false,
    payload_exposed_on_failure: false
  });
  assert.doesNotMatch(JSON.stringify(panelStartupFailureResult(failure)), /must-never-be-exposed|Private|panel\.txt|Error:/);
  assert.equal(panelStartupFailureResult({ code: "unsafe code with payload" }).error_code, null);
});

test("panel server fails closed without exposing a file body when descriptor close fails", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-close-failure-"));
  fs.mkdirSync(path.join(projectRoot, "control"), { recursive: true });
  fs.writeFileSync(path.join(projectRoot, "control", "safe.txt"), "must-never-be-returned", "utf8");

  const server = createPanelServer({
    projectRoot,
    ensureRoutes: false
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const originalCloseSync = fs.closeSync;
    let closeFailureInjected = false;
    fs.closeSync = (fileDescriptor) => {
      originalCloseSync(fileDescriptor);
      if (!closeFailureInjected) {
        closeFailureInjected = true;
        const error = new Error("injected panel file close failure");
        error.code = "EIO";
        throw error;
      }
    };
    try {
      const failed = await fetch(`${base}/control/safe.txt`);
      assert.equal(failed.status, 503);
      assert.doesNotMatch(await failed.text(), /must-never-be-returned/);
    } finally {
      fs.closeSync = originalCloseSync;
    }

    const recovered = await fetch(`${base}/control/safe.txt`);
    assert.equal(recovered.status, 200);
    assert.equal(await recovered.text(), "must-never-be-returned");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("panel route data discards pending rows when the read-only database close fails", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-db-close-failure-"));
  const dbPath = path.join(projectRoot, ".pala", "db", "pala.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const setupDb = new DatabaseSync(dbPath);
  setupDb.exec(`
    CREATE TABLE decisions (
      decision_type TEXT,
      decision TEXT,
      reason TEXT,
      risk_level TEXT,
      required_approval INTEGER,
      evidence_path TEXT,
      created_at TEXT
    );
    INSERT INTO decisions VALUES (
      'test',
      'manual_verification_required',
      'must-never-be-returned',
      'low',
      0,
      NULL,
      '2026-06-04T00:00:00.000Z'
    );
  `);
  setupDb.close();

  const server = createPanelServer({
    projectRoot,
    dbPath,
    ensureRoutes: false
  });
  const listener = server.listeners("request")[0];
  const invokeRoute = () => {
    const response = {
      statusCode: null,
      headers: null,
      body: "",
      writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
      },
      end(body = "") {
        this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
      }
    };
    assert.doesNotThrow(() => listener({ method: "GET", url: "/api/route/decisions" }, response));
    return response;
  };

  const originalClose = DatabaseSync.prototype.close;
  let closeFailureInjected = false;
  DatabaseSync.prototype.close = function closeWithInjectedFailure() {
    originalClose.call(this);
    if (!closeFailureInjected) {
      closeFailureInjected = true;
      throw new Error("injected panel database close failure");
    }
  };
  let failed;
  try {
    failed = invokeRoute();
  } finally {
    DatabaseSync.prototype.close = originalClose;
  }

  assert.equal(PANEL_READ_CONTRACT.database_close_failure_reason, "route_database_close_failed");
  assert.equal(failed.statusCode, 503);
  assert.doesNotMatch(failed.body, /must-never-be-returned|\"rows\"/);
  const recovered = invokeRoute();
  assert.equal(recovered.statusCode, 200);
  assert.match(recovered.body, /must-never-be-returned/);
});

test("panel route responses enforce a content-free byte limit", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-route-byte-limit-"));
  const dbPath = path.join(projectRoot, ".pala", "db", "pala.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const setupDb = new DatabaseSync(dbPath);
  setupDb.exec(`
    CREATE TABLE decisions (
      decision_type TEXT,
      decision TEXT,
      reason TEXT,
      risk_level TEXT,
      required_approval INTEGER,
      evidence_path TEXT,
      created_at TEXT
    );
  `);
  setupDb.prepare(`
    INSERT INTO decisions VALUES ('test', 'manual_verification_required', ?, 'low', 0, NULL, '2026-06-04T00:00:00.000Z')
  `).run(`must-never-be-returned-${"x".repeat(512)}`);
  setupDb.close();

  const server = createPanelServer({
    projectRoot,
    dbPath,
    ensureRoutes: false,
    maxRouteResponseBytes: 256
  });
  const listener = server.listeners("request")[0];
  const invoke = (url) => {
    const response = {
      statusCode: null,
      body: "",
      writeHead(statusCode) {
        this.statusCode = statusCode;
      },
      end(body = "") {
        this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
      }
    };
    assert.doesNotThrow(() => listener({ method: "GET", url }, response));
    return response;
  };

  const oversized = invoke("/api/route/decisions");
  assert.equal(PANEL_READ_CONTRACT.max_route_response_bytes, 1_000_000);
  assert.equal(PANEL_READ_CONTRACT.route_response_limit_reason, "route_response_exceeds_byte_limit");
  assert.equal(oversized.statusCode, 503);
  assert.match(oversized.body, /route_response_exceeds_byte_limit/);
  assert.doesNotMatch(oversized.body, /must-never-be-returned|\"rows\"|x{32}/);
  const health = invoke("/health");
  assert.equal(health.statusCode, 200);
});

test("panel route data is discarded when the database path changes after read", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-db-post-read-path-"));
  const dbPath = path.join(projectRoot, ".pala", "db", "pala.sqlite");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const setupDb = new DatabaseSync(dbPath);
  setupDb.exec(`
    CREATE TABLE decisions (
      decision_type TEXT,
      decision TEXT,
      reason TEXT,
      risk_level TEXT,
      required_approval INTEGER,
      evidence_path TEXT,
      created_at TEXT
    );
    INSERT INTO decisions VALUES (
      'test',
      'manual_verification_required',
      'must-never-be-returned',
      'low',
      0,
      NULL,
      '2026-06-04T00:00:00.000Z'
    );
  `);
  setupDb.close();

  const server = createPanelServer({
    projectRoot,
    dbPath,
    ensureRoutes: false
  });
  const listener = server.listeners("request")[0];
  const response = {
    statusCode: null,
    body: "",
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body = "") {
      this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    }
  };
  const originalClose = DatabaseSync.prototype.close;
  let pathChangeInjected = false;
  DatabaseSync.prototype.close = function closeAndChangeDatabasePath() {
    originalClose.call(this);
    if (!pathChangeInjected) {
      pathChangeInjected = true;
      fs.renameSync(dbPath, `${dbPath}.replaced`);
      fs.mkdirSync(dbPath);
    }
  };
  try {
    assert.doesNotThrow(() => listener({ method: "GET", url: "/api/route/decisions" }, response));
  } finally {
    DatabaseSync.prototype.close = originalClose;
  }

  assert.equal(PANEL_READ_CONTRACT.database_post_read_path_recheck, true);
  assert.equal(PANEL_READ_CONTRACT.database_path_change_reason, "route_database_path_changed_after_read");
  assert.equal(pathChangeInjected, true);
  assert.equal(response.statusCode, 503);
  assert.match(response.body, /route_database_path_changed_after_read/);
  assert.doesNotMatch(response.body, /must-never-be-returned|\"rows\"/);
});

test("panel state HEAD validates JSON with the same status as GET", async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-state-head-"));
  const statePath = path.join(projectRoot, ".pala", "state", "dashboard-state.json");
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, "{must-never-be-returned", "utf8");
  const server = createPanelServer({
    projectRoot,
    statePath,
    ensureRoutes: false
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    const base = `http://127.0.0.1:${address.port}`;
    const getResponse = await fetch(`${base}/api/state`);
    const headResponse = await fetch(`${base}/api/state`, { method: "HEAD" });
    assert.equal(PANEL_READ_CONTRACT.state_head_validation_policy, "same_validation_status_as_get_without_body");
    assert.equal(getResponse.status, 503);
    assert.equal(headResponse.status, getResponse.status);
    assert.doesNotMatch(await getResponse.text(), /must-never-be-returned/);
    assert.equal(await headResponse.text(), "");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("panel static HEAD performs the same bounded read as GET without a body", () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pala-panel-static-head-"));
  const staticPath = path.join(projectRoot, "control", "overview", "index.html");
  fs.mkdirSync(path.dirname(staticPath), { recursive: true });
  fs.writeFileSync(staticPath, "must-never-be-returned", "utf8");
  const server = createPanelServer({
    projectRoot,
    ensureRoutes: false
  });
  const listener = server.listeners("request")[0];
  const response = () => ({
    statusCode: null,
    body: "",
    writeHead(statusCode) {
      this.statusCode = statusCode;
    },
    end(body = "") {
      this.body = Buffer.isBuffer(body) ? body.toString("utf8") : String(body);
    }
  });
  const getResponse = response();
  const headResponse = response();
  const originalReadSync = fs.readSync;
  fs.readSync = () => {
    throw new Error("injected static file read failure");
  };
  try {
    listener({ method: "GET", url: "/control/overview/" }, getResponse);
    listener({ method: "HEAD", url: "/control/overview/" }, headResponse);
  } finally {
    fs.readSync = originalReadSync;
  }

  assert.equal(PANEL_READ_CONTRACT.static_head_validation_policy, "same_read_status_as_get_without_body");
  assert.equal(getResponse.statusCode, 503);
  assert.equal(headResponse.statusCode, getResponse.statusCode);
  assert.doesNotMatch(getResponse.body, /must-never-be-returned/);
  assert.equal(headResponse.body, "");
});
