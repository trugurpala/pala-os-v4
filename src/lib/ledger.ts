import fs from "node:fs";
import path from "node:path";
import { ensureKernel, nowIso } from "./db.ts";
import { createPaths, PROJECT_ROOT, toProjectPath } from "./paths.ts";
import { redact } from "./redaction.ts";
import { inspectRepoPath } from "./repo-scan.ts";
import { LEDGER_MUTATION_LOCK_CONTRACT, withLedgerMutationLock } from "./ledger-lock.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
export const LEDGER_FILES = Object.freeze([
  "events.jsonl",
  "handoffs.jsonl",
  "decisions.jsonl",
  "mistakes.jsonl",
  "token-economy.jsonl",
  "evidence.jsonl",
  "token-cost.jsonl",
  "verification.jsonl",
  "reference-refresh.jsonl"
]);
const LEDGER_FILE_SET = new Set(LEDGER_FILES);

export const LEDGER_APPEND_CONTRACT = Object.freeze({
  policy: "fixed_allowlisted_project_contained_single_handle_append",
  allowed_file_count: LEDGER_FILES.length,
  allowed_files: LEDGER_FILES,
  max_record_bytes: 1_000_000,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  concurrent_mutation_policy: LEDGER_MUTATION_LOCK_CONTRACT.policy,
  max_mutation_lock_attempts: LEDGER_MUTATION_LOCK_CONTRACT.max_lock_attempts,
  stale_mutation_lock_reclamation_allowed: false,
  nofollow_supported: NOFOLLOW_FLAG !== 0,
  single_append_handle: true,
  close_failure_error: "ledger_append_blocked:file_close_failed",
  payload_exposed_on_failure: false,
  writes_outside_ledger_dir_allowed: false
});

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function normalizedLedgerFileName(name) {
  const fileName = name.endsWith(".jsonl") ? name : `${name}.jsonl`;
  if (!LEDGER_FILE_SET.has(fileName)) {
    throw new Error("ledger_name_not_allowed");
  }
  return fileName;
}

function inspectLedgerTarget(projectRoot, fileName) {
  const parent = inspectRepoPath(".pala/ledger", { projectRoot, expectedKind: "directory" });
  const target = inspectRepoPath(`.pala/ledger/${fileName}`, { projectRoot, expectedKind: "file" });
  if (
    parent.status !== "safe_to_execute"
    || parent.exists !== true
    || target.status !== "safe_to_execute"
    || target.exists !== true
  ) {
    throw new Error("ledger_append_blocked:path_not_safe");
  }
  return target;
}

export function appendLedger(name, event, options = {}) {
  const fileName = normalizedLedgerFileName(String(name || ""));
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  ensureKernel({ projectRoot });
  const ledgerDir = createPaths(projectRoot).ledgerDir;
  const fullPath = path.join(ledgerDir, fileName);
  const record = {
    recorded_at: nowIso(),
    ...event
  };
  const buffer = Buffer.from(`${redact(JSON.stringify(record))}\n`, "utf8");
  if (buffer.byteLength > LEDGER_APPEND_CONTRACT.max_record_bytes) {
    throw new Error("ledger_append_blocked:record_exceeds_byte_limit");
  }

  try {
    return withLedgerMutationLock({ projectRoot, ledgerDir }, () => {
      inspectLedgerTarget(projectRoot, fileName);
      let fileDescriptor;
      let appendError;
      try {
        fileDescriptor = fs.openSync(fullPath, fs.constants.O_WRONLY | fs.constants.O_APPEND | NOFOLLOW_FLAG);
        const openedStats = fs.fstatSync(fileDescriptor);
        const currentStats = fs.statSync(fullPath);
        if (!openedStats.isFile() || !sameFileIdentity(openedStats, currentStats)) {
          throw new Error("ledger_append_blocked:path_changed_after_open");
        }
        inspectLedgerTarget(projectRoot, fileName);
        const bytesWritten = fs.writeSync(fileDescriptor, buffer, 0, buffer.byteLength, null);
        if (bytesWritten !== buffer.byteLength) {
          throw new Error("ledger_append_blocked:short_write");
        }
        fs.fsyncSync(fileDescriptor);
        const afterWriteStats = fs.fstatSync(fileDescriptor);
        const afterWritePathStats = fs.statSync(fullPath);
        if (!sameFileIdentity(afterWriteStats, afterWritePathStats)) {
          throw new Error("ledger_append_blocked:path_changed_after_write");
        }
        inspectLedgerTarget(projectRoot, fileName);
      } catch (error) {
        appendError = error;
      }
      let closeError;
      if (fileDescriptor !== undefined) {
        try {
          fs.closeSync(fileDescriptor);
        } catch {
          closeError = new Error(LEDGER_APPEND_CONTRACT.close_failure_error);
        }
      }
      if (appendError) throw appendError;
      if (closeError) throw closeError;
      return toProjectPath(fullPath, projectRoot);
    });
  } catch (error) {
    if (String(error?.message || "").startsWith("ledger_append_blocked:")) {
      throw error;
    }
    if (String(error?.message || "").startsWith("ledger_mutation_lock_blocked:")) {
      throw new Error("ledger_append_blocked:mutation_lock_unavailable");
    }
    throw new Error("ledger_append_blocked:write_failed");
  }
}
