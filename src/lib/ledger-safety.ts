import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { nowIso } from "./db.ts";
import { PATHS, toProjectPath } from "./paths.ts";
import { redact } from "./redaction.ts";
import { inspectRepoPath } from "./repo-scan.ts";
import { LEDGER_MUTATION_LOCK_CONTRACT, withLedgerMutationLock } from "./ledger-lock.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;

export const LEDGER_SAFETY_SCAN_CONTRACT = Object.freeze({
  policy: "bounded_single_handle_jsonl_scan_with_true_finding_count",
  max_files: 100,
  max_file_bytes: 10_000_000,
  max_lines_per_file: 50_000,
  max_returned_findings: 200,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_blocker: "ledger_file_close_failed",
  directory_close_failure_blocker: "ledger_directory_close_failed",
  payload_exposed: false,
  payload_exposed_on_failure: false,
  writes_allowed: false
});

export const LEDGER_REPAIR_WRITE_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_atomic_backup_then_replace",
  max_file_bytes: LEDGER_SAFETY_SCAN_CONTRACT.max_file_bytes,
  parent_directory_creation_policy: "one_segment_at_a_time_with_path_recheck",
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  concurrent_mutation_policy: LEDGER_MUTATION_LOCK_CONTRACT.policy,
  max_mutation_lock_attempts: LEDGER_MUTATION_LOCK_CONTRACT.max_lock_attempts,
  stale_mutation_lock_reclamation_allowed: false,
  backup_create_only: true,
  atomic_create_link: true,
  temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match",
  identity_safe_temp_cleanup: true,
  backup_post_publish_identity_policy: "temporary_and_backup_dev_ino_match",
  atomic_replace: true,
  replacement_post_publish_identity_policy: "temporary_and_live_ledger_dev_ino_match",
  original_backup_required: true,
  payload_exposed_on_failure: false,
  writes_outside_project_allowed: false
});

function boundedInteger(value, fallback, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, max) : fallback;
}

function isInsideProject(fullPath, projectRoot) {
  const relative = path.relative(projectRoot, fullPath);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
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

function containsSensitiveLedgerValue(line) {
  return redact(line) !== line;
}

function scanOptions(options = {}) {
  const projectRoot = options.projectRoot || PATHS.projectRoot;
  return {
    projectRoot,
    ledgerDir: options.ledgerDir || (projectRoot === PATHS.projectRoot ? PATHS.ledgerDir : path.join(projectRoot, ".pala", "ledger")),
    maxFiles: boundedInteger(options.maxFiles, LEDGER_SAFETY_SCAN_CONTRACT.max_files, LEDGER_SAFETY_SCAN_CONTRACT.max_files),
    maxFileBytes: boundedInteger(options.maxFileBytes, LEDGER_SAFETY_SCAN_CONTRACT.max_file_bytes, LEDGER_SAFETY_SCAN_CONTRACT.max_file_bytes),
    maxLinesPerFile: boundedInteger(options.maxLinesPerFile, LEDGER_SAFETY_SCAN_CONTRACT.max_lines_per_file, LEDGER_SAFETY_SCAN_CONTRACT.max_lines_per_file),
    maxFindings: boundedInteger(options.maxFindings, LEDGER_SAFETY_SCAN_CONTRACT.max_returned_findings, LEDGER_SAFETY_SCAN_CONTRACT.max_returned_findings)
  };
}

function ensureContainedDirectories(projectRoot, relativeDirectory) {
  const target = path.resolve(projectRoot, relativeDirectory);
  const relative = path.relative(projectRoot, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    return { status: "manual_verification_required", blockers: ["ledger_repair_directory_outside_project"], created_directories: [] };
  }
  const targetInspection = inspectRepoPath(relative, { projectRoot, expectedKind: "directory" });
  if (targetInspection.status !== "safe_to_execute") {
    return { status: "manual_verification_required", blockers: ["ledger_repair_directory_path_not_safe"], created_directories: [] };
  }

  const created = [];
  let current = projectRoot;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const currentRelative = toProjectPath(current, projectRoot);
    let inspection = inspectRepoPath(currentRelative, { projectRoot, expectedKind: "directory" });
    if (inspection.status !== "safe_to_execute") {
      return { status: "manual_verification_required", blockers: ["ledger_repair_directory_path_not_safe"], created_directories: created };
    }
    if (!inspection.exists) {
      try {
        fs.mkdirSync(current);
        created.push(currentRelative);
      } catch (error) {
        if (error?.code !== "EEXIST") {
          return { status: "manual_verification_required", blockers: ["ledger_repair_directory_create_failed"], created_directories: created };
        }
      }
      inspection = inspectRepoPath(currentRelative, { projectRoot, expectedKind: "directory" });
    }
    if (inspection.status !== "safe_to_execute" || inspection.exists !== true || inspection.kind !== "directory") {
      return { status: "manual_verification_required", blockers: ["ledger_repair_directory_post_create_verification_failed"], created_directories: created };
    }
  }
  return { status: "safe_to_execute", blockers: [], created_directories: created };
}

function atomicCreateBackup(plan, backupRoot, bounded) {
  const backupPath = path.join(backupRoot, path.basename(plan.fullPath));
  const backupRelative = toProjectPath(backupPath, bounded.projectRoot);
  const parentInspection = inspectRepoPath(toProjectPath(backupRoot, bounded.projectRoot), {
    projectRoot: bounded.projectRoot,
    expectedKind: "directory"
  });
  const targetInspection = inspectRepoPath(backupRelative, {
    projectRoot: bounded.projectRoot,
    expectedKind: "file"
  });
  const bytes = Buffer.byteLength(plan.original, "utf8");
  if (
    parentInspection.status !== "safe_to_execute"
    || parentInspection.exists !== true
    || targetInspection.status !== "safe_to_execute"
    || targetInspection.exists
    || bytes > LEDGER_REPAIR_WRITE_CONTRACT.max_file_bytes
  ) {
    return { status: "manual_verification_required", blocker: "ledger_repair_backup_path_not_safe_or_bounded", backup_identity_verified: false, writes_performed: false };
  }

  const tempPath = path.join(
    backupRoot,
    `.${path.basename(backupPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
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
    fs.writeFileSync(fileDescriptor, plan.original, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      return { status: "manual_verification_required", blocker: "ledger_repair_backup_create_failed", backup_identity_verified: false, writes_performed: true };
    }
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    const recheckedTarget = inspectRepoPath(backupRelative, { projectRoot: bounded.projectRoot, expectedKind: "file" });
    if (recheckedTarget.status !== "safe_to_execute" || recheckedTarget.exists) {
      return { status: "manual_verification_required", blocker: "ledger_repair_backup_target_changed_before_publish", backup_identity_verified: false, writes_performed: true };
    }
    fs.linkSync(tempPath, backupPath);
    const written = inspectRepoPath(backupRelative, { projectRoot: bounded.projectRoot, expectedKind: "file" });
    let backupIdentityVerified = false;
    try {
      const backupStats = fs.lstatSync(backupPath);
      backupIdentityVerified = backupStats.isFile()
        && !backupStats.isSymbolicLink()
        && sameFileIdentity(createdTempStats, backupStats);
    } catch {
      backupIdentityVerified = false;
    }
    if (written.status !== "safe_to_execute" || written.exists !== true || written.bytes !== bytes || !backupIdentityVerified) {
      return { status: "manual_verification_required", blocker: "ledger_repair_backup_post_create_verification_failed", backup_identity_verified: false, writes_performed: true };
    }
    return { status: "safe_to_execute", blocker: null, backup_identity_verified: true, writes_performed: true };
  } catch {
    return { status: "manual_verification_required", blocker: "ledger_repair_backup_create_failed", backup_identity_verified: false, writes_performed: tempExists };
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

function atomicReplaceLedger(plan, bounded) {
  const targetInspection = inspectRepoPath(plan.relativePath, {
    projectRoot: bounded.projectRoot,
    expectedKind: "file"
  });
  const parentInspection = inspectRepoPath(toProjectPath(path.dirname(plan.fullPath), bounded.projectRoot), {
    projectRoot: bounded.projectRoot,
    expectedKind: "directory"
  });
  const bytes = Buffer.byteLength(plan.sanitized, "utf8");
  if (
    targetInspection.status !== "safe_to_execute"
    || targetInspection.exists !== true
    || parentInspection.status !== "safe_to_execute"
    || parentInspection.exists !== true
    || bytes > LEDGER_REPAIR_WRITE_CONTRACT.max_file_bytes
  ) {
    return { status: "manual_verification_required", blocker: "ledger_repair_target_not_safe_or_bounded", replacement_identity_verified: false, writes_performed: false };
  }

  const unchanged = readBoundedLedgerFile(plan.fullPath, bounded);
  if (unchanged.status !== "safe_to_execute" || unchanged.text !== plan.original) {
    return { status: "manual_verification_required", blocker: "ledger_repair_target_changed_before_replace", replacement_identity_verified: false, writes_performed: false };
  }

  const tempPath = path.join(
    path.dirname(plan.fullPath),
    `.${path.basename(plan.fullPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
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
    fs.writeFileSync(fileDescriptor, plan.sanitized, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      return { status: "manual_verification_required", blocker: "ledger_repair_atomic_replace_failed", replacement_identity_verified: false, writes_performed: true };
    }
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    const rechecked = readBoundedLedgerFile(plan.fullPath, bounded);
    if (rechecked.status !== "safe_to_execute" || rechecked.text !== plan.original) {
      return { status: "manual_verification_required", blocker: "ledger_repair_target_changed_before_replace", replacement_identity_verified: false, writes_performed: true };
    }
    const replaceSourceStats = fs.lstatSync(tempPath);
    if (
      !replaceSourceStats.isFile()
      || replaceSourceStats.isSymbolicLink()
      || !sameFileIdentity(createdTempStats, replaceSourceStats)
    ) {
      return { status: "manual_verification_required", blocker: "ledger_repair_atomic_replace_failed", replacement_identity_verified: false, writes_performed: true };
    }
    fs.renameSync(tempPath, plan.fullPath);
    tempExists = false;
    const written = inspectRepoPath(plan.relativePath, { projectRoot: bounded.projectRoot, expectedKind: "file" });
    let replacementIdentityVerified = false;
    try {
      const liveLedgerStats = fs.lstatSync(plan.fullPath);
      replacementIdentityVerified = liveLedgerStats.isFile()
        && !liveLedgerStats.isSymbolicLink()
        && sameFileIdentity(createdTempStats, liveLedgerStats);
    } catch {
      replacementIdentityVerified = false;
    }
    if (written.status !== "safe_to_execute" || written.exists !== true || written.bytes !== bytes || !replacementIdentityVerified) {
      return { status: "manual_verification_required", blocker: "ledger_repair_post_replace_verification_failed", replacement_identity_verified: false, writes_performed: true };
    }
    return { status: "safe_to_execute", blocker: null, replacement_identity_verified: true, writes_performed: true };
  } catch {
    return { status: "manual_verification_required", blocker: "ledger_repair_atomic_replace_failed", replacement_identity_verified: false, writes_performed: tempExists };
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

function inventoryLedgerFiles(options) {
  const blockers = [];
  const files = [];
  const ledgerDir = path.resolve(options.ledgerDir);
  const projectRoot = path.resolve(options.projectRoot);
  const rootInspection = inspectRepoPath(ledgerDir, {
    projectRoot,
    expectedKind: "directory"
  });
  if (rootInspection.blocker === "repo_path_outside_project_root") {
    return {
      blockers: ["ledger_directory_outside_project_root"],
      files,
      scannedEntryCount: 0,
      fileScanTruncated: false,
      ledgerFileCountExact: false,
      inventoryRootSafe: false,
      rootInspection
    };
  }
  if (rootInspection.status === "safe_to_execute" && !rootInspection.exists) {
    return {
      blockers,
      files,
      scannedEntryCount: 0,
      fileScanTruncated: false,
      ledgerFileCountExact: true,
      inventoryRootSafe: true,
      rootInspection
    };
  }

  if (rootInspection.status !== "safe_to_execute" || rootInspection.kind !== "directory") {
    return {
      blockers: [rootInspection.blocker === "repo_path_inspection_failed"
        ? "ledger_directory_inspection_failed"
        : "ledger_directory_not_realpath_contained_regular_directory"],
      files,
      scannedEntryCount: 0,
      fileScanTruncated: false,
      ledgerFileCountExact: false,
      inventoryRootSafe: false,
      rootInspection
    };
  }

  const entries = [];
  let fileScanTruncated = false;
  let directory;
  try {
    directory = fs.opendirSync(ledgerDir);
    while (entries.length <= options.maxFiles) {
      const entry = directory.readSync();
      if (!entry) break;
      if (entries.length === options.maxFiles) {
        fileScanTruncated = true;
        break;
      }
      entries.push(entry);
    }
  } catch {
    blockers.push("ledger_directory_scan_failed");
  } finally {
    if (directory) {
      try {
        directory.closeSync();
      } catch {
        blockers.push(LEDGER_SAFETY_SCAN_CONTRACT.directory_close_failure_blocker);
        entries.length = 0;
        fileScanTruncated = false;
      }
    }
  }
  if (fileScanTruncated) blockers.push("ledger_file_scan_truncated");

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.name.endsWith(".jsonl")) continue;
    const fullPath = path.join(ledgerDir, entry.name);
    try {
      const stat = fs.lstatSync(fullPath);
      const contained = stat.isFile()
        && !stat.isSymbolicLink()
        && isInsideProject(fs.realpathSync(fullPath), fs.realpathSync(projectRoot));
      if (contained) {
        files.push(fullPath);
      } else {
        blockers.push("ledger_file_not_realpath_contained_regular_file");
      }
    } catch {
      blockers.push("ledger_file_inspection_failed");
    }
  }

  return {
    blockers: [...new Set(blockers)],
    files,
    scannedEntryCount: entries.length,
    fileScanTruncated,
    ledgerFileCountExact: blockers.length === 0,
    inventoryRootSafe: true,
    rootInspection
  };
}

function readBoundedLedgerFile(fullPath, options) {
  let stat;
  try {
    stat = fs.lstatSync(fullPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      return { status: "manual_verification_required", blocker: "ledger_file_not_realpath_contained_regular_file" };
    }
    if (!isInsideProject(fs.realpathSync(fullPath), fs.realpathSync(options.projectRoot))) {
      return { status: "manual_verification_required", blocker: "ledger_file_not_realpath_contained_regular_file" };
    }
  } catch {
    return { status: "manual_verification_required", blocker: "ledger_file_inspection_failed" };
  }
  if (stat.size > options.maxFileBytes) {
    return { status: "manual_verification_required", blocker: "ledger_file_exceeds_byte_limit", bytes: stat.size };
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(fullPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return { status: "manual_verification_required", blocker: "ledger_file_open_failed" };
  }
  try {
    const openedStats = fs.fstatSync(fileDescriptor);
    if (!openedStats.isFile()) {
      return { status: "manual_verification_required", blocker: "ledger_file_not_realpath_contained_regular_file" };
    }
    if (openedStats.size > options.maxFileBytes) {
      return { status: "manual_verification_required", blocker: "ledger_file_exceeds_byte_limit", bytes: openedStats.size };
    }
    let currentStats = null;
    try {
      currentStats = fs.statSync(fullPath);
    } catch {
      currentStats = null;
    }
    if (!currentStats || !sameFileSnapshot(openedStats, currentStats)) {
      return { status: "manual_verification_required", blocker: "ledger_file_changed_during_scan" };
    }
    let text;
    try {
      text = fs.readFileSync(fileDescriptor, "utf8");
    } catch {
      return { status: "manual_verification_required", blocker: "ledger_file_read_failed" };
    }
    const afterReadStats = fs.fstatSync(fileDescriptor);
    if (!sameFileSnapshot(openedStats, afterReadStats)) {
      return { status: "manual_verification_required", blocker: "ledger_file_changed_during_scan" };
    }
    return {
      status: "safe_to_execute",
      text,
      bytes: openedStats.size,
      singleFileHandleUsed: true,
      contentStableDuringRead: true
    };
  } finally {
    try {
      fs.closeSync(fileDescriptor);
    } catch {
      return {
        status: "manual_verification_required",
        blocker: LEDGER_SAFETY_SCAN_CONTRACT.close_failure_blocker,
        payload_exposed_on_failure: false
      };
    }
  }
}

export function inspectLedgerSafety(options = {}) {
  const bounded = scanOptions(options);
  const inventory = inventoryLedgerFiles(bounded);
  const blockers = [...inventory.blockers];
  const findings = [];
  let findingCount = 0;
  let scannedLineCount = 0;
  let lineScanTruncatedFileCount = 0;
  let oversizedFileCount = 0;
  let checkedFileCount = 0;
  const checkedFiles = [];
  const addFinding = (finding) => {
    findingCount += 1;
    if (findings.length < bounded.maxFindings) findings.push(finding);
  };

  for (const fullPath of inventory.files) {
    const relativePath = toProjectPath(fullPath, bounded.projectRoot);
    const inspected = readBoundedLedgerFile(fullPath, bounded);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      if (inspected.blocker === "ledger_file_exceeds_byte_limit") oversizedFileCount += 1;
      continue;
    }
    checkedFileCount += 1;
    checkedFiles.push(relativePath);
    const lines = inspected.text.split(/\r?\n/);
    const scannedLines = lines.slice(0, bounded.maxLinesPerFile);
    scannedLineCount += scannedLines.length;
    if (lines.length > bounded.maxLinesPerFile) {
      blockers.push("ledger_line_scan_truncated");
      lineScanTruncatedFileCount += 1;
    }
    scannedLines.forEach((line, index) => {
      if (!line.trim()) return;
      try {
        JSON.parse(line);
      } catch {
        addFinding({
          severity: "high",
          file: relativePath,
          line: index + 1,
          summary: "Local ledger line is not valid JSON."
        });
      }
      if (containsSensitiveLedgerValue(line)) {
        addFinding({
          severity: "high",
          file: relativePath,
          line: index + 1,
          summary: "Local ledger line contains a personal path or secret-like value."
        });
      }
    });
  }

  const uniqueBlockers = [...new Set(blockers)];
  const scanComplete = uniqueBlockers.length === 0;
  return {
    status: scanComplete && findingCount === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: uniqueBlockers,
    scan_policy: LEDGER_SAFETY_SCAN_CONTRACT.policy,
    scan_complete: scanComplete,
    inventory_root_safe: inventory.inventoryRootSafe,
    root_inspection: inventory.rootInspection,
    file_scan_limit: bounded.maxFiles,
    scanned_entry_count: inventory.scannedEntryCount,
    file_scan_truncated: inventory.fileScanTruncated,
    ledger_file_count: inventory.files.length,
    ledger_file_count_exact: inventory.ledgerFileCountExact,
    checked_file_count: checkedFileCount,
    checked_files: checkedFiles,
    max_file_bytes: bounded.maxFileBytes,
    oversized_file_count: oversizedFileCount,
    line_scan_limit_per_file: bounded.maxLinesPerFile,
    scanned_line_count: scannedLineCount,
    line_scan_truncated_file_count: lineScanTruncatedFileCount,
    finding_limit: bounded.maxFindings,
    finding_count: findingCount,
    returned_finding_count: findings.length,
    omitted_finding_count: Math.max(0, findingCount - findings.length),
    findings_truncated: findingCount > findings.length,
    findings,
    payload_exposed: false,
    writes_performed: false,
    note: scanComplete
      ? "Bounded ledger safety scan completed; findings never echo sensitive source text."
      : "Bounded ledger safety scan is incomplete; repair and PASS remain blocked."
  };
}

function repairLedgerSafetyWithAcquiredMutationLock(options = {}, bounded = scanOptions(options)) {
  const apply = Boolean(options.apply);
  const before = inspectLedgerSafety(bounded);
  if (!before.scan_complete) {
    return {
      status: "manual_verification_required",
      dry_run: !apply,
      blockers: before.blockers,
      scan_complete: false,
      repair_blocked_by_incomplete_scan: true,
      writes_performed: false,
      affected_ledger_files: [],
      backup_path: null,
      before_findings: before.findings,
      before_finding_count: before.finding_count,
      after_findings: null,
      note: "Repair is blocked because the bounded ledger safety scan is incomplete."
    };
  }

  const inventory = inventoryLedgerFiles(bounded);
  const plans = [];
  const repairBlockers = [];
  for (const fullPath of inventory.files) {
    const inspected = readBoundedLedgerFile(fullPath, bounded);
    if (inspected.status !== "safe_to_execute") {
      repairBlockers.push(inspected.blocker);
      continue;
    }
    const sanitized = redact(inspected.text);
    if (sanitized !== inspected.text) {
      plans.push({ fullPath, relativePath: toProjectPath(fullPath, bounded.projectRoot), original: inspected.text, sanitized });
    }
  }
  if (repairBlockers.length > 0) {
    return {
      status: "manual_verification_required",
      dry_run: !apply,
      blockers: [...new Set(repairBlockers)],
      scan_complete: false,
      repair_blocked_by_incomplete_scan: true,
      writes_performed: false,
      affected_ledger_files: [],
      backup_path: null,
      before_findings: before.findings,
      before_finding_count: before.finding_count,
      after_findings: null,
      note: "Repair is blocked because ledger files changed or could not be read safely after inspection."
    };
  }

  const backupRoot = path.join(bounded.projectRoot, ".pala", "private", "ledger-redaction-backups", nowIso().replace(/[:.]/g, "-"));
  const writeSummary = {
    planned_file_count: plans.length,
    created_directory_count: 0,
    backup_file_count: 0,
    backup_identity_verified_count: 0,
    atomic_replace_file_count: 0,
    atomic_replace_identity_verified_count: 0,
    failed_file_count: 0
  };
  if (apply && plans.length > 0) {
    const directories = ensureContainedDirectories(bounded.projectRoot, toProjectPath(backupRoot, bounded.projectRoot));
    writeSummary.created_directory_count = directories.created_directories.length;
    if (directories.status !== "safe_to_execute") {
      return {
        status: "manual_verification_required",
        dry_run: false,
        blockers: directories.blockers,
        scan_complete: false,
        repair_blocked_by_incomplete_scan: false,
        write_contract: LEDGER_REPAIR_WRITE_CONTRACT,
        write_summary: writeSummary,
        writes_performed: directories.created_directories.length > 0,
        affected_ledger_files: plans.map((plan) => plan.relativePath),
        backup_path: null,
        before_findings: before.findings,
        before_finding_count: before.finding_count,
        after_findings: null,
        note: "Repair write blocked before backup creation because the private backup path was unsafe."
      };
    }

    const backupFailures = [];
    for (const plan of plans) {
      const backup = atomicCreateBackup(plan, backupRoot, bounded);
      if (backup.status === "safe_to_execute") {
        writeSummary.backup_file_count += 1;
        if (backup.backup_identity_verified) writeSummary.backup_identity_verified_count += 1;
      } else {
        backupFailures.push(backup.blocker);
      }
    }
    if (backupFailures.length > 0) {
      writeSummary.failed_file_count = backupFailures.length;
      return {
        status: "manual_verification_required",
        dry_run: false,
        blockers: [...new Set(backupFailures)],
        scan_complete: false,
        repair_blocked_by_incomplete_scan: false,
        write_contract: LEDGER_REPAIR_WRITE_CONTRACT,
        write_summary: writeSummary,
        writes_performed: writeSummary.created_directory_count > 0 || writeSummary.backup_file_count > 0,
        affected_ledger_files: plans.map((plan) => plan.relativePath),
        backup_path: writeSummary.backup_file_count > 0 ? toProjectPath(backupRoot, bounded.projectRoot) : null,
        before_findings: before.findings,
        before_finding_count: before.finding_count,
        after_findings: null,
        note: "Repair write blocked because every original ledger could not be preserved first."
      };
    }

    const replaceFailures = [];
    for (const plan of plans) {
      const replaced = atomicReplaceLedger(plan, bounded);
      if (replaced.status === "safe_to_execute") {
        writeSummary.atomic_replace_file_count += 1;
        if (replaced.replacement_identity_verified) writeSummary.atomic_replace_identity_verified_count += 1;
      } else {
        replaceFailures.push(replaced.blocker);
      }
    }
    if (replaceFailures.length > 0) {
      writeSummary.failed_file_count = replaceFailures.length;
      return {
        status: "manual_verification_required",
        dry_run: false,
        blockers: [...new Set(replaceFailures)],
        scan_complete: false,
        repair_blocked_by_incomplete_scan: false,
        write_contract: LEDGER_REPAIR_WRITE_CONTRACT,
        write_summary: writeSummary,
        writes_performed: true,
        affected_ledger_files: plans.map((plan) => plan.relativePath),
        backup_path: toProjectPath(backupRoot, bounded.projectRoot),
        before_findings: before.findings,
        before_finding_count: before.finding_count,
        after_findings: null,
        note: "Original backups were preserved, but one or more atomic ledger replacements failed."
      };
    }
  }
  const after = apply ? inspectLedgerSafety(bounded) : null;
  const status = apply
    ? after.status
    : plans.length > 0
      ? "dry_run_only"
      : before.status;
  return {
    status,
    dry_run: !apply,
    blockers: apply ? after.blockers : before.blockers,
    scan_complete: apply ? after.scan_complete : before.scan_complete,
    repair_blocked_by_incomplete_scan: false,
    write_contract: LEDGER_REPAIR_WRITE_CONTRACT,
    write_summary: writeSummary,
    writes_performed: apply && plans.length > 0,
    affected_ledger_files: plans.map((plan) => plan.relativePath),
    backup_path: apply && plans.length > 0 ? toProjectPath(backupRoot, bounded.projectRoot) : null,
    before_findings: before.findings,
    before_finding_count: before.finding_count,
    after_findings: after?.findings || null,
    note: apply
      ? "Sensitive originals were preserved under the gitignored .pala/private backup before sanitized ledger rewrite."
      : "Dry-run only. Use the explicit local apply mode to create a private backup and sanitize local ledgers before public export."
  };
}

export function repairLedgerSafety(options = {}) {
  const apply = Boolean(options.apply);
  const bounded = scanOptions(options);
  if (!apply) return repairLedgerSafetyWithAcquiredMutationLock(options, bounded);
  try {
    return withLedgerMutationLock({
      projectRoot: bounded.projectRoot,
      ledgerDir: bounded.ledgerDir
    }, () => repairLedgerSafetyWithAcquiredMutationLock(options, bounded));
  } catch (error) {
    const lockMayHaveBeenReleasedAfterWork = /changed_before_release|release_failed/.test(String(error?.message || ""));
    return {
      status: "manual_verification_required",
      dry_run: false,
      blockers: ["ledger_repair_mutation_lock_unavailable"],
      scan_complete: false,
      repair_blocked_by_incomplete_scan: false,
      write_contract: LEDGER_REPAIR_WRITE_CONTRACT,
      write_summary: {
        planned_file_count: 0,
        created_directory_count: 0,
        backup_file_count: 0,
        atomic_replace_file_count: 0,
        failed_file_count: 0
      },
      writes_performed: lockMayHaveBeenReleasedAfterWork,
      affected_ledger_files: [],
      backup_path: null,
      before_findings: [],
      before_finding_count: 0,
      after_findings: null,
      note: "Repair apply was blocked because the shared ledger mutation lock was unavailable or unsafe."
    };
  }
}
