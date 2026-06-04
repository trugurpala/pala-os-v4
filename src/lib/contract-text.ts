import { createBoundedRepoTextReader, REPO_SCAN_CONTRACT, repoScanOptions } from "./repo-scan.ts";

export const CONTRACT_TEXT_READ_CONTRACT = Object.freeze({
  policy: "bounded_cached_contract_text_reads_with_shared_budget",
  max_file_bytes: REPO_SCAN_CONTRACT.max_text_file_bytes,
  max_total_text_bytes: REPO_SCAN_CONTRACT.max_total_text_bytes,
  post_read_path_recheck: true,
  metadata_failure_policy: REPO_SCAN_CONTRACT.metadata_failure_policy,
  payload_exposed: false,
  payload_exposed_on_failure: false,
  writes_allowed: false
});

export function createContractTextReader(options = {}) {
  const bounded = repoScanOptions(options);
  const reader = options.textReader || createBoundedRepoTextReader(bounded);
  const cache = new Map();
  function inspect(relativePath) {
    if (!cache.has(relativePath)) cache.set(relativePath, reader.read(relativePath));
    return cache.get(relativePath);
  }
  return {
    read(relativePath) {
      const observed = inspect(relativePath);
      return observed.status === "safe_to_execute" && observed.exists ? observed.text : "";
    },
    exists(relativePath) {
      const observed = inspect(relativePath);
      return observed.status === "safe_to_execute" && observed.exists === true;
    },
    summary() {
      const summary = reader.summary();
      const blockers = [...new Set(summary.text_read_blockers)];
      return {
        policy: CONTRACT_TEXT_READ_CONTRACT.policy,
        max_file_bytes: bounded.maxTextFileBytes,
        max_total_text_bytes: bounded.maxTotalTextBytes,
        text_file_read_count: summary.text_file_read_count,
        total_text_bytes_read: summary.total_text_bytes_read,
        text_read_budget_complete: summary.text_read_budget_complete,
        scan_complete: blockers.length === 0,
        blockers,
        payload_exposed: false,
        writes_performed: false
      };
    }
  };
}
