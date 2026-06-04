import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { readBoundedRepoText } from "./lib/repo-scan.ts";

export const WORKER_SMOKE_SCRIPT = "node --no-warnings=ExperimentalWarning ./src/worker.ts --smoke-check";

export const WORKER_SMOKE_CONTRACT = Object.freeze({
  protocol_version: 1,
  policy: "single_bounded_local_read_only_task",
  max_runtime_ms: 2000,
  arbitrary_commands_allowed: false,
  external_calls_allowed: false,
  writes_allowed: false,
  destructive_actions_allowed: false
});

export const WORKER_PACKAGE_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_single_handle_worker_package_json",
  max_file_bytes: 1_000_000,
  payload_exposed: false,
  writes_allowed: false
});

export const WORKER_SMOKE_CHECK_NAMES = Object.freeze([
  "node_runtime_meets_project_floor",
  "package_json_is_parseable",
  "worker_entrypoint_is_regular_project_file",
  "worker_smoke_script_is_fixed"
]);

function isInsideProject(projectRoot, targetPath) {
  const relative = path.relative(projectRoot, targetPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function inspectWorkerPackageWithPayload(projectRoot, options = {}) {
  const resolvedRoot = path.resolve(projectRoot);
  const maxFileBytes = boundedInteger(options.maxFileBytes, WORKER_PACKAGE_INSPECTION_CONTRACT.max_file_bytes, WORKER_PACKAGE_INSPECTION_CONTRACT.max_file_bytes);
  const inspected = readBoundedRepoText("package.json", {
    projectRoot: resolvedRoot,
    maxTextFileBytes: maxFileBytes,
    maxTotalTextBytes: maxFileBytes
  });
  const blockers = [];
  let packageJson = null;
  let parsePerformed = false;
  let parseValid = false;
  if (inspected.status !== "safe_to_execute") {
    blockers.push(inspected.blocker || "worker_package_json_inspection_failed");
  } else if (!inspected.exists) {
    blockers.push("worker_package_json_missing");
  } else {
    parsePerformed = true;
    try {
      const parsed = JSON.parse(inspected.text);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("package root must be an object");
      packageJson = parsed;
      parseValid = true;
    } catch {
      blockers.push("worker_package_json_invalid");
    }
  }
  const inspection = {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    policy: WORKER_PACKAGE_INSPECTION_CONTRACT.policy,
    blockers,
    scan_complete: inspected.status === "safe_to_execute",
    target: "package.json",
    target_exists: Boolean(inspected.exists),
    target_read_performed: Boolean(inspected.exists && inspected.single_file_handle_used),
    single_file_handle_used: Boolean(inspected.single_file_handle_used),
    content_stable_during_read: Boolean(inspected.content_stable_during_read),
    post_read_path_recheck_performed: Boolean(inspected.post_read_path_recheck_performed),
    file_bytes: Number.isInteger(inspected.bytes) ? inspected.bytes : null,
    file_byte_limit: maxFileBytes,
    parse_performed: parsePerformed,
    parse_valid: parseValid,
    script_configured: parseValid && packageJson?.scripts?.["worker:smoke"] === WORKER_SMOKE_SCRIPT,
    payload_exposed: false,
    writes_performed: false
  };
  return { packageJson, inspection };
}

export function inspectWorkerPackage(projectRoot = process.cwd(), options = {}) {
  return inspectWorkerPackageWithPayload(projectRoot, options).inspection;
}

function inspectEntrypoint(projectRoot) {
  try {
    const entrypoint = path.join(projectRoot, "src", "worker.ts");
    const stat = fs.lstatSync(entrypoint);
    return stat.isFile()
      && !stat.isSymbolicLink()
      && isInsideProject(fs.realpathSync(projectRoot), fs.realpathSync(entrypoint));
  } catch {
    return false;
  }
}

export function runWorkerSmoke(projectRoot = process.cwd()) {
  const packageResult = inspectWorkerPackageWithPayload(projectRoot);
  const packageJson = packageResult.packageJson;
  const packageInspection = packageResult.inspection;
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const checks = [
    { name: WORKER_SMOKE_CHECK_NAMES[0], ok: Number.isInteger(nodeMajor) && nodeMajor >= 24, evidence: "process.versions.node" },
    { name: WORKER_SMOKE_CHECK_NAMES[1], ok: packageInspection.parse_valid, evidence: "package.json" },
    { name: WORKER_SMOKE_CHECK_NAMES[2], ok: inspectEntrypoint(projectRoot), evidence: "src/worker.ts" },
    { name: WORKER_SMOKE_CHECK_NAMES[3], ok: packageInspection.script_configured, evidence: "package.json#scripts.worker:smoke" }
  ];
  const failures = checks.filter((check) => !check.ok);
  return {
    status: failures.length === 0 ? "safe_to_execute" : "manual_verification_required",
    mode: "smoke_check",
    contract: WORKER_SMOKE_CONTRACT,
    package_inspection: packageInspection,
    checks,
    failures,
    workload_started: false,
    external_call_performed: false,
    writes_performed: false,
    destructive_action_performed: false,
    note: "Worker smoke-check runs one fixed local read-only self-check and exits without starting a workload."
  };
}

function blockedWorkerMode() {
  return {
    status: "blocked",
    mode: "unsupported",
    blockers: ["unsupported_worker_mode"],
    contract: WORKER_SMOKE_CONTRACT,
    workload_started: false,
    external_call_performed: false,
    writes_performed: false,
    destructive_action_performed: false,
    note: "Only --smoke-check is accepted; arbitrary worker tasks are disabled."
  };
}

function main() {
  const result = process.argv.slice(2).length === 1 && process.argv[2] === "--smoke-check"
    ? runWorkerSmoke()
    : blockedWorkerMode();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.status !== "safe_to_execute") {
    process.exitCode = 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main();
}
