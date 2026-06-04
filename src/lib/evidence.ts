import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { ensureKernel, makeId, nowIso, PROJECT_ROOT, RAW_EVIDENCE_DIR, slug } from "./db.ts";
import { createPaths } from "./paths.ts";
import { redact } from "./redaction.ts";
import { inspectRepoPath } from "./repo-scan.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
const ATOMIC_REPLACE_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));
const TRANSIENT_ATOMIC_REPLACE_ERROR_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

export const LATEST_EVIDENCE_CONTRACT = Object.freeze({
  inventory_policy: "bounded_directory_iterator_latest_mtime_with_prefix_read",
  max_scan_entries: 5000,
  read_policy: "single_handle_prefix_max_bytes_and_chars",
  max_preview_bytes: 4096,
  max_preview_chars: 1200,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  directory_close_failure_blocker: "raw_evidence_directory_close_failed",
  file_close_failure_blocker: "latest_evidence_file_close_failed",
  payload_exposed_on_failure: false,
  writes_allowed: false
});

export const RAW_EVIDENCE_WRITE_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_atomic_create_only_redacted_raw_evidence",
  max_file_bytes: 5_000_000,
  max_kind_bytes: 256,
  kind_policy: "bounded_redacted_before_envelope_and_filename",
  raw_kind_exposed: false,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match",
  identity_safe_temp_cleanup: true,
  post_publish_identity_policy: "temporary_and_target_dev_ino_match",
  atomic_create_link: true,
  overwrite_allowed: false,
  payload_exposed_on_failure: false,
  writes_outside_raw_evidence_dir_allowed: false
});

const PUBLIC_EVIDENCE_FILES = new Set(["official-compatibility-check.md"]);

export const PUBLIC_EVIDENCE_WRITE_CONTRACT = Object.freeze({
  policy: "bounded_fixed_project_contained_atomic_public_evidence_replace",
  allowed_file_count: PUBLIC_EVIDENCE_FILES.size,
  max_file_bytes: 1_000_000,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  concurrent_write_policy: "last_writer_wins_rechecked_transient_atomic_replace_retry",
  max_atomic_replace_attempts: 20,
  atomic_replace_retry_delay_ms: 5,
  max_atomic_replace_retry_delay_ms: 25,
  temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt",
  identity_safe_temp_cleanup: true,
  atomic_replace: true,
  payload_exposed_on_failure: false,
  writes_outside_docs_evidence_dir_allowed: false
});

function boundedInteger(value, fallback, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function safeEvidenceKind(kind) {
  let rawKind;
  try {
    rawKind = String(kind ?? "item");
  } catch {
    throw new Error("raw_evidence_write_blocked:kind_not_safe");
  }
  if (Buffer.byteLength(rawKind, "utf8") > RAW_EVIDENCE_WRITE_CONTRACT.max_kind_bytes) {
    throw new Error("raw_evidence_write_blocked:kind_exceeds_byte_limit");
  }
  let redactedKind;
  try {
    redactedKind = redact(rawKind);
  } catch {
    throw new Error("raw_evidence_write_blocked:kind_not_safe");
  }
  if (Buffer.byteLength(redactedKind, "utf8") > RAW_EVIDENCE_WRITE_CONTRACT.max_kind_bytes) {
    throw new Error("raw_evidence_write_blocked:kind_exceeds_byte_limit");
  }
  return slug(redactedKind);
}

function isInsideProject(fullPath, projectRoot) {
  const relative = path.relative(projectRoot, fullPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function rootRelativePath(fullPath, projectRoot) {
  return path.relative(projectRoot, fullPath).replace(/\\/g, "/");
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

function waitForAtomicReplaceRetry(attempt) {
  const delay = Math.min(
    PUBLIC_EVIDENCE_WRITE_CONTRACT.max_atomic_replace_retry_delay_ms,
    PUBLIC_EVIDENCE_WRITE_CONTRACT.atomic_replace_retry_delay_ms * attempt
  );
  Atomics.wait(ATOMIC_REPLACE_WAIT_ARRAY, 0, 0, delay);
}

export function writeEvidence(kind, payload, options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const safeKind = safeEvidenceKind(kind);
  const envelope = {
    kind: safeKind,
    created_at: nowIso(),
    public_safe: Boolean(options.publicSafe),
    redaction_status: "redacted",
    payload
  };
  let serialized;
  try {
    serialized = JSON.stringify(envelope, null, 2);
  } catch {
    throw new Error("raw_evidence_write_blocked:serialization_failed");
  }
  if (Buffer.byteLength(serialized, "utf8") + 1 > RAW_EVIDENCE_WRITE_CONTRACT.max_file_bytes) {
    throw new Error("raw_evidence_write_blocked:content_exceeds_byte_limit");
  }
  const text = `${redact(serialized)}\n`;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > RAW_EVIDENCE_WRITE_CONTRACT.max_file_bytes) {
    throw new Error("raw_evidence_write_blocked:content_exceeds_byte_limit");
  }

  ensureKernel({ projectRoot });
  const rawEvidenceDir = createPaths(projectRoot).rawEvidenceDir;
  const fileName = `${new Date().toISOString().replace(/[:.]/g, "-")}-${crypto.randomBytes(6).toString("hex")}-${safeKind}.log`;
  const fullPath = path.join(rawEvidenceDir, fileName);
  const relativePath = rootRelativePath(fullPath, projectRoot);
  const parent = inspectRepoPath(".pala/evidence/raw", { projectRoot, expectedKind: "directory" });
  const target = inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" });
  if (
    parent.status !== "safe_to_execute"
    || parent.exists !== true
    || target.status !== "safe_to_execute"
    || target.exists
  ) {
    throw new Error("raw_evidence_write_blocked:path_not_safe_or_target_exists");
  }

  const tempPath = path.join(
    rawEvidenceDir,
    `.${fileName}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
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
    fs.writeFileSync(fileDescriptor, text, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      throw new Error("raw_evidence_write_blocked:temporary_source_verification_failed");
    }
    const recheckedParent = inspectRepoPath(".pala/evidence/raw", { projectRoot, expectedKind: "directory" });
    const recheckedTarget = inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" });
    if (
      recheckedParent.status !== "safe_to_execute"
      || recheckedParent.exists !== true
      || recheckedTarget.status !== "safe_to_execute"
      || recheckedTarget.exists
    ) {
      throw new Error("raw_evidence_write_blocked:path_changed_before_publish");
    }
    fs.linkSync(tempPath, fullPath);
    const written = inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" });
    let targetIdentityVerified = false;
    try {
      const openedTempStats = fs.fstatSync(fileDescriptor);
      const publishedSourceStats = fs.lstatSync(tempPath);
      const targetStats = fs.lstatSync(fullPath);
      targetIdentityVerified = publishedSourceStats.isFile()
        && !publishedSourceStats.isSymbolicLink()
        && targetStats.isFile()
        && !targetStats.isSymbolicLink()
        && sameFileIdentity(openedTempStats, publishedSourceStats)
        && sameFileIdentity(openedTempStats, targetStats);
    } catch {
      targetIdentityVerified = false;
    }
    if (written.status !== "safe_to_execute" || written.exists !== true || written.bytes !== bytes || !targetIdentityVerified) {
      throw new Error("raw_evidence_write_blocked:post_publish_verification_failed");
    }
  } catch (error) {
    if (String(error?.message || "").startsWith("raw_evidence_write_blocked:")) {
      throw error;
    }
    throw new Error("raw_evidence_write_blocked:atomic_create_failed");
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
  return relativePath;
}

export function writePublicEvidence(fileName, markdown, options = {}) {
  const allowedFileName = String(fileName || "");
  if (!PUBLIC_EVIDENCE_FILES.has(allowedFileName)) {
    throw new Error("public_evidence_file_not_allowed");
  }
  const rawText = String(markdown || "");
  if (Buffer.byteLength(rawText, "utf8") + 1 > PUBLIC_EVIDENCE_WRITE_CONTRACT.max_file_bytes) {
    throw new Error("public_evidence_write_blocked:content_exceeds_byte_limit");
  }
  const text = `${redact(rawText).trim()}\n`;
  const bytes = Buffer.byteLength(text, "utf8");
  if (bytes > PUBLIC_EVIDENCE_WRITE_CONTRACT.max_file_bytes) {
    throw new Error("public_evidence_write_blocked:content_exceeds_byte_limit");
  }

  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  ensureKernel({ projectRoot });
  const docsEvidenceDir = createPaths(projectRoot).docsEvidenceDir;
  const fullPath = path.join(docsEvidenceDir, allowedFileName);
  const relativePath = rootRelativePath(fullPath, projectRoot);
  const parent = inspectRepoPath("docs/evidence", { projectRoot, expectedKind: "directory" });
  const target = inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" });
  if (parent.status !== "safe_to_execute" || parent.exists !== true || target.status !== "safe_to_execute") {
    throw new Error("public_evidence_write_blocked:path_not_safe");
  }

  const tempPath = path.join(
    docsEvidenceDir,
    `.${allowedFileName}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let fileDescriptor;
  let tempExists = false;
  let createdTempStats = null;
  let atomicReplaceAttemptCount = 0;
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
      throw new Error("public_evidence_write_blocked:temporary_source_verification_failed");
    }
    if (process.platform === "win32") {
      fs.closeSync(fileDescriptor);
      fileDescriptor = undefined;
    }
    while (atomicReplaceAttemptCount < PUBLIC_EVIDENCE_WRITE_CONTRACT.max_atomic_replace_attempts) {
      const recheckedParent = inspectRepoPath("docs/evidence", { projectRoot, expectedKind: "directory" });
      const recheckedTarget = inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" });
      if (recheckedParent.status !== "safe_to_execute" || recheckedParent.exists !== true || recheckedTarget.status !== "safe_to_execute") {
        throw new Error("public_evidence_write_blocked:path_changed_before_replace");
      }
      const expectedTempStats = fileDescriptor === undefined ? createdTempStats : fs.fstatSync(fileDescriptor);
      if (!pathMatchesFileIdentity(tempPath, expectedTempStats)) {
        throw new Error("public_evidence_write_blocked:temporary_source_changed");
      }
      atomicReplaceAttemptCount += 1;
      try {
        fs.renameSync(tempPath, fullPath);
        tempExists = false;
        break;
      } catch (error) {
        const retryAllowed = TRANSIENT_ATOMIC_REPLACE_ERROR_CODES.has(error?.code)
          && atomicReplaceAttemptCount < PUBLIC_EVIDENCE_WRITE_CONTRACT.max_atomic_replace_attempts;
        if (!retryAllowed) throw error;
        waitForAtomicReplaceRetry(atomicReplaceAttemptCount);
      }
    }
    const written = inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" });
    if (
      written.status !== "safe_to_execute"
      || written.exists !== true
      || written.bytes > PUBLIC_EVIDENCE_WRITE_CONTRACT.max_file_bytes
    ) {
      throw new Error("public_evidence_write_blocked:post_replace_verification_failed");
    }
  } catch (error) {
    if (String(error?.message || "").startsWith("public_evidence_write_blocked:")) {
      throw error;
    }
    throw new Error("public_evidence_write_blocked:atomic_replace_failed");
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
  return relativePath;
}

export function recordEvidence(db, runId, commandId, kind, evidencePath, isPublicSafe = false) {
  const id = makeId("ev");
  db.prepare(`
    INSERT INTO evidence (id, run_id, command_id, kind, type, path, is_public_safe, sanitized, redaction_status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, runId || null, commandId || null, kind, kind, evidencePath, isPublicSafe ? 1 : 0, isPublicSafe ? 1 : 0, "redacted", nowIso());
  return id;
}

export function latestEvidence(options = {}) {
  const projectRoot = options.projectRoot || PROJECT_ROOT;
  const rawEvidenceDir = options.rawEvidenceDir || RAW_EVIDENCE_DIR;
  const scanLimit = boundedInteger(options.scanLimit, LATEST_EVIDENCE_CONTRACT.max_scan_entries, LATEST_EVIDENCE_CONTRACT.max_scan_entries);
  const previewByteLimit = boundedInteger(options.previewByteLimit, LATEST_EVIDENCE_CONTRACT.max_preview_bytes, LATEST_EVIDENCE_CONTRACT.max_preview_bytes);
  const previewCharLimit = boundedInteger(options.previewCharLimit, LATEST_EVIDENCE_CONTRACT.max_preview_chars, LATEST_EVIDENCE_CONTRACT.max_preview_chars);
  if (!options.projectRoot && !options.rawEvidenceDir) ensureKernel();

  const blockers = [];
  const candidates = [];
  let scannedEntryCount = 0;
  let scanTruncated = false;
  let inventoryRootSafe = false;

  const resolvedRoot = path.resolve(projectRoot);
  const resolvedRawDir = path.resolve(rawEvidenceDir);
  const rootInspection = inspectRepoPath(resolvedRawDir, {
    projectRoot: resolvedRoot,
    expectedKind: "directory"
  });
  if (rootInspection.blocker === "repo_path_outside_project_root") {
    blockers.push("raw_evidence_directory_outside_project_root");
  } else if (rootInspection.status === "safe_to_execute" && !rootInspection.exists) {
    inventoryRootSafe = true;
  } else if (rootInspection.status === "safe_to_execute" && rootInspection.kind === "directory") {
    inventoryRootSafe = true;
  } else {
    blockers.push("raw_evidence_directory_not_realpath_contained_regular_directory");
  }

  if (inventoryRootSafe && rootInspection.exists) {
    const entries = [];
    let directory;
    try {
      directory = fs.opendirSync(resolvedRawDir);
      while (entries.length <= scanLimit) {
        const entry = directory.readSync();
        if (!entry) break;
        if (entries.length === scanLimit) {
          scanTruncated = true;
          break;
        }
        entries.push(entry);
      }
    } catch {
      blockers.push("raw_evidence_directory_scan_failed");
    } finally {
      if (directory) {
        try {
          directory.closeSync();
        } catch {
          blockers.push(LATEST_EVIDENCE_CONTRACT.directory_close_failure_blocker);
          entries.length = 0;
          scanTruncated = false;
        }
      }
    }
    scannedEntryCount = entries.length;
    if (scanTruncated) blockers.push("raw_evidence_scan_truncated");
    for (const entry of entries) {
      if (!entry.name.endsWith(".log") || !entry.isFile()) continue;
      const fullPath = path.join(resolvedRawDir, entry.name);
      try {
        const stat = fs.lstatSync(fullPath);
        if (!stat.isFile() || stat.isSymbolicLink() || !isInsideProject(fs.realpathSync(fullPath), fs.realpathSync(resolvedRoot))) {
          blockers.push("raw_evidence_file_not_realpath_contained_regular_file");
          continue;
        }
        candidates.push({ file: entry.name, fullPath, mtimeMs: stat.mtimeMs });
      } catch {
        blockers.push("raw_evidence_file_inspection_failed");
      }
    }
  }

  const inventoryBlockers = [...new Set(blockers)];
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs || right.file.localeCompare(left.file));
  const latest = candidates[0] || null;
  if (!latest) blockers.push("no_raw_evidence_files");

  let preview = null;
  let previewBytesRead = 0;
  let previewComplete = false;
  let targetOpenPerformed = false;
  let targetReadPerformed = false;
  let singleFileHandleUsed = false;
  let contentStableDuringRead = null;
  let fileBytes = null;
  if (latest) {
    let fileDescriptor;
    try {
      fileDescriptor = fs.openSync(latest.fullPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
      targetOpenPerformed = true;
      const openedStats = fs.fstatSync(fileDescriptor);
      fileBytes = openedStats.size;
      const currentStats = fs.statSync(latest.fullPath);
      if (!openedStats.isFile() || !sameFileSnapshot(openedStats, currentStats)) {
        blockers.push("latest_evidence_file_changed_after_open");
      } else {
        const buffer = Buffer.alloc(previewByteLimit);
        previewBytesRead = fs.readSync(fileDescriptor, buffer, 0, previewByteLimit, 0);
        targetReadPerformed = true;
        singleFileHandleUsed = true;
        const afterReadStats = fs.fstatSync(fileDescriptor);
        contentStableDuringRead = sameFileSnapshot(openedStats, afterReadStats);
        if (!contentStableDuringRead) {
          blockers.push("latest_evidence_file_changed_during_read");
        } else {
          const decoded = buffer.subarray(0, previewBytesRead).toString("utf8");
          preview = decoded.slice(0, previewCharLimit);
          previewComplete = openedStats.size <= previewBytesRead && decoded.length <= previewCharLimit;
        }
      }
    } catch {
      blockers.push("latest_evidence_prefix_read_failed");
    } finally {
      if (fileDescriptor !== undefined) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          blockers.push(LATEST_EVIDENCE_CONTRACT.file_close_failure_blocker);
          preview = null;
          previewBytesRead = 0;
          previewComplete = false;
          contentStableDuringRead = false;
        }
      }
    }
  }

  const uniqueBlockers = [...new Set(blockers)];
  return {
    status: uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: uniqueBlockers,
    inventory_policy: LATEST_EVIDENCE_CONTRACT.inventory_policy,
    inventory_root_safe: inventoryRootSafe,
    root_inspection: rootInspection,
    scan_limit: scanLimit,
    scanned_entry_count: scannedEntryCount,
    scan_truncated: scanTruncated,
    log_candidate_count: candidates.length,
    log_candidate_count_exact: inventoryBlockers.length === 0,
    latest_exact: Boolean(latest && inventoryBlockers.length === 0),
    path: latest ? rootRelativePath(latest.fullPath, projectRoot) : null,
    read_policy: LATEST_EVIDENCE_CONTRACT.read_policy,
    preview_byte_limit: previewByteLimit,
    preview_char_limit: previewCharLimit,
    target_open_performed: targetOpenPerformed,
    target_read_performed: targetReadPerformed,
    single_file_handle_used: singleFileHandleUsed,
    content_stable_during_read: contentStableDuringRead,
    file_bytes: fileBytes,
    preview_bytes_read: previewBytesRead,
    preview_char_count: preview?.length || 0,
    preview_complete: previewComplete,
    preview,
    full_file_exposed: false,
    payload_exposed_on_failure: false,
    writes_performed: false,
    note: uniqueBlockers.length === 0
      ? "Latest raw evidence was selected from a bounded exact inventory and read through a bounded single-handle prefix."
      : "Latest raw evidence is not proven exactly or could not be read safely within the bounded contract."
  };
}
