import { spawnSync } from "node:child_process";
import { PROJECT_ROOT } from "./paths.ts";

export const SYNC_OBSERVATION_CONTRACT = Object.freeze({
  status_policy: "bounded_git_porcelain_v1_z_with_explicit_process_truth",
  remote_policy: "bounded_git_remote_names_with_explicit_process_truth",
  head_policy: "bounded_git_rev_parse_head_with_validated_hash",
  timeout_ms: 5000,
  max_status_output_bytes: 1_000_000,
  max_remote_output_bytes: 64_000,
  max_head_output_bytes: 256,
  max_returned_changed_files: 120,
  max_returned_remotes: 50,
  raw_output_exposed: false,
  writes_allowed: false
});

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function asBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(String(value || ""), "utf8");
}

function normalizeObservation(observation) {
  return {
    status: Number.isInteger(observation?.status) ? observation.status : null,
    signal: observation?.signal || null,
    errorCode: observation?.error?.code || null,
    stdout: asBuffer(observation?.stdout),
    stderr: asBuffer(observation?.stderr)
  };
}

function runGitObservation(args, options, injectedObservation, maxOutputBytes) {
  const observation = injectedObservation || spawnSync("git", args, {
    cwd: options.projectRoot,
    encoding: null,
    timeout: options.timeoutMs,
    maxBuffer: maxOutputBytes,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"]
  });
  return normalizeObservation(observation);
}

function observationBlockers(prefix, observation, maxOutputBytes) {
  const outputLimitExceeded = ["ENOBUFS", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"].includes(observation.errorCode)
    || observation.stdout.length > maxOutputBytes
    || observation.stderr.length > maxOutputBytes;
  if (outputLimitExceeded) return [`${prefix}_output_limit_exceeded`];
  if (observation.errorCode === "ETIMEDOUT") return [`${prefix}_timed_out`];
  if (observation.errorCode || observation.status !== 0) return [`${prefix}_process_failed`];
  return [];
}

function observationMetadata(policy, observation, maxOutputBytes, timeoutMs) {
  return {
    policy,
    process_started: observation.errorCode !== "ENOENT",
    completed: observation.status !== null,
    timed_out: observation.errorCode === "ETIMEDOUT",
    output_limit_exceeded: ["ENOBUFS", "ERR_CHILD_PROCESS_STDIO_MAXBUFFER"].includes(observation.errorCode)
      || observation.stdout.length > maxOutputBytes
      || observation.stderr.length > maxOutputBytes,
    timeout_ms: timeoutMs,
    max_output_bytes: maxOutputBytes,
    exit_code: observation.status,
    signal: observation.signal,
    stdout_bytes: observation.stdout.length,
    stderr_present: observation.stderr.length > 0,
    raw_output_exposed: false
  };
}

function parsePorcelainV1Z(stdout, maxReturnedFiles) {
  if (stdout.length === 0) {
    return { status: "safe_to_execute", changedFiles: [], changedFileCount: 0 };
  }
  const text = stdout.toString("utf8");
  if (!text.endsWith("\0")) {
    return { status: "manual_verification_required", blocker: "git_status_output_invalid" };
  }
  const tokens = text.split("\0");
  tokens.pop();
  const changedFiles = [];
  let changedFileCount = 0;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.length < 4 || token[2] !== " ") {
      return { status: "manual_verification_required", blocker: "git_status_output_invalid" };
    }
    const status = token.slice(0, 2);
    const targetPath = token.slice(3);
    if (!targetPath) {
      return { status: "manual_verification_required", blocker: "git_status_output_invalid" };
    }
    let display = `${status} ${targetPath}`;
    if (/[RC]/.test(status)) {
      const sourcePath = tokens[index + 1];
      if (!sourcePath) {
        return { status: "manual_verification_required", blocker: "git_status_output_invalid" };
      }
      index += 1;
      display = `${status} ${sourcePath} -> ${targetPath}`;
    }
    changedFileCount += 1;
    if (changedFiles.length < maxReturnedFiles) changedFiles.push(display);
  }
  return { status: "safe_to_execute", changedFiles, changedFileCount };
}

export function inspectGitHead(options = {}) {
  const bounded = {
    projectRoot: options.projectRoot || PROJECT_ROOT,
    timeoutMs: boundedInteger(options.timeoutMs, SYNC_OBSERVATION_CONTRACT.timeout_ms, SYNC_OBSERVATION_CONTRACT.timeout_ms),
    maxOutputBytes: boundedInteger(options.maxHeadOutputBytes, SYNC_OBSERVATION_CONTRACT.max_head_output_bytes, SYNC_OBSERVATION_CONTRACT.max_head_output_bytes)
  };
  const observation = runGitObservation(
    ["rev-parse", "--verify", "HEAD"],
    bounded,
    options.headObservation,
    bounded.maxOutputBytes
  );
  const blockers = observationBlockers("git_head", observation, bounded.maxOutputBytes);
  let commitSha = null;
  if (blockers.length === 0) {
    const match = observation.stdout.toString("utf8").match(/^([0-9a-f]{40}|[0-9a-f]{64})(?:\r?\n)?$/i);
    if (match) {
      commitSha = match[1].toLowerCase();
    } else {
      blockers.push("git_head_output_invalid");
    }
  }
  const uniqueBlockers = [...new Set(blockers)];
  const scanComplete = uniqueBlockers.length === 0;
  return {
    status: scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: SYNC_OBSERVATION_CONTRACT,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    commit_available: scanComplete,
    commit_sha: scanComplete ? commitSha : null,
    observation: observationMetadata(
      SYNC_OBSERVATION_CONTRACT.head_policy,
      observation,
      bounded.maxOutputBytes,
      bounded.timeoutMs
    ),
    raw_output_exposed: false,
    writes_performed: false
  };
}

export function inspectGitStatus(options = {}) {
  const bounded = {
    projectRoot: options.projectRoot || PROJECT_ROOT,
    timeoutMs: boundedInteger(options.timeoutMs, SYNC_OBSERVATION_CONTRACT.timeout_ms, SYNC_OBSERVATION_CONTRACT.timeout_ms),
    maxOutputBytes: boundedInteger(options.maxStatusOutputBytes, SYNC_OBSERVATION_CONTRACT.max_status_output_bytes, SYNC_OBSERVATION_CONTRACT.max_status_output_bytes),
    maxReturnedFiles: boundedInteger(options.maxReturnedChangedFiles, SYNC_OBSERVATION_CONTRACT.max_returned_changed_files, SYNC_OBSERVATION_CONTRACT.max_returned_changed_files)
  };
  const observation = runGitObservation(
    ["status", "--porcelain=v1", "-z", "--untracked-files=normal"],
    bounded,
    options.statusObservation,
    bounded.maxOutputBytes
  );
  const blockers = observationBlockers("git_status", observation, bounded.maxOutputBytes);
  let parsed = null;
  if (blockers.length === 0) {
    parsed = parsePorcelainV1Z(observation.stdout, bounded.maxReturnedFiles);
    if (parsed.status !== "safe_to_execute") blockers.push(parsed.blocker);
  }
  const uniqueBlockers = [...new Set(blockers)];
  const scanComplete = uniqueBlockers.length === 0;
  const changedFiles = scanComplete ? parsed.changedFiles : [];
  const changedFileCount = scanComplete ? parsed.changedFileCount : null;
  return {
    status: scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: SYNC_OBSERVATION_CONTRACT,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    changed_files_count: changedFileCount,
    changed_files_count_exact: scanComplete,
    changed_files: changedFiles,
    returned_changed_file_count: changedFiles.length,
    changed_files_truncated: scanComplete && changedFileCount > changedFiles.length,
    observation: observationMetadata(
      SYNC_OBSERVATION_CONTRACT.status_policy,
      observation,
      bounded.maxOutputBytes,
      bounded.timeoutMs
    ),
    raw_output_exposed: false,
    writes_performed: false
  };
}

export function inspectGitRemotes(options = {}) {
  const bounded = {
    projectRoot: options.projectRoot || PROJECT_ROOT,
    timeoutMs: boundedInteger(options.timeoutMs, SYNC_OBSERVATION_CONTRACT.timeout_ms, SYNC_OBSERVATION_CONTRACT.timeout_ms),
    maxOutputBytes: boundedInteger(options.maxRemoteOutputBytes, SYNC_OBSERVATION_CONTRACT.max_remote_output_bytes, SYNC_OBSERVATION_CONTRACT.max_remote_output_bytes),
    maxReturnedRemotes: boundedInteger(options.maxReturnedRemotes, SYNC_OBSERVATION_CONTRACT.max_returned_remotes, SYNC_OBSERVATION_CONTRACT.max_returned_remotes)
  };
  const observation = runGitObservation(["remote"], bounded, options.remoteObservation, bounded.maxOutputBytes);
  const blockers = observationBlockers("git_remote", observation, bounded.maxOutputBytes);
  let allRemotes = [];
  if (blockers.length === 0) {
    const text = observation.stdout.toString("utf8");
    if (text.includes("\0")) {
      blockers.push("git_remote_output_invalid");
    } else {
      allRemotes = text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    }
  }
  const uniqueBlockers = [...new Set(blockers)];
  const scanComplete = uniqueBlockers.length === 0;
  const remotes = scanComplete ? allRemotes.slice(0, bounded.maxReturnedRemotes) : [];
  return {
    status: scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: SYNC_OBSERVATION_CONTRACT,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    remote_count: scanComplete ? allRemotes.length : null,
    remote_count_exact: scanComplete,
    remotes,
    returned_remote_count: remotes.length,
    remotes_truncated: scanComplete && allRemotes.length > remotes.length,
    observation: observationMetadata(
      SYNC_OBSERVATION_CONTRACT.remote_policy,
      observation,
      bounded.maxOutputBytes,
      bounded.timeoutMs
    ),
    raw_output_exposed: false,
    writes_performed: false
  };
}

export function gitStatusLines(options = {}) {
  return inspectGitStatus(options).changed_files;
}

export function inspectSync(options = {}) {
  const observation = inspectGitStatus(options);
  const blockers = [...observation.blockers];
  if (observation.scan_complete && observation.changed_files_count > 0) {
    blockers.push("worktree_has_uncommitted_or_untracked_files");
  }
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ...observation,
    status: uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: uniqueBlockers,
    note: observation.scan_complete
      ? "Sync-check reports bounded exact git worktree state only; it does not stage, commit, or push."
      : "Git worktree observation is incomplete; sync PASS remains blocked."
  };
}
