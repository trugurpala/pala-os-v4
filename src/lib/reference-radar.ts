import path from "node:path";
import { nowIso } from "./db.ts";
import { appendLedger } from "./ledger.ts";
import { PATHS } from "./paths.ts";
import { writeBoundedStateJson } from "./state-file.ts";

const DAY_MS = 86_400_000;
const DEFAULT_MAX_AGE_DAYS = 90;
const MAX_REFRESH_QUEUE = 100;
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2 };

export const REFERENCE_FRESHNESS_POLICY = Object.freeze({
  ai_coding_agents: 30,
  mcp_installer: 30,
  token_economy: 30
});

export const REFERENCE_REFRESH_WRITE_CONTRACT = Object.freeze({
  policy: "state_then_ledger_with_explicit_append_outcome",
  state_before_ledger: true,
  ledger_outcome_policy: "not_attempted_confirmed_or_unknown_after_attempt",
  ledger_failure_blocker: "reference_refresh_ledger_write_outcome_unknown",
  payload_exposed_on_failure: false
});

export function referenceRows(db) {
  return db.prepare(`
    SELECT
      category,
      name,
      url,
      status,
      COALESCE(freshness_status, status) AS freshness_status,
      last_checked_at,
      lesson,
      pala_decision,
      risk
    FROM reference_sources
    ORDER BY category, name
  `).all();
}

function boundedQueueLimit(value) {
  const parsed = Number.parseInt(String(value ?? 25), 10);
  return Math.min(MAX_REFRESH_QUEUE, Math.max(1, Number.isFinite(parsed) ? parsed : 25));
}

function nowMilliseconds(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function sourceFreshnessWarning(source, nowMs) {
  const checkedAt = Date.parse(source.last_checked_at);
  const validCheckedAt = Number.isFinite(checkedAt);
  const ageDays = validCheckedAt ? Math.max(0, Math.floor((nowMs - checkedAt) / DAY_MS)) : null;
  const maxAgeDays = REFERENCE_FRESHNESS_POLICY[source.category] || DEFAULT_MAX_AGE_DAYS;
  const staleReasons = [];
  if (source.freshness_status !== "checked") {
    staleReasons.push("freshness_status_not_checked");
  }
  if (!validCheckedAt) {
    staleReasons.push("last_checked_at_missing_or_invalid");
  } else if (ageDays > maxAgeDays) {
    staleReasons.push("age_exceeds_policy");
  }
  if (staleReasons.length === 0) {
    return null;
  }
  const priority = staleReasons.some((reason) => reason !== "age_exceeds_policy")
    ? "critical"
    : REFERENCE_FRESHNESS_POLICY[source.category]
      ? "high"
      : "medium";
  return {
    category: source.category,
    name: source.name,
    url: source.url,
    freshness_status: source.freshness_status,
    last_checked_at: source.last_checked_at,
    age_days: ageDays,
    max_age_days: maxAgeDays,
    priority,
    stale_reasons: staleReasons,
    recommended_action: "Recheck the official source and record evidence before changing the stored freshness status."
  };
}

export function buildReferenceRefreshPlan(db, options = {}) {
  const sources = referenceRows(db);
  const coverage = referenceCoverage(db);
  const nowMs = nowMilliseconds(options.now);
  const queueLimit = boundedQueueLimit(options.maxQueue);
  const warnings = sources
    .map((source) => sourceFreshnessWarning(source, nowMs))
    .filter(Boolean)
    .sort((left, right) => {
      const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (priority !== 0) return priority;
      const age = (right.age_days ?? Number.MAX_SAFE_INTEGER) - (left.age_days ?? Number.MAX_SAFE_INTEGER);
      if (age !== 0) return age;
      return `${left.category}:${left.name}`.localeCompare(`${right.category}:${right.name}`);
    });
  return {
    schema_version: 1,
    generated_at: new Date(nowMs).toISOString(),
    status: warnings.length === 0 && coverage.gaps.length === 0 && sources.length > 0 ? "checked" : "stale_recheck_required",
    source_count: sources.length,
    stale_source_count: warnings.length,
    stale_sources: warnings.map((warning) => warning.name),
    category_gaps: coverage.gaps,
    freshness_policy: {
      default_max_age_days: DEFAULT_MAX_AGE_DAYS,
      category_max_age_days: REFERENCE_FRESHNESS_POLICY
    },
    refresh_queue: warnings.slice(0, queueLimit),
    refresh_queue_count: Math.min(warnings.length, queueLimit),
    queue_limit: queueLimit,
    queue_truncated: warnings.length > queueLimit,
    external_fetch_performed: false,
    writes_performed: false,
    copy_policy: "Lessons only. Do not copy code, branding, UI text, package names, screenshots, or claims.",
    note: "Local bounded refresh plan only. A source remains stale until an official-source recheck records new evidence."
  };
}

export function referenceRadarState(db, mode = "check") {
  const sources = referenceRows(db);
  const categories = [...new Set(sources.map((source) => source.category))];
  const plan = buildReferenceRefreshPlan(db);
  return {
    schema_version: 1,
    mode,
    checked_at: nowIso(),
    status: plan.status,
    source_count: sources.length,
    categories,
    stale_sources: plan.stale_sources,
    stale_source_warnings: plan.refresh_queue,
    category_gaps: plan.category_gaps,
    freshness_policy: plan.freshness_policy,
    copy_policy: "Lessons only. Do not copy code, branding, UI text, package names, or screenshots.",
    sources
  };
}

export function referenceCoverage(db) {
  const required = {
    ai_coding_agents: 2,
    mcp_installer: 2,
    developer_portal_control_tower: 2,
    token_economy: 2,
    backtesting: 2,
    public_github_readiness: 2
  };
  const counts = Object.fromEntries(Object.keys(required).map((category) => [category, 0]));
  for (const source of referenceRows(db)) {
    if (source.category in counts) counts[source.category] += 1;
  }
  const gaps = Object.entries(required)
    .filter(([category, minimum]) => counts[category] < minimum)
    .map(([category, minimum]) => ({ category, minimum, observed: counts[category] }));
  return {
    status: gaps.length === 0 ? "checked" : "stale_recheck_required",
    required,
    counts,
    gaps
  };
}

export function refreshReferenceRadar(db, options = {}) {
  const dryRun = options.dryRun !== false;
  const state = referenceRadarState(db, dryRun ? "dry_run" : "refresh");
  const refreshPlan = buildReferenceRefreshPlan(db, options);
  const projectRoot = path.resolve(options.projectRoot || PATHS.projectRoot);
  const statePath = path.join(projectRoot, ".pala", "state", "reference-radar-state.json");
  const stateIo = writeBoundedStateJson(statePath, { ...state, refresh_plan: refreshPlan }, { projectRoot });
  const blockers = [...stateIo.blockers];
  let ledgerPath = null;
  let ledgerWriteAttempted = false;
  let ledgerWriteOutcome = "not_attempted";
  let ledgerWritePerformed = false;
  if (stateIo.status === "safe_to_execute") {
    ledgerWriteAttempted = true;
    try {
      const appendLedgerRecord = options.appendLedger || appendLedger;
      const candidateLedgerPath = appendLedgerRecord("reference-refresh", {
        mode: state.mode,
        status: state.status,
        source_count: state.source_count,
        stale_sources: state.stale_sources,
        refresh_queue_count: refreshPlan.refresh_queue_count,
        category_gaps: refreshPlan.category_gaps,
        state_path: stateIo.path,
        external_fetch_performed: false
      });
      if (typeof candidateLedgerPath !== "string" || candidateLedgerPath.trim() === "") {
        throw new Error("reference_refresh_ledger_path_missing");
      }
      ledgerPath = candidateLedgerPath;
      ledgerWriteOutcome = "confirmed";
      ledgerWritePerformed = true;
    } catch {
      ledgerWriteOutcome = "unknown_after_attempt";
      blockers.push(REFERENCE_REFRESH_WRITE_CONTRACT.ledger_failure_blocker);
    }
  }
  const uniqueBlockers = [...new Set(blockers)];
  return {
    ...state,
    refresh_plan: refreshPlan,
    dry_run: dryRun,
    operation_status: uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: uniqueBlockers,
    external_fetch_performed: false,
    state_path: stateIo.path,
    state_io: stateIo,
    ledger_path: ledgerPath,
    ledger_write_attempted: ledgerWriteAttempted,
    ledger_write_outcome: ledgerWriteOutcome,
    ledger_write_performed: ledgerWritePerformed,
    writes_performed: stateIo.writes_performed || ledgerWritePerformed,
    payload_exposed_on_failure: false
  };
}
