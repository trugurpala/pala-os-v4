import { inspectGitRemotes, inspectGitStatus, SYNC_OBSERVATION_CONTRACT } from "./sync.ts";

export function inspectPushReadiness(options = {}) {
  const worktree = inspectGitStatus(options);
  const remoteObservation = inspectGitRemotes(options);
  const blockers = [...worktree.blockers, ...remoteObservation.blockers];
  if (worktree.scan_complete && worktree.changed_files_count > 0) {
    blockers.push("worktree_has_uncommitted_or_untracked_files");
  }
  if (remoteObservation.scan_complete && remoteObservation.remote_count === 0) {
    blockers.push("no_git_remote_configured");
  }
  const uniqueBlockers = [...new Set(blockers)];
  return {
    status: uniqueBlockers.length === 0 ? "safe_to_execute" : "blocked",
    contract: SYNC_OBSERVATION_CONTRACT,
    pushed: false,
    blockers: uniqueBlockers,
    scan_complete: worktree.scan_complete && remoteObservation.scan_complete,
    changed_files_count: worktree.changed_files_count,
    changed_files_count_exact: worktree.changed_files_count_exact,
    changed_files: worktree.changed_files,
    changed_files_truncated: worktree.changed_files_truncated,
    remote_count: remoteObservation.remote_count,
    remote_count_exact: remoteObservation.remote_count_exact,
    remotes: remoteObservation.remotes,
    remotes_truncated: remoteObservation.remotes_truncated,
    worktree_observation: worktree.observation,
    remote_observation: remoteObservation.observation,
    raw_output_exposed: false,
    writes_performed: false,
    note: "Push-check reports bounded git worktree/remote truth only and never pushes."
  };
}
