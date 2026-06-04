#!/usr/bin/env node
import process from "node:process";
import {
  ACTION_PLAN_USER_INPUT_CONTRACT,
  ARCHIVE_INVENTORY_CONTRACT,
  N8N_IMPORT_INSPECTION_CONTRACT,
  PLAN_SOURCE_TRUTH_CONTRACT,
  buildArchivePlan,
  buildAutopilotPlan,
  buildAutopilotRunGate,
  buildDriftFixPlan,
  buildExternalSkillProposal,
  buildLocaleSyncPlan,
  buildN8nImportPlan,
  buildN8nPlan,
  buildRefactorPlan,
  buildWorkerRunPlan
} from "./lib/action-plans.ts";
import {
  DATABASE_PATH_INSPECTION_CONTRACT,
  DATABASE_SCHEMA_EXECUTION_CONTRACT,
  KERNEL_BOOTSTRAP_CONTRACT,
  beginCommand,
  beginRun,
  bootstrapKernel,
  dbStatus,
  ensureKernel,
  makeId,
  nowIso,
  openDatabase,
  inspectDatabaseSchema
} from "./lib/db.ts";
import { DECISION_RECORD_CONTRACT, recordDecision } from "./lib/decision-engine.ts";
import { DECISION_REVIEW_AGING_POLICY, buildDecisionReviewQueue } from "./lib/decision-review.ts";
import { CONTROL_ROUTES, DASHBOARD_GENERATION_CONTRACT, dashboardState, ensureDashboardRoutes, generateDashboardRoutes } from "./lib/dashboard.ts";
import { CLI_COMMAND_RECORD_CONTRACT, buildCliCommandRecord } from "./lib/cli-command.ts";
import { CLI_FINALIZATION_CONTRACT, finalizeCliCommand } from "./lib/cli-finalization.ts";
import { CLI_OUTPUT_CONTRACT, cliFailureResult, unknownCliCommandResult, writeCliOutputAfterDatabaseClose, writeTopLevelCliFailure } from "./lib/cli-output.ts";
import { CONTRACT_TEXT_READ_CONTRACT, createContractTextReader } from "./lib/contract-text.ts";
import { LATEST_EVIDENCE_CONTRACT, PUBLIC_EVIDENCE_WRITE_CONTRACT, RAW_EVIDENCE_WRITE_CONTRACT, latestEvidence } from "./lib/evidence.ts";
import { EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY, EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY, EVIDENCE_EXCHANGE_CONTRACT, EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT, EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY, EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY, EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY, EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY, EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY, EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY, assertEvidenceExchangeContentDigest, buildSanitizedEvidenceExport, checkEvidenceExchangeCompleteness, compareEvidenceExchangeTarget, inspectEvidenceImport, inspectEvidenceMigration, planEvidenceExchangeImport, planEvidenceExchangeMigrationReadiness, writeSanitizedEvidenceExport } from "./lib/evidence-exchange.ts";
import { LEDGER_APPEND_CONTRACT } from "./lib/ledger.ts";
import { LEDGER_REPAIR_WRITE_CONTRACT, LEDGER_SAFETY_SCAN_CONTRACT, inspectLedgerSafety, repairLedgerSafety } from "./lib/ledger-safety.ts";
import { INTERACTIVE_MISTAKE_CONTRACT, collectInteractiveMistake } from "./lib/interactive-memory.ts";
import { CLAUDE_SYNC_INSPECTION_CONTRACT, MEMORY_REGISTRY_APPEND_CONTRACT, MEMORY_REGISTRY_SCAN_CONTRACT, addMistake, claudeSyncDryRun, inspectMemoryRegistry, memoryStatus, promoteRuleDryRun } from "./lib/memory.ts";
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
} from "./lib/operations.ts";
import { estimateTokenBudget, recordTokenUsage, tokenSummary } from "./lib/token-economy.ts";
import { runRuntimeCheck } from "./commands/runtime-check.ts";
import { PANEL_READ_CONTRACT } from "./panel-server.ts";
import { DRIFT_TEXT_READ_CONTRACT, inspectDrift } from "./lib/drift.ts";
import { MCP_FIXTURE_INSPECTION_CONTRACT, planMcpRepair } from "./lib/mcp-dry-run.ts";
import { inspectPushReadiness } from "./lib/push-readiness.ts";
import { QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT, inspectDocsHonesty, inspectHardcodedPaths, inspectQualityRadar, inspectQualityRequiredArtifacts, PUBLIC_CLAIM_FILES } from "./lib/quality-radar.ts";
import { inspectPublicReadiness, PUBLIC_READINESS_INSPECTION_CONTRACT } from "./lib/public-readiness.ts";
import { REFERENCE_REFRESH_WRITE_CONTRACT, referenceCoverage, referenceRadarState, referenceRows as getReferenceRows, refreshReferenceRadar } from "./lib/reference-radar.ts";
import { RUNTIME_OBSERVATION_CONTRACT, RUNTIME_PROJECT_ASSET_CONTRACT, inspectRuntimeProjectAssets } from "./lib/runtime.ts";
import {
  ARCHITECTURE_PATH_INSPECTION_CONTRACT,
  CLAUDE_SKILL_INSPECTION_CONTRACT,
  buildCodeMap,
  inspectArchitecture,
  inspectClaudeAssets,
  inspectDeadCode,
  inspectDuplicates,
  inspectExamples,
  inspectPlaybooks,
  inspectPrompts,
  inspectTestGaps,
  REPO_SCAN_CONTRACT
} from "./lib/repo-inspection.ts";
import { REPO_PATH_INSPECTION_CONTRACT, REPO_PATH_PRESENCE_CONTRACT, createBoundedRepoTextReader, inspectRepoPathPresence } from "./lib/repo-scan.ts";
import { blockerIdsForVerificationFailure } from "./lib/state-refresh.ts";
import { STATE_FILE_IO_CONTRACT, readBoundedStateJson } from "./lib/state-file.ts";
import { inspectGitStatus, inspectSync, SYNC_OBSERVATION_CONTRACT } from "./lib/sync.ts";
import { WORKFLOW_INSPECTION_CONTRACT, inspectWorkflowContracts } from "./lib/workflow-contract.ts";

const REQUIRED_LIBS = [
  "src/lib/db.ts",
  "src/lib/ledger.ts",
  "src/lib/ledger-lock.ts",
  "src/lib/evidence.ts",
  "src/lib/evidence-exchange.ts",
  "src/lib/memory.ts",
  "src/lib/redaction.ts",
  "src/lib/decision-engine.ts",
  "src/lib/decision-review.ts",
  "src/lib/token-economy.ts",
  "src/lib/completion.ts",
  "src/lib/cli-command.ts",
  "src/lib/cli-finalization.ts",
  "src/lib/cli-output.ts",
  "src/lib/contract-text.ts",
  "src/lib/paths.ts",
  "src/lib/runtime.ts",
  "src/lib/reference-radar.ts",
  "src/lib/drift.ts",
  "src/lib/sync.ts",
  "src/lib/push-readiness.ts",
  "src/lib/mcp-dry-run.ts",
  "src/lib/public-readiness.ts",
  "src/lib/quality-radar.ts",
  "src/lib/repo-scan.ts",
  "src/lib/repo-inspection.ts",
  "src/lib/state-refresh.ts",
  "src/lib/state-file.ts",
  "src/lib/operations.ts",
  "src/lib/ledger-safety.ts",
  "src/lib/interactive-memory.ts",
  "src/lib/action-plans.ts",
  "src/lib/workflow-contract.ts",
  "src/lib/panel-data.ts",
  "src/worker.ts",
  "src/panel-server.ts"
];

const REQUIRED_COMMANDS = [
  "pala db init",
  "pala db status",
  "pala runtime-check",
  "pala status",
  "pala memory check",
  "pala memory list",
  "pala memory add-mistake",
  "pala memory add-mistake --interactive",
  "pala memory promote-rule --dry-run",
  "pala memory sync-claude --dry-run",
  "pala plan --goal",
  "pala decision-review",
  "pala token-budget --goal",
  "pala reference-check",
  "pala reference-refresh --dry-run",
  "pala benchmark-refresh --dry-run",
  "pala benchmark-check",
  "pala competitor-lessons",
  "pala stop-if-risk",
  "pala next-actions",
  "pala dashboard-state",
  "pala evidence last",
  "pala evidence export --dry-run",
  "pala evidence export --apply --target",
  "pala evidence import --dry-run --target",
  "pala evidence import --target",
  "pala evidence compare --dry-run --target",
  "pala evidence assert-content --content-digest",
  "pala evidence completeness-check",
  "pala evidence migrate --dry-run --target",
  "pala evidence migrate --target",
  "pala evidence schema-check",
  "pala drift-check --quick",
  "pala token-economy",
  "pala verify",
  "pala drift-check",
  "pala sync-check",
  "pala push-check",
  "pala quality-radar",
  "pala token-language-check",
  "pala copy-check",
  "pala positioning-check",
  "pala setup --repair --dry-run --all",
  "pala setup --check --all",
  "pala setup --remove --dry-run --all",
  "pala mcp-smoke --dry-run",
  "pala dashboard-truth-check",
  "pala docs-honesty-check",
  "pala public-readiness-check",
  "pala workflow-check",
  "pala architecture-check",
  "pala code-map",
  "pala duplicate-check",
  "pala dead-code-check",
  "pala test-gap-check",
  "pala playbook-check",
  "pala prompt-radar",
  "pala examples-check",
  "pala skills-check",
  "pala hooks-check",
  "pala agents-check",
  "pala doctor",
  "pala admin-check",
  "pala worker-check",
  "pala worker-run --dry-run",
  "pala n8n-check",
  "pala n8n-plan",
  "pala n8n-import --dry-run --target",
  "pala language-policy-check",
  "pala i18n-check",
  "pala rollback-check",
  "pala refactor-check",
  "pala smart-suggestions",
  "pala surprise-check",
  "pala external-skills-refresh",
  "pala external-skill-propose",
  "pala opportunity-radar",
  "pala autopilot-plan --goal",
  "pala autopilot-run --dry-run --goal",
  "pala drift-fix",
  "pala archive-old",
  "pala locale-sync",
  "pala refactor-plan",
  "pala ledger-safety-check",
  "pala ledger-redact --dry-run",
  "pala panel"
];

const ACTION_PLAN_COMMANDS = new Set([
  "worker-run",
  "n8n-plan",
  "n8n-import",
  "autopilot-plan",
  "autopilot-run",
  "external-skill-propose",
  "drift-fix",
  "archive-old",
  "locale-sync",
  "refactor-plan"
]);

const KNOWN_TOP_LEVEL_COMMANDS = new Set([
  ...REQUIRED_COMMANDS.map((command) => command.split(" ")[1]),
  "help",
  "--help",
  "-h"
]);

function option(args, name) {
  const flag = `--${name}`;
  const index = args.indexOf(flag);
  if (index === -1) {
    return null;
  }
  const next = args[index + 1];
  return next && !next.startsWith("--") ? next : "";
}

function hasFlag(args, name) {
  return args.includes(`--${name}`);
}

const cliTextReader = createContractTextReader();

function readText(relativePath) {
  return cliTextReader.read(relativePath);
}

function exists(relativePath) {
  return inspectRepoPathPresence(relativePath).present;
}

function recordQualityFindings(db, runId, findings) {
  for (const finding of findings) {
    db.prepare(`
      INSERT INTO quality_findings (id, run_id, category, severity, summary, file_path, status, evidence_path, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      makeId("quality"),
      runId,
      finding.category || "quality-radar",
      finding.severity || "medium",
      finding.summary,
      finding.file || null,
      "open",
      finding.evidence_path || null,
      nowIso()
    );
  }
}

function referenceRows(db) {
  return db.prepare(`
    SELECT category, name, url, status, last_checked_at, lesson, pala_decision
    FROM reference_sources
    ORDER BY category, name
  `).all();
}

function decisionResult(ctx, type, goal, extra = {}) {
  const decision = recordDecision(ctx.db, {
    runId: ctx.runId,
    decisionType: type,
    goal,
    inputs: { args: ctx.args, goal, ...extra.inputs },
    assessment: extra.assessment,
    tokenBudget: extra.tokenBudget,
    confidence: extra.confidence || "medium",
    relatedRuleIds: extra.relatedRuleIds
  });
  return {
    status: decision.decision,
    decision,
    output: decision.decision
  };
}

function handleDb(args, ctx) {
  const sub = args[1];
  const schemaInspection = inspectDatabaseSchema();
  const database = dbStatus(ctx.db);
  const blockers = [...new Set([...schemaInspection.blockers, ...database.blockers])];
  if (sub === "init") {
    const kernelBootstrap = ensureKernel();
    ensureDashboardRoutes();
    return {
      status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
      blockers,
      message: "SQLite database initialized from .pala/schema/001_init.sql.",
      db: database,
      schema_inspection: schemaInspection,
      kernel_bootstrap: kernelBootstrap,
      kernel: {
        directories: [".pala/rules", ".pala/state", ".pala/ledger", ".pala/memory", ".pala/evidence", ".pala/evidence/raw", ".pala/archive", "docs/evidence", ".pala/schema"],
        gitignored_runtime: [".pala/db/*.sqlite", ".pala/evidence/raw/", ".pala/state/", ".pala/ledger/", ".pala/archive/"]
      }
    };
  }
  if (sub === "status") {
    return {
      status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
      blockers,
      db: database,
      schema_inspection: schemaInspection
    };
  }
  return { status: "blocked", exitCode: 1, error: "Unknown db command. Use: pala db init or pala db status." };
}

async function handleMemory(args, ctx) {
  const sub = args[1];
  if (sub === "check") {
    const category = option(args, "category") || "all";
    const registry = inspectMemoryRegistry();
    const memory = memoryStatus({ inspection: registry });
    const mistakes = registry.records.filter((mistake) => mistake.status !== "template");
    const matchingMistakes = category === "all" ? mistakes : mistakes.filter((mistake) => mistake.category === category);
    return {
      status: memory.status,
      blockers: memory.blockers,
      scan_complete: registry.scan_complete,
      memory,
      category,
      matching_mistakes: matchingMistakes,
      matching_mistakes_exact: registry.record_count_exact && !registry.records_truncated,
      findings: registry.findings,
      invalid_raw_line_exposed: false,
      writes_performed: false
    };
  }
  if (sub === "list") {
    const registry = inspectMemoryRegistry();
    const outputBlockers = [
      ...registry.blockers,
      ...(registry.records_truncated ? ["memory_registry_returned_record_limit_reached"] : [])
    ];
    return {
      status: registry.status === "safe_to_execute" && outputBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
      blockers: [...new Set(outputBlockers)],
      scan_complete: registry.scan_complete,
      record_count: registry.record_count,
      record_count_exact: registry.record_count_exact,
      records_truncated: registry.records_truncated,
      mistakes: registry.records.filter((mistake) => mistake.status !== "template"),
      templates: registry.records.filter((mistake) => mistake.status === "template"),
      findings: registry.findings,
      invalid_raw_line_exposed: false,
      writes_performed: false
    };
  }
  if (sub === "add-mistake") {
    const interactiveRequested = hasFlag(args, "interactive");
    const providedSummary = option(args, "summary");
    const inlineFieldsProvided = ["summary", "category", "root-cause", "severity", "prevention-rule"]
      .some((name) => option(args, name) !== null);
    let input;
    let promptResult = {
      interactive_requested: interactiveRequested,
      terminal_available: null,
      prompt_performed: false,
      prompt_count: 0,
      confirmation_requested: false,
      capture_confirmed: null
    };
    if (interactiveRequested && inlineFieldsProvided) {
      return {
        status: "blocked",
        exitCode: 1,
        interactive_requested: true,
        terminal_available: null,
        prompt_performed: false,
        writes_performed: false,
        blockers: ["interactive_and_inline_inputs_cannot_be_combined"],
        note: "Use either --interactive or inline mistake fields, not both."
      };
    }
    if (interactiveRequested) {
      const collected = await collectInteractiveMistake();
      const { input: collectedInput, ...safePromptResult } = collected;
      if (collected.status !== "safe_to_execute") {
        return {
          ...safePromptResult,
          interactive_requested: true,
          exitCode: collected.status === "blocked" ? 1 : 0
        };
      }
      input = collectedInput;
      promptResult = { ...safePromptResult, interactive_requested: true };
    } else if (!providedSummary) {
      return {
        status: "blocked",
        exitCode: 1,
        writes_performed: false,
        blockers: ["mistake_summary_required"],
        note: "Provide --summary or use --interactive from a real TTY."
      };
    } else {
      input = {
        summary: providedSummary,
        category: option(args, "category") || "implementation",
        rootCause: option(args, "root-cause") || null,
        severity: option(args, "severity") || "low",
        preventionRule: option(args, "prevention-rule") || null
      };
    }
    const result = addMistake(ctx.db, {
      runId: ctx.runId,
      ...input
    });
    return {
      status: "safe_to_execute",
      ...promptResult,
      writes_performed: true,
      note: "Mistake captured. Rule promotion remains approval-gated.",
      ...result
    };
  }
  if (sub === "promote-rule") {
    if (!hasFlag(args, "dry-run")) {
      return {
        status: "needs_approval",
        note: "Rule promotion changes policy files and requires explicit approval. Re-run with --dry-run to preview only."
      };
    }
    return promoteRuleDryRun();
  }
  if (sub === "sync-claude") {
    return hasFlag(args, "dry-run")
      ? claudeSyncDryRun()
      : {
          status: "needs_approval",
          dry_run: false,
          writes_performed: false,
          blockers: ["claude_md_write_requires_approval"],
          note: "Run with --dry-run to inspect the proposed CLAUDE.md sync."
        };
  }
  return { status: "blocked", exitCode: 1, error: "Unknown memory command." };
}

function handleSetup(args, ctx) {
  const selected = ["cursor", "claude", "codex", "claude-desktop"].filter((client) => hasFlag(args, client));
  const clients = hasFlag(args, "all") ? ["cursor", "claude", "codex", "claude-desktop"] : selected.length > 0 ? selected : ["selected-client"];
  const dryRun = hasFlag(args, "dry-run");
  const repair = hasFlag(args, "repair");
  const remove = hasFlag(args, "remove");
  const check = hasFlag(args, "check");
  const action = check ? "check" : remove ? "remove" : repair ? "repair" : "setup";
  const plan = planMcpRepair({ clients, action });
  const status = plan.status === "manual_verification_required" ? plan.status : check ? plan.status : dryRun ? plan.status : "needs_approval";

  for (const clientPlan of plan.plans) {
    ctx.db.prepare(`
      INSERT INTO mcp_config_checks
        (id, run_id, client, scope, action, dry_run, status, existing_servers_preserved, config_path_redacted, proposed_diff_json, evidence_path, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      makeId("mcp"),
      ctx.runId,
      clientPlan.client,
      "temp-fixture",
      check ? "check" : `${action}-plan`,
      dryRun || check ? 1 : 0,
      status,
      clientPlan.existing_servers_preserved ? 1 : 0,
      clientPlan.config_path_redacted,
      JSON.stringify(clientPlan.proposed_diff),
      null,
      nowIso()
    );
  }

  return {
    ...plan,
    status,
    dry_run: dryRun,
    check,
    repair,
    remove,
    clients,
    action,
    fixture_policy: "Tests and dry-runs use temporary HOME/USERPROFILE/APPDATA/XDG_CONFIG_HOME fixtures.",
    note: check
      ? "Read-only fixture check; no config change was proposed or attempted."
      : dryRun && remove
        ? "Dry-run only. Only recognized Pala-owned fixture entries would be removed; unrelated config is preserved."
        : dryRun
          ? "Dry-run only. Unrelated MCP servers and top-level config keys would be preserved."
          : "Real MCP config writes require explicit approval and backup."
  };
}

function handlePanel(ctx) {
  return {
    status: "safe_to_execute",
    message: "Read-only local panel server is available.",
    read_contract: PANEL_READ_CONTRACT,
    dashboard: dashboardState(ctx.db),
    start: "npm run panel",
    url: "http://127.0.0.1:4173/control/overview/",
    read_only: true
  };
}

function handleEvidenceCommand(args, ctx) {
  const sub = args[1];
  if (sub === "last") {
    const latest = latestEvidence();
    return {
      status: latest.status,
      blockers: latest.blockers,
      latest_evidence: latest
    };
  }
  if (sub === "export") {
    if (hasFlag(args, "apply")) {
      return writeSanitizedEvidenceExport(ctx.db, option(args, "target"));
    }
    const { payload, ...built } = buildSanitizedEvidenceExport(ctx.db);
    return {
      ...built,
      status: built.validation.status === "safe_to_execute" ? "dry_run_only" : built.validation.status,
      dry_run: true,
      writes_performed: false,
      note: "Dry-run built and validated a sanitized exchange in memory; no export file was written."
    };
  }
  if (sub === "import") {
    if (!hasFlag(args, "dry-run")) {
      return {
        ...planEvidenceExchangeImport(ctx.db, option(args, "target")),
        dry_run: false
      };
    }
    return { ...inspectEvidenceImport(option(args, "target")), dry_run: true };
  }
  if (sub === "schema-check") {
    return {
      status: "safe_to_execute",
      contract: EVIDENCE_EXCHANGE_CONTRACT,
      compatibility_policy: EVIDENCE_EXCHANGE_CONTRACT.compatibility_policy,
      writes_performed: false,
      note: "Local evidence exchange schema contract check; older or newer schema versions require reviewed migration."
    };
  }
  if (sub === "compare") {
    return {
      ...compareEvidenceExchangeTarget(ctx.db, option(args, "target")),
      dry_run: true
    };
  }
  if (sub === "assert-content") {
    return assertEvidenceExchangeContentDigest(ctx.db, option(args, "content-digest"));
  }
  if (sub === "completeness-check") {
    return checkEvidenceExchangeCompleteness(ctx.db);
  }
  if (sub === "migrate") {
    if (!hasFlag(args, "dry-run")) {
      return {
        ...planEvidenceExchangeMigrationReadiness(option(args, "target")),
        dry_run: false
      };
    }
    return { ...inspectEvidenceMigration(option(args, "target")), dry_run: true };
  }
  return { status: "blocked", exitCode: 1, error: "Unknown evidence command. Use: last, export --dry-run, import --dry-run --target, compare --dry-run --target, assert-content --content-digest, completeness-check, migrate --dry-run --target, migrate --target, or schema-check." };
}

function handleDriftCheck(args, ctx) {
  ensureDashboardRoutes();
  const result = inspectDrift(hasFlag(args, "quick"));
  ctx.db.prepare(`
    INSERT INTO drift_checks (id, run_id, checked_at, source, target, status, diff_summary, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    makeId("drift"),
    ctx.runId,
    nowIso(),
    "README/docs/control/state",
    hasFlag(args, "quick") ? "quick" : "full",
    result.status,
    result.failures.map((item) => item.name).join("; "),
    null
  );
  return result;
}

function handleSyncCheck(ctx) {
  const result = inspectSync();
  ctx.db.prepare(`
    INSERT INTO sync_checks (id, run_id, checked_at, scope, status, summary, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    makeId("sync"),
    ctx.runId,
    nowIso(),
    "git-worktree",
    result.status,
    result.changed_files_count_exact
      ? `${result.changed_files_count} changed/untracked files visible in bounded git status.`
      : `Git status observation incomplete: ${result.blockers.join(", ")}.`,
    null
  );
  return result;
}

function handlePushCheck(ctx) {
  const result = inspectPushReadiness();
  ctx.db.prepare(`
    INSERT INTO push_checks (id, run_id, checked_at, status, blockers_json, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(makeId("push"), ctx.runId, nowIso(), result.status, JSON.stringify(result.blockers), null);
  return result;
}

function handleQualityRadar(ctx) {
  ensureDashboardRoutes();
  ctx.db.prepare("UPDATE quality_findings SET status = 'resolved' WHERE category = 'quality-radar' AND status = 'open'").run();
  const result = inspectQualityRadar();
  recordQualityFindings(ctx.db, ctx.runId, result.findings);
  return result;
}

function handleDashboardTruthCheck(ctx) {
  const routeGeneration = generateDashboardRoutes();
  const routes = routeGeneration.routes;
  const failures = [];
  if (routeGeneration.status !== "safe_to_execute") {
    failures.push({ file: "control/", summary: "Dashboard route generation did not complete safely." });
  }
  for (const route of CONTROL_ROUTES) {
    const file = `control/${route}/index.html`;
    const text = readText(file);
    if (!text.includes("data-pala-source")) {
      failures.push({ file, summary: "Route does not declare truth data sources." });
    }
    if (!text.includes("Frontend reads truth. It does not create truth.")) {
      failures.push({ file, summary: "Route is missing dashboard truth contract." });
    }
    if (!text.includes("data-pala-snapshot=\".pala/state/dashboard-state.json\"")) {
      failures.push({ file, summary: "Route does not declare the current dashboard state snapshot." });
    }
    if (!text.includes("data-pala-api=\"/api/state\"") || !text.includes("data-pala-route-api=\"/api/route\"") || !text.includes("../control.js")) {
      failures.push({ file, summary: "Route does not consume the read-only local state API." });
    }
    if (!text.includes("id=\"route-filter\"") || !text.includes("id=\"route-prev\"") || !text.includes("id=\"route-next\"")) {
      failures.push({ file, summary: "Route is missing bounded search or pagination controls." });
    }
    if (!text.includes("id=\"route-summary\"")) {
      failures.push({ file, summary: "Route is missing the read-only route summary surface." });
    }
  }
  const controlScript = readText("control/control.js");
  if (!controlScript.includes("route_summary")) {
    failures.push({ file: "control/control.js", summary: "Dashboard script does not render route summary truth." });
  }
  const panelData = readText("src/lib/panel-data.ts");
  if (!panelData.includes("buildReferenceRefreshPlan") || !panelData.includes("route === \"benchmarks\"")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Benchmarks route is not backed by the bounded refresh plan." });
  }
  if (!panelData.includes("buildEvidenceExchangePreview") || !panelData.includes("route === \"evidence-exchange\"")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route is not backed by the payload-free preview." });
  }
  if (!panelData.includes("migration_capability") || !readText("src/lib/evidence-exchange.ts").includes("EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the payload-free migration capability contract." });
  }
  if (!panelData.includes("migration_readiness_capability") || !readText("src/lib/evidence-exchange.ts").includes("EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the payload-free migration-readiness capability." });
  }
  if (!panelData.includes("content_digest_sha256") || !readText("src/lib/evidence-exchange.ts").includes("evidenceExchangeContentDigest")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the stable content digest contract." });
  }
  if (!panelData.includes("comparison_capability") || !readText("src/lib/evidence-exchange.ts").includes("EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the target-free comparison capability contract." });
  }
  if (!panelData.includes("assertion_capability") || !readText("src/lib/evidence-exchange.ts").includes("EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the no-file assertion capability contract." });
  }
  if (!panelData.includes("collection_truncation") || !readText("src/lib/evidence-exchange.ts").includes("truncationMetadata")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose per-collection truncation truth." });
  }
  if (!panelData.includes("byte_budget: preview.byte_budget") || !readText("src/lib/evidence-exchange.ts").includes("evidenceExchangeByteBudget")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose exact payload byte-budget truth." });
  }
  if (!panelData.includes("import_preflight_capability") || !readText("src/lib/evidence-exchange.ts").includes("EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the target-free raw-file preflight capability." });
  }
  if (!panelData.includes("import_readiness_capability") || !readText("src/lib/evidence-exchange.ts").includes("EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the payload-free import-readiness capability." });
  }
  if (!panelData.includes("target_path_capability") || !readText("src/lib/evidence-exchange.ts").includes("inspectTargetPathSafety")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the target-free path-safety capability." });
  }
  if (!panelData.includes("file_handle_capability") || !readText("src/lib/evidence-exchange.ts").includes("inspectAndReadEvidenceTarget")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Evidence exchange route does not expose the target-free single-handle inspection capability." });
  }
  if (!panelData.includes("buildDecisionReviewQueue") || !panelData.includes("route === \"decision-review\"")) {
    failures.push({ file: "src/lib/panel-data.ts", summary: "Decision review route is not backed by the bounded read-only queue." });
  }
  return {
    status: failures.length === 0 ? "safe_to_execute" : "manual_verification_required",
    routes,
    route_generation: routeGeneration,
    failures,
    rule: "Frontend reads truth. It does not create truth."
  };
}

function handleDocsHonestyCheck() {
  const result = inspectDocsHonesty();
  return {
    ...result,
    checked_files: PUBLIC_CLAIM_FILES,
    note: "Public claim files are checked line-by-line; explicit negative/non-claim language remains allowed."
  };
}

function handlePublicReadinessCheck() {
  return inspectPublicReadiness();
}

function handleVerify(ctx) {
  ensureDashboardRoutes();
  const sync = handleSyncCheck(ctx);
  const pushReadiness = handlePushCheck(ctx);
  const mcpFixturePlan = planMcpRepair({ action: "check" });
  const dashboardTruth = handleDashboardTruthCheck(ctx);
  const workflowContracts = inspectWorkflowContracts();
  const publicReadiness = inspectPublicReadiness({ workflowContract: workflowContracts });
  const decisionReview = buildDecisionReviewQueue(ctx.db);
  const admin = inspectAdmin();
  const worker = inspectWorker();
  const n8n = inspectN8n();
  const i18n = inspectI18n();
  const externalSkills = inspectExternalSkillsDryRun();
  const opportunityRadar = inspectOpportunityRadar();
  const driftFixPlan = buildDriftFixPlan();
  const localeSyncPlan = buildLocaleSyncPlan();
  const n8nPlan = buildN8nPlan();
  const autopilotInputProbe = buildAutopilotPlan("bounded local verification");
  const externalSkillInputProbe = buildExternalSkillProposal("bounded local skill need");
  const stateFileReads = [
    ".pala/state/dashboard-state.json",
    ".pala/state/latest-command.json",
    ".pala/state/project-state.json",
    ".pala/state/control-tower-state.json",
    ".pala/state/reference-radar-state.json"
  ].map((file) => readBoundedStateJson(file, { fallback: {} }));
  const databaseSchema = inspectDatabaseSchema();
  const database = dbStatus(ctx.db);
  const databasePath = database.path_inspection;
  const kernelBootstrap = bootstrapKernel();
  const architecture = inspectArchitecture();
  const runtimeProjectAssets = inspectRuntimeProjectAssets();
  const qualityRequiredArtifacts = inspectQualityRequiredArtifacts();
  const cliPathPresence = inspectRepoPathPresence("src/cli.ts", { expectedKind: "file" });
  const driftSourceReads = inspectDrift(true);
  const ledgerSafety = inspectLedgerSafety();
  const memoryRegistry = inspectMemoryRegistry();
  const hardcodedPaths = inspectHardcodedPaths();
  const docsHonesty = inspectDocsHonesty();
  const latestModelEffort = ctx.db.prepare(`
    SELECT model_observed, effort_observed, evidence_path
    FROM operator_sessions ORDER BY started_at DESC LIMIT 1
  `).get();
  const releaseBlockers = [
    ...sync.blockers,
    ...pushReadiness.blockers
  ].filter((blocker, index, all) => all.indexOf(blocker) === index);
  const requiredDirs = [".pala/rules", ".pala/state", ".pala/ledger", ".pala/memory", ".pala/evidence", ".pala/evidence/raw", ".pala/archive", "docs/evidence", ".pala/schema"];
  const checks = [
    ...requiredDirs.map((dir) => ({ name: `${dir} exists`, ok: exists(dir), evidence: dir })),
    ...REQUIRED_LIBS.map((file) => ({ name: `${file} exists`, ok: exists(file), evidence: file })),
    { name: "DB file exists", ok: exists(".pala/db/pala.sqlite"), evidence: ".pala/db/pala.sqlite" },
    { name: "Bounded authorized database schema execution contract", ok: DATABASE_SCHEMA_EXECUTION_CONTRACT.policy === "bounded_project_contained_single_handle_schema_with_authorized_sqlite_execution" && DATABASE_SCHEMA_EXECUTION_CONTRACT.max_file_bytes === 1_000_000 && DATABASE_SCHEMA_EXECUTION_CONTRACT.authorizer_required === true && DATABASE_SCHEMA_EXECUTION_CONTRACT.defensive_mode_required === true && DATABASE_SCHEMA_EXECUTION_CONTRACT.attach_allowed === false && DATABASE_SCHEMA_EXECUTION_CONTRACT.load_extension_allowed === false && DATABASE_SCHEMA_EXECUTION_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && DATABASE_SCHEMA_EXECUTION_CONTRACT.close_failure_blocker === "database_schema_file_close_failed" && DATABASE_SCHEMA_EXECUTION_CONTRACT.payload_exposed === false && DATABASE_SCHEMA_EXECUTION_CONTRACT.payload_exposed_on_failure === false && databaseSchema.status === "safe_to_execute" && databaseSchema.single_file_handle_used === true && databaseSchema.content_stable_during_read === true && databaseSchema.payload_exposed === false && readText("docs/CLI.md").includes("bounded_project_contained_single_handle_schema_with_authorized_sqlite_execution") && readText("docs/CLI.md").includes("database_schema_file_close_failed") && readText("docs/ARCHITECTURE.md").includes("SQLite authorizer") && readText("src/lib/db.ts").includes("DATABASE_SCHEMA_EXECUTION_CONTRACT.close_failure_blocker"), evidence: "pala db status --strict/src/lib/db.ts" },
    { name: "Fixed contained database path metadata contract", ok: DATABASE_PATH_INSPECTION_CONTRACT.policy === "fixed_project_contained_database_path_metadata_only" && DATABASE_PATH_INSPECTION_CONTRACT.path === ".pala/db/pala.sqlite" && DATABASE_PATH_INSPECTION_CONTRACT.expected_kind === "file" && DATABASE_PATH_INSPECTION_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && DATABASE_PATH_INSPECTION_CONTRACT.payload_exposed === false && DATABASE_PATH_INSPECTION_CONTRACT.writes_allowed === false && database.status === "safe_to_execute" && databasePath.status === "safe_to_execute" && databasePath.exists === true && databasePath.kind === "file" && databasePath.payload_exposed === false && readText("docs/CLI.md").includes("fixed_project_contained_database_path_metadata_only") && readText("docs/ARCHITECTURE.md").includes("Database path observation") && !readText("src/lib/db.ts").includes("fs." + "existsSync"), evidence: "pala db status --strict/src/lib/db.ts" },
    { name: "Fixed contained create-only kernel bootstrap contract", ok: KERNEL_BOOTSTRAP_CONTRACT.policy === "fixed_project_contained_create_only_kernel_bootstrap" && KERNEL_BOOTSTRAP_CONTRACT.directory_count === 12 && KERNEL_BOOTSTRAP_CONTRACT.initialized_file_count === 9 && KERNEL_BOOTSTRAP_CONTRACT.protected_file_count === 11 && KERNEL_BOOTSTRAP_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && KERNEL_BOOTSTRAP_CONTRACT.concurrent_directory_creation_policy === "rechecked_eexist_tolerant" && KERNEL_BOOTSTRAP_CONTRACT.create_only === true && KERNEL_BOOTSTRAP_CONTRACT.atomic_create_link === true && KERNEL_BOOTSTRAP_CONTRACT.initialized_file_temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match" && KERNEL_BOOTSTRAP_CONTRACT.initialized_file_identity_safe_temp_cleanup === true && KERNEL_BOOTSTRAP_CONTRACT.initialized_file_post_publish_identity_policy === "temporary_and_initialized_file_dev_ino_match" && KERNEL_BOOTSTRAP_CONTRACT.existing_files_overwritten === false && KERNEL_BOOTSTRAP_CONTRACT.payload_exposed === false && kernelBootstrap.status === "safe_to_execute" && kernelBootstrap.directory_summary.safe_directory_count === KERNEL_BOOTSTRAP_CONTRACT.directory_count && kernelBootstrap.file_summary.failed_file_count === 0 && kernelBootstrap.unsafe_paths.length === 0 && readText("docs/CLI.md").includes("fixed_project_contained_create_only_kernel_bootstrap") && readText("docs/CLI.md").includes("rechecked_eexist_tolerant") && readText("docs/CLI.md").includes("write_handle_and_temporary_path_dev_ino_match") && readText("docs/CLI.md").includes("temporary_and_initialized_file_dev_ino_match") && readText("docs/ARCHITECTURE.md").includes("Kernel bootstrap") && readText("src/lib/db.ts").includes("unlinkIfSameFileIdentity") && readText("src/lib/db.ts").includes("sameFileIdentity"), evidence: "pala db init/src/lib/db.ts" },
    { name: "Bounded drift contract source-read contract", ok: DRIFT_TEXT_READ_CONTRACT.policy === "bounded_cached_contract_text_reads_with_shared_budget" && DRIFT_TEXT_READ_CONTRACT.max_file_bytes === 2_000_000 && DRIFT_TEXT_READ_CONTRACT.max_total_text_bytes === 20_000_000 && DRIFT_TEXT_READ_CONTRACT.post_read_path_recheck === true && DRIFT_TEXT_READ_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && DRIFT_TEXT_READ_CONTRACT.payload_exposed === false && DRIFT_TEXT_READ_CONTRACT.payload_exposed_on_failure === false && DRIFT_TEXT_READ_CONTRACT.writes_allowed === false && driftSourceReads.scan_complete === true && driftSourceReads.text_read.scan_complete === true && driftSourceReads.text_read.payload_exposed === false && readText("docs/CLI.md").includes("bounded_cached_contract_text_reads_with_shared_budget") && readText("docs/CLI.md").includes("repo_text_file_close_failed") && readText("docs/ARCHITECTURE.md").includes("shared 20 MB"), evidence: "pala drift-check --strict" },
    { name: "CLI final output and failure payload contract", ok: CLI_OUTPUT_CONTRACT.policy === "close_database_before_stdout_json" && CLI_OUTPUT_CONTRACT.max_output_bytes === 5_000_000 && CLI_OUTPUT_CONTRACT.serialization_preflight_before_database_close === true && CLI_OUTPUT_CONTRACT.serialization_failure_error === "cli_output_blocked:serialization_failed" && CLI_OUTPUT_CONTRACT.output_byte_limit_error === "cli_output_blocked:output_exceeds_byte_limit" && CLI_OUTPUT_CONTRACT.unsafe_output_policy === "payload_free_failure_json_after_database_close" && CLI_OUTPUT_CONTRACT.database_close_failure_error === "cli_output_blocked:database_close_failed" && CLI_OUTPUT_CONTRACT.top_level_failure_policy === "nonzero_without_raw_stack_or_pending_payload" && CLI_OUTPUT_CONTRACT.top_level_failure_error === "cli_top_level_failed" && CLI_OUTPUT_CONTRACT.top_level_failure_output_policy === "fixed_payload_free_json_best_effort" && CLI_OUTPUT_CONTRACT.command_failure_policy === "structured_payload_free_without_stack" && CLI_OUTPUT_CONTRACT.command_failure_error === "cli_command_failed" && CLI_OUTPUT_CONTRACT.unknown_command_policy === "structured_payload_free_without_raw_command" && CLI_OUTPUT_CONTRACT.unknown_command_error === "unknown_command" && CLI_OUTPUT_CONTRACT.raw_unknown_command_exposed === false && CLI_OUTPUT_CONTRACT.raw_error_exposed === false && CLI_OUTPUT_CONTRACT.stack_exposed === false && CLI_OUTPUT_CONTRACT.payload_exposed_on_failure === false && readText("docs/CLI.md").includes("close_database_before_stdout_json") && readText("docs/CLI.md").includes("payload_free_failure_json_after_database_close") && readText("docs/CLI.md").includes("fixed_payload_free_json_best_effort") && readText("docs/CLI.md").includes("structured_payload_free_without_stack") && readText("docs/CLI.md").includes("structured_payload_free_without_raw_command") && readText("docs/ARCHITECTURE.md").includes("CLI final output") && readText("docs/ARCHITECTURE.md").includes("Unknown top-level commands") && readText("src/cli.ts").includes("unknownCliCommandResult(REQUIRED_COMMANDS)") && readText("src/cli.ts").includes("\"command-unknown\"") && readText("src/cli.ts").includes("writeCliOutputAfterDatabaseClose(db, output)") && readText("src/cli.ts").includes("writeTopLevelCliFailure(error)") && readText("src/cli.ts").includes("cliFailureResult(error)") && !readText("src/cli.ts").includes("process.stdout." + "write") && !readText("src/cli.ts").includes("error." + "stack") && !readText("src/cli.ts").includes("Unknown command:" + " ${name}") && readText("src/lib/cli-output.ts").includes("CLI_OUTPUT_CONTRACT.database_close_failure_error") && readText("src/lib/cli-output.ts").includes("CLI_OUTPUT_CONTRACT.output_byte_limit_error") && readText("src/lib/cli-output.ts").includes("CLI_OUTPUT_CONTRACT.top_level_failure_error") && readText("src/lib/cli-output.ts").includes("CLI_OUTPUT_CONTRACT.command_failure_error") && readText("src/lib/cli-output.ts").includes("CLI_OUTPUT_CONTRACT.unknown_command_error"), evidence: "src/cli.ts/src/lib/cli-output.ts" },
    { name: "CLI finalization write outcome contract", ok: CLI_FINALIZATION_CONTRACT.policy === "explicit_outcome_cli_finalization_before_database_close" && CLI_FINALIZATION_CONTRACT.required_steps.length === 5 && CLI_FINALIZATION_CONTRACT.step_outcomes.join(",") === "not_attempted,confirmed,unknown_after_attempt" && CLI_FINALIZATION_CONTRACT.write_failure_policy === "manual_verification_required_exit_1" && CLI_FINALIZATION_CONTRACT.dependent_step_policy === "not_attempted_when_prerequisite_unconfirmed" && CLI_FINALIZATION_CONTRACT.payload_exposed_on_failure === false && readText("docs/CLI.md").includes("explicit_outcome_cli_finalization_before_database_close") && readText("docs/CLI.md").includes("not_attempted_when_prerequisite_unconfirmed") && readText("docs/ARCHITECTURE.md").includes("CLI finalization") && readText("src/cli.ts").includes("finalizeCliCommand({") && readText("src/lib/cli-finalization.ts").includes("cli_ledger_append_outcome_unknown") && readText("src/lib/state-refresh.ts").includes("current_finalization"), evidence: "src/cli.ts/src/lib/cli-finalization.ts/src/lib/state-refresh.ts" },
    { name: "Bounded redacted CLI command record contract", ok: CLI_COMMAND_RECORD_CONTRACT.policy === "bounded_redacted_cli_command_record" && CLI_COMMAND_RECORD_CONTRACT.max_argument_count === 100 && CLI_COMMAND_RECORD_CONTRACT.max_argument_bytes === 1_024 && CLI_COMMAND_RECORD_CONTRACT.max_command_bytes === 4_096 && CLI_COMMAND_RECORD_CONTRACT.raw_arguments_exposed === false && CLI_COMMAND_RECORD_CONTRACT.sensitive_argument_values_exposed === false && readText("docs/CLI.md").includes("bounded_redacted_cli_command_record") && readText("docs/ARCHITECTURE.md").includes("CLI command record") && readText("src/cli.ts").includes("buildCliCommandRecord(args)") && readText("src/cli.ts").includes("command_record: commandRecord") && !readText("src/cli.ts").includes("args." + "join(\" \")") && readText("src/lib/state-refresh.ts").includes("current_command_record"), evidence: "src/cli.ts/src/lib/cli-command.ts/src/lib/state-refresh.ts" },
    { name: "Bounded redacted decision record contract", ok: DECISION_RECORD_CONTRACT.policy === "bounded_redacted_decision_record_before_persistence" && DECISION_RECORD_CONTRACT.max_inputs_bytes === 100_000 && DECISION_RECORD_CONTRACT.max_metadata_bytes === 25_000 && DECISION_RECORD_CONTRACT.max_related_rule_count === 100 && DECISION_RECORD_CONTRACT.max_related_rule_id_bytes === 256 && DECISION_RECORD_CONTRACT.max_reason_bytes === 2_000 && DECISION_RECORD_CONTRACT.max_decision_type_bytes === 120 && DECISION_RECORD_CONTRACT.oversized_inputs_policy === "metadata_only_manual_verification_required" && DECISION_RECORD_CONTRACT.serialization_failure_policy === "metadata_only_manual_verification_required" && DECISION_RECORD_CONTRACT.unsafe_metadata_policy === "metadata_only_manual_verification_required" && DECISION_RECORD_CONTRACT.persistence_policy === "evidence_then_ledger_then_database_with_explicit_outcomes" && DECISION_RECORD_CONTRACT.persistence_step_outcomes.join(",") === "not_attempted,confirmed,unknown_after_attempt" && DECISION_RECORD_CONTRACT.persistence_failure_policy === "manual_verification_required_without_raw_error" && DECISION_RECORD_CONTRACT.persistence_pending_marker === true && DECISION_RECORD_CONTRACT.raw_inputs_exposed === false && DECISION_RECORD_CONTRACT.raw_metadata_exposed === false && DECISION_RECORD_CONTRACT.payload_exposed_on_failure === false && readText("docs/DECISION_ENGINE.md").includes("bounded_redacted_decision_record_before_persistence") && readText("docs/DECISION_ENGINE.md").includes("metadata_only_manual_verification_required") && readText("docs/DECISION_ENGINE.md").includes("evidence_then_ledger_then_database_with_explicit_outcomes") && readText("docs/DECISION_ENGINE.md").includes("25,000") && readText("docs/ARCHITECTURE.md").includes("Decision record persistence") && readText("src/lib/decision-engine.ts").includes("inputs_record: boundedInputs.record") && readText("src/lib/decision-engine.ts").includes("metadata_record: boundedMetadata.record") && readText("src/lib/decision-engine.ts").includes("boundedRedactedDecisionMetadata") && readText("src/lib/decision-engine.ts").includes("decision_database_insert_outcome_unknown") && readText("src/lib/decision-engine.ts").includes("DECISION_RECORD_CONTRACT.max_reason_bytes"), evidence: "src/lib/decision-engine.ts/docs/DECISION_ENGINE.md/docs/ARCHITECTURE.md" },
    { name: "DB path gitignored", ok: readText(".gitignore").includes(".pala/db/*.sqlite"), evidence: ".gitignore" },
    { name: "Runtime state and ledger paths gitignored", ok: [".pala/state/", ".pala/ledger/", ".pala/archive/"].every((item) => readText(".gitignore").includes(item)), evidence: ".gitignore" },
    { name: "Overview tagline", ok: readText("control/overview/index.html").includes("Agent does the work. Pala OS verifies the work."), evidence: "control/overview/index.html" },
    { name: "Dashboard route count", ok: CONTROL_ROUTES.every((route) => exists(`control/${route}/index.html`)), evidence: "control/" },
    { name: "Dashboard consumes read-only state API", ok: dashboardTruth.failures.length === 0, evidence: "dashboard-truth-check" },
    { name: "Bounded atomic dashboard generation contract", ok: DASHBOARD_GENERATION_CONTRACT.policy === "bounded_fixed_project_contained_atomic_dashboard_generation" && DASHBOARD_GENERATION_CONTRACT.output_file_count === CONTROL_ROUTES.length + 2 && DASHBOARD_GENERATION_CONTRACT.max_file_bytes === 1_000_000 && DASHBOARD_GENERATION_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && DASHBOARD_GENERATION_CONTRACT.concurrent_directory_creation_policy === "rechecked_eexist_tolerant" && DASHBOARD_GENERATION_CONTRACT.concurrent_generation_policy === "rechecked_transient_atomic_replace_retry" && DASHBOARD_GENERATION_CONTRACT.max_atomic_replace_attempts === 20 && DASHBOARD_GENERATION_CONTRACT.temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt" && DASHBOARD_GENERATION_CONTRACT.identity_safe_temp_cleanup === true && DASHBOARD_GENERATION_CONTRACT.atomic_replace === true && DASHBOARD_GENERATION_CONTRACT.payload_exposed === false && dashboardTruth.route_generation.status === "safe_to_execute" && dashboardTruth.route_generation.output_file_count === CONTROL_ROUTES.length + 2 && dashboardTruth.route_generation.output_file_count_exact === true && dashboardTruth.route_generation.write_summary.safe_file_count === CONTROL_ROUTES.length + 2 && dashboardTruth.route_generation.write_summary.atomic_replace_file_count === CONTROL_ROUTES.length + 2 && dashboardTruth.route_generation.write_summary.temporary_source_identity_verified_file_count === CONTROL_ROUTES.length + 2 && dashboardTruth.route_generation.write_summary.failed_file_count === 0 && dashboardTruth.route_generation.file_failures.length === 0 && readText("docs/CLI.md").includes("bounded_fixed_project_contained_atomic_dashboard_generation") && readText("docs/CLI.md").includes("rechecked_eexist_tolerant") && readText("docs/CLI.md").includes("rechecked_transient_atomic_replace_retry") && readText("docs/CLI.md").includes("write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt") && readText("docs/ARCHITECTURE.md").includes("Dashboard route generation") && readText("src/lib/dashboard.ts").includes("unlinkIfSameFileIdentity"), evidence: "pala dashboard-truth-check --strict/src/lib/dashboard.ts" },
    { name: "Reference sources seeded", ok: ctx.db.prepare("SELECT COUNT(*) AS count FROM reference_sources").get().count >= 10, evidence: "docs/evidence/current-sources.md" },
    { name: "Official compatibility evidence", ok: exists("docs/evidence/official-compatibility-check.md"), evidence: "docs/evidence/official-compatibility-check.md" },
    { name: "Sanitized evidence exchange contract", ok: exists("docs/EVIDENCE_EXCHANGE.md") && exists("src/lib/evidence-exchange.ts"), evidence: "docs/EVIDENCE_EXCHANGE.md" },
    { name: "Atomic create-only evidence exchange export contract", ok: EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.policy === "bounded_project_contained_atomic_create_only_evidence_export" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.max_raw_file_bytes === 2_000_000 && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.parent_directory_creation_policy === "one_segment_at_a_time_with_path_recheck" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.concurrent_parent_creation_policy === "rechecked_eexist_tolerant" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.concurrent_publish_policy === "atomic_create_only_one_winner_existing_target_needs_approval" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.path_policy === "realpath_contained_no_symlinks" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.identity_safe_temp_cleanup === true && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.post_publish_identity_policy === "temporary_and_target_dev_ino_match" && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.atomic_create_link === true && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.overwrite_allowed === false && EVIDENCE_EXCHANGE_EXPORT_WRITE_CONTRACT.payload_exposed_on_failure === false && readText("docs/EVIDENCE_EXCHANGE.md").includes("bounded_project_contained_atomic_create_only_evidence_export") && readText("docs/EVIDENCE_EXCHANGE.md").includes("atomic_create_only_one_winner_existing_target_needs_approval") && readText("docs/EVIDENCE_EXCHANGE.md").includes("write_handle_and_temporary_path_dev_ino_match") && readText("docs/EVIDENCE_EXCHANGE.md").includes("temporary_and_target_dev_ino_match") && readText("docs/ARCHITECTURE.md").includes("Evidence exchange export write") && readText("src/lib/evidence-exchange.ts").includes("writeEvidenceExportAtomic") && readText("src/lib/evidence-exchange.ts").includes("unlinkIfSameFileIdentity") && readText("src/lib/evidence-exchange.ts").includes("sameFileIdentity") && !readText("src/lib/evidence-exchange.ts").includes("fs.writeFileSync(resolved.fullPath"), evidence: "pala evidence export --apply --target/src/lib/evidence-exchange.ts" },
    { name: "Evidence exchange schema compatibility contract", ok: EVIDENCE_EXCHANGE_CONTRACT.current_schema_version === 2 && EVIDENCE_EXCHANGE_CONTRACT.compatibility_policy === "exact_match_only" && readText("docs/EVIDENCE_EXCHANGE.md").includes("Schema version: `2`"), evidence: "pala evidence schema-check" },
    { name: "Evidence exchange migration plan contract", ok: readText("src/lib/evidence-exchange.ts").includes("planEvidenceExchangeMigration") && readText("docs/EVIDENCE_EXCHANGE.md").includes("evidence migrate --dry-run --target"), evidence: "pala evidence migrate --dry-run --target" },
    { name: "Evidence exchange migration dashboard capability contract", ok: EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.mode === "validation_only" && EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.candidate_payload_exposed === false && EVIDENCE_EXCHANGE_MIGRATION_CAPABILITY.writes_allowed === false && dashboardTruth.failures.length === 0, evidence: "/api/route/evidence-exchange" },
    { name: "Evidence exchange migration readiness plan contract", ok: EVIDENCE_EXCHANGE_CONTRACT.migration_readiness_policy === "validated_source_schema_migration_readiness_approval_plan" && EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.mode === "read_only_approval_plan" && EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.target_read_performed === false && EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.candidate_validation_performed === false && EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.candidate_payload_exposed === false && EVIDENCE_EXCHANGE_MIGRATION_READINESS_CAPABILITY.writes_allowed === false && readText("src/lib/evidence-exchange.ts").includes("planEvidenceExchangeMigrationReadiness") && readText("src/cli.ts").includes("planEvidenceExchangeMigrationReadiness") && !readText("src/cli.ts").includes("real_evidence_migration_requires_reviewed_" + "implementation") && readText("docs/EVIDENCE_EXCHANGE.md").includes("validated_source_schema_migration_readiness_approval_plan") && dashboardTruth.failures.length === 0, evidence: "pala evidence migrate --target//api/route/evidence-exchange" },
    { name: "Stable evidence content digest contract", ok: EVIDENCE_EXCHANGE_CONTRACT.content_digest_policy === "canonical_without_generated_at" && readText("docs/EVIDENCE_EXCHANGE.md").includes("canonical_without_generated_at") && dashboardTruth.failures.length === 0, evidence: "pala evidence export --dry-run//api/route/evidence-exchange" },
    { name: "Evidence exchange comparison contract", ok: EVIDENCE_EXCHANGE_CONTRACT.comparison_policy === "digest_and_count_delta_only" && readText("src/lib/evidence-exchange.ts").includes("compareEvidenceExchangeTarget") && readText("docs/EVIDENCE_EXCHANGE.md").includes("evidence compare --dry-run --target"), evidence: "pala evidence compare --dry-run --target" },
    { name: "Evidence exchange comparison dashboard capability contract", ok: EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.mode === "validation_only" && EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.target_read_performed === false && EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.payload_exposed === false && EVIDENCE_EXCHANGE_COMPARISON_CAPABILITY.writes_allowed === false && dashboardTruth.failures.length === 0, evidence: "/api/route/evidence-exchange" },
    { name: "Evidence content digest assertion contract", ok: EVIDENCE_EXCHANGE_CONTRACT.content_assertion_policy === "expected_sha256_only_no_file_read" && readText("src/lib/evidence-exchange.ts").includes("assertEvidenceExchangeContentDigest") && readText("docs/EVIDENCE_EXCHANGE.md").includes("evidence assert-content --content-digest"), evidence: "pala evidence assert-content --content-digest" },
    { name: "Evidence content assertion dashboard capability contract", ok: EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.mode === "strict_capable_validation_only" && EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.assertion_performed === false && EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.target_file_read === false && EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.payload_exposed === false && EVIDENCE_EXCHANGE_ASSERTION_CAPABILITY.writes_allowed === false && dashboardTruth.failures.length === 0, evidence: "/api/route/evidence-exchange" },
    { name: "Evidence exchange collection truncation contract", ok: EVIDENCE_EXCHANGE_CONTRACT.collection_truncation_policy === "exact_counts_or_explicit_unknown" && readText("src/lib/evidence-exchange.ts").includes("unknown_beyond_scan_limit") && readText("docs/EVIDENCE_EXCHANGE.md").includes("exact_counts_or_explicit_unknown") && dashboardTruth.failures.length === 0, evidence: "pala evidence export --dry-run//api/route/evidence-exchange" },
    { name: "Evidence truncation metadata validation contract", ok: EVIDENCE_EXCHANGE_CONTRACT.truncation_metadata_validation_policy === "validate_when_present" && readText("src/lib/evidence-exchange.ts").includes("validateCollectionTruncation") && readText("docs/EVIDENCE_EXCHANGE.md").includes("validate_when_present"), evidence: "pala evidence import --dry-run --target" },
    { name: "Evidence truncation metadata dashboard status contract", ok: readText("src/lib/evidence-exchange.ts").includes("truncation_metadata_status: built.validation.truncation_metadata_status") && readText("docs/EVIDENCE_EXCHANGE.md").includes("dashboard summary exposes") && readText("docs/EVIDENCE_EXCHANGE.md").includes("`truncation_metadata_status`") && dashboardTruth.failures.length === 0, evidence: "/api/route/evidence-exchange" },
    { name: "Evidence completeness check contract", ok: EVIDENCE_EXCHANGE_CONTRACT.completeness_policy === "all_collections_complete_and_exact" && readText("src/lib/evidence-exchange.ts").includes("checkEvidenceExchangeCompleteness") && readText("docs/EVIDENCE_EXCHANGE.md").includes("evidence completeness-check --strict"), evidence: "pala evidence completeness-check --strict" },
    { name: "Evidence completeness dashboard status contract", ok: readText("src/lib/evidence-exchange.ts").includes("completeness_status: completeness.status") && readText("docs/EVIDENCE_EXCHANGE.md").includes("dashboard summary exposes completeness policy") && readText("docs/EVIDENCE_EXCHANGE.md").includes("and status") && dashboardTruth.failures.length === 0, evidence: "/api/route/evidence-exchange" },
    { name: "Evidence payload byte budget contract", ok: EVIDENCE_EXCHANGE_CONTRACT.payload_byte_budget_policy === "exact_utf8_json_bytes_with_80_percent_warning" && readText("src/lib/evidence-exchange.ts").includes("evidenceExchangeByteBudget") && readText("docs/EVIDENCE_EXCHANGE.md").includes("payload_byte_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence export --dry-run//api/route/evidence-exchange" },
    { name: "Evidence raw-file preflight contract", ok: EVIDENCE_EXCHANGE_CONTRACT.raw_file_byte_preflight_policy === "stat_before_read_with_2mb_limit" && EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.max_raw_file_bytes === 2_000_000 && EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.target_stat_performed === false && EVIDENCE_EXCHANGE_IMPORT_PREFLIGHT_CAPABILITY.target_parse_performed === false && readText("docs/EVIDENCE_EXCHANGE.md").includes("before JSON parsing") && dashboardTruth.failures.length === 0, evidence: "pala evidence import --dry-run --target//api/route/evidence-exchange" },
    { name: "Evidence import readiness plan contract", ok: EVIDENCE_EXCHANGE_CONTRACT.import_readiness_policy === "validated_target_digest_and_count_delta_approval_plan" && EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.mode === "read_only_approval_plan" && EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.target_read_performed === false && EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.comparison_performed === false && EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.payload_exposed === false && EVIDENCE_EXCHANGE_IMPORT_READINESS_CAPABILITY.writes_allowed === false && readText("src/lib/evidence-exchange.ts").includes("planEvidenceExchangeImport") && readText("src/cli.ts").includes("planEvidenceExchangeImport(ctx.db") && !readText("src/cli.ts").includes("real_evidence_import_requires_approval_and_" + "is_not_implemented") && readText("docs/EVIDENCE_EXCHANGE.md").includes("validated_target_digest_and_count_delta_approval_plan") && dashboardTruth.failures.length === 0, evidence: "pala evidence import --target//api/route/evidence-exchange" },
    { name: "Evidence target path safety contract", ok: EVIDENCE_EXCHANGE_CONTRACT.target_path_policy === "realpath_contained_no_symlinks" && EVIDENCE_EXCHANGE_CONTRACT.target_existence_probe_policy === "single_lstat_with_enoent_only_missing_truth" && EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.existence_probe_policy === "single_lstat_with_enoent_only_missing_truth" && EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.target_check_performed === false && EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.realpath_check_performed === false && EVIDENCE_EXCHANGE_TARGET_PATH_CAPABILITY.symlink_check_performed === false && readText("docs/EVIDENCE_EXCHANGE.md").includes("single_lstat_with_enoent_only_missing_truth") && !readText("src/lib/evidence-exchange.ts").includes("fs." + "existsSync") && dashboardTruth.failures.length === 0, evidence: "pala evidence import/migrate/compare/export//api/route/evidence-exchange" },
    { name: "Evidence single-handle file inspection contract", ok: EVIDENCE_EXCHANGE_CONTRACT.file_handle_inspection_policy === "single_fd_fstat_read_with_post_open_path_recheck" && EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_policy === "structured_fail_closed_no_throw" && EVIDENCE_EXCHANGE_CONTRACT.file_handle_close_failure_reason === "close_failed" && EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.close_failure_policy === "structured_fail_closed_no_throw" && EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.close_failure_reason === "close_failed" && EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_open_performed === false && EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_read_performed === false && EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.target_close_performed === false && EVIDENCE_EXCHANGE_FILE_HANDLE_CAPABILITY.post_open_path_recheck_performed === false && readText("docs/EVIDENCE_EXCHANGE.md").includes("structured_fail_closed_no_throw") && readText("docs/EVIDENCE_EXCHANGE.md").includes("import_target_close_failed") && readText("src/lib/evidence-exchange.ts").includes("target_close_succeeded") && dashboardTruth.failures.length === 0, evidence: "pala evidence import/migrate/compare//api/route/evidence-exchange" },
    { name: "Evidence strict schema shape contract", ok: EVIDENCE_EXCHANGE_CONTRACT.schema_shape_policy === "allowlisted_keys_and_fixed_safety_policy_values" && readText("src/lib/evidence-exchange.ts").includes("validateSchemaShape") && readText("docs/EVIDENCE_EXCHANGE.md").includes("schema_shape_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence import --dry-run --target//api/route/evidence-exchange" },
    { name: "Evidence record validation contract", ok: EVIDENCE_EXCHANGE_CONTRACT.record_validation_policy === "required_fields_types_enums_and_timestamps" && readText("src/lib/evidence-exchange.ts").includes("RECORD_FIELD_RULES") && readText("docs/EVIDENCE_EXCHANGE.md").includes("record_validation_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence import --dry-run --target//api/route/evidence-exchange" },
    { name: "Evidence payload complexity guard contract", ok: EVIDENCE_EXCHANGE_CONTRACT.complexity_policy === "iterative_max_depth_32_max_nodes_50000" && readText("src/lib/evidence-exchange.ts").includes("inspectPayloadComplexityAndSafety") && readText("docs/EVIDENCE_EXCHANGE.md").includes("serialization_performed: false") && dashboardTruth.failures.length === 0, evidence: "pala evidence import --dry-run --target//api/route/evidence-exchange" },
    { name: "Evidence digest availability contract", ok: EVIDENCE_EXCHANGE_CONTRACT.digest_availability_policy === "explicit_exact_and_content_digest_availability" && readText("src/lib/evidence-exchange.ts").includes("digestAvailability") && readText("docs/EVIDENCE_EXCHANGE.md").includes("digest_availability") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import/compare//api/route/evidence-exchange" },
    { name: "Evidence generated_at time truth contract", ok: EVIDENCE_EXCHANGE_CONTRACT.generated_at_policy === "iso_timestamp_with_5_minute_future_skew_limit" && readText("src/lib/evidence-exchange.ts").includes("validateGeneratedAt") && readText("docs/EVIDENCE_EXCHANGE.md").includes("generated_at_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Evidence temporal consistency contract", ok: EVIDENCE_EXCHANGE_CONTRACT.temporal_consistency_policy === "generated_at_not_before_valid_record_timestamps" && readText("src/lib/evidence-exchange.ts").includes("validateTemporalConsistency") && readText("docs/EVIDENCE_EXCHANGE.md").includes("temporal_consistency_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Evidence collection ordering contract", ok: EVIDENCE_EXCHANGE_CONTRACT.collection_ordering_policy === "deterministic_per_collection_visible_field_order" && readText("src/lib/evidence-exchange.ts").includes("validateCollectionOrdering") && readText("docs/EVIDENCE_EXCHANGE.md").includes("collection_ordering_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Evidence duplicate-record truth contract", ok: EVIDENCE_EXCHANGE_CONTRACT.duplicate_record_policy === "exact_canonical_record_identity_counts_only" && readText("src/lib/evidence-exchange.ts").includes("validateDuplicateRecords") && readText("docs/EVIDENCE_EXCHANGE.md").includes("duplicate_record_status") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Evidence validation finding budget contract", ok: EVIDENCE_EXCHANGE_CONTRACT.finding_budget_policy === "bounded_first_200_with_total_count" && readText("src/lib/evidence-exchange.ts").includes("createFindingCollector") && readText("docs/EVIDENCE_EXCHANGE.md").includes("validation_findings_truncated") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Evidence validation phase execution contract", ok: EVIDENCE_EXCHANGE_CONTRACT.phase_execution_policy === "explicit_executed_skipped_with_dependency_reason" && readText("src/lib/evidence-exchange.ts").includes("validationPhaseExecution") && readText("docs/EVIDENCE_EXCHANGE.md").includes("validation_phase_skip_reasons") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Evidence validation finding attribution contract", ok: EVIDENCE_EXCHANGE_CONTRACT.finding_attribution_policy === "counts_only_by_validation_phase" && readText("src/lib/evidence-exchange.ts").includes("withFindingPhase") && readText("docs/EVIDENCE_EXCHANGE.md").includes("validation_finding_phase_counts") && dashboardTruth.failures.length === 0, evidence: "pala evidence export/import//api/route/evidence-exchange" },
    { name: "Read-only admin privilege detection contract", ok: admin.status === "safe_to_execute" && admin.detection.output_valid === true && admin.elevation_requested === false && readText("docs/ADMIN.md").includes("windows_principal_administrator_role_read_only") && readText("docs/ADMIN.md").includes("posix_getuid"), evidence: "pala admin-check --strict" },
    { name: "Bounded local worker smoke contract", ok: worker.status === "safe_to_execute" && WORKER_ENTRYPOINT_INSPECTION_CONTRACT.policy === "fixed_worker_entrypoint_path_metadata_scan" && WORKER_ENTRYPOINT_INSPECTION_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && WORKER_ENTRYPOINT_INSPECTION_CONTRACT.payload_exposed === false && WORKER_ENTRYPOINT_INSPECTION_CONTRACT.writes_allowed === false && worker.entrypoint_inspection.status === "safe_to_execute" && worker.entrypoint_inspection.exists === true && worker.entrypoint_inspection.kind === "file" && worker.entrypoint_inspection.payload_exposed === false && worker.package_inspection.policy === "bounded_project_contained_single_handle_worker_package_json" && worker.package_inspection.status === "safe_to_execute" && worker.package_inspection.single_file_handle_used === true && worker.package_inspection.parse_valid === true && worker.package_inspection.payload_exposed === false && worker.smoke_check.contract_valid === true && worker.workload_started === false && readText("docs/WORKER.md").includes("single_bounded_local_read_only_task") && readText("docs/WORKER.md").includes("bounded_project_contained_single_handle_worker_package_json") && readText("docs/WORKER.md").includes("fixed_worker_entrypoint_path_metadata_scan"), evidence: "pala worker-check --strict" },
    { name: "Bounded local external-skill readiness contract", ok: CLAUDE_SKILL_INSPECTION_CONTRACT.policy === "bounded_project_skill_readiness_scan" && CLAUDE_SKILL_INSPECTION_CONTRACT.max_skill_bytes === 4000 && CLAUDE_SKILL_INSPECTION_CONTRACT.payload_exposed === false && CLAUDE_SKILL_INSPECTION_CONTRACT.writes_allowed === false && EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.policy === "bounded_local_skill_readiness_without_external_fetch_or_install" && EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.external_fetch_allowed === false && EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.install_allowed === false && EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.payload_exposed === false && EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT.writes_allowed === false && externalSkills.status === "dry_run_only" && externalSkills.local_readiness_status === "safe_to_execute" && externalSkills.scan_complete === true && externalSkills.ready_skill_count > 0 && externalSkills.unready_skill_count === 0 && externalSkills.external_fetch_performed === false && externalSkills.install_performed === false && externalSkills.writes_performed === false && readText("docs/CLI.md").includes("bounded_local_skill_readiness_without_external_fetch_or_install") && readText("docs/ARCHITECTURE.md").includes("Local skill readiness inspection"), evidence: "pala skills-check/pala external-skills-refresh" },
    { name: "Bounded smart-suggestion source truth contract", ok: SMART_SUGGESTION_INSPECTION_CONTRACT.policy === "bounded_local_advisory_from_explicit_source_truth" && SMART_SUGGESTION_INSPECTION_CONTRACT.source_count === 7 && SMART_SUGGESTION_INSPECTION_CONTRACT.max_suggestions === 7 && SMART_SUGGESTION_INSPECTION_CONTRACT.incomplete_source_policy === "manual_verification_required" && SMART_SUGGESTION_INSPECTION_CONTRACT.payload_exposed === false && SMART_SUGGESTION_INSPECTION_CONTRACT.external_fetch_allowed === false && SMART_SUGGESTION_INSPECTION_CONTRACT.writes_allowed === false && OPPORTUNITY_RADAR_INSPECTION_CONTRACT.policy === "bounded_local_opportunities_from_smart_suggestion_truth" && OPPORTUNITY_RADAR_INSPECTION_CONTRACT.source_policy === SMART_SUGGESTION_INSPECTION_CONTRACT.policy && OPPORTUNITY_RADAR_INSPECTION_CONTRACT.external_fetch_allowed === false && opportunityRadar.status === "safe_to_execute" && opportunityRadar.scan_complete === true && opportunityRadar.incomplete_sources.length === 0 && opportunityRadar.external_fetch_performed === false && opportunityRadar.payload_exposed === false && opportunityRadar.writes_performed === false && readText("docs/CLI.md").includes("bounded_local_advisory_from_explicit_source_truth") && readText("docs/ARCHITECTURE.md").includes("Smart suggestion source truth"), evidence: "pala smart-suggestions/pala opportunity-radar" },
    { name: "Plan source truth contract", ok: PLAN_SOURCE_TRUTH_CONTRACT.policy === "plan_status_requires_complete_source_truth" && PLAN_SOURCE_TRUTH_CONTRACT.incomplete_source_status === "manual_verification_required" && PLAN_SOURCE_TRUTH_CONTRACT.known_finding_plan_status === "dry_run_only" && PLAN_SOURCE_TRUTH_CONTRACT.payload_exposed === false && PLAN_SOURCE_TRUTH_CONTRACT.writes_allowed === false && driftFixPlan.source_scan_complete === true && driftFixPlan.status !== "manual_verification_required" && driftFixPlan.writes_performed === false && localeSyncPlan.source_scan_complete === true && localeSyncPlan.status !== "manual_verification_required" && localeSyncPlan.writes_performed === false && n8nPlan.source_truth_complete === true && n8nPlan.status === "dry_run_only" && n8nPlan.blockers.length === 0 && n8nPlan.writes_performed === false && readText("docs/CLI.md").includes("plan_status_requires_complete_source_truth") && readText("docs/ARCHITECTURE.md").includes("Plan source truth") && readText("src/lib/action-plans.ts").includes("inspectWorker(options)"), evidence: "pala n8n-plan/pala worker-run/pala drift-fix/pala locale-sync" },
    { name: "Bounded action-plan user-input metadata contract", ok: ACTION_PLAN_USER_INPUT_CONTRACT.policy === "bounded_complete_user_input_classification_with_payload_free_metadata" && ACTION_PLAN_USER_INPUT_CONTRACT.max_input_bytes === 4_096 && ACTION_PLAN_USER_INPUT_CONTRACT.oversized_input_status === "manual_verification_required" && ACTION_PLAN_USER_INPUT_CONTRACT.raw_goal_exposed === false && ACTION_PLAN_USER_INPUT_CONTRACT.raw_target_exposed === false && ACTION_PLAN_USER_INPUT_CONTRACT.payload_exposed === false && ACTION_PLAN_USER_INPUT_CONTRACT.writes_allowed === false && autopilotInputProbe.goal_metadata.input_bytes_exact === true && autopilotInputProbe.goal_metadata.raw_input_exposed === false && !Object.hasOwn(autopilotInputProbe, "goal") && externalSkillInputProbe.target_metadata.input_bytes_exact === true && externalSkillInputProbe.target_metadata.raw_input_exposed === false && !Object.hasOwn(externalSkillInputProbe, "target") && readText("docs/CLI.md").includes("bounded_complete_user_input_classification_with_payload_free_metadata") && readText("docs/ARCHITECTURE.md").includes("Action-plan user inputs") && readText("src/lib/action-plans.ts").includes("inspectActionPlanUserInput") && !readText("src/lib/action-plans.ts").includes("goal: normalizedGoal") && !readText("src/lib/action-plans.ts").includes("target: String(target"), evidence: "pala autopilot-plan/pala autopilot-run/pala external-skill-propose" },
    { name: "Interactive mistake capture contract", ok: INTERACTIVE_MISTAKE_CONTRACT.requires_tty === true && INTERACTIVE_MISTAKE_CONTRACT.confirmation_required === true && INTERACTIVE_MISTAKE_CONTRACT.prompt_stream === "stderr" && INTERACTIVE_MISTAKE_CONTRACT.close_before_safe_result === true && INTERACTIVE_MISTAKE_CONTRACT.close_failure_policy === "payload_free_manual_verification_no_write" && INTERACTIVE_MISTAKE_CONTRACT.close_failure_blocker === "interactive_prompt_close_failed" && INTERACTIVE_MISTAKE_CONTRACT.payload_exposed_on_failure === false && INTERACTIVE_MISTAKE_CONTRACT.writes_performed === false && readText("docs/MEMORY.md").includes("tty_only_validated_confirmation_before_write") && readText("docs/MEMORY.md").includes("interactive_prompt_close_failed") && readText("docs/CLI.md").includes("payload_free_manual_verification_no_write") && readText("docs/ARCHITECTURE.md").includes("Prompt close failure") && readText("src/lib/interactive-memory.ts").includes("prompt_close_status: \"failed\""), evidence: "pala memory add-mistake --interactive" },
    {
      name: "Bounded contained memory registry append contract",
      ok: MEMORY_REGISTRY_APPEND_CONTRACT.policy === "fixed_project_contained_create_or_single_handle_memory_registry_append"
        && MEMORY_REGISTRY_APPEND_CONTRACT.max_record_bytes === 1_000_000
        && MEMORY_REGISTRY_APPEND_CONTRACT.max_registry_bytes === 5_000_000
        && MEMORY_REGISTRY_APPEND_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only"
        && MEMORY_REGISTRY_APPEND_CONTRACT.concurrent_write_policy === "bounded_fixed_create_only_lock_serialized_create_or_append"
        && MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts === 100
        && MEMORY_REGISTRY_APPEND_CONTRACT.transient_lock_observation_policy === "bounded_retry_on_existing_lock_inspection_race"
        && MEMORY_REGISTRY_APPEND_CONTRACT.post_release_success_policy === "released_identity_absent_or_safe_successor"
        && MEMORY_REGISTRY_APPEND_CONTRACT.stale_write_lock_reclamation_allowed === false
        && MEMORY_REGISTRY_APPEND_CONTRACT.atomic_create_link === true
        && MEMORY_REGISTRY_APPEND_CONTRACT.first_create_temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match"
        && MEMORY_REGISTRY_APPEND_CONTRACT.first_create_identity_safe_temp_cleanup === true
        && MEMORY_REGISTRY_APPEND_CONTRACT.first_create_post_publish_identity_policy === "temporary_and_registry_dev_ino_match"
        && MEMORY_REGISTRY_APPEND_CONTRACT.single_append_handle === true
        && MEMORY_REGISTRY_APPEND_CONTRACT.close_failure_error === "memory_registry_append_blocked:file_close_failed"
        && MEMORY_REGISTRY_APPEND_CONTRACT.payload_exposed_on_failure === false
        && MEMORY_REGISTRY_APPEND_CONTRACT.writes_outside_memory_dir_allowed === false
        && readText("docs/MEMORY.md").includes("fixed_project_contained_create_or_single_handle_memory_registry_append")
        && readText("docs/MEMORY.md").includes("bounded_fixed_create_only_lock_serialized_create_or_append")
        && readText("docs/MEMORY.md").includes("bounded_retry_on_existing_lock_inspection_race")
        && readText("docs/MEMORY.md").includes("released_identity_absent_or_safe_successor")
        && readText("docs/MEMORY.md").includes("write_handle_and_temporary_path_dev_ino_match")
        && readText("docs/MEMORY.md").includes("temporary_and_registry_dev_ino_match")
        && readText("docs/MEMORY.md").includes("memory_registry_append_blocked:file_close_failed")
        && readText("docs/ARCHITECTURE.md").includes("Memory registry append")
        && readText("src/lib/memory.ts").includes("confirmMemoryRegistryWriteLockReleased")
        && readText("src/lib/memory.ts").includes("MEMORY_REGISTRY_APPEND_CONTRACT.close_failure_error")
        && readText("src/lib/memory.ts").includes("withMemoryRegistryWriteLock")
        && readText("src/lib/memory.ts").includes("unlinkIfSameFileIdentity")
        && readText("src/lib/memory.ts").includes("sameFileIdentity")
        && !readText("src/lib/memory.ts").includes("appendFileSync"),
      evidence: "src/lib/memory.ts/docs/MEMORY.md"
    },
    { name: "Bounded n8n import target inspection contract", ok: N8N_IMPORT_INSPECTION_CONTRACT.policy === "realpath_contained_single_handle_max_1mb_json" && N8N_IMPORT_INSPECTION_CONTRACT.max_file_bytes === 1_000_000 && N8N_IMPORT_INSPECTION_CONTRACT.post_read_path_recheck === true && N8N_IMPORT_INSPECTION_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && N8N_IMPORT_INSPECTION_CONTRACT.close_failure_blocker === "workflow_target_close_failed" && N8N_IMPORT_INSPECTION_CONTRACT.workflow_summary_policy === "counts_and_boolean_metadata_without_raw_workflow_fields" && N8N_IMPORT_INSPECTION_CONTRACT.raw_workflow_name_exposed === false && N8N_IMPORT_INSPECTION_CONTRACT.payload_exposed === false && N8N_IMPORT_INSPECTION_CONTRACT.payload_exposed_on_failure === false && N8N_IMPORT_INSPECTION_CONTRACT.writes_allowed === false && readText("docs/recipes/n8n-background.md").includes("counts_and_boolean_metadata_without_raw_workflow_fields") && readText("docs/recipes/n8n-background.md").includes("structured_fail_closed_no_throw") && readText("docs/recipes/n8n-background.md").includes("workflow_target_close_failed") && readText("docs/ARCHITECTURE.md").includes("post-read path identity recheck") && readText("docs/ARCHITECTURE.md").includes("raw workflow name") && readText("docs/ARCHITECTURE.md").includes("workflow_target_close_failed") && readText("src/lib/action-plans.ts").includes("post_read_path_recheck_performed") && readText("src/lib/action-plans.ts").includes("workflow_target_changed_after_read") && readText("src/lib/action-plans.ts").includes("raw_name_exposed: false") && readText("src/lib/action-plans.ts").includes("target_close_succeeded"), evidence: "pala n8n-import --dry-run --target" },
    { name: "Bounded archive inventory contract", ok: ARCHIVE_INVENTORY_CONTRACT.policy === "bounded_directory_iterator_with_explicit_exactness" && ARCHIVE_INVENTORY_CONTRACT.max_scan_entries === 1000 && ARCHIVE_INVENTORY_CONTRACT.candidate_output_limit === 120 && ARCHIVE_INVENTORY_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && ARCHIVE_INVENTORY_CONTRACT.directory_close_failure_blocker === "archive_inventory_directory_close_failed" && ARCHIVE_INVENTORY_CONTRACT.payload_exposed_on_failure === false && ARCHIVE_INVENTORY_CONTRACT.files_moved_allowed === false && ARCHIVE_INVENTORY_CONTRACT.files_deleted_allowed === false && readText("docs/CLI.md").includes("bounded_directory_iterator_with_explicit_exactness") && readText("docs/CLI.md").includes("root_inspection") && readText("docs/CLI.md").includes("archive_inventory_directory_close_failed") && readText("src/lib/action-plans.ts").includes("root_inspection: rootInspection"), evidence: "pala archive-old --older-than-days" },
    { name: "Fixed bounded ledger append contract", ok: LEDGER_APPEND_CONTRACT.policy === "fixed_allowlisted_project_contained_single_handle_append" && LEDGER_APPEND_CONTRACT.allowed_file_count === 6 && LEDGER_APPEND_CONTRACT.max_record_bytes === 1_000_000 && LEDGER_APPEND_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && LEDGER_APPEND_CONTRACT.concurrent_mutation_policy === "bounded_fixed_create_only_lock_serialized_ledger_mutations" && LEDGER_APPEND_CONTRACT.max_mutation_lock_attempts === 100 && LEDGER_APPEND_CONTRACT.stale_mutation_lock_reclamation_allowed === false && LEDGER_APPEND_CONTRACT.single_append_handle === true && LEDGER_APPEND_CONTRACT.close_failure_error === "ledger_append_blocked:file_close_failed" && LEDGER_APPEND_CONTRACT.payload_exposed_on_failure === false && LEDGER_APPEND_CONTRACT.writes_outside_ledger_dir_allowed === false && readText("docs/MEMORY.md").includes("fixed_allowlisted_project_contained_single_handle_append") && readText("docs/MEMORY.md").includes("bounded_fixed_create_only_lock_serialized_ledger_mutations") && readText("docs/MEMORY.md").includes("ledger_append_blocked:file_close_failed") && readText("docs/ARCHITECTURE.md").includes("Ledger append") && readText("src/lib/ledger.ts").includes("LEDGER_APPEND_CONTRACT.close_failure_error") && readText("src/lib/ledger.ts").includes("withLedgerMutationLock") && readText("src/lib/ledger-lock.ts").includes("withLedgerMutationLock") && !readText("src/lib/ledger.ts").includes("appendFileSync"), evidence: "src/lib/ledger.ts/src/lib/ledger-lock.ts/docs/MEMORY.md" },
    { name: "Bounded atomic create-only raw evidence write contract", ok: RAW_EVIDENCE_WRITE_CONTRACT.policy === "bounded_project_contained_atomic_create_only_redacted_raw_evidence" && RAW_EVIDENCE_WRITE_CONTRACT.max_file_bytes === 5_000_000 && RAW_EVIDENCE_WRITE_CONTRACT.max_kind_bytes === 256 && RAW_EVIDENCE_WRITE_CONTRACT.kind_policy === "bounded_redacted_before_envelope_and_filename" && RAW_EVIDENCE_WRITE_CONTRACT.raw_kind_exposed === false && RAW_EVIDENCE_WRITE_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && RAW_EVIDENCE_WRITE_CONTRACT.temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match" && RAW_EVIDENCE_WRITE_CONTRACT.identity_safe_temp_cleanup === true && RAW_EVIDENCE_WRITE_CONTRACT.post_publish_identity_policy === "temporary_and_target_dev_ino_match" && RAW_EVIDENCE_WRITE_CONTRACT.atomic_create_link === true && RAW_EVIDENCE_WRITE_CONTRACT.overwrite_allowed === false && RAW_EVIDENCE_WRITE_CONTRACT.payload_exposed_on_failure === false && RAW_EVIDENCE_WRITE_CONTRACT.writes_outside_raw_evidence_dir_allowed === false && readText("docs/CLI.md").includes("bounded_project_contained_atomic_create_only_redacted_raw_evidence") && readText("docs/CLI.md").includes("bounded_redacted_before_envelope_and_filename") && readText("docs/CLI.md").includes("write_handle_and_temporary_path_dev_ino_match") && readText("docs/CLI.md").includes("temporary_and_target_dev_ino_match") && readText("docs/ARCHITECTURE.md").includes("Raw evidence write") && readText("src/lib/evidence.ts").includes("safeEvidenceKind") && readText("src/lib/evidence.ts").includes("fs.linkSync") && readText("src/lib/evidence.ts").includes("unlinkIfSameFileIdentity") && readText("src/lib/evidence.ts").includes("sameFileIdentity") && readText("src/lib/evidence.ts").includes("content_exceeds_byte_limit"), evidence: "src/lib/evidence.ts/docs/CLI.md" },
    { name: "Bounded fixed public evidence atomic replace contract", ok: PUBLIC_EVIDENCE_WRITE_CONTRACT.policy === "bounded_fixed_project_contained_atomic_public_evidence_replace" && PUBLIC_EVIDENCE_WRITE_CONTRACT.allowed_file_count === 1 && PUBLIC_EVIDENCE_WRITE_CONTRACT.max_file_bytes === 1_000_000 && PUBLIC_EVIDENCE_WRITE_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && PUBLIC_EVIDENCE_WRITE_CONTRACT.concurrent_write_policy === "last_writer_wins_rechecked_transient_atomic_replace_retry" && PUBLIC_EVIDENCE_WRITE_CONTRACT.max_atomic_replace_attempts === 20 && PUBLIC_EVIDENCE_WRITE_CONTRACT.temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt" && PUBLIC_EVIDENCE_WRITE_CONTRACT.identity_safe_temp_cleanup === true && PUBLIC_EVIDENCE_WRITE_CONTRACT.atomic_replace === true && PUBLIC_EVIDENCE_WRITE_CONTRACT.payload_exposed_on_failure === false && PUBLIC_EVIDENCE_WRITE_CONTRACT.writes_outside_docs_evidence_dir_allowed === false && readText("docs/CLI.md").includes("bounded_fixed_project_contained_atomic_public_evidence_replace") && readText("docs/CLI.md").includes("last_writer_wins_rechecked_transient_atomic_replace_retry") && readText("docs/CLI.md").includes("write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt") && readText("docs/ARCHITECTURE.md").includes("Public evidence write") && readText("src/lib/evidence.ts").includes("PUBLIC_EVIDENCE_FILES") && readText("src/lib/evidence.ts").includes("TRANSIENT_ATOMIC_REPLACE_ERROR_CODES") && readText("src/lib/evidence.ts").includes("unlinkIfSameFileIdentity") && readText("src/lib/evidence.ts").includes("fs.renameSync"), evidence: "src/lib/evidence.ts/docs/CLI.md" },
    { name: "Bounded ledger safety scan contract", ok: LEDGER_SAFETY_SCAN_CONTRACT.policy === "bounded_single_handle_jsonl_scan_with_true_finding_count" && LEDGER_SAFETY_SCAN_CONTRACT.max_files === 100 && LEDGER_SAFETY_SCAN_CONTRACT.max_file_bytes === 10_000_000 && LEDGER_SAFETY_SCAN_CONTRACT.max_lines_per_file === 50_000 && LEDGER_SAFETY_SCAN_CONTRACT.max_returned_findings === 200 && LEDGER_SAFETY_SCAN_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && LEDGER_SAFETY_SCAN_CONTRACT.close_failure_blocker === "ledger_file_close_failed" && LEDGER_SAFETY_SCAN_CONTRACT.directory_close_failure_blocker === "ledger_directory_close_failed" && LEDGER_SAFETY_SCAN_CONTRACT.payload_exposed_on_failure === false && ledgerSafety.root_inspection.status === "safe_to_execute" && ledgerSafety.root_inspection.exists === true && ledgerSafety.root_inspection.kind === "directory" && ledgerSafety.root_inspection.payload_exposed === false && readText("docs/MEMORY.md").includes("bounded_single_handle_jsonl_scan_with_true_finding_count") && readText("docs/MEMORY.md").includes("ledger_file_close_failed") && readText("docs/MEMORY.md").includes("ledger_directory_close_failed") && readText("src/lib/ledger-safety.ts").includes("LEDGER_SAFETY_SCAN_CONTRACT.close_failure_blocker") && readText("src/lib/ledger-safety.ts").includes("LEDGER_SAFETY_SCAN_CONTRACT.directory_close_failure_blocker"), evidence: "pala ledger-safety-check --strict" },
    { name: "Bounded contained atomic ledger repair contract", ok: LEDGER_REPAIR_WRITE_CONTRACT.policy === "bounded_project_contained_atomic_backup_then_replace" && LEDGER_REPAIR_WRITE_CONTRACT.max_file_bytes === 10_000_000 && LEDGER_REPAIR_WRITE_CONTRACT.parent_directory_creation_policy === "one_segment_at_a_time_with_path_recheck" && LEDGER_REPAIR_WRITE_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && LEDGER_REPAIR_WRITE_CONTRACT.concurrent_mutation_policy === "bounded_fixed_create_only_lock_serialized_ledger_mutations" && LEDGER_REPAIR_WRITE_CONTRACT.max_mutation_lock_attempts === 100 && LEDGER_REPAIR_WRITE_CONTRACT.stale_mutation_lock_reclamation_allowed === false && LEDGER_REPAIR_WRITE_CONTRACT.backup_create_only === true && LEDGER_REPAIR_WRITE_CONTRACT.atomic_create_link === true && LEDGER_REPAIR_WRITE_CONTRACT.temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match" && LEDGER_REPAIR_WRITE_CONTRACT.identity_safe_temp_cleanup === true && LEDGER_REPAIR_WRITE_CONTRACT.backup_post_publish_identity_policy === "temporary_and_backup_dev_ino_match" && LEDGER_REPAIR_WRITE_CONTRACT.atomic_replace === true && LEDGER_REPAIR_WRITE_CONTRACT.replacement_post_publish_identity_policy === "temporary_and_live_ledger_dev_ino_match" && LEDGER_REPAIR_WRITE_CONTRACT.original_backup_required === true && LEDGER_REPAIR_WRITE_CONTRACT.payload_exposed_on_failure === false && LEDGER_REPAIR_WRITE_CONTRACT.writes_outside_project_allowed === false && readText("docs/MEMORY.md").includes("bounded_project_contained_atomic_backup_then_replace") && readText("docs/MEMORY.md").includes("bounded_fixed_create_only_lock_serialized_ledger_mutations") && readText("docs/MEMORY.md").includes("write_handle_and_temporary_path_dev_ino_match") && readText("docs/MEMORY.md").includes("temporary_and_backup_dev_ino_match") && readText("docs/MEMORY.md").includes("temporary_and_live_ledger_dev_ino_match") && readText("docs/CLI.md").includes("bounded_project_contained_atomic_backup_then_replace") && readText("docs/ARCHITECTURE.md").includes("Ledger repair write") && readText("src/lib/ledger-safety.ts").includes("atomicCreateBackup") && readText("src/lib/ledger-safety.ts").includes("atomicReplaceLedger") && readText("src/lib/ledger-safety.ts").includes("unlinkIfSameFileIdentity") && readText("src/lib/ledger-safety.ts").includes("sameFileIdentity") && readText("src/lib/ledger-safety.ts").includes("withLedgerMutationLock") && !readText("src/lib/ledger-safety.ts").includes("fs.copyFileSync") && !readText("src/lib/ledger-safety.ts").includes("fs.writeFileSync(plan.fullPath"), evidence: "pala ledger-redact --dry-run/src/lib/ledger-safety.ts/src/lib/ledger-lock.ts" },
    { name: "Bounded latest evidence lookup contract", ok: LATEST_EVIDENCE_CONTRACT.inventory_policy === "bounded_directory_iterator_latest_mtime_with_prefix_read" && LATEST_EVIDENCE_CONTRACT.max_scan_entries === 5000 && LATEST_EVIDENCE_CONTRACT.read_policy === "single_handle_prefix_max_bytes_and_chars" && LATEST_EVIDENCE_CONTRACT.max_preview_bytes === 4096 && LATEST_EVIDENCE_CONTRACT.max_preview_chars === 1200 && LATEST_EVIDENCE_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && LATEST_EVIDENCE_CONTRACT.directory_close_failure_blocker === "raw_evidence_directory_close_failed" && LATEST_EVIDENCE_CONTRACT.file_close_failure_blocker === "latest_evidence_file_close_failed" && LATEST_EVIDENCE_CONTRACT.payload_exposed_on_failure === false && readText("docs/CLI.md").includes("bounded_directory_iterator_latest_mtime_with_prefix_read") && readText("docs/CLI.md").includes("Latest-evidence root truth") && readText("docs/CLI.md").includes("raw_evidence_directory_close_failed") && readText("docs/CLI.md").includes("latest_evidence_file_close_failed") && readText("src/lib/evidence.ts").includes("root_inspection: rootInspection"), evidence: "pala evidence last" },
    { name: "Bounded repo quality scan contract", ok: REPO_SCAN_CONTRACT.policy === "bounded_realpath_contained_inventory_with_single_handle_text_reads" && REPO_SCAN_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && REPO_SCAN_CONTRACT.missing_path_ancestor_check === true && REPO_SCAN_CONTRACT.max_scan_entries === 5000 && REPO_SCAN_CONTRACT.max_depth === 32 && REPO_SCAN_CONTRACT.max_text_file_bytes === 2_000_000 && REPO_SCAN_CONTRACT.max_total_text_bytes === 20_000_000 && REPO_SCAN_CONTRACT.max_returned_findings === 200 && REPO_SCAN_CONTRACT.post_read_path_recheck === true && REPO_SCAN_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && REPO_SCAN_CONTRACT.directory_close_failure_blocker === "repo_directory_close_failed" && REPO_SCAN_CONTRACT.payload_exposed === false && REPO_SCAN_CONTRACT.payload_exposed_on_failure === false && REPO_SCAN_CONTRACT.writes_allowed === false && architecture.root_inspection.status === "safe_to_execute" && architecture.root_inspection.kind === "directory" && architecture.root_inspection.payload_exposed === false && readText("docs/CLI.md").includes("Repo inventory root truth") && readText("docs/CLI.md").includes("repo_text_file_close_failed") && readText("docs/CLI.md").includes("repo_directory_close_failed") && readText("src/lib/repo-scan.ts").includes("root_inspection: rootInspection") && readText("src/lib/repo-scan.ts").includes("repo_text_file_close_failed") && readText("src/lib/repo-scan.ts").includes("REPO_SCAN_CONTRACT.directory_close_failure_blocker"), evidence: "pala quality-radar --strict" },
    { name: "Bounded CLI path presence metadata contract", ok: REPO_PATH_PRESENCE_CONTRACT.policy === "repo_path_presence_from_contained_metadata_only" && REPO_PATH_PRESENCE_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && REPO_PATH_INSPECTION_CONTRACT.missing_path_ancestor_check === true && REPO_PATH_PRESENCE_CONTRACT.payload_exposed === false && REPO_PATH_PRESENCE_CONTRACT.writes_allowed === false && cliPathPresence.status === "safe_to_execute" && cliPathPresence.present === true && cliPathPresence.inspection.kind === "file" && cliPathPresence.payload_exposed === false && readText("docs/CLI.md").toLowerCase().includes("missing-target ancestors") && readText("docs/ARCHITECTURE.md").toLowerCase().includes("missing-target ancestors"), evidence: "pala verify/CLI path presence" },
    { name: "Bounded quality required artifact path metadata contract", ok: QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.policy === "bounded_fixed_quality_required_artifact_path_metadata_scan" && QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.required_path_count === 4 && QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.payload_exposed === false && QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT.writes_allowed === false && qualityRequiredArtifacts.status === "safe_to_execute" && qualityRequiredArtifacts.scan_complete === true && qualityRequiredArtifacts.inspections.length === 4 && qualityRequiredArtifacts.inspections.every((item) => item.status === "safe_to_execute" && item.exists === true && item.kind === "file" && item.payload_exposed === false) && readText("docs/CLI.md").includes("bounded_fixed_quality_required_artifact_path_metadata_scan") && readText("docs/ARCHITECTURE.md").includes("Quality required-artifact path inspection"), evidence: "pala quality-radar --strict" },
    { name: "Bounded architecture path metadata contract", ok: ARCHITECTURE_PATH_INSPECTION_CONTRACT.policy === "bounded_fixed_architecture_path_metadata_scan" && ARCHITECTURE_PATH_INSPECTION_CONTRACT.required_path_count === 7 && ARCHITECTURE_PATH_INSPECTION_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && ARCHITECTURE_PATH_INSPECTION_CONTRACT.payload_exposed === false && ARCHITECTURE_PATH_INSPECTION_CONTRACT.writes_allowed === false && architecture.status === "safe_to_execute" && architecture.scan_complete === true && architecture.path_inspections.length === 7 && architecture.path_inspections.every((item) => item.status === "safe_to_execute" && item.exists === true && item.payload_exposed === false) && readText("docs/CLI.md").includes("bounded_fixed_architecture_path_metadata_scan") && readText("docs/ARCHITECTURE.md").includes("Architecture layer path inspection"), evidence: "pala architecture-check --strict" },
    { name: "Bounded i18n artifact path metadata contract", ok: I18N_ARTIFACT_INSPECTION_CONTRACT.policy === "bounded_fixed_i18n_artifact_path_metadata_scan" && I18N_ARTIFACT_INSPECTION_CONTRACT.required_path_count === 2 && I18N_ARTIFACT_INSPECTION_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && I18N_ARTIFACT_INSPECTION_CONTRACT.payload_exposed === false && I18N_ARTIFACT_INSPECTION_CONTRACT.writes_allowed === false && i18n.status === "safe_to_execute" && i18n.scan_complete === true && i18n.artifact_inspections.length === 2 && i18n.artifact_inspections.every((item) => item.status === "safe_to_execute" && item.exists === true && item.kind === "file" && item.payload_exposed === false) && readText("docs/CLI.md").includes("bounded_fixed_i18n_artifact_path_metadata_scan") && readText("docs/ARCHITECTURE.md").includes("i18n artifact path inspection"), evidence: "pala i18n-check --strict" },
    { name: "Bounded git worktree and remote observation contract", ok: SYNC_OBSERVATION_CONTRACT.status_policy === "bounded_git_porcelain_v1_z_with_explicit_process_truth" && SYNC_OBSERVATION_CONTRACT.remote_policy === "bounded_git_remote_names_with_explicit_process_truth" && SYNC_OBSERVATION_CONTRACT.head_policy === "bounded_git_rev_parse_head_with_validated_hash" && SYNC_OBSERVATION_CONTRACT.timeout_ms === 5000 && SYNC_OBSERVATION_CONTRACT.max_status_output_bytes === 1_000_000 && SYNC_OBSERVATION_CONTRACT.max_remote_output_bytes === 64_000 && SYNC_OBSERVATION_CONTRACT.max_head_output_bytes === 256 && SYNC_OBSERVATION_CONTRACT.raw_output_exposed === false && SYNC_OBSERVATION_CONTRACT.writes_allowed === false && readText("docs/CLI.md").includes("bounded_git_porcelain_v1_z_with_explicit_process_truth") && readText("docs/CLI.md").includes("bounded_git_rev_parse_head_with_validated_hash"), evidence: "pala sync-check/push-check/rollback-check" },
    { name: "Bounded memory registry scan contract", ok: MEMORY_REGISTRY_SCAN_CONTRACT.policy === "bounded_single_handle_jsonl_without_invalid_raw_line_exposure" && MEMORY_REGISTRY_SCAN_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && MEMORY_REGISTRY_SCAN_CONTRACT.max_file_bytes === 5_000_000 && MEMORY_REGISTRY_SCAN_CONTRACT.max_lines === 10_000 && MEMORY_REGISTRY_SCAN_CONTRACT.max_returned_records === 500 && MEMORY_REGISTRY_SCAN_CONTRACT.max_returned_findings === 100 && MEMORY_REGISTRY_SCAN_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && MEMORY_REGISTRY_SCAN_CONTRACT.close_failure_blocker === "memory_registry_file_close_failed" && MEMORY_REGISTRY_SCAN_CONTRACT.invalid_raw_line_exposed === false && MEMORY_REGISTRY_SCAN_CONTRACT.payload_exposed_on_failure === false && MEMORY_REGISTRY_SCAN_CONTRACT.writes_allowed === false && readText("docs/MEMORY.md").includes("memory_registry_file_close_failed") && readText("src/lib/memory.ts").includes("MEMORY_REGISTRY_SCAN_CONTRACT.close_failure_blocker") && !readText("src/lib/memory.ts").includes("fs." + "existsSync"), evidence: "pala memory check/list" },
    { name: "Bounded payload-free MCP fixture inspection contract", ok: MCP_FIXTURE_INSPECTION_CONTRACT.policy === "realpath_contained_single_handle_max_1mb_payload_free" && MCP_FIXTURE_INSPECTION_CONTRACT.path_metadata_policy === "realpath_contained_symlink_free_path_metadata_only" && MCP_FIXTURE_INSPECTION_CONTRACT.max_clients === 20 && MCP_FIXTURE_INSPECTION_CONTRACT.max_file_bytes === 1_000_000 && MCP_FIXTURE_INSPECTION_CONTRACT.max_returned_names === 200 && MCP_FIXTURE_INSPECTION_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && MCP_FIXTURE_INSPECTION_CONTRACT.close_failure_blocker === "fixture_file_close_failed" && MCP_FIXTURE_INSPECTION_CONTRACT.payload_exposed === false && MCP_FIXTURE_INSPECTION_CONTRACT.payload_exposed_on_failure === false && MCP_FIXTURE_INSPECTION_CONTRACT.writes_allowed === false && mcpFixturePlan.payload_exposed === false && mcpFixturePlan.secret_values_exposed === false && mcpFixturePlan.writes_performed === false && mcpFixturePlan.plans.every((plan) => plan.payload_exposed === false && plan.secret_values_exposed === false && plan.writes_performed === false) && readText("docs/MCP_INSTALLER.md").includes("fixture_file_close_failed") && readText("src/lib/mcp-dry-run.ts").includes("MCP_FIXTURE_INSPECTION_CONTRACT.close_failure_blocker") && !readText("src/lib/mcp-dry-run.ts").includes("fs." + "existsSync"), evidence: "pala setup --check --all" },
    { name: "Loopback-only bounded panel read contract", ok: PANEL_READ_CONTRACT.policy === "loopback_read_only_realpath_contained_single_handle_max_bytes" && PANEL_READ_CONTRACT.allowed_hosts.length === 2 && PANEL_READ_CONTRACT.allowed_hosts.includes("127.0.0.1") && PANEL_READ_CONTRACT.allowed_hosts.includes("::1") && PANEL_READ_CONTRACT.max_state_file_bytes === 1_000_000 && PANEL_READ_CONTRACT.max_static_file_bytes === 1_000_000 && PANEL_READ_CONTRACT.max_route_response_bytes === 1_000_000 && PANEL_READ_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && PANEL_READ_CONTRACT.close_failure_reason === "file_close_failed" && PANEL_READ_CONTRACT.database_close_failure_reason === "route_database_close_failed" && PANEL_READ_CONTRACT.database_post_read_path_recheck === true && PANEL_READ_CONTRACT.database_path_change_reason === "route_database_path_changed_after_read" && PANEL_READ_CONTRACT.route_response_limit_reason === "route_response_exceeds_byte_limit" && PANEL_READ_CONTRACT.state_head_validation_policy === "same_validation_status_as_get_without_body" && PANEL_READ_CONTRACT.static_head_validation_policy === "same_read_status_as_get_without_body" && PANEL_READ_CONTRACT.startup_failure_policy === "structured_payload_free_without_raw_error" && PANEL_READ_CONTRACT.startup_failure_error === "panel_start_failed" && PANEL_READ_CONTRACT.raw_startup_error_exposed === false && PANEL_READ_CONTRACT.payload_exposed_on_failure === false && PANEL_READ_CONTRACT.writes_allowed === false && readText("src/panel-server.ts").includes("readContainedFile") && readText("src/panel-server.ts").includes("panelStartupFailureResult") && readText("src/panel-server.ts").includes("PANEL_READ_CONTRACT.database_close_failure_reason") && readText("src/panel-server.ts").includes("PANEL_READ_CONTRACT.database_path_change_reason") && readText("src/panel-server.ts").includes("PANEL_READ_CONTRACT.route_response_limit_reason") && readText("docs/ARCHITECTURE.md").includes("loopback_read_only_realpath_contained_single_handle_max_bytes") && readText("docs/CLI.md").includes("file_close_failed") && readText("docs/CLI.md").includes("panel_start_failed") && readText("docs/CLI.md").includes("route_database_close_failed") && readText("docs/CLI.md").includes("route_database_path_changed_after_read") && readText("docs/CLI.md").includes("route_response_exceeds_byte_limit") && readText("docs/CLI.md").includes("same_validation_status_as_get_without_body") && readText("docs/CLI.md").includes("same_read_status_as_get_without_body"), evidence: "pala panel/src/panel-server.ts" },
    { name: "Bounded state JSON read and atomic refresh contract", ok: STATE_FILE_IO_CONTRACT.policy === "bounded_project_contained_single_handle_state_json_with_atomic_replace" && STATE_FILE_IO_CONTRACT.max_file_bytes === 1_000_000 && STATE_FILE_IO_CONTRACT.allowed_file_count === 5 && STATE_FILE_IO_CONTRACT.existence_probe_policy === "single_lstat_with_enoent_only_missing_truth" && STATE_FILE_IO_CONTRACT.concurrent_write_policy === "last_writer_wins_rechecked_transient_atomic_replace_retry" && STATE_FILE_IO_CONTRACT.max_atomic_replace_attempts === 20 && STATE_FILE_IO_CONTRACT.temporary_source_identity_policy === "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt" && STATE_FILE_IO_CONTRACT.identity_safe_temp_cleanup === true && STATE_FILE_IO_CONTRACT.atomic_replace === true && STATE_FILE_IO_CONTRACT.metadata_failure_policy === "structured_fail_closed_no_throw" && STATE_FILE_IO_CONTRACT.close_failure_blocker === "state_file_close_failed" && STATE_FILE_IO_CONTRACT.payload_exposed_on_failure === false && STATE_FILE_IO_CONTRACT.writes_outside_state_dir_allowed === false && stateFileReads.every((item) => item.status === "safe_to_execute" && item.payload_exposed_on_failure === false && (!item.exists || (item.single_file_handle_used === true && item.content_stable_during_read === true))) && readText("docs/CLI.md").includes("single_lstat_with_enoent_only_missing_truth") && readText("docs/CLI.md").includes("state_file_close_failed") && readText("docs/CLI.md").includes("last_writer_wins_rechecked_transient_atomic_replace_retry") && readText("docs/CLI.md").includes("write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt") && readText("docs/ARCHITECTURE.md").includes("atomic replace") && readText("src/lib/state-file.ts").includes("STATE_FILE_IO_CONTRACT.close_failure_blocker") && readText("src/lib/state-file.ts").includes("unlinkIfSameFileIdentity") && !readText("src/lib/state-file.ts").includes("fs." + "existsSync"), evidence: "pala status/state refresh/reference refresh" },
    { name: "Reference refresh ledger outcome truth contract", ok: REFERENCE_REFRESH_WRITE_CONTRACT.policy === "state_then_ledger_with_explicit_append_outcome" && REFERENCE_REFRESH_WRITE_CONTRACT.state_before_ledger === true && REFERENCE_REFRESH_WRITE_CONTRACT.ledger_outcome_policy === "not_attempted_confirmed_or_unknown_after_attempt" && REFERENCE_REFRESH_WRITE_CONTRACT.ledger_failure_blocker === "reference_refresh_ledger_write_outcome_unknown" && REFERENCE_REFRESH_WRITE_CONTRACT.payload_exposed_on_failure === false && readText("docs/evidence/reference-radar.md").includes("not_attempted_confirmed_or_unknown_after_attempt") && readText("docs/CLI.md").includes("unknown_after_attempt") && readText("docs/ARCHITECTURE.md").includes("Reference refresh write truth") && readText("src/lib/reference-radar.ts").includes("ledger_write_attempted: ledgerWriteAttempted") && readText("src/lib/reference-radar.ts").includes("ledger_write_outcome: ledgerWriteOutcome"), evidence: "pala benchmark-refresh --dry-run/src/lib/reference-radar.ts" },
    { name: "Bounded raw-output-free runtime observation contract", ok: RUNTIME_OBSERVATION_CONTRACT.policy === "bounded_fixed_command_process_metadata_with_redacted_first_line" && RUNTIME_OBSERVATION_CONTRACT.timeout_ms === 5000 && RUNTIME_OBSERVATION_CONTRACT.max_output_bytes === 64_000 && RUNTIME_OBSERVATION_CONTRACT.max_summary_chars === 160 && RUNTIME_OBSERVATION_CONTRACT.command_count === 5 && RUNTIME_OBSERVATION_CONTRACT.raw_output_exposed === false && RUNTIME_OBSERVATION_CONTRACT.external_calls_allowed === false && RUNTIME_OBSERVATION_CONTRACT.writes_allowed === false && readText("docs/CLI.md").includes("bounded_fixed_command_process_metadata_with_redacted_first_line"), evidence: "pala runtime-check" },
    { name: "Bounded runtime project asset path metadata contract", ok: RUNTIME_PROJECT_ASSET_CONTRACT.policy === "bounded_fixed_runtime_project_asset_path_metadata_scan" && RUNTIME_PROJECT_ASSET_CONTRACT.required_path_count === 5 && RUNTIME_PROJECT_ASSET_CONTRACT.path_policy === "realpath_contained_symlink_free_path_metadata_only" && RUNTIME_PROJECT_ASSET_CONTRACT.payload_exposed === false && RUNTIME_PROJECT_ASSET_CONTRACT.writes_allowed === false && runtimeProjectAssets.status === "safe_to_execute" && runtimeProjectAssets.inspections.length === 5 && runtimeProjectAssets.inspections.every((item) => item.status === "safe_to_execute" && item.exists === true && item.payload_exposed === false) && readText("docs/CLI.md").includes("bounded_fixed_runtime_project_asset_path_metadata_scan") && readText("docs/ARCHITECTURE.md").includes("Runtime project asset path inspection"), evidence: "pala runtime-check/project assets" },
    { name: "Bounded optional n8n CLI observation contract", ok: N8N_CLI_OBSERVATION_CONTRACT.policy === "bounded_optional_n8n_version_metadata_with_redacted_first_line" && N8N_CLI_OBSERVATION_CONTRACT.windows_discovery_policy === "bounded_windows_where_n8n_cmd_presence_only" && N8N_CLI_OBSERVATION_CONTRACT.timeout_ms === 5000 && N8N_CLI_OBSERVATION_CONTRACT.max_output_bytes === 16_000 && N8N_CLI_OBSERVATION_CONTRACT.max_summary_chars === 160 && N8N_CLI_OBSERVATION_CONTRACT.raw_output_exposed === false && N8N_CLI_OBSERVATION_CONTRACT.external_calls_allowed === false && N8N_CLI_OBSERVATION_CONTRACT.writes_allowed === false && n8n.status === "safe_to_execute" && n8n.raw_output_exposed === false && n8n.discovery.raw_output_exposed === false && n8n.observation.raw_output_exposed === false && readText("docs/CLI.md").includes("bounded_optional_n8n_version_metadata_with_redacted_first_line") && readText("docs/recipes/n8n-background.md").includes("bounded_windows_where_n8n_cmd_presence_only"), evidence: "pala n8n-check --strict" },
    { name: "Bounded CLAUDE sync dry-run inspection contract", ok: CLAUDE_SYNC_INSPECTION_CONTRACT.policy === "bounded_project_contained_single_handle_claude_md_dry_run" && CLAUDE_SYNC_INSPECTION_CONTRACT.max_file_bytes === 1_000_000 && CLAUDE_SYNC_INSPECTION_CONTRACT.payload_exposed === false && CLAUDE_SYNC_INSPECTION_CONTRACT.writes_allowed === false && readText("docs/MEMORY.md").includes("bounded_project_contained_single_handle_claude_md_dry_run"), evidence: "pala memory sync-claude --dry-run" },
    { name: "Bounded payload-free workflow inspection contract", ok: WORKFLOW_INSPECTION_CONTRACT.policy === "bounded_project_contained_single_handle_workflow_contract_scan" && WORKFLOW_INSPECTION_CONTRACT.max_file_bytes === 1_000_000 && WORKFLOW_INSPECTION_CONTRACT.max_total_text_bytes === 2_000_000 && WORKFLOW_INSPECTION_CONTRACT.workflow_count === 4 && WORKFLOW_INSPECTION_CONTRACT.mutation_payload_exposed === false && WORKFLOW_INSPECTION_CONTRACT.writes_allowed === false && WORKFLOW_INSPECTION_CONTRACT.external_calls_allowed === false && workflowContracts.scan_complete === true && workflowContracts.payload_exposed === false && readText("docs/CLI.md").includes("bounded_project_contained_single_handle_workflow_contract_scan"), evidence: "pala workflow-check --strict" },
    { name: "Decision review queue contract", ok: decisionReview.status === "safe_to_execute" && decisionReview.writes_performed === false, evidence: "pala decision-review" },
    { name: "Decision review aging policy contract", ok: DECISION_REVIEW_AGING_POLICY.critical === 1 && DECISION_REVIEW_AGING_POLICY.high === 7 && DECISION_REVIEW_AGING_POLICY.medium === 30 && readText("docs/DECISION_ENGINE.md").includes("Critical: 1 day"), evidence: "docs/DECISION_ENGINE.md/src/lib/decision-review.ts" },
    { name: "Reference radar state", ok: exists(".pala/state/reference-radar-state.json"), evidence: ".pala/state/reference-radar-state.json" },
    { name: "V28 operator session record", ok: ctx.db.prepare("SELECT COUNT(*) AS count FROM operator_sessions").get().count > 0, evidence: ".pala/db/pala.sqlite" },
    { name: "V28 model/effort observation", ok: ctx.db.prepare("SELECT COUNT(*) AS count FROM model_effort_observations").get().count > 0, evidence: ".pala/db/pala.sqlite" },
    { name: "Active model and effort observed", ok: Boolean(latestModelEffort && latestModelEffort.model_observed !== "unknown" && latestModelEffort.effort_observed !== "unknown"), evidence: latestModelEffort?.evidence_path || "docs/evidence/official-compatibility-check.md" },
    { name: "Tests exist", ok: exists("tests/pala.test.ts"), evidence: "tests/pala.test.ts" },
    { name: "At least one run record", ok: ctx.db.prepare("SELECT COUNT(*) AS count FROM runs").get().count > 0, evidence: ".pala/db/pala.sqlite" },
    { name: "At least one decision record", ok: ctx.db.prepare("SELECT COUNT(*) AS count FROM decisions").get().count > 0, evidence: ".pala/db/pala.sqlite" },
    { name: "Mistake registry exists without requiring a fake captured mistake", ok: exists(".pala/memory/mistake-registry.jsonl"), evidence: ".pala/memory/mistake-registry.jsonl" },
    { name: "Bounded public readiness artifact inspection contract", ok: PUBLIC_READINESS_INSPECTION_CONTRACT.policy === "bounded_required_public_artifact_single_handle_scan" && PUBLIC_READINESS_INSPECTION_CONTRACT.required_file_count === 30 && PUBLIC_READINESS_INSPECTION_CONTRACT.max_file_bytes === 2_000_000 && PUBLIC_READINESS_INSPECTION_CONTRACT.max_total_text_bytes === 20_000_000 && PUBLIC_READINESS_INSPECTION_CONTRACT.payload_exposed === false && PUBLIC_READINESS_INSPECTION_CONTRACT.writes_allowed === false && publicReadiness.status === "safe_to_execute" && publicReadiness.scan_complete === true && publicReadiness.missing.length === 0 && publicReadiness.empty.length === 0 && publicReadiness.unsafe.length === 0 && publicReadiness.payload_exposed === false && readText("docs/CLI.md").includes("bounded_required_public_artifact_single_handle_scan") && readText("docs/ARCHITECTURE.md").includes("Public-readiness artifact inspection"), evidence: "pala public-readiness-check --strict" },
    { name: "Workflow contracts pass", ok: workflowContracts.failures.length === 0 && workflowContracts.scan_complete === true, evidence: "workflow-check" },
    { name: "No hardcoded personal paths in public files", ok: hardcodedPaths.status === "safe_to_execute" && hardcodedPaths.scan_complete === true && hardcodedPaths.finding_count === 0, evidence: "quality-radar" },
    { name: "Local ledgers contain no personal paths or secret-like values before export", ok: ledgerSafety.status === "safe_to_execute" && ledgerSafety.scan_complete === true && ledgerSafety.finding_count === 0, evidence: "ledger-safety-check" },
    { name: "Memory registry scan complete and valid", ok: memoryRegistry.status === "safe_to_execute" && memoryRegistry.scan_complete === true && memoryRegistry.record_count_exact === true && memoryRegistry.finding_count === 0 && memoryRegistry.records_truncated === false, evidence: "memory check" },
    { name: "No fake public publish claim", ok: docsHonesty.status === "safe_to_execute" && docsHonesty.scan_complete === true && docsHonesty.finding_count === 0, evidence: "docs-honesty-check" },
    { name: "No unresolved sync state", ok: sync.status === "safe_to_execute" && sync.scan_complete === true && sync.changed_files_count_exact === true && sync.changed_files_count === 0, evidence: "verify sync snapshot" },
    { name: "No unresolved push-readiness blockers", ok: pushReadiness.status === "safe_to_execute" && pushReadiness.scan_complete === true && pushReadiness.blockers.length === 0, evidence: "verify push-readiness snapshot" }
  ];
  const cliTextRead = cliTextReader.summary();
  checks.push({
    name: "Bounded CLI contract source-read contract",
    ok: CONTRACT_TEXT_READ_CONTRACT.policy === "bounded_cached_contract_text_reads_with_shared_budget"
      && CONTRACT_TEXT_READ_CONTRACT.max_file_bytes === 2_000_000
      && CONTRACT_TEXT_READ_CONTRACT.max_total_text_bytes === 20_000_000
      && CONTRACT_TEXT_READ_CONTRACT.post_read_path_recheck === true
      && CONTRACT_TEXT_READ_CONTRACT.payload_exposed === false
      && CONTRACT_TEXT_READ_CONTRACT.writes_allowed === false
      && cliTextRead.scan_complete === true
      && cliTextRead.text_file_read_count > 0
      && cliTextRead.payload_exposed === false,
    evidence: "CLI contract-source reads"
  });
  const failures = checks.filter((check) => !check.ok);
  const rootBlockers = [
    ...releaseBlockers,
    ...failures.flatMap((failure) => blockerIdsForVerificationFailure(failure.name, pushReadiness.blockers))
  ].filter((blocker, index, all) => all.indexOf(blocker) === index);
  const assessment = failures.length === 0
    ? { decision: "pass_allowed", riskLevel: "low", requiredApproval: false, reason: "All v28 verification and readiness checks have evidence with no unresolved blockers." }
    : { decision: "manual_verification_required", riskLevel: "medium", requiredApproval: false, reason: `${failures.length} v28 verification or readiness checks have unresolved blockers.` };
  const decision = recordDecision(ctx.db, {
    runId: ctx.runId,
    decisionType: "final-verify",
    inputs: { failures: failures.map((failure) => failure.name), release_blockers: releaseBlockers },
    assessment
  });
  return {
    status: failures.length === 0 ? "safe_to_execute" : "manual_verification_required",
    decision,
    checks,
    failures,
    root_blockers: rootBlockers,
    release_blockers: releaseBlockers,
    sync,
    push_readiness: pushReadiness,
    dashboard_truth: dashboardTruth,
    decision_review: decisionReview,
    admin,
    worker,
    external_skills: externalSkills,
    opportunity_radar: opportunityRadar,
    plan_source_truth: {
      contract: PLAN_SOURCE_TRUTH_CONTRACT,
      drift_fix_status: driftFixPlan.status,
      drift_fix_source_scan_complete: driftFixPlan.source_scan_complete,
      locale_sync_status: localeSyncPlan.status,
      locale_sync_source_scan_complete: localeSyncPlan.source_scan_complete,
      n8n_plan_status: n8nPlan.status,
      n8n_plan_source_truth_complete: n8nPlan.source_truth_complete
    },
    ledger_safety: ledgerSafety,
    memory_registry: memoryRegistry,
    hardcoded_paths: hardcodedPaths,
    docs_honesty: docsHonesty,
    workflow_contracts: workflowContracts,
    kernel_bootstrap: kernelBootstrap,
    db: database,
    note: "This is an evidence gate, not a fake PASS claim."
  };
}

function handleActionPlan(args, ctx) {
  const name = args[0];
  const dryRun = hasFlag(args, "dry-run");
  const goal = option(args, "goal") || "";
  const actions = {
    "worker-run": () => buildWorkerRunPlan({ dryRun }),
    "n8n-plan": buildN8nPlan,
    "n8n-import": () => buildN8nImportPlan({ dryRun, target: option(args, "target") }),
    "autopilot-plan": () => buildAutopilotPlan(goal),
    "autopilot-run": () => buildAutopilotRunGate(goal, { dryRun }),
    "external-skill-propose": () => buildExternalSkillProposal(option(args, "target")),
    "drift-fix": buildDriftFixPlan,
    "archive-old": () => buildArchivePlan({ olderThanDays: option(args, "older-than-days") }),
    "locale-sync": buildLocaleSyncPlan,
    "refactor-plan": buildRefactorPlan
  };
  const result = actions[name]();
  const assessment = {
    decision: result.status === "safe_to_execute" ? "safe_local_write" : result.status,
    riskLevel: result.status === "blocked" || result.status === "needs_approval" ? "high" : result.status === "manual_verification_required" ? "medium" : "low",
    requiredApproval: result.status === "needs_approval",
    reason: `${name} produced an evidence-backed local plan/gate and performed no execution.`
  };
  const decision = recordDecision(ctx.db, {
    runId: ctx.runId,
    decisionType: name,
    inputs: { dry_run: dryRun, goal: goal || null, target_provided: Boolean(option(args, "target")) },
    assessment
  });
  return {
    ...result,
    decision,
    plan_only: true,
    writes_performed: false,
    note: result.note || `${name} produced a local evidence-backed plan and performed no execution.`
  };
}

function handleMcpSmoke(args) {
  const plan = planMcpRepair({ action: "repair" });
  return { ...plan, status: hasFlag(args, "dry-run") ? plan.status : "needs_approval", note: "MCP smoke does not touch real config." };
}

function handleTokenLanguageCheck() {
  const files = ["README.md", "docs/product/positioning.md", "docs/product/public-copy.md"];
  const findings = [];
  for (const file of files) {
    const text = readText(file);
    if (/exact (token|cost)|saves .*%|cost saving/i.test(text) && !/estimated|without before\/after evidence|unless measured/i.test(text)) {
      findings.push({ file, summary: "Potential exact token/cost claim without measurement language." });
    }
  }
  return {
    status: findings.length === 0 ? "safe_to_execute" : "manual_verification_required",
    findings,
    rule: "Separate exact known usage from estimates."
  };
}

function handleReferenceCommand(ctx, name) {
  const rows = getReferenceRows(ctx.db);
  const categories = [...new Set(rows.map((row) => row.category))];
  const radar = referenceRadarState(ctx.db, "check");
  const coverage = referenceCoverage(ctx.db);
  const competitorEvidence = exists("docs/evidence/competitor-lessons.md");
  const accepted = name === "benchmark-check"
    ? radar.status === "checked" && coverage.gaps.length === 0
    : name === "competitor-lessons"
      ? competitorEvidence && rows.length > 0
      : radar.status === "checked" && rows.length >= 10;
  const assessment = {
    decision: accepted ? "safe_local_write" : "manual_verification_required",
    riskLevel: accepted ? "low" : "medium",
    requiredApproval: false,
    reason: accepted
      ? "Reference freshness, category coverage, and copy policy have evidence."
      : "Reference freshness, category coverage, or competitor-lesson evidence requires review."
  };
  const decision = recordDecision(ctx.db, {
    runId: ctx.runId,
    decisionType: name,
    inputs: { categories },
    assessment
  });
  return {
    status: decision.decision,
    decision,
    categories,
    sources: rows,
    radar,
    coverage,
    competitor_evidence: competitorEvidence,
    copy_policy: "Lessons only. Do not copy code, branding, UI text, or package names."
  };
}

function handleRepoInspection(name) {
  const inspections = {
    "architecture-check": inspectArchitecture,
    "code-map": buildCodeMap,
    "duplicate-check": inspectDuplicates,
    "dead-code-check": inspectDeadCode,
    "test-gap-check": inspectTestGaps,
    "playbook-check": inspectPlaybooks,
    "prompt-radar": inspectPrompts,
    "examples-check": inspectExamples,
    "skills-check": (options = {}) => inspectClaudeAssets("skills", options),
    "hooks-check": (options = {}) => inspectClaudeAssets("hooks", options),
    "agents-check": (options = {}) => inspectClaudeAssets("agents", options),
    "workflow-check": inspectWorkflowContracts
  };
  if (name === "doctor") {
    const textReader = createBoundedRepoTextReader();
    const reports = Object.fromEntries(Object.entries(inspections).map(([command, inspect]) => [command, inspect({ textReader })]));
    const blockers = Object.entries(reports)
      .filter(([, report]) => report.status !== "safe_to_execute")
      .map(([command]) => command);
    return {
      status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
      blockers,
      reports,
      ...textReader.summary(),
      note: "Doctor aggregates local read-only inspections and performs no repair."
    };
  }
  return inspections[name]();
}

function handleOperationalInspection(name) {
  const inspections = {
    "admin-check": inspectAdmin,
    "worker-check": inspectWorker,
    "n8n-check": inspectN8n,
    "language-policy-check": inspectLanguagePolicy,
    "i18n-check": inspectI18n,
    "rollback-check": inspectRollbackReadiness,
    "refactor-check": inspectRefactorReadiness,
    "smart-suggestions": inspectSmartSuggestions,
    "surprise-check": inspectSurprises,
    "external-skills-refresh": inspectExternalSkillsDryRun,
    "opportunity-radar": inspectOpportunityRadar
  };
  return inspections[name]();
}

async function handle(args, ctx) {
  const name = args[0] || "help";

  if (name === "help" || name === "--help" || name === "-h") {
    return {
      status: "safe_to_execute",
      commands: REQUIRED_COMMANDS,
      note: "Use npm run pala -- <command> in this workspace, or install/link the package to expose pala."
    };
  }
  if (name === "db") {
    return handleDb(args, ctx);
  }
  if (name === "runtime-check") {
    return runRuntimeCheck(ctx.db);
  }
  if (name === "memory") {
    return handleMemory(args, ctx);
  }
  if (name === "setup") {
    return handleSetup(args, ctx);
  }
  if (name === "panel") {
    return handlePanel(ctx);
  }
  if (name === "status") {
    const projectStateRead = readBoundedStateJson(".pala/state/project-state.json", { fallback: {} });
    const { value: projectState, ...projectStateReadMetadata } = projectStateRead;
    return {
      status: projectStateRead.status,
      blockers: projectStateRead.blockers,
      project_state: projectState,
      project_state_read: projectStateReadMetadata,
      db: dbStatus(ctx.db),
      latest_evidence: latestEvidence()?.path || null
    };
  }
  if (name === "plan") {
    const goal = option(args, "goal") || "unspecified";
    return {
      ...decisionResult(ctx, "plan", goal),
      dry_run_plan: ["read rules and memory", "check references and token budget", "execute local-only changes", "write evidence", "run verification gates"]
    };
  }
  if (name === "decision-review") {
    return buildDecisionReviewQueue(ctx.db, { maxQueue: option(args, "limit") });
  }
  if (name === "token-budget") {
    const goal = option(args, "goal") || "unspecified";
    const budget = estimateTokenBudget(goal);
    recordTokenUsage(ctx.db, ctx.runId, ctx.commandId, budget);
    ctx.db.prepare("UPDATE runs SET token_estimate = ?, token_confidence = ? WHERE id = ?").run(budget.estimated_tokens, budget.confidence, ctx.runId);
    return {
      ...decisionResult(ctx, "token-budget", goal, { tokenBudget: budget }),
      token_budget: budget
    };
  }
  if (name === "reference-refresh" || name === "benchmark-refresh") {
    const dryRun = hasFlag(args, "dry-run");
    const radar = refreshReferenceRadar(ctx.db, {
      dryRun,
      maxQueue: option(args, "max-queue")
    });
    const operationSafe = radar.operation_status === "safe_to_execute";
    const assessment = {
      decision: operationSafe ? (dryRun ? "dry_run_only" : "needs_approval") : "manual_verification_required",
      riskLevel: "medium",
      requiredApproval: operationSafe && !dryRun,
      reason: !operationSafe
        ? `Reference refresh state recording failed: ${radar.blockers.join(", ")}.`
        : dryRun
        ? "Reference refresh recorded a bounded local dry-run queue without external fetch."
        : "External reference refresh requires approval."
    };
    return {
      status: assessment.decision,
      radar,
      decision: recordDecision(ctx.db, {
        runId: ctx.runId,
        decisionType: name,
        inputs: {
          dry_run: dryRun,
          max_queue: radar.refresh_plan.queue_limit,
          stale_source_count: radar.refresh_plan.stale_source_count,
          category_gap_count: radar.refresh_plan.category_gaps.length
        },
        assessment
      })
    };
  }
  if (name === "reference-check" || name === "benchmark-check" || name === "competitor-lessons") {
    return handleReferenceCommand(ctx, name);
  }
  if (name === "stop-if-risk") {
    const goal = option(args, "goal") || "current local work";
    return decisionResult(ctx, "stop-if-risk", goal);
  }
  if (name === "next-actions") {
    const assessment = {
      decision: "safe_local_write",
      riskLevel: "low",
      requiredApproval: false,
      reason: "Next action is to continue local evidence-backed implementation or run verification gates."
    };
    return {
      ...decisionResult(ctx, "next-actions", "continue evidence-backed workflow", { assessment }),
      actions: ["run missing gates", "inspect failures", "record evidence", "avoid push/publish/delete without approval"]
    };
  }
  if (name === "dashboard-state") {
    return {
      status: "safe_to_execute",
      dashboard: dashboardState(ctx.db)
    };
  }
  if (name === "evidence") {
    return handleEvidenceCommand(args, ctx);
  }
  if (name === "drift-check") {
    return handleDriftCheck(args, ctx);
  }
  if (name === "sync-check") {
    return handleSyncCheck(ctx);
  }
  if (name === "push-check") {
    return handlePushCheck(ctx);
  }
  if (name === "quality-radar") {
    return handleQualityRadar(ctx);
  }
  if (name === "verify") {
    return handleVerify(ctx);
  }
  if (name === "token-economy") {
    return {
      status: "safe_to_execute",
      token_economy: tokenSummary(ctx.db)
    };
  }
  if (name === "mcp-smoke") {
    return handleMcpSmoke(args);
  }
  if (name === "dashboard-truth-check") {
    return handleDashboardTruthCheck(ctx);
  }
  if (name === "docs-honesty-check") {
    return handleDocsHonestyCheck();
  }
  if (name === "public-readiness-check") {
    return handlePublicReadinessCheck();
  }
  if (["architecture-check", "code-map", "duplicate-check", "dead-code-check", "test-gap-check", "playbook-check", "prompt-radar", "examples-check", "skills-check", "hooks-check", "agents-check", "workflow-check", "doctor"].includes(name)) {
    return handleRepoInspection(name);
  }
  if (["admin-check", "worker-check", "n8n-check", "language-policy-check", "i18n-check", "rollback-check", "refactor-check", "smart-suggestions", "surprise-check", "external-skills-refresh", "opportunity-radar"].includes(name)) {
    return handleOperationalInspection(name);
  }
  if (name === "ledger-safety-check") {
    return inspectLedgerSafety();
  }
  if (name === "ledger-redact") {
    return repairLedgerSafety({ apply: hasFlag(args, "apply") });
  }
  if (name === "token-language-check") {
    return handleTokenLanguageCheck();
  }
  if (name === "copy-check" || name === "positioning-check") {
    const docsHonesty = inspectDocsHonesty();
    return {
      ...docsHonesty,
      positioning: readText("docs/product/positioning.md").includes("Pala OS is not a coding agent"),
      core_line_present: readText("docs/product/positioning.md").includes("Agent does the work. Pala OS verifies the work.")
    };
  }
  if (ACTION_PLAN_COMMANDS.has(name)) {
    return handleActionPlan(args, ctx);
  }

  return unknownCliCommandResult(REQUIRED_COMMANDS);
}

async function main() {
  ensureKernel();
  const args = process.argv.slice(2);
  const db = openDatabase();
  const commandName = args[0] || "help";
  const knownTopLevelCommand = KNOWN_TOP_LEVEL_COMMANDS.has(commandName);
  const commandRecord = buildCliCommandRecord(knownTopLevelCommand ? args : ["<UNKNOWN_COMMAND>"]);
  const text = commandRecord.command;
  const runId = beginRun(db, text);
  const commandId = beginCommand(db, runId, text);
  const ctx = { db, runId, commandId, args, commandRecord };

  let result;
  try {
    result = await handle(args, ctx);
  } catch (error) {
    result = cliFailureResult(error);
  }
  const cliTextRead = cliTextReader.summary();
  if (cliTextRead.text_file_read_count > 0 || !cliTextRead.scan_complete) {
    result = { ...result, cli_text_read: cliTextRead };
  }
  if (!cliTextRead.scan_complete) {
    result = {
      ...result,
      status: result.status === "blocked" ? "blocked" : "manual_verification_required",
      blockers: [...new Set([...(Array.isArray(result.blockers) ? result.blockers : []), "cli_contract_text_read_incomplete"])]
    };
  }

  const worktreeObservation = inspectGitStatus();
  const strict = hasFlag(args, "strict");
  const finalized = finalizeCliCommand({
    db,
    runId,
    commandId,
    commandKind: knownTopLevelCommand ? `command-${commandName}` : "command-unknown",
    command: text,
    commandRecord,
    result,
    strict,
    worktreeObservation
  });

  const output = {
    ...finalized.result,
    ...finalized.completion,
    command_record: commandRecord,
    strict,
    finalization: finalized.finalization,
    state_refresh: finalized.stateRefresh,
    exit_code: finalized.exitCode,
    run_id: runId,
    command_id: commandId,
    raw_log_path: finalized.rawLogPath
  };
  const outputWrite = writeCliOutputAfterDatabaseClose(db, output);
  process.exitCode = outputWrite.exitCode ?? finalized.exitCode;
}

main().catch((error) => {
  writeTopLevelCliFailure(error);
  process.exitCode = 1;
});
