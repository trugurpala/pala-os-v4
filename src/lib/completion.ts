function itemSummary(item) {
  if (typeof item === "string") return item;
  return item?.name || item?.summary || item?.file || JSON.stringify(item);
}

function unresolvedBlockers(result) {
  const items = (Array.isArray(result.root_blockers)
    ? result.root_blockers
    : [
        ...(Array.isArray(result.blockers) ? result.blockers : []),
        ...(Array.isArray(result.release_blockers) ? result.release_blockers : []),
        ...(Array.isArray(result.failures) ? result.failures : []),
        ...(Array.isArray(result.findings) ? result.findings : [])
      ]).map(itemSummary).filter(Boolean);
  if (result.error) items.push(String(result.error));
  if (result.status === "manual_verification_required" && items.length === 0) items.push("manual_verification_required");
  if (result.status === "needs_approval" && items.length === 0) items.push("explicit_approval_required");
  return [...new Set(items)];
}

function worktreeTruth(input) {
  if (Array.isArray(input)) {
    return {
      blockers: [],
      scan_complete: true,
      changed_files_count: input.length,
      changed_files_count_exact: true,
      changed_files: input.slice(0, 120),
      changed_files_truncated: input.length > 120,
      observation: null
    };
  }
  return {
    blockers: Array.isArray(input?.blockers) ? input.blockers : ["git_status_observation_missing"],
    scan_complete: input?.scan_complete === true,
    changed_files_count: Number.isInteger(input?.changed_files_count) ? input.changed_files_count : null,
    changed_files_count_exact: input?.changed_files_count_exact === true,
    changed_files: Array.isArray(input?.changed_files) ? input.changed_files.slice(0, 120) : [],
    changed_files_truncated: Boolean(input?.changed_files_truncated),
    observation: input?.observation || null
  };
}

export function buildCompletionSummary(result, changedFilesOrObservation, rawLogPath) {
  const worktree = worktreeTruth(changedFilesOrObservation);
  const blockers = [...new Set([...unresolvedBlockers(result), ...worktree.blockers])];
  const decision = result.decision?.decision || null;
  const acceptanceStatus = blockers.length === 0 && (decision === "pass_allowed" || result.status === "safe_to_execute")
    ? "PASS"
    : result.status === "blocked"
      ? "BLOCKED"
      : "PARTIAL";
  const riskLevel = result.decision?.risk_level
    || result.decision?.riskLevel
    || (result.status === "blocked" || result.status === "needs_approval" ? "high" : blockers.length > 0 ? "medium" : "low");
  const nextAction = result.next_action
    || (acceptanceStatus === "PASS"
      ? "Review the evidence and keep push/publish actions approval-gated."
      : result.status === "dry_run_only"
        ? "Review the dry-run evidence before approving any real write."
        : blockers.length > 0
          ? "Resolve or explicitly review the listed blockers, then rerun the command."
          : "Continue with the next evidence-backed phase.");

  return {
    acceptance_status: acceptanceStatus,
    changed_files_count: worktree.changed_files_count,
    changed_files_count_exact: worktree.changed_files_count_exact,
    changed_files: worktree.changed_files,
    changed_files_truncated: worktree.changed_files_truncated,
    worktree_observation: worktree.observation,
    evidence_summary: {
      raw_log_path: rawLogPath,
      decision_evidence_path: result.decision?.evidence_path || null,
      command_status: result.status
    },
    risk_summary: {
      level: riskLevel,
      unresolved_blocker_count: blockers.length,
      unresolved_blockers: blockers
    },
    next_action: nextAction
  };
}
