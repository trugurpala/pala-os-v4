import { buildCompletionSummary } from "./completion.ts";
import { finishCommand } from "./db.ts";
import { recordEvidence, writeEvidence } from "./evidence.ts";
import { appendLedger } from "./ledger.ts";
import { refreshOperationalState } from "./state-refresh.ts";

export const CLI_FINALIZATION_CONTRACT = Object.freeze({
  policy: "explicit_outcome_cli_finalization_before_database_close",
  required_steps: Object.freeze([
    "raw_evidence",
    "database_evidence_record",
    "ledger_append",
    "database_finish",
    "state_refresh"
  ]),
  step_outcomes: Object.freeze(["not_attempted", "confirmed", "unknown_after_attempt"]),
  write_failure_policy: "manual_verification_required_exit_1",
  dependent_step_policy: "not_attempted_when_prerequisite_unconfirmed",
  payload_exposed_on_failure: false
});

const STEP_BLOCKERS = Object.freeze({
  raw_evidence: "cli_raw_evidence_write_outcome_unknown",
  database_evidence_record: "cli_database_evidence_record_outcome_unknown",
  ledger_append: "cli_ledger_append_outcome_unknown",
  database_finish: "cli_database_finish_outcome_unknown",
  state_refresh: "cli_state_refresh_outcome_unknown"
});

function step(outcome, extra = {}) {
  return {
    attempted: outcome !== "not_attempted",
    outcome,
    payload_exposed_on_failure: false,
    ...extra
  };
}

function runStatusFor(result) {
  if (result.decision?.decision === "pass_allowed") return "passed";
  if (result.status === "blocked") return "blocked";
  if (result.status === "manual_verification_required") return "manual_verification_required";
  if (result.exitCode && result.exitCode !== 0) return "failed";
  return "partial";
}

function worktreeDetails(observation) {
  if (Array.isArray(observation)) {
    return {
      changed_files_count: observation.length,
      changed_files_count_exact: true,
      changed_files: observation.slice(0, 120),
      changed_files_truncated: observation.length > 120,
      observation: null
    };
  }
  return {
    changed_files_count: observation?.changed_files_count ?? null,
    changed_files_count_exact: observation?.changed_files_count_exact === true,
    changed_files: Array.isArray(observation?.changed_files) ? observation.changed_files.slice(0, 120) : [],
    changed_files_truncated: Boolean(observation?.changed_files_truncated),
    observation: observation?.observation || null
  };
}

function withBlocker(result, blocker) {
  return {
    ...result,
    status: result.status === "blocked" ? "blocked" : "manual_verification_required",
    exitCode: 1,
    blockers: [...new Set([...(Array.isArray(result.blockers) ? result.blockers : []), blocker])]
  };
}

export function finalizeCliCommand(input, options = {}) {
  const dependencies = {
    writeEvidence: options.writeEvidence || writeEvidence,
    recordEvidence: options.recordEvidence || recordEvidence,
    appendLedger: options.appendLedger || appendLedger,
    finishCommand: options.finishCommand || finishCommand,
    refreshOperationalState: options.refreshOperationalState || refreshOperationalState
  };
  const worktree = worktreeDetails(input.worktreeObservation);
  const finalization = {
    status: "safe_to_execute",
    contract: CLI_FINALIZATION_CONTRACT,
    blockers: [],
    steps: {
      raw_evidence: step("not_attempted"),
      database_evidence_record: step("not_attempted"),
      ledger_append: step("not_attempted"),
      database_finish: step("not_attempted"),
      state_refresh: step("not_attempted")
    },
    payload_exposed_on_failure: false
  };
  let result = { ...input.result };
  let exitCode = Number.isInteger(result.exitCode) ? result.exitCode : 0;
  let rawLogPath = null;
  let stateRefresh = null;

  const downgrade = (blocker) => {
    if (!finalization.blockers.includes(blocker)) finalization.blockers.push(blocker);
    finalization.status = "manual_verification_required";
    result = withBlocker(result, blocker);
    exitCode = 1;
  };
  const completion = () => buildCompletionSummary(result, input.worktreeObservation, rawLogPath);

  const preliminaryCompletion = completion();
  if (input.strict && preliminaryCompletion.acceptance_status !== "PASS") {
    exitCode = 1;
  }

  try {
    const candidatePath = dependencies.writeEvidence(input.commandKind, {
      command: input.command,
      command_record: input.commandRecord,
      exit_code: exitCode,
      result,
      finalization_pending: true,
      changed_files_count: worktree.changed_files_count,
      changed_files_count_exact: worktree.changed_files_count_exact,
      changed_files: worktree.changed_files,
      changed_files_truncated: worktree.changed_files_truncated,
      worktree_observation: worktree.observation
    });
    if (typeof candidatePath !== "string" || candidatePath.length === 0) {
      throw new Error("raw_evidence_path_not_confirmed");
    }
    rawLogPath = candidatePath;
    finalization.steps.raw_evidence = step("confirmed");
  } catch {
    finalization.steps.raw_evidence = step("unknown_after_attempt");
    downgrade(STEP_BLOCKERS.raw_evidence);
  }

  if (rawLogPath) {
    try {
      const evidenceId = dependencies.recordEvidence(
        input.db,
        input.runId,
        input.commandId,
        "command",
        rawLogPath,
        false
      );
      if (typeof evidenceId !== "string" || evidenceId.length === 0) {
        throw new Error("database_evidence_record_not_confirmed");
      }
      finalization.steps.database_evidence_record = step("confirmed");
    } catch {
      finalization.steps.database_evidence_record = step("unknown_after_attempt");
      downgrade(STEP_BLOCKERS.database_evidence_record);
    }

    try {
      const currentCompletion = completion();
      const ledgerPath = dependencies.appendLedger("events", {
        run_id: input.runId,
        command_id: input.commandId,
        command: input.command,
        command_record: input.commandRecord,
        exit_code: exitCode,
        status: result.status,
        raw_log_path: rawLogPath,
        changed_files_count: worktree.changed_files_count,
        changed_files_count_exact: worktree.changed_files_count_exact,
        changed_files: worktree.changed_files,
        changed_files_truncated: worktree.changed_files_truncated,
        acceptance_status: currentCompletion.acceptance_status,
        risk_summary: currentCompletion.risk_summary,
        next_action: currentCompletion.next_action
      });
      if (typeof ledgerPath !== "string" || ledgerPath.length === 0) {
        throw new Error("ledger_append_path_not_confirmed");
      }
      finalization.steps.ledger_append = step("confirmed");
    } catch {
      finalization.steps.ledger_append = step("unknown_after_attempt");
      downgrade(STEP_BLOCKERS.ledger_append);
    }
  }

  let databaseFinishAttemptCount = 0;
  const persistDatabaseFinish = () => {
    databaseFinishAttemptCount += 1;
    try {
      dependencies.finishCommand(input.db, input.runId, input.commandId, {
        exitCode,
        rawLogPath,
        changedFilesCount: worktree.changed_files_count ?? 0,
        runStatus: runStatusFor(result),
        riskLevel: result.decision?.risk_level || result.decision?.riskLevel || "unknown"
      });
      finalization.steps.database_finish = step("confirmed", {
        attempt_count: databaseFinishAttemptCount
      });
    } catch {
      finalization.steps.database_finish = step("unknown_after_attempt", {
        attempt_count: databaseFinishAttemptCount
      });
      downgrade(STEP_BLOCKERS.database_finish);
    }
  };
  persistDatabaseFinish();

  const blockerCountBeforeStateRefresh = finalization.blockers.length;
  try {
    stateRefresh = dependencies.refreshOperationalState(input.db, {
      command: input.command,
      commandRecord: input.commandRecord,
      result,
      completion: completion(),
      rawLogPath,
      finalization
    });
    finalization.steps.state_refresh = step("confirmed", {
      reported_status: stateRefresh?.state_io?.status || "unknown"
    });
    if (stateRefresh?.state_io?.status !== "safe_to_execute") {
      const blockers = Array.isArray(stateRefresh?.state_io?.blockers) && stateRefresh.state_io.blockers.length > 0
        ? stateRefresh.state_io.blockers.map((blocker) => `cli_state_refresh_reported:${blocker}`)
        : ["cli_state_refresh_reported_incomplete"];
      for (const blocker of blockers) downgrade(blocker);
    }
  } catch {
    finalization.steps.state_refresh = step("unknown_after_attempt");
    stateRefresh = null;
    downgrade(STEP_BLOCKERS.state_refresh);
  }
  if (finalization.blockers.length > blockerCountBeforeStateRefresh) {
    persistDatabaseFinish();
  }

  return {
    result,
    completion: completion(),
    finalization,
    stateRefresh,
    exitCode,
    rawLogPath
  };
}
