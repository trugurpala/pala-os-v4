import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { makeId, nowIso } from "./db.ts";
import { PROJECT_ROOT } from "./paths.ts";
import { redact } from "./redaction.ts";
import { inspectRepoPath, REPO_PATH_INSPECTION_CONTRACT } from "./repo-scan.ts";

const RUNTIME_COMMANDS = Object.freeze([
  { id: "claude_version", command: "claude", args: ["--version"] },
  { id: "node_version", command: "node", args: ["--version"] },
  { id: "npm_version", command: process.platform === "win32" ? "npm.cmd" : "npm", args: ["--version"] },
  { id: "git_version", command: "git", args: ["--version"] },
  { id: "claude_mcp_help", command: "claude", args: ["mcp", "--help"] }
]);

const RUNTIME_PROJECT_ASSETS = Object.freeze([
  { id: "settings", path: ".claude/settings.json", kind: "file" },
  { id: "recommended_hooks", path: ".claude/settings.recommended-after-smoke.json", kind: "file" },
  { id: "hook_guard", path: ".claude/hooks/pretooluse-guard.mjs", kind: "file" },
  { id: "skills", path: ".claude/skills", kind: "directory" },
  { id: "agents", path: ".claude/agents", kind: "directory" }
]);

export const RUNTIME_OBSERVATION_CONTRACT = Object.freeze({
  policy: "bounded_fixed_command_process_metadata_with_redacted_first_line",
  timeout_ms: 5000,
  max_output_bytes: 64_000,
  max_summary_chars: 160,
  command_count: RUNTIME_COMMANDS.length,
  raw_output_exposed: false,
  external_calls_allowed: false,
  writes_allowed: false
});

export const RUNTIME_PROJECT_ASSET_CONTRACT = Object.freeze({
  policy: "bounded_fixed_runtime_project_asset_path_metadata_scan",
  required_path_count: RUNTIME_PROJECT_ASSETS.length,
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

function runCommand(command, args, options) {
  const executable = process.platform === "win32" && command.endsWith(".cmd")
    ? process.env.ComSpec || "cmd.exe"
    : command;
  const executableArgs = executable === command ? args : ["/d", "/s", "/c", command, ...args];
  return spawnSync(executable, executableArgs, {
    cwd: options.projectRoot,
    timeout: options.timeoutMs,
    maxBuffer: options.maxOutputBytes,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
}

function firstLineSummary(buffer, maxSummaryChars) {
  const firstLine = buffer.toString("utf8").split(/\r?\n/).find((line) => line.trim())?.trim() || "";
  const redacted = redact(firstLine).replace(/\s+/g, " ").trim();
  return {
    summary: redacted ? redacted.slice(0, maxSummaryChars) : null,
    summary_truncated: redacted.length > maxSummaryChars
  };
}

function commandObservation(spec, options) {
  let result;
  try {
    result = options.commandRunner
      ? options.commandRunner(spec.command, spec.args, {
          timeoutMs: options.timeoutMs,
          maxOutputBytes: options.maxOutputBytes,
          projectRoot: options.projectRoot
        })
      : runCommand(spec.command, spec.args, options);
  } catch {
    result = { status: null, stdout: "", stderr: "", error: { code: "COMMAND_RUNNER_ERROR" }, signal: null };
  }

  const stdout = asBuffer(result?.stdout);
  const stderr = asBuffer(result?.stderr);
  const errorCode = result?.error?.code || null;
  const timedOut = errorCode === "ETIMEDOUT";
  const outputLimitExceeded = errorCode === "ENOBUFS"
    || stdout.length > options.maxOutputBytes
    || stderr.length > options.maxOutputBytes;
  const processStarted = !["ENOENT", "EACCES"].includes(errorCode);
  const completed = processStarted
    && !result?.error
    && result?.status !== null
    && result?.status !== undefined
    && !timedOut
    && !outputLimitExceeded;
  const summarySource = stdout.length > 0 ? "stdout_first_line" : stderr.length > 0 ? "stderr_first_line" : "none";
  const summaryTruth = completed && result?.status === 0 && summarySource !== "none"
    ? firstLineSummary(summarySource === "stdout_first_line" ? stdout : stderr, options.maxSummaryChars)
    : { summary: null, summary_truncated: false };
  const outputValid = completed && result?.status === 0 && Boolean(summaryTruth.summary);
  const blockers = [];
  if (!processStarted) blockers.push(`${spec.id}_process_not_started`);
  else if (timedOut) blockers.push(`${spec.id}_timed_out`);
  else if (outputLimitExceeded) blockers.push(`${spec.id}_output_limit_exceeded`);
  else if (result?.error) blockers.push(`${spec.id}_process_error`);
  else if (result?.status !== 0) blockers.push(`${spec.id}_nonzero_exit`);
  else if (!outputValid) blockers.push(`${spec.id}_invalid_output`);

  return {
    id: spec.id,
    command: `${spec.command} ${spec.args.join(" ")}`.trim(),
    process_started: processStarted,
    completed,
    timed_out: timedOut,
    output_limit_exceeded: outputLimitExceeded,
    timeout_ms: options.timeoutMs,
    max_output_bytes: options.maxOutputBytes,
    exit_code: Number.isInteger(result?.status) ? result.status : null,
    signal: result?.signal || null,
    stdout_bytes: stdout.length,
    stderr_bytes: stderr.length,
    stderr_present: stderr.length > 0,
    output_valid: outputValid,
    summary: summaryTruth.summary,
    summary_source: summarySource,
    summary_truncated: summaryTruth.summary_truncated,
    blockers,
    raw_output_exposed: false
  };
}

export function detectAgentSurface(observations = [], env = process.env) {
  const originator = String(env.CODEX_INTERNAL_ORIGINATOR_OVERRIDE || "").toLowerCase();
  if (originator.includes("codex") && originator.includes("desktop")) {
    return { agent_surface: "codex-desktop", source: "environment_marker" };
  }
  if (originator.includes("codex") || env.CODEX_SHELL) {
    return { agent_surface: "codex-shell", source: "environment_marker" };
  }
  if (env.CLAUDE_CODE_ENTRYPOINT || env.CLAUDECODE) {
    return { agent_surface: "claude-code", source: "environment_marker" };
  }
  return {
    agent_surface: "unknown",
    source: observations.some((item) => item.command === "claude --version" && item.exit_code === 0)
      ? "installed_cli_is_not_active_surface_evidence"
      : "unknown"
  };
}

export function inspectRuntimeProjectAssets(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const inspections = RUNTIME_PROJECT_ASSETS.map((asset) => inspectRepoPath(asset.path, {
    projectRoot,
    expectedKind: asset.kind
  }));
  const blockers = [...new Set(inspections.flatMap((inspection, index) => {
    if (inspection.status !== "safe_to_execute") {
      return [`runtime_project_asset_unsafe:${RUNTIME_PROJECT_ASSETS[index].id}:${inspection.blocker}`];
    }
    if (!inspection.exists) {
      return [`runtime_project_asset_missing:${RUNTIME_PROJECT_ASSETS[index].id}`];
    }
    return [];
  }))];
  const assets = Object.fromEntries(RUNTIME_PROJECT_ASSETS.map((asset, index) => [
    asset.id,
    inspections[index].status === "safe_to_execute"
      && inspections[index].exists
      && inspections[index].kind === asset.kind
  ]));
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: RUNTIME_PROJECT_ASSET_CONTRACT,
    blockers,
    inspections,
    assets,
    payload_exposed: false,
    writes_performed: false
  };
}

export function observeRuntime(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const timeoutMs = boundedInteger(options.timeoutMs, RUNTIME_OBSERVATION_CONTRACT.timeout_ms, RUNTIME_OBSERVATION_CONTRACT.timeout_ms);
  const maxOutputBytes = boundedInteger(options.maxOutputBytes, RUNTIME_OBSERVATION_CONTRACT.max_output_bytes, RUNTIME_OBSERVATION_CONTRACT.max_output_bytes);
  const maxSummaryChars = boundedInteger(options.maxSummaryChars, RUNTIME_OBSERVATION_CONTRACT.max_summary_chars, RUNTIME_OBSERVATION_CONTRACT.max_summary_chars);
  const env = options.env || process.env;
  const observations = RUNTIME_COMMANDS.map((spec) => commandObservation(spec, {
    projectRoot,
    timeoutMs,
    maxOutputBytes,
    maxSummaryChars,
    commandRunner: options.commandRunner
  }));
  const processObservationBlockers = [...new Set(observations.flatMap((item) => item.blockers))];
  const observedModel = env.ANTHROPIC_MODEL || "unknown";
  const observedEffort = env.CLAUDE_CODE_EFFORT_LEVEL || "unknown";
  const surface = detectAgentSurface(observations, env);
  const projectAssets = inspectRuntimeProjectAssets({ projectRoot });

  return {
    checked_at: nowIso(),
    contract: RUNTIME_OBSERVATION_CONTRACT,
    process_observation_status: processObservationBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    process_observation_blockers: processObservationBlockers,
    project_asset_contract: projectAssets.contract,
    project_asset_status: projectAssets.status,
    project_asset_blockers: projectAssets.blockers,
    project_asset_inspections: projectAssets.inspections,
    observations,
    raw_output_exposed: false,
    external_call_performed: false,
    writes_performed: false,
    agent_surface: surface.agent_surface,
    agent_surface_source: surface.source,
    observed_model: observedModel,
    observed_effort: observedEffort,
    model_effort_source: observedModel !== "unknown" || observedEffort !== "unknown" ? "environment" : "unknown",
    confidence: observedModel !== "unknown" || observedEffort !== "unknown" ? "medium" : "low",
    interactive_checks: {
      status: "manual_verification_required",
      commands: ["/status", "/model", "/effort", "/mcp"],
      reason: "Slash commands are interactive and were not invoked from the non-interactive Pala CLI."
    },
    project_assets: projectAssets.assets
  };
}

export function recordRuntimeObservation(db, observation, evidencePath) {
  const sessionId = makeId("operator");
  db.prepare(`
    INSERT INTO operator_sessions
      (id, started_at, ended_at, agent_surface, model_observed, effort_observed, status, evidence_path)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    sessionId,
    observation.checked_at,
    nowIso(),
    observation.agent_surface,
    observation.observed_model,
    observation.observed_effort,
    observation.interactive_checks.status,
    evidencePath || null
  );
  const observationId = makeId("model_effort");
  db.prepare(`
    INSERT INTO model_effort_observations
      (id, session_id, observed_model, observed_effort, source, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    observationId,
    sessionId,
    observation.observed_model,
    observation.observed_effort,
    observation.model_effort_source,
    observation.confidence,
    nowIso()
  );
  return { session_id: sessionId, observation_id: observationId };
}
