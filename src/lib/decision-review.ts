const REVIEW_DECISIONS = new Set([
  "blocked",
  "needs_approval",
  "manual_verification_required",
  "dry_run_only"
]);
const PRIORITY_ORDER = { critical: 0, high: 1, medium: 2 };
const DEFAULT_QUEUE_LIMIT = 25;
const MAX_QUEUE_LIMIT = 100;
const DEFAULT_SCAN_LIMIT = 500;
const MAX_SCAN_LIMIT = 500;
const DAY_MS = 86_400_000;

export const DECISION_REVIEW_AGING_POLICY = Object.freeze({
  critical: 1,
  high: 7,
  medium: 30
});

function boundedInteger(value, fallback, min, max) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function nowMilliseconds(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function basePriorityFor(row) {
  if (Boolean(row.required_approval) || row.decision === "blocked" || ["critical", "high"].includes(row.risk_level)) {
    return "critical";
  }
  if (row.decision === "manual_verification_required") {
    return "high";
  }
  return "medium";
}

function agingFor(row, nowMs, basePriority) {
  const createdAt = Date.parse(row.created_at);
  const maxReviewAgeDays = DECISION_REVIEW_AGING_POLICY[basePriority];
  if (!Number.isFinite(createdAt)) {
    return {
      age_days: null,
      max_review_age_days: maxReviewAgeDays,
      escalation_status: "unknown"
    };
  }
  const ageDays = Math.max(0, Math.floor((nowMs - createdAt) / DAY_MS));
  const dueSoonAt = Math.max(1, Math.ceil(maxReviewAgeDays * 0.8));
  return {
    age_days: ageDays,
    max_review_age_days: maxReviewAgeDays,
    escalation_status: ageDays > maxReviewAgeDays ? "overdue" : ageDays >= dueSoonAt ? "due_soon" : "within_window"
  };
}

function escalatedPriority(basePriority, escalationStatus) {
  if (escalationStatus !== "overdue") return basePriority;
  if (basePriority === "medium") return "high";
  return "critical";
}

function reviewReasons(row, aging) {
  const reasons = [];
  if (Boolean(row.required_approval)) {
    reasons.push("explicit_approval_required");
  } else if (row.decision === "blocked") {
    reasons.push("decision_blocked");
  } else if (row.decision === "manual_verification_required") {
    reasons.push("manual_verification_required");
  } else if (row.decision === "dry_run_only") {
    reasons.push("dry_run_requires_follow_up");
  }
  if (!row.evidence_path) {
    reasons.push("evidence_path_missing");
  }
  if (aging.escalation_status === "overdue") {
    reasons.push("review_age_exceeds_threshold");
  } else if (aging.escalation_status === "unknown") {
    reasons.push("decision_timestamp_missing_or_invalid");
  }
  return reasons;
}

function reviewItem(row, nowMs) {
  const basePriority = basePriorityFor(row);
  const aging = agingFor(row, nowMs, basePriority);
  return {
    decision_type: row.decision_type,
    decision: row.decision,
    reason: row.reason,
    risk_level: row.risk_level,
    required_approval: Boolean(row.required_approval),
    evidence_status: row.evidence_path ? "linked" : "missing",
    evidence_path: row.evidence_path,
    created_at: row.created_at,
    base_priority: basePriority,
    priority: escalatedPriority(basePriority, aging.escalation_status),
    ...aging,
    review_reasons: reviewReasons(row, aging),
    recommended_action: Boolean(row.required_approval)
      ? "Review the linked evidence before granting explicit approval."
      : row.evidence_path
        ? "Review the latest decision evidence and resolve or accept the follow-up."
        : "Record evidence before resolving or accepting this follow-up."
  };
}

export function buildDecisionReviewQueue(db, options = {}) {
  const scanLimit = boundedInteger(options.maxScan, DEFAULT_SCAN_LIMIT, 1, MAX_SCAN_LIMIT);
  const queueLimit = boundedInteger(options.maxQueue, DEFAULT_QUEUE_LIMIT, 1, MAX_QUEUE_LIMIT);
  const nowMs = nowMilliseconds(options.now);
  const scannedWithOverflow = db.prepare(`
    SELECT decision_type, decision, reason, risk_level, required_approval, evidence_path, created_at
    FROM decisions
    ORDER BY created_at DESC, decision_type ASC, decision ASC, reason ASC,
      risk_level ASC, required_approval DESC, evidence_path ASC, id ASC
    LIMIT ?
  `).all(scanLimit + 1);
  const scanTruncated = scannedWithOverflow.length > scanLimit;
  const scanned = scannedWithOverflow.slice(0, scanLimit);
  const candidates = scanned.filter((row) => Boolean(row.required_approval) || REVIEW_DECISIONS.has(row.decision));
  const seenTypes = new Set();
  const unique = [];
  for (const row of candidates) {
    if (seenTypes.has(row.decision_type)) continue;
    seenTypes.add(row.decision_type);
    unique.push(reviewItem(row, nowMs));
  }
  unique.sort((left, right) => {
    const priority = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
    if (priority !== 0) return priority;
    if (left.required_approval !== right.required_approval) return left.required_approval ? -1 : 1;
    const age = (right.age_days ?? -1) - (left.age_days ?? -1);
    if (age !== 0) return age;
    const createdAt = String(right.created_at).localeCompare(String(left.created_at));
    if (createdAt !== 0) return createdAt;
    return String(left.decision_type).localeCompare(String(right.decision_type));
  });
  const approvalRequiredCount = unique.filter((item) => item.required_approval).length;
  const missingEvidenceCount = unique.filter((item) => item.evidence_status === "missing").length;
  const knownAges = unique.map((item) => item.age_days).filter(Number.isFinite);
  return {
    status: "safe_to_execute",
    queue_status: unique.length > 0 ? "review_required" : "checked",
    scan_limit: scanLimit,
    scan_truncated: scanTruncated,
    scanned_decision_count: scanned.length,
    review_candidate_count: unique.length,
    deduplicated_candidate_count: candidates.length - unique.length,
    approval_required_count: approvalRequiredCount,
    missing_evidence_count: missingEvidenceCount,
    blocked_count: unique.filter((item) => item.decision === "blocked").length,
    overdue_count: unique.filter((item) => item.escalation_status === "overdue").length,
    due_soon_count: unique.filter((item) => item.escalation_status === "due_soon").length,
    oldest_review_age_days: knownAges.length > 0 ? Math.max(...knownAges) : null,
    aging_policy_days: DECISION_REVIEW_AGING_POLICY,
    queue_limit: queueLimit,
    queue: unique.slice(0, queueLimit),
    queue_truncated: unique.length > queueLimit,
    writes_performed: false,
    note: "Read-only queue keeps only the latest reviewable decision per decision type and performs no approval or resolution."
  };
}
