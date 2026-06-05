import { buildEvidenceExchangePreview } from "./evidence-exchange.ts";
import { buildReferenceRefreshPlan } from "./reference-radar.ts";
import { buildDecisionReviewQueue } from "./decision-review.ts";
import { inspectMasterWorkflow } from "./master-workflow.ts";

const ROUTE_QUERIES = {
  overview: "SELECT goal, status, risk_level, evidence_path, started_at, ended_at FROM runs ORDER BY started_at DESC LIMIT 20",
  evidence: "SELECT kind, path, redaction_status, is_public_safe, created_at FROM evidence ORDER BY created_at DESC LIMIT 30",
  commands: "SELECT command, status, exit_code, changed_files_count, raw_log_path, started_at, ended_at FROM commands ORDER BY started_at DESC LIMIT 30",
  decisions: "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions ORDER BY created_at DESC LIMIT 30",
  memory: "SELECT category, summary, root_cause, severity, prevent_next_time, status, evidence_path, created_at FROM mistakes WHERE status != 'template' ORDER BY created_at DESC LIMIT 30",
  mistakes: "SELECT category, summary, root_cause, severity, prevent_next_time, status, evidence_path, created_at FROM mistakes WHERE status != 'template' ORDER BY created_at DESC LIMIT 30",
  "token-economy": "SELECT model, effort, known_input_tokens, known_output_tokens, estimated_tokens, confidence, source, created_at FROM token_usage ORDER BY created_at DESC LIMIT 30",
  drift: "SELECT source, target, status, diff_summary, evidence_path, checked_at FROM drift_checks ORDER BY checked_at DESC LIMIT 30",
  sync: "SELECT scope, status, summary, evidence_path, checked_at FROM sync_checks ORDER BY checked_at DESC LIMIT 30",
  "push-readiness": "SELECT status, blockers_json, evidence_path, checked_at FROM push_checks ORDER BY checked_at DESC LIMIT 30",
  "mcp-installer": "SELECT client, scope, action, dry_run, status, existing_servers_preserved, config_path_redacted, checked_at FROM mcp_config_checks ORDER BY checked_at DESC LIMIT 30",
  mcp: "SELECT client, scope, action, dry_run, status, existing_servers_preserved, config_path_redacted, checked_at FROM mcp_config_checks ORDER BY checked_at DESC LIMIT 30",
  references: "SELECT category, name, status, freshness_status, lesson, pala_decision, evidence_path, last_checked_at FROM reference_sources ORDER BY category, name LIMIT 50",
  benchmarks: "SELECT category, name, status, freshness_status, lesson, pala_decision, evidence_path, last_checked_at FROM reference_sources ORDER BY category, name LIMIT 50",
  "quality-radar": "SELECT category, severity, summary, file_path, status, evidence_path, created_at FROM quality_findings WHERE status = 'open' ORDER BY created_at DESC LIMIT 30",
  architecture: "SELECT source, target, status, diff_summary, evidence_path, checked_at FROM drift_checks ORDER BY checked_at DESC LIMIT 30",
  tests: "SELECT command, status, exit_code, raw_log_path, started_at, ended_at FROM commands WHERE command LIKE '%test%' OR command LIKE '%check%' ORDER BY started_at DESC LIMIT 30",
  security: "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions WHERE risk_level IN ('high', 'critical') OR required_approval = 1 ORDER BY created_at DESC LIMIT 30",
  installer: "SELECT client, scope, action, dry_run, status, existing_servers_preserved, config_path_redacted, checked_at FROM mcp_config_checks ORDER BY checked_at DESC LIMIT 30",
  refactor: "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions WHERE decision_type LIKE '%refactor%' ORDER BY created_at DESC LIMIT 30",
  playbooks: "SELECT category, severity, summary, file_path, status, evidence_path, created_at FROM quality_findings WHERE category LIKE '%playbook%' ORDER BY created_at DESC LIMIT 30",
  "external-skills": "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions WHERE decision_type LIKE '%skill%' ORDER BY created_at DESC LIMIT 30",
  "public-release": "SELECT status, blockers_json, evidence_path, checked_at FROM push_checks ORDER BY checked_at DESC LIMIT 30",
  review: "SELECT category, severity, summary, file_path, status, evidence_path, created_at FROM quality_findings ORDER BY created_at DESC LIMIT 30",
  "smart-suggestions": "SELECT category, severity, summary, file_path, status, evidence_path, created_at FROM quality_findings WHERE status = 'open' ORDER BY created_at DESC LIMIT 30",
  "test-gaps": "SELECT category, severity, summary, file_path, status, evidence_path, created_at FROM quality_findings WHERE category LIKE '%test%' ORDER BY created_at DESC LIMIT 30",
  performance: "SELECT model, effort, known_input_tokens, known_output_tokens, estimated_tokens, confidence, source, created_at FROM token_usage ORDER BY created_at DESC LIMIT 30",
  "dashboard-truth": "SELECT command, status, exit_code, raw_log_path, started_at, ended_at FROM commands WHERE command LIKE '%dashboard%' ORDER BY started_at DESC LIMIT 30",
  rollback: "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions WHERE decision_type LIKE '%rollback%' OR decision_type LIKE '%refactor%' ORDER BY created_at DESC LIMIT 30",
  "risk-register": "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions WHERE decision != 'pass_allowed' ORDER BY created_at DESC LIMIT 30",
  "next-actions": "SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at FROM decisions ORDER BY created_at DESC LIMIT 20"
};

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;
const MAX_SCAN_ROWS = 500;

function normalizeRow(row) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => {
    if (key.endsWith("_json") && typeof value === "string") {
      try {
        return [key.replace(/_json$/, ""), JSON.parse(value)];
      } catch {
        return [key, value];
      }
    }
    return [key, value];
  }));
}

function boundedInteger(value, fallback, min, max) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function rowMatches(row, query) {
  if (!query) return true;
  return Object.values(row).some((value) => {
    const text = value && typeof value === "object" ? JSON.stringify(value) : String(value ?? "");
    return text.toLowerCase().includes(query);
  });
}

function benchmarkRouteData(db, options) {
  const limit = boundedInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const searchQuery = String(options.query || "").trim().toLowerCase().slice(0, 120);
  const plan = buildReferenceRefreshPlan(db, { maxQueue: MAX_PAGE_SIZE });
  const filteredRows = plan.refresh_queue.map(normalizeRow).filter((row) => rowMatches(row, searchQuery));
  const rows = filteredRows.slice(offset, offset + limit);
  return {
    status: "safe_to_execute",
    route: "benchmarks",
    row_count: rows.length,
    total_count: filteredRows.length,
    total_count_exact: !plan.queue_truncated,
    limit,
    offset,
    query: searchQuery || null,
    has_more: offset + rows.length < filteredRows.length,
    scan_limit: MAX_PAGE_SIZE,
    scan_truncated: plan.queue_truncated,
    rows,
    route_summary: {
      status: plan.status,
      source_count: plan.source_count,
      stale_source_count: plan.stale_source_count,
      category_gap_count: plan.category_gaps.length,
      queue_truncated: plan.queue_truncated,
      external_fetch_performed: plan.external_fetch_performed
    },
    category_gaps: plan.category_gaps,
    freshness_policy: plan.freshness_policy,
    empty_state: rows.length === 0
      ? searchQuery
        ? "No matching stale benchmark sources"
        : plan.category_gaps.length > 0
          ? "No queued sources; category coverage gaps remain"
          : "No stale benchmark sources"
      : null,
    note: "Benchmark data is the bounded local-only stale-source refresh queue; no external fetch is performed."
  };
}

function evidenceExchangeRouteData(db, options) {
  const limit = boundedInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const searchQuery = String(options.query || "").trim().toLowerCase().slice(0, 120);
  const preview = buildEvidenceExchangePreview(db);
  const filteredRows = preview.rows.map(normalizeRow).filter((row) => rowMatches(row, searchQuery));
  const rows = filteredRows.slice(offset, offset + limit);
  return {
    status: preview.status,
    route: "evidence-exchange",
    row_count: rows.length,
    total_count: filteredRows.length,
    total_count_exact: true,
    limit,
    offset,
    query: searchQuery || null,
    has_more: offset + rows.length < filteredRows.length,
    scan_limit: preview.rows.length,
    scan_truncated: false,
    rows,
    route_summary: preview.route_summary,
    validation: preview.validation,
    digest_sha256: preview.digest_sha256,
    content_digest_sha256: preview.content_digest_sha256,
    digest_availability: preview.digest_availability,
    byte_budget: preview.byte_budget,
    collection_truncation: preview.collection_truncation,
    migration_capability: preview.migration_capability,
    migration_readiness_capability: preview.migration_readiness_capability,
    comparison_capability: preview.comparison_capability,
    assertion_capability: preview.assertion_capability,
    import_preflight_capability: preview.import_preflight_capability,
    import_readiness_capability: preview.import_readiness_capability,
    target_path_capability: preview.target_path_capability,
    file_handle_capability: preview.file_handle_capability,
    completeness: preview.completeness,
    payload_exposed: false,
    writes_performed: false,
    empty_state: rows.length === 0 ? searchQuery ? "No matching evidence collections" : "No evidence collections" : null,
    note: preview.note
  };
}

function decisionReviewRouteData(db, options) {
  const limit = boundedInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const searchQuery = String(options.query || "").trim().toLowerCase().slice(0, 120);
  const plan = buildDecisionReviewQueue(db, { maxQueue: MAX_PAGE_SIZE });
  const filteredRows = plan.queue.map(normalizeRow).filter((row) => rowMatches(row, searchQuery));
  const rows = filteredRows.slice(offset, offset + limit);
  return {
    status: plan.status,
    route: "decision-review",
    row_count: rows.length,
    total_count: filteredRows.length,
    total_count_exact: !plan.queue_truncated && !plan.scan_truncated,
    limit,
    offset,
    query: searchQuery || null,
    has_more: offset + rows.length < filteredRows.length,
    scan_limit: MAX_PAGE_SIZE,
    scan_truncated: plan.queue_truncated || plan.scan_truncated,
    rows,
    route_summary: {
      queue_status: plan.queue_status,
      review_candidate_count: plan.review_candidate_count,
      approval_required_count: plan.approval_required_count,
      missing_evidence_count: plan.missing_evidence_count,
      blocked_count: plan.blocked_count,
      overdue_count: plan.overdue_count,
      due_soon_count: plan.due_soon_count,
      oldest_review_age_days: plan.oldest_review_age_days,
      scan_truncated: plan.scan_truncated,
      queue_truncated: plan.queue_truncated
    },
    aging_policy_days: plan.aging_policy_days,
    writes_performed: false,
    empty_state: rows.length === 0 ? searchQuery ? "No matching review decisions" : "No decisions require review" : null,
    note: plan.note
  };
}

function masterWorkflowRouteData(options) {
  const limit = boundedInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const searchQuery = String(options.query || "").trim().toLowerCase().slice(0, 120);
  const workflow = inspectMasterWorkflow();
  const filteredRows = workflow.gate_states.map(normalizeRow).filter((row) => rowMatches(row, searchQuery));
  const rows = filteredRows.slice(offset, offset + limit);
  return {
    status: workflow.status,
    route: "master-workflow",
    row_count: rows.length,
    total_count: filteredRows.length,
    total_count_exact: true,
    limit,
    offset,
    query: searchQuery || null,
    has_more: offset + rows.length < filteredRows.length,
    scan_limit: workflow.contract.gate_count,
    scan_truncated: false,
    rows,
    route_summary: {
      current_gate: workflow.current_gate,
      passed_gates: workflow.passed_gates,
      blocked_gates: workflow.blocked_gates,
      missing_evidence: workflow.missing_evidence,
      token_cost_summary: workflow.token_cost_summary,
      manual_verification_required_items: workflow.manual_verification_required_items,
      approval_required_items: workflow.approval_required_items,
      infrastructure_acceptance: workflow.infrastructure_acceptance,
      product_workflow_status: workflow.product_workflow_status,
      release_readiness: workflow.release_readiness,
      release_authorization: workflow.release_authorization
    },
    truth_sources: workflow.truth_sources,
    empty_state: rows.length === 0 ? "No master workflow gates" : null,
    note: "Master Workflow reads fixed local ledger truth; missing evidence never becomes PASS."
  };
}

export function panelRouteData(db, route, options = {}) {
  if (route === "master-workflow") {
    return masterWorkflowRouteData(options);
  }
  if (route === "benchmarks") {
    return benchmarkRouteData(db, options);
  }
  if (route === "evidence-exchange") {
    return evidenceExchangeRouteData(db, options);
  }
  if (route === "decision-review") {
    return decisionReviewRouteData(db, options);
  }
  const query = Object.hasOwn(ROUTE_QUERIES, route) ? ROUTE_QUERIES[route] : null;
  if (!query) {
    return {
      status: "manual_verification_required",
      route,
      row_count: 0,
      rows: [],
      empty_state: "Not checked",
      note: "No route-specific read-only data contract is registered."
    };
  }
  const limit = boundedInteger(options.limit, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  const offset = boundedInteger(options.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const searchQuery = String(options.query || "").trim().toLowerCase().slice(0, 120);
  const boundedQuery = query.replace(/\s+LIMIT\s+\d+\s*$/i, "");
  const scannedRows = db.prepare(`${boundedQuery} LIMIT ?`).all(MAX_SCAN_ROWS).map(normalizeRow);
  const filteredRows = scannedRows.filter((row) => rowMatches(row, searchQuery));
  const rows = filteredRows.slice(offset, offset + limit);
  const scanTruncated = scannedRows.length === MAX_SCAN_ROWS;
  return {
    status: "safe_to_execute",
    route,
    row_count: rows.length,
    total_count: filteredRows.length,
    total_count_exact: !scanTruncated,
    limit,
    offset,
    query: searchQuery || null,
    has_more: offset + rows.length < filteredRows.length,
    scan_limit: MAX_SCAN_ROWS,
    scan_truncated: scanTruncated,
    rows,
    empty_state: rows.length === 0 ? searchQuery ? "No matching records" : "No records" : null,
    note: "Route data is a bounded read-only SQLite scan with in-memory search and pagination."
  };
}
