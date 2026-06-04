import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { PROJECT_ROOT, toProjectPath } from "./paths.ts";
import { redact } from "./redaction.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
const ATOMIC_REPLACE_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));
const TRANSIENT_ATOMIC_REPLACE_ERROR_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);
const ALLOWED_STATE_FILES = new Set([
  "control-tower-state.json",
  "dashboard-state.json",
  "latest-command.json",
  "project-state.json",
  "reference-radar-state.json"
]);

export const STATE_FILE_IO_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_single_handle_state_json_with_atomic_replace",
  max_file_bytes: 1_000_000,
  allowed_file_count: ALLOWED_STATE_FILES.size,
  existence_probe_policy: "single_lstat_with_enoent_only_missing_truth",
  concurrent_write_policy: "last_writer_wins_rechecked_transient_atomic_replace_retry",
  max_atomic_replace_attempts: 20,
  atomic_replace_retry_delay_ms: 5,
  max_atomic_replace_retry_delay_ms: 25,
  temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt",
  identity_safe_temp_cleanup: true,
  nofollow_supported: NOFOLLOW_FLAG !== 0,
  atomic_replace: true,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_blocker: "state_file_close_failed",
  payload_exposed_on_failure: false,
  writes_outside_state_dir_allowed: false
});

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function isInsideOrEqual(candidatePath, rootPath) {
  const relative = path.relative(rootPath, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function pathHasSymlinkAtOrBelowRoot(rootPath, targetPath) {
  const relative = path.relative(rootPath, targetPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
  let current = rootPath;
  for (const segment of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return true;
    } catch {
      break;
    }
  }
  return false;
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function pathMatchesFileIdentity(fullPath, expectedStats) {
  if (!expectedStats) return false;
  try {
    const currentStats = fs.lstatSync(fullPath);
    return currentStats.isFile()
      && !currentStats.isSymbolicLink()
      && sameFileIdentity(expectedStats, currentStats);
  } catch {
    return false;
  }
}

function unlinkIfSameFileIdentity(fullPath, expectedStats) {
  if (!pathMatchesFileIdentity(fullPath, expectedStats)) return false;
  try {
    fs.unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function normalizedOptions(filePath, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const stateDir = path.resolve(options.stateDir || path.join(projectRoot, ".pala", "state"));
  return {
    projectRoot,
    stateDir,
    filePath: path.resolve(filePath),
    maxFileBytes: boundedInteger(options.maxFileBytes, STATE_FILE_IO_CONTRACT.max_file_bytes, STATE_FILE_IO_CONTRACT.max_file_bytes),
    fallback: options.fallback ?? {}
  };
}

function inspectStateDirectory(bounded) {
  const blockers = [];
  if (!isInsideOrEqual(bounded.stateDir, bounded.projectRoot)) {
    blockers.push("state_directory_outside_project_root");
  } else {
    try {
      const rootRealPath = fs.realpathSync(bounded.projectRoot);
      const stateStats = fs.lstatSync(bounded.stateDir);
      const stateRealPath = fs.realpathSync(bounded.stateDir);
      if (
        !stateStats.isDirectory()
        || stateStats.isSymbolicLink()
        || pathHasSymlinkAtOrBelowRoot(bounded.projectRoot, bounded.stateDir)
        || !isInsideOrEqual(stateRealPath, rootRealPath)
      ) {
        blockers.push("state_directory_not_project_contained_regular_directory");
      }
    } catch {
      blockers.push("state_directory_inspection_failed");
    }
  }
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers
  };
}

function inspectStateTarget(bounded) {
  const relative = path.relative(bounded.stateDir, bounded.filePath);
  if (
    relative.startsWith("..")
    || path.isAbsolute(relative)
    || relative.includes(path.sep)
    || !ALLOWED_STATE_FILES.has(relative)
  ) {
    return { status: "manual_verification_required", exists: false, blockers: ["state_file_path_not_allowed"] };
  }
  const directory = inspectStateDirectory(bounded);
  if (directory.status !== "safe_to_execute") {
    return { status: directory.status, exists: false, blockers: directory.blockers };
  }
  let stats;
  try {
    stats = fs.lstatSync(bounded.filePath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { status: "safe_to_execute", exists: false, blockers: [] };
    }
    return { status: "manual_verification_required", exists: false, blockers: ["state_file_inspection_failed"] };
  }
  try {
    const stateRealPath = fs.realpathSync(bounded.stateDir);
    const fileRealPath = fs.realpathSync(bounded.filePath);
    if (
      !stats.isFile()
      || stats.isSymbolicLink()
      || pathHasSymlinkAtOrBelowRoot(bounded.stateDir, bounded.filePath)
      || !isInsideOrEqual(fileRealPath, stateRealPath)
    ) {
      return { status: "manual_verification_required", exists: true, blockers: ["state_file_not_project_contained_regular_file"] };
    }
    if (stats.size > bounded.maxFileBytes) {
      return {
        status: "manual_verification_required",
        exists: true,
        blockers: ["state_file_exceeds_byte_limit"],
        bytes: stats.size
      };
    }
    return { status: "safe_to_execute", exists: true, blockers: [], stats };
  } catch {
    return { status: "manual_verification_required", exists: true, blockers: ["state_file_inspection_failed"] };
  }
}

function failedRead(bounded, blockers, extra = {}) {
  return {
    status: "manual_verification_required",
    blockers: [...new Set(blockers)],
    value: bounded.fallback,
    path: toProjectPath(bounded.filePath, bounded.projectRoot),
    exists: extra.exists ?? false,
    bytes: extra.bytes ?? null,
    max_file_bytes: bounded.maxFileBytes,
    single_file_handle_used: extra.single_file_handle_used ?? false,
    content_stable_during_read: false,
    post_read_path_recheck_performed: extra.post_read_path_recheck_performed ?? false,
    parse_valid: false,
    payload_exposed_on_failure: false,
    writes_performed: false
  };
}

export function readBoundedStateJson(filePath, options = {}) {
  const bounded = normalizedOptions(filePath, options);
  const target = inspectStateTarget(bounded);
  if (target.status !== "safe_to_execute") {
    return failedRead(bounded, target.blockers, target);
  }
  if (!target.exists) {
    return {
      status: "safe_to_execute",
      blockers: [],
      value: bounded.fallback,
      path: toProjectPath(bounded.filePath, bounded.projectRoot),
      exists: false,
      bytes: 0,
      max_file_bytes: bounded.maxFileBytes,
      single_file_handle_used: false,
      content_stable_during_read: true,
      post_read_path_recheck_performed: false,
      parse_valid: null,
      payload_exposed_on_failure: false,
      writes_performed: false
    };
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(bounded.filePath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return failedRead(bounded, ["state_file_open_failed"], { exists: true });
  }
  const finish = (result) => {
    try {
      fs.closeSync(fileDescriptor);
      return result;
    } catch {
      return failedRead(bounded, [STATE_FILE_IO_CONTRACT.close_failure_blocker], {
        exists: true,
        bytes: result.bytes,
        single_file_handle_used: true,
        post_read_path_recheck_performed: result.post_read_path_recheck_performed
      });
    }
  };
  try {
    const openedStats = fs.fstatSync(fileDescriptor);
    let currentPathStats;
    try {
      currentPathStats = fs.statSync(bounded.filePath);
    } catch {
      currentPathStats = null;
    }
    if (!openedStats.isFile() || openedStats.size > bounded.maxFileBytes) {
      return finish(failedRead(bounded, [openedStats.size > bounded.maxFileBytes ? "state_file_exceeds_byte_limit" : "state_file_not_project_contained_regular_file"], {
        exists: true,
        bytes: openedStats.size,
        single_file_handle_used: true
      }));
    }
    if (
      !currentPathStats
      || !sameFileSnapshot(openedStats, currentPathStats)
      || pathHasSymlinkAtOrBelowRoot(bounded.stateDir, bounded.filePath)
    ) {
      return finish(failedRead(bounded, ["state_file_changed_after_open"], {
        exists: true,
        bytes: openedStats.size,
        single_file_handle_used: true,
        post_read_path_recheck_performed: true
      }));
    }

    const buffer = Buffer.alloc(Math.min(openedStats.size + 1, bounded.maxFileBytes + 1));
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(fileDescriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const afterReadStats = fs.fstatSync(fileDescriptor);
    let afterReadPathStats;
    try {
      afterReadPathStats = fs.statSync(bounded.filePath);
    } catch {
      afterReadPathStats = null;
    }
    if (
      bytesRead !== openedStats.size
      || !sameFileSnapshot(openedStats, afterReadStats)
      || !afterReadPathStats
      || !sameFileSnapshot(afterReadStats, afterReadPathStats)
      || pathHasSymlinkAtOrBelowRoot(bounded.stateDir, bounded.filePath)
    ) {
      return finish(failedRead(bounded, ["state_file_changed_during_read"], {
        exists: true,
        bytes: openedStats.size,
        single_file_handle_used: true,
        post_read_path_recheck_performed: true
      }));
    }

    let value;
    try {
      value = JSON.parse(buffer.subarray(0, bytesRead).toString("utf8"));
    } catch {
      return finish(failedRead(bounded, ["state_file_invalid_json"], {
        exists: true,
        bytes: bytesRead,
        single_file_handle_used: true,
        post_read_path_recheck_performed: true
      }));
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return finish(failedRead(bounded, ["state_file_invalid_json_shape"], {
        exists: true,
        bytes: bytesRead,
        single_file_handle_used: true,
        post_read_path_recheck_performed: true
      }));
    }
    return finish({
      status: "safe_to_execute",
      blockers: [],
      value,
      path: toProjectPath(bounded.filePath, bounded.projectRoot),
      exists: true,
      bytes: bytesRead,
      max_file_bytes: bounded.maxFileBytes,
      single_file_handle_used: true,
      content_stable_during_read: true,
      post_read_path_recheck_performed: true,
      parse_valid: true,
      payload_exposed_on_failure: false,
      writes_performed: false
    });
  } catch {
    return finish(failedRead(bounded, ["state_file_read_failed"], { exists: true, single_file_handle_used: true }));
  }
}

function failedWrite(bounded, blockers, extra = {}) {
  return {
    status: "manual_verification_required",
    blockers: [...new Set(blockers)],
    path: toProjectPath(bounded.filePath, bounded.projectRoot),
    bytes_written: 0,
    max_file_bytes: bounded.maxFileBytes,
    atomic_replace: false,
    atomic_replace_attempt_count: extra.atomic_replace_attempt_count ?? 0,
    atomic_replace_retry_count: extra.atomic_replace_retry_count ?? 0,
    post_replace_target_safe: extra.post_replace_target_safe ?? false,
    temporary_source_identity_verified: extra.temporary_source_identity_verified ?? false,
    write_currentness: extra.write_currentness ?? "not_published",
    payload_exposed_on_failure: false,
    writes_performed: extra.writes_performed ?? false
  };
}

function waitForAtomicReplaceRetry(attempt) {
  const delay = Math.min(
    STATE_FILE_IO_CONTRACT.max_atomic_replace_retry_delay_ms,
    STATE_FILE_IO_CONTRACT.atomic_replace_retry_delay_ms * attempt
  );
  Atomics.wait(ATOMIC_REPLACE_WAIT_ARRAY, 0, 0, delay);
}

export function writeBoundedStateJson(filePath, value, options = {}) {
  const bounded = normalizedOptions(filePath, options);
  const target = inspectStateTarget(bounded);
  if (target.status !== "safe_to_execute") {
    return failedWrite(bounded, target.blockers);
  }

  let text;
  try {
    text = `${redact(value).trim()}\n`;
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return failedWrite(bounded, ["state_write_invalid_json_shape"]);
    }
  } catch {
    return failedWrite(bounded, ["state_write_serialization_failed"]);
  }
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > bounded.maxFileBytes) {
    return failedWrite(bounded, ["state_write_exceeds_byte_limit"]);
  }

  const tempPath = path.join(
    bounded.stateDir,
    `.${path.basename(bounded.filePath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let fileDescriptor;
  let tempExists = false;
  let createdTempStats = null;
  let atomicReplaceAttemptCount = 0;
  let atomicReplaceRetryCount = 0;
  try {
    fileDescriptor = fs.openSync(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW_FLAG,
      0o600
    );
    tempExists = true;
    fs.writeFileSync(fileDescriptor, text, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      return failedWrite(bounded, ["state_write_temporary_source_verification_failed"], {
        writes_performed: true
      });
    }
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    while (atomicReplaceAttemptCount < STATE_FILE_IO_CONTRACT.max_atomic_replace_attempts) {
      const rechecked = inspectStateTarget(bounded);
      if (rechecked.status !== "safe_to_execute") {
        return failedWrite(bounded, rechecked.blockers, {
          writes_performed: true,
          atomic_replace_attempt_count: atomicReplaceAttemptCount,
          atomic_replace_retry_count: atomicReplaceRetryCount
        });
      }
      if (!pathMatchesFileIdentity(tempPath, createdTempStats)) {
        return failedWrite(bounded, ["state_write_temporary_source_changed"], {
          writes_performed: true,
          atomic_replace_attempt_count: atomicReplaceAttemptCount,
          atomic_replace_retry_count: atomicReplaceRetryCount
        });
      }
      atomicReplaceAttemptCount += 1;
      try {
        fs.renameSync(tempPath, bounded.filePath);
        tempExists = false;
        break;
      } catch (error) {
        const retryAllowed = TRANSIENT_ATOMIC_REPLACE_ERROR_CODES.has(error?.code)
          && atomicReplaceAttemptCount < STATE_FILE_IO_CONTRACT.max_atomic_replace_attempts;
        if (!retryAllowed) throw error;
        atomicReplaceRetryCount += 1;
        waitForAtomicReplaceRetry(atomicReplaceAttemptCount);
      }
    }
    const written = inspectStateTarget(bounded);
    if (written.status !== "safe_to_execute" || !written.exists) {
      return failedWrite(bounded, written.blockers.length > 0 ? written.blockers : ["state_write_post_replace_verification_failed"], {
        writes_performed: true,
        atomic_replace_attempt_count: atomicReplaceAttemptCount,
        atomic_replace_retry_count: atomicReplaceRetryCount,
        write_currentness: "published_then_target_changed_or_missing"
      });
    }
    const writeCurrentness = written.stats?.size === bytes
      ? "unknown_same_size_or_current"
      : "superseded_before_postcheck";
    return {
      status: "safe_to_execute",
      blockers: [],
      path: toProjectPath(bounded.filePath, bounded.projectRoot),
      bytes_written: bytes,
      max_file_bytes: bounded.maxFileBytes,
      atomic_replace: true,
      atomic_replace_attempt_count: atomicReplaceAttemptCount,
      atomic_replace_retry_count: atomicReplaceRetryCount,
      post_replace_target_safe: true,
      post_replace_observed_bytes: written.stats?.size ?? null,
      temporary_source_identity_verified: true,
      write_currentness: writeCurrentness,
      payload_exposed_on_failure: false,
      writes_performed: true
    };
  } catch {
    return failedWrite(bounded, ["state_write_atomic_replace_failed"], {
      writes_performed: tempExists,
      atomic_replace_attempt_count: atomicReplaceAttemptCount,
      atomic_replace_retry_count: atomicReplaceRetryCount
    });
  } finally {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Cleanup continues below.
      }
    }
    if (tempExists) {
      unlinkIfSameFileIdentity(tempPath, createdTempStats);
    }
  }
}
