import fs from "node:fs";
import path from "node:path";
import { toProjectPath } from "./paths.ts";
import { inspectRepoPath } from "./repo-scan.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
const LEDGER_MUTATION_LOCK_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));
const TRANSIENT_LEDGER_MUTATION_LOCK_ERROR_CODES = new Set(["EACCES", "EEXIST", "EPERM"]);
const LEDGER_MUTATION_LOCK_FILE = ".ledger-mutation.write-lock";

export const LEDGER_MUTATION_LOCK_CONTRACT = Object.freeze({
  policy: "bounded_fixed_create_only_lock_serialized_ledger_mutations",
  max_lock_attempts: 100,
  lock_retry_delay_ms: 5,
  max_lock_retry_delay_ms: 25,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  post_release_success_policy: "released_identity_absent_or_safe_successor",
  stale_lock_reclamation_allowed: false,
  payload_exposed_on_failure: false,
  writes_outside_ledger_dir_allowed: false
});

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function inspectLedgerMutationLock(projectRoot, ledgerDir) {
  const parentRelative = toProjectPath(ledgerDir, projectRoot);
  const lockRelative = toProjectPath(path.join(ledgerDir, LEDGER_MUTATION_LOCK_FILE), projectRoot);
  const parent = inspectRepoPath(parentRelative, { projectRoot, expectedKind: "directory" });
  const lock = inspectRepoPath(lockRelative, { projectRoot, expectedKind: "file" });
  if (
    parent.status !== "safe_to_execute"
    || parent.exists !== true
    || lock.status !== "safe_to_execute"
  ) {
    throw new Error("ledger_mutation_lock_blocked:path_not_safe");
  }
  return lock;
}

function waitForLedgerMutationLock(attempt) {
  const delay = Math.min(
    LEDGER_MUTATION_LOCK_CONTRACT.max_lock_retry_delay_ms,
    LEDGER_MUTATION_LOCK_CONTRACT.lock_retry_delay_ms * attempt
  );
  Atomics.wait(LEDGER_MUTATION_LOCK_WAIT_ARRAY, 0, 0, delay);
}

function confirmLedgerMutationLockReleased(projectRoot, ledgerDir, lock) {
  const afterRelease = inspectLedgerMutationLock(projectRoot, ledgerDir);
  if (!afterRelease.exists) return;
  try {
    const currentStats = fs.lstatSync(lock.lockPath);
    if (
      !currentStats.isFile()
      || currentStats.isSymbolicLink()
      || sameFileIdentity(lock.openedStats, currentStats)
    ) {
      throw new Error("ledger_mutation_lock_blocked:release_failed");
    }
  } catch (error) {
    if (error?.code === "ENOENT") return;
    throw new Error("ledger_mutation_lock_blocked:release_failed");
  }
}

function acquireLedgerMutationLock(projectRoot, ledgerDir) {
  const lockPath = path.join(ledgerDir, LEDGER_MUTATION_LOCK_FILE);
  for (let attempt = 1; attempt <= LEDGER_MUTATION_LOCK_CONTRACT.max_lock_attempts; attempt += 1) {
    const inspected = inspectLedgerMutationLock(projectRoot, ledgerDir);
    if (inspected.exists) {
      if (attempt === LEDGER_MUTATION_LOCK_CONTRACT.max_lock_attempts) {
        throw new Error("ledger_mutation_lock_blocked:unavailable");
      }
      waitForLedgerMutationLock(attempt);
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
        throw new Error("ledger_mutation_lock_blocked:changed_after_create");
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
      if (String(error?.message || "").startsWith("ledger_mutation_lock_blocked:")) {
        throw error;
      }
      const retryAllowed = TRANSIENT_LEDGER_MUTATION_LOCK_ERROR_CODES.has(error?.code)
        && attempt < LEDGER_MUTATION_LOCK_CONTRACT.max_lock_attempts;
      if (!retryAllowed) {
        throw new Error("ledger_mutation_lock_blocked:acquire_failed");
      }
      waitForLedgerMutationLock(attempt);
    }
  }
  throw new Error("ledger_mutation_lock_blocked:unavailable");
}

function releaseLedgerMutationLock(projectRoot, ledgerDir, lock) {
  let currentStats;
  try {
    currentStats = fs.statSync(lock.lockPath);
  } catch {
    try {
      fs.closeSync(lock.fileDescriptor);
    } catch {
      // The lock path already changed; preserve the fail-closed result.
    }
    throw new Error("ledger_mutation_lock_blocked:changed_before_release");
  }
  if (!sameFileIdentity(lock.openedStats, currentStats)) {
    try {
      fs.closeSync(lock.fileDescriptor);
    } catch {
      // The changed lock remains fail-closed.
    }
    throw new Error("ledger_mutation_lock_blocked:changed_before_release");
  }
  let releaseError;
  try {
    fs.unlinkSync(lock.lockPath);
    confirmLedgerMutationLockReleased(projectRoot, ledgerDir, lock);
  } catch {
    releaseError = new Error("ledger_mutation_lock_blocked:release_failed");
  }
  try {
    fs.closeSync(lock.fileDescriptor);
  } catch {
    releaseError = new Error("ledger_mutation_lock_blocked:release_failed");
  }
  if (releaseError) throw releaseError;
}

export function withLedgerMutationLock(options, operation) {
  const projectRoot = path.resolve(options.projectRoot);
  const ledgerDir = path.resolve(options.ledgerDir);
  const lock = acquireLedgerMutationLock(projectRoot, ledgerDir);
  let result;
  let operationError;
  try {
    result = operation();
  } catch (error) {
    operationError = error;
  }
  let releaseError;
  try {
    releaseLedgerMutationLock(projectRoot, ledgerDir, lock);
  } catch (error) {
    releaseError = error;
  }
  if (operationError) throw operationError;
  if (releaseError) throw releaseError;
  return result;
}
