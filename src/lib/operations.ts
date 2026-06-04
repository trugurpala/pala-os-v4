import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { performance } from "node:perf_hooks";
import { inspectDocsHonesty, inspectHardcodedPaths, inspectWorkspaceHygiene } from "./quality-radar.ts";
import {
  inspectArchitecture,
  inspectClaudeAssets,
  inspectDeadCode,
  inspectDuplicates,
  inspectExamples,
  inspectPlaybooks,
  inspectPrompts,
  inspectRepoInventory,
  inspectTestGaps
} from "./repo-inspection.ts";
import { createBoundedRepoTextReader, inspectRepoPath, REPO_PATH_INSPECTION_CONTRACT, REPO_SCAN_CONTRACT, repoScanOptions } from "./repo-scan.ts";
import { redact } from "./redaction.ts";
import { inspectGitHead, inspectSync } from "./sync.ts";
import { PROJECT_ROOT } from "./paths.ts";
import { WORKER_PACKAGE_INSPECTION_CONTRACT, WORKER_SMOKE_CHECK_NAMES, WORKER_SMOKE_CONTRACT, inspectWorkerPackage } from "../worker.ts";

export const N8N_CLI_OBSERVATION_CONTRACT = Object.freeze({
  policy: "bounded_optional_n8n_version_metadata_with_redacted_first_line",
  windows_discovery_policy: "bounded_windows_where_n8n_cmd_presence_only",
  timeout_ms: 5000,
  max_output_bytes: 16_000,
  max_summary_chars: 160,
  raw_output_exposed: false,
  external_calls_allowed: false,
  writes_allowed: false
});

const I18N_ARTIFACT_PATHS = [
  { name: "English public README", path: "README.md" },
  { name: "Turkish usage mirror", path: "README-KULLANIM.md" }
];

export const I18N_ARTIFACT_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_fixed_i18n_artifact_path_metadata_scan",
  required_path_count: I18N_ARTIFACT_PATHS.length,
  path_policy: REPO_PATH_INSPECTION_CONTRACT.policy,
  payload_exposed: false,
  writes_allowed: false
});

export const EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_local_skill_readiness_without_external_fetch_or_install",
  source: ".claude/skills/**/SKILL.md",
  external_fetch_allowed: false,
  install_allowed: false,
  payload_exposed: false,
  writes_allowed: false
});

export const SMART_SUGGESTION_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_local_advisory_from_explicit_source_truth",
  source_count: 7,
  max_suggestions: 7,
  incomplete_source_policy: "manual_verification_required",
  raw_source_payload_exposed: false,
  payload_exposed: false,
  external_fetch_allowed: false,
  writes_allowed: false
});

export const OPPORTUNITY_RADAR_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_local_opportunities_from_smart_suggestion_truth",
  source_policy: SMART_SUGGESTION_INSPECTION_CONTRACT.policy,
  external_fetch_allowed: false,
  payload_exposed: false,
  writes_allowed: false
});

export const WORKER_ENTRYPOINT_INSPECTION_CONTRACT = Object.freeze({
  policy: "fixed_worker_entrypoint_path_metadata_scan",
  path_policy: REPO_PATH_INSPECTION_CONTRACT.policy,
  payload_exposed: false,
  writes_allowed: false
});

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value === null || value === undefined) return Buffer.alloc(0);
  return Buffer.from(String(value), "utf8");
}

function runBoundedCommand(command, args, options) {
  try {
    return spawnSync(command, args, {
      cwd: options.projectRoot || PROJECT_ROOT,
      encoding: null,
      timeout: options.timeoutMs,
      maxBuffer: options.maxOutputBytes,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch {
    return { status: null, stdout: "", stderr: "", error: { code: "COMMAND_RUNNER_ERROR" }, signal: null };
  }
}

function boundedProcessMetadata(result, maxOutputBytes) {
  const stdout = asBuffer(result?.stdout);
  const stderr = asBuffer(result?.stderr);
  const errorCode = result?.error?.code || null;
  const timedOut = errorCode === "ETIMEDOUT";
  const outputLimitExceeded = ["ENOBUFS", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"].includes(errorCode)
    || stdout.length > maxOutputBytes
    || stderr.length > maxOutputBytes;
  const processStarted = !["ENOENT", "EACCES"].includes(errorCode);
  const completed = processStarted && !result?.error && result?.status !== null && result?.status !== undefined;
  return {
    stdout,
    stderr,
    error_code: errorCode,
    process_started: processStarted,
    completed,
    timed_out: timedOut,
    output_limit_exceeded: outputLimitExceeded,
    exit_code: Number.isInteger(result?.status) ? result.status : null,
    signal: result?.signal || null,
    stdout_bytes: stdout.length,
    stderr_bytes: stderr.length,
    stderr_present: stderr.length > 0
  };
}

function inspectN8nVersion(options = {}) {
  const platform = options.platform || process.platform;
  const timeoutMs = boundedInteger(options.timeoutMs, N8N_CLI_OBSERVATION_CONTRACT.timeout_ms, N8N_CLI_OBSERVATION_CONTRACT.timeout_ms);
  const maxOutputBytes = boundedInteger(options.maxOutputBytes, N8N_CLI_OBSERVATION_CONTRACT.max_output_bytes, N8N_CLI_OBSERVATION_CONTRACT.max_output_bytes);
  const maxSummaryChars = boundedInteger(options.maxSummaryChars, N8N_CLI_OBSERVATION_CONTRACT.max_summary_chars, N8N_CLI_OBSERVATION_CONTRACT.max_summary_chars);
  const runOptions = { projectRoot: options.projectRoot, timeoutMs, maxOutputBytes };
  let discovery = {
    policy: N8N_CLI_OBSERVATION_CONTRACT.windows_discovery_policy,
    performed: false,
    process_started: false,
    completed: false,
    timed_out: false,
    output_limit_exceeded: false,
    timeout_ms: timeoutMs,
    max_output_bytes: maxOutputBytes,
    exit_code: null,
    signal: null,
    stdout_bytes: 0,
    stderr_bytes: 0,
    stderr_present: false,
    found: null,
    raw_output_exposed: false
  };

  if (platform === "win32" && !options.versionObservation) {
    const discoveryResult = options.discoveryObservation || runBoundedCommand("where.exe", ["n8n.cmd"], runOptions);
    const discoveryMetadata = boundedProcessMetadata(discoveryResult, maxOutputBytes);
    const found = discoveryMetadata.completed && discoveryMetadata.exit_code === 0 && discoveryMetadata.stdout.length > 0;
    discovery = {
      ...discovery,
      performed: true,
      process_started: discoveryMetadata.process_started,
      completed: discoveryMetadata.completed,
      timed_out: discoveryMetadata.timed_out,
      output_limit_exceeded: discoveryMetadata.output_limit_exceeded,
      exit_code: discoveryMetadata.exit_code,
      signal: discoveryMetadata.signal,
      stdout_bytes: discoveryMetadata.stdout_bytes,
      stderr_bytes: discoveryMetadata.stderr_bytes,
      stderr_present: discoveryMetadata.stderr_present,
      found
    };
    const discoveryBlockers = [];
    if (discoveryMetadata.output_limit_exceeded) discoveryBlockers.push("n8n_cli_discovery_output_limit_exceeded");
    else if (discoveryMetadata.timed_out) discoveryBlockers.push("n8n_cli_discovery_timed_out");
    else if (discoveryMetadata.error_code) discoveryBlockers.push("n8n_cli_discovery_process_failed");
    else if (discoveryMetadata.exit_code === 1) {
      return {
        status: "safe_to_execute",
        installed: false,
        blockers: [],
        discovery,
        observation: {
          policy: N8N_CLI_OBSERVATION_CONTRACT.policy,
          command: "n8n.cmd --version",
          process_started: false,
          completed: false,
          timed_out: false,
          output_limit_exceeded: false,
          timeout_ms: timeoutMs,
          max_output_bytes: maxOutputBytes,
          exit_code: null,
          signal: null,
          stdout_bytes: 0,
          stderr_bytes: 0,
          stderr_present: false,
          output_valid: false,
          summary: null,
          summary_truncated: false,
          raw_output_exposed: false
        }
      };
    } else if (discoveryMetadata.exit_code !== 0) discoveryBlockers.push("n8n_cli_discovery_nonzero_exit");
    else if (!found) discoveryBlockers.push("n8n_cli_discovery_invalid_output");

    if (discoveryBlockers.length > 0) {
      return {
        status: "manual_verification_required",
        installed: null,
        blockers: discoveryBlockers,
        discovery,
        observation: {
          policy: N8N_CLI_OBSERVATION_CONTRACT.policy,
          command: "n8n.cmd --version",
          process_started: false,
          completed: false,
          timed_out: false,
          output_limit_exceeded: false,
          timeout_ms: timeoutMs,
          max_output_bytes: maxOutputBytes,
          exit_code: null,
          signal: null,
          stdout_bytes: 0,
          stderr_bytes: 0,
          stderr_present: false,
          output_valid: false,
          summary: null,
          summary_truncated: false,
          raw_output_exposed: false
        }
      };
    }
  }

  const command = platform === "win32" ? "cmd.exe" : "n8n";
  const args = platform === "win32" ? ["/d", "/s", "/c", "n8n.cmd --version"] : ["--version"];
  const commandLabel = platform === "win32" ? "cmd.exe /d /s /c n8n.cmd --version" : "n8n --version";
  const result = options.versionObservation || runBoundedCommand(command, args, runOptions);
  const metadata = boundedProcessMetadata(result, maxOutputBytes);
  const { stdout, stderr } = metadata;
  const errorCode = metadata.error_code;
  const missing = errorCode === "ENOENT";
  const timedOut = metadata.timed_out;
  const outputLimitExceeded = metadata.output_limit_exceeded;
  const processStarted = metadata.process_started;
  const completed = metadata.completed;
  const summaryBuffer = stdout.length > 0 ? stdout : stderr;
  const firstLine = completed && result?.status === 0
    ? summaryBuffer.toString("utf8").split(/\r?\n/).find((line) => line.trim())?.trim() || ""
    : "";
  const redactedSummary = redact(firstLine).replace(/\s+/g, " ").trim();
  const summary = redactedSummary ? redactedSummary.slice(0, maxSummaryChars) : null;
  const outputValid = completed && result?.status === 0 && Boolean(summary) && !outputLimitExceeded;
  const blockers = [];
  if (!missing) {
    if (outputLimitExceeded) blockers.push("n8n_cli_version_output_limit_exceeded");
    else if (timedOut) blockers.push("n8n_cli_version_timed_out");
    else if (result?.error) blockers.push("n8n_cli_version_process_failed");
    else if (result?.status !== 0) blockers.push("n8n_cli_version_nonzero_exit");
    else if (!outputValid) blockers.push("n8n_cli_version_invalid_output");
  }
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    installed: missing ? false : blockers.length === 0 ? true : null,
    blockers,
    discovery,
    observation: {
      policy: N8N_CLI_OBSERVATION_CONTRACT.policy,
      command: commandLabel,
      process_started: processStarted,
      completed,
      timed_out: timedOut,
      output_limit_exceeded: outputLimitExceeded,
      timeout_ms: timeoutMs,
      max_output_bytes: maxOutputBytes,
      exit_code: Number.isInteger(result?.status) ? result.status : null,
      signal: result?.signal || null,
      stdout_bytes: stdout.length,
      stderr_bytes: stderr.length,
      stderr_present: stderr.length > 0,
      output_valid: outputValid,
      summary,
      summary_truncated: redactedSummary.length > maxSummaryChars,
      raw_output_exposed: false
    }
  };
}

const WINDOWS_PRIVILEGE_PROBE = [
  "$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())",
  "if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { 'elevated' } else { 'standard' }"
].join("; ");

export function inspectAdmin(options = {}) {
  const platform = options.platform || process.platform;
  let privilege = "unknown";
  let blockers = [];
  let detection;

  if (platform === "win32") {
    const observation = options.windowsObservation || spawnSync("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      WINDOWS_PRIVILEGE_PROBE
    ], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 8 * 1024,
      windowsHide: true
    });
    const normalizedOutput = String(observation.stdout || "").trim().toLowerCase();
    const outputValid = observation.status === 0 && ["standard", "elevated"].includes(normalizedOutput);
    if (outputValid) {
      privilege = normalizedOutput;
    } else if (observation.status !== 0 || observation.error) {
      blockers = ["windows_privilege_probe_failed"];
    } else {
      blockers = ["windows_privilege_probe_invalid_output"];
    }
    detection = {
      policy: "windows_principal_administrator_role_read_only",
      performed: true,
      process_started: true,
      completed: observation.status !== null && !observation.error,
      timed_out: observation.error?.code === "ETIMEDOUT",
      timeout_ms: 3000,
      exit_code: observation.status ?? null,
      output_valid: outputValid,
      stdout_bytes: Buffer.byteLength(String(observation.stdout || ""), "utf8"),
      stderr_present: Boolean(observation.stderr)
    };
  } else {
    const uid = Object.hasOwn(options, "uid")
      ? options.uid
      : typeof process.getuid === "function"
        ? process.getuid()
        : null;
    const uidValid = Number.isInteger(uid) && uid >= 0;
    if (uidValid) {
      privilege = uid === 0 ? "elevated" : "standard";
    } else {
      blockers = ["privilege_detection_unavailable_on_platform"];
    }
    detection = {
      policy: uidValid ? "posix_getuid" : "unavailable",
      performed: uidValid,
      process_started: false,
      completed: uidValid,
      timed_out: false,
      timeout_ms: null,
      exit_code: null,
      output_valid: uidValid,
      stdout_bytes: 0,
      stderr_present: false
    };
  }

  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers,
    privilege,
    platform,
    detection,
    elevation_requested: false,
    external_call_performed: false,
    writes_performed: false,
    destructive_action_performed: false,
    note: "Admin-check observes the current token only; it never requests elevation or changes system state."
  };
}

function workerSmokeContractValid(output) {
  return output?.status === "safe_to_execute"
    && output?.mode === "smoke_check"
    && JSON.stringify(output?.contract) === JSON.stringify(WORKER_SMOKE_CONTRACT)
    && output?.package_inspection?.policy === WORKER_PACKAGE_INSPECTION_CONTRACT.policy
    && output?.package_inspection?.status === "safe_to_execute"
    && output?.package_inspection?.parse_valid === true
    && output?.package_inspection?.script_configured === true
    && output?.package_inspection?.payload_exposed === false
    && output?.package_inspection?.writes_performed === false
    && Array.isArray(output?.checks)
    && output.checks.length === WORKER_SMOKE_CHECK_NAMES.length
    && output.checks.every((check, index) => check?.name === WORKER_SMOKE_CHECK_NAMES[index] && check?.ok === true && typeof check?.evidence === "string")
    && Array.isArray(output?.failures)
    && output.failures.length === 0
    && output?.workload_started === false
    && output?.external_call_performed === false
    && output?.writes_performed === false
    && output?.destructive_action_performed === false;
}

export function inspectWorker(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const workerEntrypoint = path.join(projectRoot, "src", "worker.ts");
  const entrypointInspection = inspectRepoPath("src/worker.ts", {
    projectRoot,
    expectedKind: "file"
  });
  const packageInspection = inspectWorkerPackage(projectRoot, { maxFileBytes: options.maxWorkerPackageBytes });
  const entrypointExists = entrypointInspection.exists;
  const entrypointSafe = entrypointInspection.status === "safe_to_execute"
    && entrypointExists
    && entrypointInspection.kind === "file";
  const smokeScriptConfigured = packageInspection.script_configured;
  const configured = entrypointSafe
    && packageInspection.status === "safe_to_execute"
    && smokeScriptConfigured;
  const blockers = [];
  if (!entrypointExists) blockers.push("worker_entrypoint_not_implemented");
  else if (!entrypointSafe && entrypointInspection.blocker) blockers.push(entrypointInspection.blocker);
  blockers.push(...packageInspection.blockers.filter((blocker) => blocker.startsWith("repo_text_")));
  if (!smokeScriptConfigured) blockers.push("worker_smoke_script_not_configured");

  let result = null;
  let output = null;
  let outputParsed = false;
  let elapsedMs = null;
  if (configured) {
    const startedAt = performance.now();
    result = spawnSync(process.execPath, ["--no-warnings=ExperimentalWarning", workerEntrypoint, "--smoke-check"], {
      cwd: projectRoot,
      encoding: "utf8",
      timeout: WORKER_SMOKE_CONTRACT.max_runtime_ms,
      maxBuffer: 64 * 1024,
      windowsHide: true
    });
    elapsedMs = Math.round(performance.now() - startedAt);
    try {
      output = JSON.parse(String(result.stdout || ""));
      outputParsed = true;
    } catch {
      // Invalid output is reported without exposing stdout.
    }
  }

  const timedOut = result?.error?.code === "ETIMEDOUT";
  const contractValid = outputParsed && workerSmokeContractValid(output);
  if (configured && timedOut) blockers.push("worker_smoke_timed_out");
  if (configured && result?.error && !timedOut) blockers.push("worker_smoke_process_error");
  if (configured && result?.status !== 0) blockers.push("worker_smoke_nonzero_exit");
  if (configured && !outputParsed) blockers.push("worker_smoke_invalid_json");
  if (configured && outputParsed && !contractValid) blockers.push("worker_smoke_contract_mismatch");

  const uniqueBlockers = [...new Set(blockers)];
  return {
    status: uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: uniqueBlockers,
    configured,
    entrypoint_contract: WORKER_ENTRYPOINT_INSPECTION_CONTRACT,
    entrypoint_inspection: entrypointInspection,
    package_inspection: packageInspection,
    worker_files: entrypointSafe ? ["src/worker.ts"] : [],
    smoke_check: {
      policy: "single_bounded_local_read_only_smoke_process",
      performed: configured,
      process_started: configured,
      completed: Boolean(configured && !timedOut && result?.status !== null),
      timed_out: Boolean(timedOut),
      timeout_ms: WORKER_SMOKE_CONTRACT.max_runtime_ms,
      elapsed_ms: elapsedMs,
      exit_code: result?.status ?? null,
      output_parsed: outputParsed,
      contract_valid: Boolean(contractValid),
      reported_status: output?.status || null,
      checks_total: Array.isArray(output?.checks) ? output.checks.length : null,
      failures_total: Array.isArray(output?.failures) ? output.failures.length : null,
      stdout_bytes: result ? Buffer.byteLength(String(result.stdout || ""), "utf8") : 0,
      stderr_present: Boolean(result?.stderr)
    },
    worker_started: false,
    workload_started: false,
    external_call_performed: false,
    writes_performed: false,
    destructive_action_performed: false,
    note: uniqueBlockers.length === 0
      ? "Dedicated worker entrypoint completed its bounded local read-only smoke contract; no workload was started."
      : "Worker readiness requires a regular project-local entrypoint, fixed package script, and successful bounded smoke contract."
  };
}

export function inspectN8n(options = {}) {
  const version = inspectN8nVersion(options);
  return {
    status: version.status,
    contract: N8N_CLI_OBSERVATION_CONTRACT,
    installed: version.installed,
    blockers: version.blockers,
    discovery: version.discovery,
    observation: version.observation,
    workflow_activated: false,
    external_call_performed: false,
    writes_performed: false,
    raw_output_exposed: false,
    note: version.installed === true
      ? "Local n8n CLI is available; activation remains approval-gated."
      : version.installed === false
        ? "n8n is optional and was not found locally."
        : "n8n installation state is unknown because the bounded version observation failed."
  };
}

export function inspectLanguagePolicy(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const inventory = inspectRepoInventory(bounded);
  const blockers = [...inventory.blockers];
  const checkedRoots = ["src", "tests", ".pala/schema"];
  const nonAsciiCodePaths = inventory.files
    .filter((file) => checkedRoots.some((root) => file === root || file.startsWith(`${root}/`)))
    .filter((file) => /[^\x00-\x7F]/.test(file));
  const readmeInspection = textReader.read("README.md");
  if (readmeInspection.status !== "safe_to_execute") blockers.push(readmeInspection.blocker);
  const readme = readmeInspection.text || "";
  const findings = nonAsciiCodePaths.map((file) => ({ severity: "medium", file, summary: "Code/schema/test path contains non-ASCII characters." }));
  if (!/^# Pala OS/m.test(readme)) findings.push({ severity: "medium", file: "README.md", summary: "Public README is not English-first." });
  const textRead = textReader.summary();
  const uniqueBlockers = [...new Set([...blockers, ...textRead.text_read_blockers])];
  return {
    status: findings.length === 0 && uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    checked_roots: checkedRoots,
    findings,
    blockers: uniqueBlockers,
    scan_complete: uniqueBlockers.length === 0,
    scan_truncated: inventory.scan_truncated,
    scanned_entry_count: inventory.scanned_entry_count,
    ...textRead,
    payload_exposed: false,
    writes_performed: false,
    rule: "Code, CLI, API, schema, and public README are English-first; localized guides may mirror them."
  };
}

export function inspectI18n(options = {}) {
  const bounded = repoScanOptions(options);
  const languagePolicy = inspectLanguagePolicy({ ...bounded, textReader: options.textReader });
  const artifactInspections = I18N_ARTIFACT_PATHS.map((artifact) => inspectRepoPath(artifact.path, {
    ...bounded,
    expectedKind: "file"
  }));
  const checks = [
    ...I18N_ARTIFACT_PATHS.map((artifact, index) => ({
      name: artifact.name,
      ok: artifactInspections[index].status === "safe_to_execute"
        && artifactInspections[index].exists
        && artifactInspections[index].kind === "file",
      evidence: artifact.path
    })),
    { name: "Code paths stay English/ASCII", ok: languagePolicy.status === "safe_to_execute", evidence: "language-policy-check" }
  ];
  const failures = checks.filter((check) => !check.ok);
  const blockers = [...new Set([
    ...languagePolicy.blockers,
    ...artifactInspections.filter((item) => item.status !== "safe_to_execute").map((item) => item.blocker)
  ])];
  const scanComplete = languagePolicy.scan_complete && blockers.length === 0;
  return {
    status: failures.length === 0 && scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: I18N_ARTIFACT_INSPECTION_CONTRACT,
    checks,
    failures,
    blockers,
    scan_complete: scanComplete,
    artifact_inspections: artifactInspections,
    language_policy: languagePolicy,
    payload_exposed: false,
    writes_performed: false,
    locale_sync_performed: false
  };
}

export function inspectRollbackReadiness(options = {}) {
  const head = inspectGitHead(options);
  const sync = inspectSync(options);
  const blockers = [
    ...head.blockers,
    ...(!head.commit_available ? ["no_commit_baseline"] : []),
    ...sync.blockers
  ];
  const uniqueBlockers = [...new Set(blockers)];
  return {
    status: uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    baseline_commit_available: head.commit_available,
    baseline_commit: head.commit_sha,
    baseline_scan_complete: head.scan_complete,
    baseline_observation: head.observation,
    blockers: uniqueBlockers,
    raw_output_exposed: false,
    writes_performed: false,
    rollback_performed: false,
    note: head.scan_complete
      ? "Rollback-check reports validated bounded HEAD and worktree truth only; it never resets or deletes files."
      : "Rollback readiness is blocked until bounded HEAD observation succeeds."
  };
}

export function inspectRefactorReadiness() {
  const architecture = inspectArchitecture();
  const testGaps = inspectTestGaps();
  const rollback = inspectRollbackReadiness();
  const blockers = [
    ...(architecture.status === "safe_to_execute" ? [] : ["architecture_contract_incomplete"]),
    ...(testGaps.status === "safe_to_execute" ? [] : ["test_gaps_present"]),
    ...rollback.blockers
  ];
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: [...new Set(blockers)],
    architecture,
    test_gaps: testGaps,
    rollback,
    refactor_performed: false
  };
}

export function inspectSurprises(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const sharedOptions = { ...bounded, textReader };
  const reports = {
    docs_honesty: inspectDocsHonesty(sharedOptions),
    hardcoded_paths: inspectHardcodedPaths(sharedOptions),
    workspace_hygiene: inspectWorkspaceHygiene(sharedOptions),
    duplicates: inspectDuplicates(sharedOptions),
    dead_code: inspectDeadCode(sharedOptions)
  };
  const findingCount = reports.docs_honesty.finding_count
    + reports.hardcoded_paths.finding_count
    + reports.workspace_hygiene.finding_count
    + reports.duplicates.duplicate_group_count
    + reports.dead_code.finding_count;
  const textRead = textReader.summary();
  const blockers = [...new Set([...Object.values(reports).flatMap((report) => report.blockers || []), ...textRead.text_read_blockers])];
  return {
    status: findingCount === 0 && blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    finding_count: findingCount,
    blockers,
    scan_complete: blockers.length === 0,
    ...textRead,
    reports,
    note: "Surprise-check is read-only and reports exact-content/static-reference heuristics."
  };
}

export function inspectSmartSuggestions(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const sharedOptions = { ...options, ...bounded, textReader };
  const reports = {
    architecture: inspectArchitecture(sharedOptions),
    tests: inspectTestGaps(sharedOptions),
    playbooks: inspectPlaybooks(sharedOptions),
    prompts: inspectPrompts(sharedOptions),
    examples: inspectExamples(sharedOptions),
    worker: inspectWorker(sharedOptions),
    rollback: inspectRollbackReadiness(sharedOptions)
  };
  const suggestions = [];
  for (const [area, report] of Object.entries(reports)) {
    if (report.status !== "safe_to_execute") {
      suggestions.push({ area, priority: area === "rollback" ? "high" : "medium", action: `Review ${area} findings and preserve evidence before changing behavior.` });
    }
  }
  const incompleteSources = Object.entries(reports)
    .filter(([, report]) => report.scan_complete === false)
    .map(([area]) => area);
  const sourceStatuses = Object.fromEntries(Object.entries(reports).map(([area, report]) => [area, {
    status: report.status,
    scan_complete: report.scan_complete !== false,
    blocker_count: Array.isArray(report.blockers) ? report.blockers.length : 0,
    finding_count: Number.isInteger(report.finding_count)
      ? report.finding_count
      : Array.isArray(report.failures)
        ? report.failures.length
        : null
  }]));
  const blockers = incompleteSources.map((area) => `smart_suggestion_source_incomplete:${area}`);
  return {
    status: incompleteSources.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: SMART_SUGGESTION_INSPECTION_CONTRACT,
    suggestions: suggestions.slice(0, SMART_SUGGESTION_INSPECTION_CONTRACT.max_suggestions),
    source_statuses: sourceStatuses,
    incomplete_sources: incompleteSources,
    blockers,
    scan_complete: incompleteSources.length === 0,
    ...textReader.summary(),
    advisory_only: true,
    payload_exposed: false,
    external_fetch_performed: false,
    writes_performed: false
  };
}

export function inspectExternalSkillsDryRun(options = {}) {
  const skills = inspectClaudeAssets("skills", options);
  const localReadinessConfirmed = skills.status === "safe_to_execute" && skills.scan_complete === true;
  return {
    status: localReadinessConfirmed ? "dry_run_only" : "manual_verification_required",
    contract: EXTERNAL_SKILL_REFRESH_INSPECTION_CONTRACT,
    local_skills: skills.assets,
    local_skill_status: skills.status,
    local_readiness_status: skills.status,
    local_skill_count: skills.assets.length,
    ready_skill_count: skills.ready_skill_count,
    unready_skill_count: skills.unready_skill_count,
    skill_readiness: skills.skill_readiness,
    failures: skills.failures,
    blockers: skills.blockers,
    scan_complete: skills.scan_complete,
    scan_truncated: skills.scan_truncated,
    external_fetch_performed: false,
    install_performed: false,
    approval_required_before_install: true,
    payload_exposed: false,
    writes_performed: false,
    note: "External skill refresh performs a bounded local readiness inspection only; no marketplace search, fetch, or install is performed."
  };
}

export function inspectOpportunityRadar(options = {}) {
  const suggestions = inspectSmartSuggestions(options);
  return {
    status: suggestions.status,
    contract: OPPORTUNITY_RADAR_INSPECTION_CONTRACT,
    opportunities: suggestions.suggestions,
    source_statuses: suggestions.source_statuses,
    incomplete_sources: suggestions.incomplete_sources,
    blockers: suggestions.blockers,
    scan_complete: suggestions.scan_complete,
    source: "local inspections only",
    advisory_only: true,
    external_fetch_performed: false,
    payload_exposed: false,
    writes_performed: false,
    note: suggestions.scan_complete === false
      ? "Local opportunity source truth is incomplete; review blockers before relying on the radar."
      : suggestions.suggestions.length === 0
        ? "No high-confidence local opportunity was detected."
        : "Opportunities are advisory and require evidence-backed implementation."
  };
}
