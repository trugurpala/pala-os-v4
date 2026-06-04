import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, toProjectPath } from "./paths.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
const IGNORED_DIR_NAMES = new Set([".git", "node_modules", "dist", "coverage", "db", "raw"]);
const IGNORED_PREFIXES = [
  ".pala/db",
  ".pala/evidence/raw",
  ".pala/state",
  ".pala/ledger",
  ".pala/archive",
  ".pala/private",
  ".pala/secrets"
];

export const REPO_SCAN_CONTRACT = Object.freeze({
  policy: "bounded_realpath_contained_inventory_with_single_handle_text_reads",
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  missing_path_ancestor_check: true,
  max_scan_entries: 5000,
  max_depth: 32,
  max_text_file_bytes: 2_000_000,
  max_total_text_bytes: 20_000_000,
  max_returned_findings: 200,
  post_read_path_recheck: true,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  directory_close_failure_blocker: "repo_directory_close_failed",
  payload_exposed: false,
  payload_exposed_on_failure: false,
  writes_allowed: false
});

export const REPO_PATH_INSPECTION_CONTRACT = Object.freeze({
  policy: "realpath_contained_symlink_free_path_metadata_only",
  expected_kinds: ["file", "directory"],
  missing_path_ancestor_check: true,
  payload_exposed: false,
  writes_allowed: false
});

export const REPO_PATH_PRESENCE_CONTRACT = Object.freeze({
  policy: "repo_path_presence_from_contained_metadata_only",
  path_policy: REPO_PATH_INSPECTION_CONTRACT.policy,
  payload_exposed: false,
  writes_allowed: false
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

function isIgnored(relativePath, entry) {
  const normalized = relativePath.replace(/\\/g, "/");
  if (entry.isDirectory() && IGNORED_DIR_NAMES.has(entry.name)) return true;
  return IGNORED_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`));
}

function inspectContainedDirectory(directoryPath, realProjectRoot) {
  try {
    const stat = fs.lstatSync(directoryPath);
    const realPath = fs.realpathSync(directoryPath);
    return stat.isDirectory()
      && !stat.isSymbolicLink()
      && isInsideOrEqual(realPath, realProjectRoot);
  } catch {
    return false;
  }
}

function readDirectoryEntries(directoryPath, remainingEntries) {
  const entries = [];
  let overflow = false;
  let directory;
  let result;
  try {
    directory = fs.opendirSync(directoryPath);
    while (entries.length <= remainingEntries) {
      const entry = directory.readSync();
      if (!entry) break;
      if (entries.length === remainingEntries) {
        overflow = true;
        break;
      }
      entries.push(entry);
    }
    result = { status: "safe_to_execute", entries, overflow, blocker: null };
  } catch {
    result = {
      status: "manual_verification_required",
      entries: [],
      overflow: false,
      blocker: "repo_directory_scan_failed"
    };
  }
  if (directory) {
    try {
      directory.closeSync();
    } catch {
      return {
        status: "manual_verification_required",
        entries: [],
        overflow: false,
        blocker: REPO_SCAN_CONTRACT.directory_close_failure_blocker
      };
    }
  }
  return result;
}

export function repoScanOptions(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  return {
    projectRoot,
    startDir: path.resolve(options.startDir || projectRoot),
    maxScanEntries: boundedInteger(options.maxScanEntries, REPO_SCAN_CONTRACT.max_scan_entries, REPO_SCAN_CONTRACT.max_scan_entries),
    maxDepth: boundedInteger(options.maxDepth, REPO_SCAN_CONTRACT.max_depth, REPO_SCAN_CONTRACT.max_depth),
    maxTextFileBytes: boundedInteger(options.maxTextFileBytes, REPO_SCAN_CONTRACT.max_text_file_bytes, REPO_SCAN_CONTRACT.max_text_file_bytes),
    maxTotalTextBytes: boundedInteger(options.maxTotalTextBytes, REPO_SCAN_CONTRACT.max_total_text_bytes, REPO_SCAN_CONTRACT.max_total_text_bytes),
    maxReturnedFindings: boundedInteger(options.maxReturnedFindings, REPO_SCAN_CONTRACT.max_returned_findings, REPO_SCAN_CONTRACT.max_returned_findings)
  };
}

export function inspectRepoInventory(options = {}) {
  const bounded = repoScanOptions(options);
  const blockers = [];
  const files = [];
  let scannedEntryCount = 0;
  let scanTruncated = false;
  let deepestScannedDepth = 0;
  let realProjectRoot;
  const rootInspection = inspectRepoPath(bounded.startDir, {
    projectRoot: bounded.projectRoot,
    expectedKind: "directory"
  });

  if (rootInspection.status !== "safe_to_execute") {
    blockers.push(rootInspection.blocker === "repo_path_inspection_failed"
      ? "repo_project_root_inspection_failed"
      : "repo_scan_root_not_realpath_contained_regular_directory");
  }
  if (blockers.length === 0 && !rootInspection.exists) {
    return {
      status: "safe_to_execute",
      contract: REPO_SCAN_CONTRACT,
      root_inspection: rootInspection,
      files,
      blockers,
      scan_complete: true,
      scan_truncated: false,
      scanned_entry_count: 0,
      file_count: 0,
      file_count_exact: true,
      deepest_scanned_depth: 0,
      writes_performed: false
    };
  }

  if (blockers.length === 0) {
    try {
      realProjectRoot = fs.realpathSync(bounded.projectRoot);
    } catch {
      blockers.push("repo_project_root_inspection_failed");
    }
  }
  if (realProjectRoot && !inspectContainedDirectory(bounded.startDir, realProjectRoot)) {
    blockers.push("repo_scan_root_not_realpath_contained_regular_directory");
  }
  if (blockers.length > 0) {
    return {
      status: "manual_verification_required",
      contract: REPO_SCAN_CONTRACT,
      root_inspection: rootInspection,
      files,
      blockers: [...new Set(blockers)],
      scan_complete: false,
      scan_truncated: false,
      scanned_entry_count: 0,
      file_count: 0,
      file_count_exact: false,
      deepest_scanned_depth: 0,
      writes_performed: false
    };
  }

  const queue = [{ directoryPath: bounded.startDir, depth: 0 }];
  scanLoop:
  while (queue.length > 0) {
    const current = queue.shift();
    deepestScannedDepth = Math.max(deepestScannedDepth, current.depth);
    const remainingEntries = bounded.maxScanEntries - scannedEntryCount;
    const observed = readDirectoryEntries(current.directoryPath, remainingEntries);
    if (observed.status !== "safe_to_execute") {
      blockers.push(observed.blocker || "repo_directory_scan_failed");
      continue;
    }

    observed.entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of observed.entries) {
      scannedEntryCount += 1;
      const fullPath = path.join(current.directoryPath, entry.name);
      const relativePath = toProjectPath(fullPath, bounded.projectRoot);
      if (isIgnored(relativePath, entry)) continue;
      if (entry.isSymbolicLink()) {
        blockers.push("repo_symlink_entry_skipped");
        continue;
      }
      if (entry.isDirectory()) {
        if (current.depth + 1 > bounded.maxDepth) {
          blockers.push("repo_scan_depth_limit_reached");
          scanTruncated = true;
          continue;
        }
        if (!inspectContainedDirectory(fullPath, realProjectRoot)) {
          blockers.push("repo_directory_not_realpath_contained_regular_directory");
          continue;
        }
        queue.push({ directoryPath: fullPath, depth: current.depth + 1 });
        continue;
      }
      if (!entry.isFile()) {
        blockers.push("repo_non_regular_entry_skipped");
        continue;
      }
      try {
        const stat = fs.lstatSync(fullPath);
        const contained = stat.isFile()
          && !stat.isSymbolicLink()
          && isInsideOrEqual(fs.realpathSync(fullPath), realProjectRoot);
        if (contained) {
          files.push(relativePath);
        } else {
          blockers.push("repo_file_not_realpath_contained_regular_file");
        }
      } catch {
        blockers.push("repo_file_inspection_failed");
      }
    }
    if (observed.overflow) {
      blockers.push("repo_scan_entry_limit_reached");
      scanTruncated = true;
      break scanLoop;
    }
  }

  files.sort((left, right) => left.localeCompare(right));
  const uniqueBlockers = [...new Set(blockers)];
  const scanComplete = uniqueBlockers.length === 0;
  return {
    status: scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    root_inspection: rootInspection,
    files,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    scan_truncated: scanTruncated,
    scanned_entry_count: scannedEntryCount,
    file_count: files.length,
    file_count_exact: scanComplete,
    deepest_scanned_depth: deepestScannedDepth,
    writes_performed: false
  };
}

export function inspectRepoPath(relativePath, options = {}) {
  const bounded = repoScanOptions(options);
  const fullPath = path.resolve(bounded.projectRoot, relativePath);
  const expectedKind = REPO_PATH_INSPECTION_CONTRACT.expected_kinds.includes(options.expectedKind)
    ? options.expectedKind
    : null;
  const base = {
    contract: REPO_PATH_INSPECTION_CONTRACT,
    path: toProjectPath(fullPath, bounded.projectRoot),
    expected_kind: expectedKind,
    payload_exposed: false,
    writes_performed: false
  };
  if (!isInsideOrEqual(fullPath, bounded.projectRoot)) {
    return {
      ...base,
      status: "manual_verification_required",
      exists: false,
      kind: null,
      bytes: null,
      blocker: "repo_path_outside_project_root"
    };
  }

  let stats;
  try {
    stats = fs.lstatSync(fullPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      try {
        const projectRootStats = fs.lstatSync(bounded.projectRoot);
        fs.realpathSync(bounded.projectRoot);
        if (
          !projectRootStats.isDirectory()
          || projectRootStats.isSymbolicLink()
          || pathHasSymlinkAtOrBelowRoot(bounded.projectRoot, fullPath)
        ) {
          return {
            ...base,
            status: "manual_verification_required",
            exists: false,
            kind: null,
            bytes: null,
            blocker: "repo_path_not_realpath_contained_symlink_free"
          };
        }
      } catch {
        return {
          ...base,
          status: "manual_verification_required",
          exists: false,
          kind: null,
          bytes: null,
          blocker: "repo_path_inspection_failed"
        };
      }
      return {
        ...base,
        status: "safe_to_execute",
        exists: false,
        kind: null,
        bytes: 0,
        blocker: null
      };
    }
    return {
      ...base,
      status: "manual_verification_required",
      exists: false,
      kind: null,
      bytes: null,
      blocker: "repo_path_inspection_failed"
    };
  }

  let realProjectRoot;
  let realPath;
  try {
    realProjectRoot = fs.realpathSync(bounded.projectRoot);
    realPath = fs.realpathSync(fullPath);
  } catch {
    return {
      ...base,
      status: "manual_verification_required",
      exists: true,
      kind: null,
      bytes: stats.size,
      blocker: "repo_path_inspection_failed"
    };
  }
  if (
    stats.isSymbolicLink()
    || pathHasSymlinkAtOrBelowRoot(bounded.projectRoot, fullPath)
    || !isInsideOrEqual(realPath, realProjectRoot)
  ) {
    return {
      ...base,
      status: "manual_verification_required",
      exists: true,
      kind: null,
      bytes: stats.size,
      blocker: "repo_path_not_realpath_contained_symlink_free"
    };
  }

  const kind = stats.isFile() ? "file" : stats.isDirectory() ? "directory" : "other";
  if (kind === "other" || (expectedKind && expectedKind !== kind)) {
    return {
      ...base,
      status: "manual_verification_required",
      exists: true,
      kind,
      bytes: stats.isFile() ? stats.size : null,
      blocker: "repo_path_kind_mismatch"
    };
  }
  return {
    ...base,
    status: "safe_to_execute",
    exists: true,
    kind,
    bytes: stats.isFile() ? stats.size : null,
    blocker: null
  };
}

export function inspectRepoPathPresence(relativePath, options = {}) {
  const inspection = inspectRepoPath(relativePath, options);
  return {
    status: inspection.status,
    contract: REPO_PATH_PRESENCE_CONTRACT,
    present: inspection.status === "safe_to_execute" && inspection.exists === true,
    blocker: inspection.blocker,
    inspection,
    payload_exposed: false,
    writes_performed: false
  };
}

export function readBoundedRepoText(filePath, options = {}) {
  const bounded = repoScanOptions(options);
  const requestedMaxReadBytes = Number(options.maxReadBytes);
  const maxReadBytes = Number.isInteger(requestedMaxReadBytes) && requestedMaxReadBytes >= 0
    ? Math.min(requestedMaxReadBytes, bounded.maxTextFileBytes)
    : bounded.maxTextFileBytes;
  const fullPath = path.resolve(bounded.projectRoot, filePath);
  const pathInspection = inspectRepoPath(fullPath, {
    projectRoot: bounded.projectRoot,
    expectedKind: "file"
  });
  if (pathInspection.status !== "safe_to_execute") {
    const blocker = pathInspection.blocker === "repo_path_outside_project_root"
      ? "repo_text_path_outside_project_root"
      : pathInspection.blocker === "repo_path_inspection_failed"
        ? "repo_text_file_inspection_failed"
        : "repo_text_file_not_realpath_contained_regular_file";
    return { status: "manual_verification_required", exists: pathInspection.exists === true, blocker };
  }
  if (!pathInspection.exists) {
    return { status: "safe_to_execute", exists: false, text: "", bytes: 0 };
  }

  const stat = { size: pathInspection.bytes };
  if (stat.size > bounded.maxTextFileBytes) {
    return {
      status: "manual_verification_required",
      exists: true,
      blocker: "repo_text_file_exceeds_byte_limit",
      bytes: stat.size
    };
  }
  if (stat.size > maxReadBytes) {
    return {
      status: "manual_verification_required",
      exists: true,
      blocker: "repo_text_total_byte_limit_reached",
      bytes: stat.size
    };
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(fullPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return { status: "manual_verification_required", exists: true, blocker: "repo_text_file_open_failed" };
  }
  const finish = (result) => {
    try {
      fs.closeSync(fileDescriptor);
      return result;
    } catch {
      return {
        status: "manual_verification_required",
        exists: true,
        blocker: "repo_text_file_close_failed",
        single_file_handle_used: true,
        payload_exposed_on_failure: false
      };
    }
  };
  try {
    const openedStats = fs.fstatSync(fileDescriptor);
    if (!openedStats.isFile()) {
      return finish({ status: "manual_verification_required", exists: true, blocker: "repo_text_file_not_realpath_contained_regular_file" });
    }
    if (openedStats.size > bounded.maxTextFileBytes) {
      return finish({
        status: "manual_verification_required",
        exists: true,
        blocker: "repo_text_file_exceeds_byte_limit",
        bytes: openedStats.size
      });
    }
    if (openedStats.size > maxReadBytes) {
      return finish({
        status: "manual_verification_required",
        exists: true,
        blocker: "repo_text_total_byte_limit_reached",
        bytes: openedStats.size
      });
    }
    let currentStats;
    try {
      currentStats = fs.statSync(fullPath);
    } catch {
      currentStats = null;
    }
    if (!currentStats || !sameFileSnapshot(openedStats, currentStats)) {
      return finish({ status: "manual_verification_required", exists: true, blocker: "repo_text_file_changed_during_scan" });
    }

    const buffer = Buffer.alloc(Math.min(openedStats.size + 1, bounded.maxTextFileBytes + 1));
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(fileDescriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const afterReadStats = fs.fstatSync(fileDescriptor);
    if (bytesRead !== openedStats.size || !sameFileSnapshot(openedStats, afterReadStats)) {
      return finish({ status: "manual_verification_required", exists: true, blocker: "repo_text_file_changed_during_scan" });
    }
    let afterReadPathStats;
    try {
      afterReadPathStats = fs.statSync(fullPath);
    } catch {
      afterReadPathStats = null;
    }
    if (!afterReadPathStats || !sameFileSnapshot(afterReadStats, afterReadPathStats)) {
      return finish({ status: "manual_verification_required", exists: true, blocker: "repo_text_file_changed_during_scan" });
    }
    return finish({
      status: "safe_to_execute",
      exists: true,
      text: buffer.subarray(0, bytesRead).toString("utf8"),
      bytes: bytesRead,
      single_file_handle_used: true,
      content_stable_during_read: true,
      post_read_path_recheck_performed: true
    });
  } catch {
    return finish({ status: "manual_verification_required", exists: true, blocker: "repo_text_file_read_failed" });
  }
}

export function createBoundedRepoTextReader(options = {}) {
  const bounded = repoScanOptions(options);
  const blockers = [];
  let totalTextBytesRead = 0;
  let textFileReadCount = 0;

  return {
    read(filePath) {
      const remainingBytes = Math.max(0, bounded.maxTotalTextBytes - totalTextBytesRead);
      const inspected = readBoundedRepoText(filePath, { ...bounded, maxReadBytes: remainingBytes });
      if (inspected.status !== "safe_to_execute") {
        blockers.push(inspected.blocker);
      } else if (inspected.exists) {
        totalTextBytesRead += inspected.bytes;
        textFileReadCount += 1;
      }
      return inspected;
    },
    summary() {
      const uniqueBlockers = [...new Set(blockers)];
      return {
        text_read_policy: REPO_SCAN_CONTRACT.policy,
        total_text_byte_limit: bounded.maxTotalTextBytes,
        total_text_bytes_read: totalTextBytesRead,
        text_file_read_count: textFileReadCount,
        text_read_budget_complete: !uniqueBlockers.includes("repo_text_total_byte_limit_reached"),
        text_read_blockers: uniqueBlockers
      };
    }
  };
}
