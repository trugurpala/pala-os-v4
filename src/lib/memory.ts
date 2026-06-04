import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ensureKernel, makeId, MEMORY_DIR, nowIso, PROJECT_ROOT } from "./db.ts";
import { writeEvidence } from "./evidence.ts";
import { appendLedger } from "./ledger.ts";
import { toProjectPath } from "./paths.ts";
import { redact } from "./redaction.ts";
import { inspectRepoPath, readBoundedRepoText } from "./repo-scan.ts";

const REGISTRY = path.join(MEMORY_DIR, "mistake-registry.jsonl");
const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
const MEMORY_REGISTRY_WRITE_LOCK_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));
const TRANSIENT_MEMORY_REGISTRY_WRITE_LOCK_ERROR_CODES = new Set(["EACCES", "EEXIST", "EPERM"]);

export const MEMORY_REGISTRY_SCAN_CONTRACT = Object.freeze({
  policy: "bounded_single_handle_jsonl_without_invalid_raw_line_exposure",
  max_file_bytes: 5_000_000,
  max_lines: 10_000,
  max_returned_records: 500,
  max_returned_findings: 100,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_blocker: "memory_registry_file_close_failed",
  invalid_raw_line_exposed: false,
  payload_exposed_on_failure: false,
  writes_allowed: false
});

export const MEMORY_REGISTRY_APPEND_CONTRACT = Object.freeze({
  policy: "fixed_project_contained_create_or_single_handle_memory_registry_append",
  max_record_bytes: 1_000_000,
  max_registry_bytes: MEMORY_REGISTRY_SCAN_CONTRACT.max_file_bytes,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  concurrent_write_policy: "bounded_fixed_create_only_lock_serialized_create_or_append",
  max_write_lock_attempts: 100,
  write_lock_retry_delay_ms: 5,
  max_write_lock_retry_delay_ms: 25,
  transient_lock_observation_policy: "bounded_retry_on_existing_lock_inspection_race",
  post_release_success_policy: "released_identity_absent_or_safe_successor",
  stale_write_lock_reclamation_allowed: false,
  atomic_create_link: true,
  first_create_temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match",
  first_create_identity_safe_temp_cleanup: true,
  first_create_post_publish_identity_policy: "temporary_and_registry_dev_ino_match",
  single_append_handle: true,
  close_failure_error: "memory_registry_append_blocked:file_close_failed",
  payload_exposed_on_failure: false,
  writes_outside_memory_dir_allowed: false
});

export const CLAUDE_SYNC_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_single_handle_claude_md_dry_run",
  max_file_bytes: 1_000_000,
  payload_exposed: false,
  writes_allowed: false
});

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
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

function unlinkIfSameFileIdentity(fullPath, expectedStats) {
  if (!expectedStats) return false;
  try {
    const currentStats = fs.lstatSync(fullPath);
    if (!currentStats.isFile() || currentStats.isSymbolicLink() || !sameFileIdentity(expectedStats, currentStats)) {
      return false;
    }
    fs.unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function registryOptions(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  return {
    projectRoot,
    registryPath: path.resolve(options.registryPath || (projectRoot === PROJECT_ROOT ? REGISTRY : path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl"))),
    maxFileBytes: boundedInteger(options.maxFileBytes, MEMORY_REGISTRY_SCAN_CONTRACT.max_file_bytes, MEMORY_REGISTRY_SCAN_CONTRACT.max_file_bytes),
    maxLines: boundedInteger(options.maxLines, MEMORY_REGISTRY_SCAN_CONTRACT.max_lines, MEMORY_REGISTRY_SCAN_CONTRACT.max_lines),
    maxReturnedRecords: boundedInteger(options.maxReturnedRecords, MEMORY_REGISTRY_SCAN_CONTRACT.max_returned_records, MEMORY_REGISTRY_SCAN_CONTRACT.max_returned_records),
    maxReturnedFindings: boundedInteger(options.maxReturnedFindings, MEMORY_REGISTRY_SCAN_CONTRACT.max_returned_findings, MEMORY_REGISTRY_SCAN_CONTRACT.max_returned_findings)
  };
}

function emptyRegistryInspection(options, blockers = [], extra = {}) {
  const uniqueBlockers = [...new Set(blockers)];
  return {
    status: uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: MEMORY_REGISTRY_SCAN_CONTRACT,
    blockers: uniqueBlockers,
    scan_complete: uniqueBlockers.length === 0,
    registry: toProjectPath(options.registryPath, options.projectRoot),
    target_exists: false,
    target_read_performed: false,
    single_file_handle_used: false,
    content_stable_during_read: false,
    file_bytes: 0,
    file_byte_limit: options.maxFileBytes,
    physical_line_count: 0,
    scanned_line_count: 0,
    line_limit: options.maxLines,
    line_scan_truncated: false,
    record_count: uniqueBlockers.length === 0 ? 0 : null,
    record_count_exact: uniqueBlockers.length === 0,
    records: [],
    returned_record_count: 0,
    records_truncated: false,
    invalid_line_count: 0,
    finding_count: 0,
    findings: [],
    returned_finding_count: 0,
    findings_truncated: false,
    invalid_raw_line_exposed: false,
    writes_performed: false,
    ...extra
  };
}

export function inspectMemoryRegistry(options = {}) {
  const bounded = registryOptions(options);
  const pathInspection = inspectRepoPath(bounded.registryPath, {
    projectRoot: bounded.projectRoot,
    expectedKind: "file"
  });
  if (pathInspection.status !== "safe_to_execute") {
    const blocker = pathInspection.blocker === "repo_path_outside_project_root"
      ? "memory_registry_path_outside_project_root"
      : pathInspection.blocker === "repo_path_inspection_failed"
        ? "memory_registry_file_inspection_failed"
        : "memory_registry_not_realpath_contained_regular_file";
    return emptyRegistryInspection(bounded, [blocker], {
      target_exists: pathInspection.exists === true
    });
  }
  if (!pathInspection.exists) return emptyRegistryInspection(bounded);

  const stat = { size: pathInspection.bytes };
  if (stat.size > bounded.maxFileBytes) {
    return emptyRegistryInspection(bounded, ["memory_registry_file_exceeds_byte_limit"], {
      target_exists: true,
      file_bytes: stat.size
    });
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(bounded.registryPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return emptyRegistryInspection(bounded, ["memory_registry_file_open_failed"], {
      target_exists: true
    });
  }

  let text;
  let openedStats;
  try {
    openedStats = fs.fstatSync(fileDescriptor);
    if (!openedStats.isFile()) {
      return emptyRegistryInspection(bounded, ["memory_registry_not_realpath_contained_regular_file"], {
        target_exists: true
      });
    }
    if (openedStats.size > bounded.maxFileBytes) {
      return emptyRegistryInspection(bounded, ["memory_registry_file_exceeds_byte_limit"], {
        target_exists: true,
        file_bytes: openedStats.size
      });
    }
    let pathStats;
    try {
      pathStats = fs.statSync(bounded.registryPath);
    } catch {
      pathStats = null;
    }
    if (!pathStats || !sameFileSnapshot(openedStats, pathStats)) {
      return emptyRegistryInspection(bounded, ["memory_registry_file_changed_during_scan"], {
        target_exists: true
      });
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
      afterReadPathStats = fs.statSync(bounded.registryPath);
    } catch {
      afterReadPathStats = null;
    }
    if (
      bytesRead !== openedStats.size
      || !sameFileSnapshot(openedStats, afterReadStats)
      || !afterReadPathStats
      || !sameFileSnapshot(afterReadStats, afterReadPathStats)
    ) {
      return emptyRegistryInspection(bounded, ["memory_registry_file_changed_during_scan"], {
        target_exists: true,
        target_read_performed: true,
        single_file_handle_used: true
      });
    }
    text = buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return emptyRegistryInspection(bounded, ["memory_registry_file_read_failed"], {
      target_exists: true,
      target_read_performed: true,
      single_file_handle_used: true
    });
  } finally {
    try {
      fs.closeSync(fileDescriptor);
    } catch {
      return emptyRegistryInspection(bounded, [MEMORY_REGISTRY_SCAN_CONTRACT.close_failure_blocker], {
        target_exists: true,
        target_read_performed: true,
        single_file_handle_used: true,
        file_bytes: openedStats?.size || stat.size
      });
    }
  }

  const physicalLines = text.length === 0 ? [] : text.split(/\r?\n/);
  if (physicalLines.at(-1) === "") physicalLines.pop();
  const blockers = [];
  const lineScanTruncated = physicalLines.length > bounded.maxLines;
  if (lineScanTruncated) blockers.push("memory_registry_line_scan_truncated");
  const scannedLines = physicalLines.slice(0, bounded.maxLines);
  const records = [];
  const findings = [];
  let recordCount = 0;
  let invalidLineCount = 0;
  let findingCount = 0;
  scannedLines.forEach((line, index) => {
    if (!line.trim()) return;
    let parsed;
    try {
      parsed = JSON.parse(line);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("record must be an object");
    } catch {
      invalidLineCount += 1;
      findingCount += 1;
      if (findings.length < bounded.maxReturnedFindings) {
        findings.push({
          severity: "high",
          line: index + 1,
          summary: "Memory registry line is not a valid JSON object."
        });
      }
      return;
    }
    recordCount += 1;
    if (records.length < bounded.maxReturnedRecords) records.push(parsed);
  });

  const uniqueBlockers = [...new Set(blockers)];
  const scanComplete = uniqueBlockers.length === 0;
  return {
    status: scanComplete && findingCount === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: MEMORY_REGISTRY_SCAN_CONTRACT,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    registry: toProjectPath(bounded.registryPath, bounded.projectRoot),
    target_exists: true,
    target_read_performed: true,
    single_file_handle_used: true,
    content_stable_during_read: true,
    file_bytes: openedStats.size,
    file_byte_limit: bounded.maxFileBytes,
    physical_line_count: physicalLines.length,
    scanned_line_count: scannedLines.length,
    line_limit: bounded.maxLines,
    line_scan_truncated: lineScanTruncated,
    record_count: recordCount,
    record_count_exact: scanComplete,
    records,
    returned_record_count: records.length,
    records_truncated: recordCount > records.length,
    invalid_line_count: invalidLineCount,
    finding_count: findingCount,
    findings,
    returned_finding_count: findings.length,
    findings_truncated: findingCount > findings.length,
    invalid_raw_line_exposed: false,
    writes_performed: false,
    note: scanComplete
      ? "Memory registry scan completed without exposing invalid source lines."
      : "Memory registry scan is incomplete; memory PASS and rule proposals remain blocked."
  };
}

export function readMistakes(options = {}) {
  return inspectMemoryRegistry(options).records;
}

export function memoryStatus(options = {}) {
  const inspection = options.inspection || inspectMemoryRegistry(options);
  const mistakes = inspection.records.filter((item) => item.status !== "template");
  const blockers = [...new Set([
    ...inspection.blockers,
    ...(inspection.records_truncated ? ["memory_registry_returned_record_limit_reached"] : [])
  ])];
  return {
    status: inspection.status === "safe_to_execute" && blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers,
    scan_complete: inspection.scan_complete,
    registry: inspection.registry,
    mistakes: mistakes.length,
    templates: inspection.records.length - mistakes.length,
    counts_exact: inspection.record_count_exact && !inspection.records_truncated,
    active_rule_promotions: mistakes.filter((item) => item.status === "promotion_requested").length,
    invalid_line_count: inspection.invalid_line_count,
    findings: inspection.findings,
    record_count: inspection.record_count,
    returned_record_count: inspection.returned_record_count,
    records_truncated: inspection.records_truncated,
    invalid_raw_line_exposed: false,
    writes_performed: false,
    lesson: "Mistakes can propose rules, but promotion requires approval."
  };
}

function fixedMemoryRegistryPath(projectRoot) {
  return path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl");
}

function fixedMemoryRegistryWriteLockPath(projectRoot) {
  return path.join(projectRoot, ".pala", "memory", "mistake-registry.jsonl.write-lock");
}

function inspectMemoryRegistryAppendTarget(projectRoot) {
  const parent = inspectRepoPath(".pala/memory", { projectRoot, expectedKind: "directory" });
  const target = inspectRepoPath(".pala/memory/mistake-registry.jsonl", { projectRoot, expectedKind: "file" });
  if (parent.status !== "safe_to_execute" || parent.exists !== true || target.status !== "safe_to_execute") {
    throw new Error("memory_registry_append_blocked:path_not_safe");
  }
  return target;
}

function inspectMemoryRegistryWriteLock(projectRoot) {
  const lock = inspectRepoPath(".pala/memory/mistake-registry.jsonl.write-lock", {
    projectRoot,
    expectedKind: "file"
  });
  if (lock.status !== "safe_to_execute") {
    if (lock.exists === true && lock.blocker === "repo_path_inspection_failed") {
      return { ...lock, transient_observation_failed: true };
    }
    throw new Error("memory_registry_append_blocked:write_lock_path_not_safe");
  }
  return { ...lock, transient_observation_failed: false };
}

function waitForMemoryRegistryWriteLock(attempt) {
  const delay = Math.min(
    MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_retry_delay_ms,
    MEMORY_REGISTRY_APPEND_CONTRACT.write_lock_retry_delay_ms * attempt
  );
  Atomics.wait(MEMORY_REGISTRY_WRITE_LOCK_WAIT_ARRAY, 0, 0, delay);
}

function acquireMemoryRegistryWriteLock(projectRoot) {
  const lockPath = fixedMemoryRegistryWriteLockPath(projectRoot);
  for (let attempt = 1; attempt <= MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts; attempt += 1) {
    const inspected = inspectMemoryRegistryWriteLock(projectRoot);
    if (inspected.transient_observation_failed) {
      if (attempt === MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts) {
        throw new Error("memory_registry_append_blocked:write_lock_unavailable");
      }
      waitForMemoryRegistryWriteLock(attempt);
      continue;
    }
    if (inspected.exists) {
      if (attempt === MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts) {
        throw new Error("memory_registry_append_blocked:write_lock_unavailable");
      }
      waitForMemoryRegistryWriteLock(attempt);
      continue;
    }

    let fileDescriptor;
    let openedStats;
    try {
      fileDescriptor = fs.openSync(
        lockPath,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW_FLAG,
        0o600
      );
      openedStats = fs.fstatSync(fileDescriptor);
      const currentStats = fs.statSync(lockPath);
      if (!openedStats.isFile() || !sameFileIdentity(openedStats, currentStats)) {
        throw new Error("memory_registry_append_blocked:write_lock_changed_after_create");
      }
      return { fileDescriptor, lockPath, openedStats, attempt };
    } catch (error) {
      if (openedStats) {
        try {
          const currentStats = fs.statSync(lockPath);
          if (sameFileIdentity(openedStats, currentStats)) fs.unlinkSync(lockPath);
        } catch {
          // A changed or unremovable lock remains fail-closed.
        }
      }
      if (fileDescriptor !== undefined) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          // The fixed lock remains fail-closed if descriptor cleanup fails.
        }
      }
      if (String(error?.message || "").startsWith("memory_registry_append_blocked:")) {
        throw error;
      }
      const retryAllowed = TRANSIENT_MEMORY_REGISTRY_WRITE_LOCK_ERROR_CODES.has(error?.code)
        && attempt < MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts;
      if (!retryAllowed) {
        throw new Error("memory_registry_append_blocked:write_lock_acquire_failed");
      }
      waitForMemoryRegistryWriteLock(attempt);
    }
  }
  throw new Error("memory_registry_append_blocked:write_lock_unavailable");
}

function confirmMemoryRegistryWriteLockReleased(projectRoot, lock) {
  for (let attempt = 1; attempt <= MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts; attempt += 1) {
    const inspected = inspectMemoryRegistryWriteLock(projectRoot);
    if (inspected.transient_observation_failed) {
      if (attempt === MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts) break;
      waitForMemoryRegistryWriteLock(attempt);
      continue;
    }
    if (!inspected.exists) return;

    try {
      const currentStats = fs.lstatSync(lock.lockPath);
      if (!currentStats.isFile() || currentStats.isSymbolicLink()) {
        throw new Error("memory_registry_append_blocked:write_lock_release_failed");
      }
      if (sameFileIdentity(lock.openedStats, currentStats)) {
        throw new Error("memory_registry_append_blocked:write_lock_release_failed");
      }
      return;
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (String(error?.message || "").startsWith("memory_registry_append_blocked:")) throw error;
      if (attempt === MEMORY_REGISTRY_APPEND_CONTRACT.max_write_lock_attempts) break;
      waitForMemoryRegistryWriteLock(attempt);
    }
  }
  throw new Error("memory_registry_append_blocked:write_lock_release_failed");
}

function releaseMemoryRegistryWriteLock(projectRoot, lock) {
  let currentStats;
  try {
    currentStats = fs.statSync(lock.lockPath);
  } catch {
    try {
      fs.closeSync(lock.fileDescriptor);
    } catch {
      // The lock path already changed; preserve the fail-closed result.
    }
    throw new Error("memory_registry_append_blocked:write_lock_changed_before_release");
  }
  if (!sameFileIdentity(lock.openedStats, currentStats)) {
    try {
      fs.closeSync(lock.fileDescriptor);
    } catch {
      // The changed lock remains fail-closed.
    }
    throw new Error("memory_registry_append_blocked:write_lock_changed_before_release");
  }
  let releaseError;
  try {
    fs.unlinkSync(lock.lockPath);
    confirmMemoryRegistryWriteLockReleased(projectRoot, lock);
  } catch {
    releaseError = new Error("memory_registry_append_blocked:write_lock_release_failed");
  }
  try {
    fs.closeSync(lock.fileDescriptor);
  } catch {
    releaseError = new Error("memory_registry_append_blocked:write_lock_release_failed");
  }
  if (releaseError) throw releaseError;
}

function withMemoryRegistryWriteLock(projectRoot, operation) {
  const lock = acquireMemoryRegistryWriteLock(projectRoot);
  let result;
  let operationError;
  try {
    result = operation();
  } catch (error) {
    operationError = error;
  }
  let releaseError;
  try {
    releaseMemoryRegistryWriteLock(projectRoot, lock);
  } catch (error) {
    releaseError = error;
  }
  if (operationError) throw operationError;
  if (releaseError) throw releaseError;
  return result;
}

function createMemoryRegistry(projectRoot, registryPath, buffer) {
  const tempPath = path.join(
    path.dirname(registryPath),
    `.mistake-registry.jsonl.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let fileDescriptor;
  let tempExists = false;
  let createdTempStats = null;
  try {
    fileDescriptor = fs.openSync(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW_FLAG,
      0o600
    );
    tempExists = true;
    fs.writeFileSync(fileDescriptor, buffer);
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== buffer.byteLength) {
      throw new Error("memory_registry_append_blocked:create_failed");
    }
    const rechecked = inspectMemoryRegistryAppendTarget(projectRoot);
    if (rechecked.exists) {
      throw new Error("memory_registry_append_blocked:target_appeared_before_create");
    }
    fs.linkSync(tempPath, registryPath);
    const written = inspectMemoryRegistryAppendTarget(projectRoot);
    let registryIdentityVerified = false;
    try {
      const openedTempStats = fs.fstatSync(fileDescriptor);
      const publishedSourceStats = fs.lstatSync(tempPath);
      const registryStats = fs.lstatSync(registryPath);
      registryIdentityVerified = publishedSourceStats.isFile()
        && !publishedSourceStats.isSymbolicLink()
        && registryStats.isFile()
        && !registryStats.isSymbolicLink()
        && sameFileIdentity(openedTempStats, publishedSourceStats)
        && sameFileIdentity(openedTempStats, registryStats);
    } catch {
      registryIdentityVerified = false;
    }
    if (written.exists !== true || written.bytes !== buffer.byteLength || !registryIdentityVerified) {
      throw new Error("memory_registry_append_blocked:post_create_verification_failed");
    }
  } catch (error) {
    if (String(error?.message || "").startsWith("memory_registry_append_blocked:")) {
      throw error;
    }
    throw new Error("memory_registry_append_blocked:create_failed");
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

function appendExistingMemoryRegistry(projectRoot, registryPath, target, buffer) {
  if (Number(target.bytes || 0) + buffer.byteLength > MEMORY_REGISTRY_APPEND_CONTRACT.max_registry_bytes) {
    throw new Error("memory_registry_append_blocked:registry_exceeds_byte_limit");
  }
  let fileDescriptor;
  let appendError;
  try {
    fileDescriptor = fs.openSync(registryPath, fs.constants.O_WRONLY | fs.constants.O_APPEND | NOFOLLOW_FLAG);
    const openedStats = fs.fstatSync(fileDescriptor);
    const currentStats = fs.statSync(registryPath);
    if (
      !openedStats.isFile()
      || !sameFileIdentity(openedStats, currentStats)
      || openedStats.size + buffer.byteLength > MEMORY_REGISTRY_APPEND_CONTRACT.max_registry_bytes
    ) {
      throw new Error("memory_registry_append_blocked:path_changed_or_registry_exceeds_byte_limit");
    }
    const rechecked = inspectMemoryRegistryAppendTarget(projectRoot);
    if (rechecked.exists !== true || rechecked.bytes !== openedStats.size) {
      throw new Error("memory_registry_append_blocked:path_changed_before_append");
    }
    const bytesWritten = fs.writeSync(fileDescriptor, buffer, 0, buffer.byteLength, null);
    if (bytesWritten !== buffer.byteLength) {
      throw new Error("memory_registry_append_blocked:short_write");
    }
    fs.fsyncSync(fileDescriptor);
    const afterWriteStats = fs.fstatSync(fileDescriptor);
    const afterWritePathStats = fs.statSync(registryPath);
    if (!sameFileIdentity(afterWriteStats, afterWritePathStats)) {
      throw new Error("memory_registry_append_blocked:path_changed_after_append");
    }
    const written = inspectMemoryRegistryAppendTarget(projectRoot);
    if (written.exists !== true || written.bytes !== openedStats.size + buffer.byteLength) {
      throw new Error("memory_registry_append_blocked:post_append_verification_failed");
    }
  } catch (error) {
    if (String(error?.message || "").startsWith("memory_registry_append_blocked:")) {
      appendError = error;
    } else {
      appendError = new Error("memory_registry_append_blocked:append_failed");
    }
  }
  let closeError;
  if (fileDescriptor !== undefined) {
    try {
      fs.closeSync(fileDescriptor);
    } catch {
      closeError = new Error(MEMORY_REGISTRY_APPEND_CONTRACT.close_failure_error);
    }
  }
  if (appendError) throw appendError;
  if (closeError) throw closeError;
}

export function appendMemoryRegistryRecord(record, options = {}) {
  let serialized;
  try {
    serialized = JSON.stringify(record);
  } catch {
    throw new Error("memory_registry_append_blocked:serialization_failed");
  }
  if (Buffer.byteLength(serialized, "utf8") + 1 > MEMORY_REGISTRY_APPEND_CONTRACT.max_record_bytes) {
    throw new Error("memory_registry_append_blocked:record_exceeds_byte_limit");
  }
  const line = `${redact(serialized)}\n`;
  const buffer = Buffer.from(line, "utf8");
  if (buffer.byteLength > MEMORY_REGISTRY_APPEND_CONTRACT.max_record_bytes) {
    throw new Error("memory_registry_append_blocked:record_exceeds_byte_limit");
  }
  try {
    const parsed = JSON.parse(line);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("invalid_shape");
    }
  } catch {
    throw new Error("memory_registry_append_blocked:redacted_record_invalid");
  }

  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  ensureKernel({ projectRoot });
  const registryPath = fixedMemoryRegistryPath(projectRoot);
  withMemoryRegistryWriteLock(projectRoot, () => {
    const target = inspectMemoryRegistryAppendTarget(projectRoot);
    if (target.exists) {
      appendExistingMemoryRegistry(projectRoot, registryPath, target, buffer);
    } else {
      createMemoryRegistry(projectRoot, registryPath, buffer);
    }
  });
  return toProjectPath(registryPath, projectRoot);
}

export function addMistake(db, input) {
  const summary = String(input?.summary || "").trim();
  if (!summary) {
    throw new TypeError("Mistake summary is required; Pala OS will not invent a sample mistake.");
  }
  const id = input.id || makeId("mistake");
  const mistake = {
    id,
    date: nowIso(),
    category: input.category || "implementation",
    summary,
    root_cause: input.rootCause || null,
    severity: input.severity || "low",
    prevention_rule: input.preventionRule || null,
    evidence_path: null,
    status: "captured",
    linked_rule_path: null
  };
  const evidencePath = writeEvidence("memory-add-mistake", mistake);
  mistake.evidence_path = evidencePath;

  appendMemoryRegistryRecord(mistake);
  db.prepare(`
    INSERT INTO mistakes
      (id, run_id, category, summary, root_cause, severity, prevent_next_time, status, linked_rule, evidence_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.runId || null,
    mistake.category,
    mistake.summary,
    mistake.root_cause,
    mistake.severity,
    mistake.prevention_rule,
    mistake.status,
    null,
    evidencePath,
    nowIso()
  );
  const ledgerPath = appendLedger("mistakes", mistake);
  return { mistake, evidence_path: evidencePath, ledger_path: ledgerPath };
}

export function promoteRuleDryRun(options = {}) {
  const inspection = inspectMemoryRegistry(options);
  if (inspection.status !== "safe_to_execute" || inspection.records_truncated) {
    return {
      status: "manual_verification_required",
      dry_run: true,
      blockers: [...new Set([
        ...inspection.blockers,
        ...(inspection.records_truncated ? ["memory_registry_returned_record_limit_reached"] : []),
        "memory_registry_not_safe_for_promotion"
      ])],
      scan_complete: inspection.scan_complete,
      proposed_rules: [],
      writes_performed: false,
      invalid_raw_line_exposed: false,
      note: "Rule proposals are blocked until the bounded memory registry scan is complete and valid."
    };
  }
  const mistakes = inspection.records.filter((mistake) => mistake.status !== "template");
  return {
    dry_run: true,
    status: mistakes.length > 0 ? "manual_verification_required" : "blocked",
    blockers: [],
    scan_complete: true,
    proposed_rules: mistakes.slice(-5).map((mistake) => ({
      source_mistake_id: mistake.id,
      proposed_rule: mistake.prevention_rule || mistake.prevent_next_time || "No proposed rule captured.",
      requires_approval: true
    })),
    proposal_count_exact: !inspection.records_truncated,
    writes_performed: false,
    invalid_raw_line_exposed: false,
    note: "No rule files were changed. Promotion requires explicit approval."
  };
}

export function claudeSyncDryRun(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const maxFileBytes = boundedInteger(options.maxFileBytes, CLAUDE_SYNC_INSPECTION_CONTRACT.max_file_bytes, CLAUDE_SYNC_INSPECTION_CONTRACT.max_file_bytes);
  const inspected = readBoundedRepoText("CLAUDE.md", {
    projectRoot,
    maxTextFileBytes: maxFileBytes,
    maxTotalTextBytes: maxFileBytes
  });
  const requiredLines = [
    "Pala OS is not a coding agent.",
    "Agent does the work. Pala OS verifies the work.",
    "No fake PASS.",
    "No push, publish, deletion, real MCP config write, or n8n activation without explicit approval.",
    ".pala/rules/*",
    ".pala/state/*",
    ".pala/ledger/*",
    ".pala/evidence/*"
  ];
  const blockers = inspected.status === "safe_to_execute" ? [] : [inspected.blocker || "claude_sync_inspection_failed"];
  const scanComplete = blockers.length === 0;
  const current = scanComplete ? inspected.text || "" : "";
  const missingLines = scanComplete ? requiredLines.filter((line) => !current.includes(line)) : [];
  const inspection = {
    status: inspected.status,
    policy: CLAUDE_SYNC_INSPECTION_CONTRACT.policy,
    blockers,
    scan_complete: scanComplete,
    target_exists: Boolean(inspected.exists),
    target_read_performed: Boolean(inspected.exists && inspected.single_file_handle_used),
    single_file_handle_used: Boolean(inspected.single_file_handle_used),
    content_stable_during_read: Boolean(inspected.content_stable_during_read),
    post_read_path_recheck_performed: Boolean(inspected.post_read_path_recheck_performed),
    file_bytes: Number.isInteger(inspected.bytes) ? inspected.bytes : null,
    file_byte_limit: maxFileBytes,
    payload_exposed: false,
    writes_performed: false
  };
  return {
    status: !scanComplete ? "manual_verification_required" : missingLines.length === 0 ? "safe_to_execute" : "dry_run_only",
    dry_run: true,
    contract: CLAUDE_SYNC_INSPECTION_CONTRACT,
    blockers,
    scan_complete: scanComplete,
    inspection,
    writes_performed: false,
    payload_exposed: false,
    target: "CLAUDE.md",
    required_lines: requiredLines,
    missing_lines: missingLines,
    proposed_diff: missingLines.map((line) => `+ ${line}`).join("\n"),
    proposal_blocked: !scanComplete,
    note: !scanComplete
      ? "CLAUDE.md sync proposal is blocked until the bounded project-contained inspection succeeds."
      : missingLines.length === 0
        ? "CLAUDE.md already contains the required concise Pala summary."
        : "Review the proposed additions before any approved CLAUDE.md write."
  };
}
