import { appendLedger } from "./ledger.ts";
import { DECISIONS, makeId, nowIso } from "./db.ts";
import { writeEvidence } from "./evidence.ts";
import { redact } from "./redaction.ts";

const RISK_TERMS = [
  "push",
  "publish",
  "delete",
  "remove",
  "rm -rf",
  "mcp config",
  "activate",
  "deploy",
  "secret",
  "token"
];

const DECISION_SET = new Set(DECISIONS);
const RISK_LEVEL_SET = new Set(["low", "medium", "high", "critical"]);
const CONFIDENCE_SET = new Set(["unknown", "low", "medium", "high", "estimated"]);
const DEFAULT_RELATED_RULE_IDS = Object.freeze([
  "core-rules:no-evidence-no-pass",
  "decision-engine-policy:no-invisible-decisions"
]);

export const DECISION_RECORD_CONTRACT = Object.freeze({
  policy: "bounded_redacted_decision_record_before_persistence",
  max_inputs_bytes: 100_000,
  max_metadata_bytes: 25_000,
  max_related_rule_count: 100,
  max_related_rule_id_bytes: 256,
  max_reason_bytes: 2_000,
  max_decision_type_bytes: 120,
  oversized_inputs_policy: "metadata_only_manual_verification_required",
  serialization_failure_policy: "metadata_only_manual_verification_required",
  unsafe_metadata_policy: "metadata_only_manual_verification_required",
  persistence_policy: "evidence_then_ledger_then_database_with_explicit_outcomes",
  persistence_step_outcomes: Object.freeze(["not_attempted", "confirmed", "unknown_after_attempt"]),
  persistence_failure_policy: "manual_verification_required_without_raw_error",
  persistence_pending_marker: true,
  raw_inputs_exposed: false,
  raw_metadata_exposed: false,
  payload_exposed_on_failure: false
});

function boundedUtf8Prefix(value, maxBytes) {
  let output = "";
  let bytes = 0;
  for (const character of String(value ?? "")) {
    const characterBytes = Buffer.byteLength(character, "utf8");
    if (bytes + characterBytes > maxBytes) {
      return { text: output, truncated: true };
    }
    output += character;
    bytes += characterBytes;
  }
  return { text: output, truncated: false };
}

function boundedRedactedText(value, maxBytes, fallback) {
  let safeText;
  try {
    safeText = redact(String(value ?? "")).replace(/\s+/g, " ").trim();
  } catch {
    safeText = fallback;
  }
  const bounded = boundedUtf8Prefix(safeText || fallback, maxBytes);
  return {
    text: bounded.text || fallback,
    truncated: bounded.truncated
  };
}

function metadataOnlyInputs(blocker, rawInputBytes = null) {
  const value = {
    recording_status: "metadata_only",
    blocker,
    payload_exposed: false
  };
  return {
    value,
    record: {
      status: "manual_verification_required",
      blockers: [blocker],
      raw_input_bytes: rawInputBytes,
      persisted_input_bytes: Buffer.byteLength(JSON.stringify(value), "utf8"),
      payload_exposed: false
    }
  };
}

function boundedRedactedInputs(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return metadataOnlyInputs("decision_inputs_serialization_failed");
  }
  if (typeof serialized !== "string") {
    return metadataOnlyInputs("decision_inputs_serialization_failed");
  }

  const rawInputBytes = Buffer.byteLength(serialized, "utf8");
  if (rawInputBytes > DECISION_RECORD_CONTRACT.max_inputs_bytes) {
    return metadataOnlyInputs("decision_inputs_exceed_byte_limit", rawInputBytes);
  }

  let redactedSerialized;
  try {
    redactedSerialized = redact(serialized);
  } catch {
    return metadataOnlyInputs("decision_inputs_redaction_failed", rawInputBytes);
  }
  const persistedInputBytes = Buffer.byteLength(redactedSerialized, "utf8");
  if (persistedInputBytes > DECISION_RECORD_CONTRACT.max_inputs_bytes) {
    return metadataOnlyInputs("decision_inputs_exceed_byte_limit", rawInputBytes);
  }

  let parsed;
  try {
    parsed = JSON.parse(redactedSerialized);
  } catch {
    return metadataOnlyInputs("decision_inputs_redaction_parse_failed", rawInputBytes);
  }
  return {
    value: parsed,
    record: {
      status: "safe_to_execute",
      blockers: [],
      raw_input_bytes: rawInputBytes,
      persisted_input_bytes: persistedInputBytes,
      payload_exposed: false
    }
  };
}

function metadataOnlyDecisionMetadata(blocker, rawMetadataBytes = null) {
  const value = {
    tokenBudget: null,
    relatedRuleIds: [...DEFAULT_RELATED_RULE_IDS]
  };
  return {
    ...value,
    record: {
      status: "manual_verification_required",
      blockers: [blocker],
      raw_metadata_bytes: rawMetadataBytes,
      persisted_metadata_bytes: Buffer.byteLength(JSON.stringify({
        token_budget: value.tokenBudget,
        related_rule_ids: value.relatedRuleIds
      }), "utf8"),
      payload_exposed: false
    }
  };
}

function boundedRedactedDecisionMetadata(tokenBudget, relatedRuleIds) {
  const value = {
    token_budget: tokenBudget ?? null,
    related_rule_ids: relatedRuleIds ?? DEFAULT_RELATED_RULE_IDS
  };
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return metadataOnlyDecisionMetadata("decision_metadata_serialization_failed");
  }
  if (typeof serialized !== "string") {
    return metadataOnlyDecisionMetadata("decision_metadata_serialization_failed");
  }

  const rawMetadataBytes = Buffer.byteLength(serialized, "utf8");
  if (rawMetadataBytes > DECISION_RECORD_CONTRACT.max_metadata_bytes) {
    return metadataOnlyDecisionMetadata("decision_metadata_exceed_byte_limit", rawMetadataBytes);
  }

  let redactedSerialized;
  try {
    redactedSerialized = redact(serialized);
  } catch {
    return metadataOnlyDecisionMetadata("decision_metadata_redaction_failed", rawMetadataBytes);
  }
  const persistedMetadataBytes = Buffer.byteLength(redactedSerialized, "utf8");
  if (persistedMetadataBytes > DECISION_RECORD_CONTRACT.max_metadata_bytes) {
    return metadataOnlyDecisionMetadata("decision_metadata_exceed_byte_limit", rawMetadataBytes);
  }

  let parsed;
  try {
    parsed = JSON.parse(redactedSerialized);
  } catch {
    return metadataOnlyDecisionMetadata("decision_metadata_redaction_parse_failed", rawMetadataBytes);
  }
  const tokenBudgetSafe = parsed?.token_budget === null
    || (typeof parsed?.token_budget === "object" && !Array.isArray(parsed.token_budget));
  const relatedRuleIdsSafe = Array.isArray(parsed?.related_rule_ids)
    && parsed.related_rule_ids.length <= DECISION_RECORD_CONTRACT.max_related_rule_count
    && parsed.related_rule_ids.every((ruleId) => (
      typeof ruleId === "string"
      && Buffer.byteLength(ruleId, "utf8") <= DECISION_RECORD_CONTRACT.max_related_rule_id_bytes
    ));
  if (!tokenBudgetSafe || !relatedRuleIdsSafe) {
    return metadataOnlyDecisionMetadata("decision_metadata_shape_invalid", rawMetadataBytes);
  }

  return {
    tokenBudget: parsed.token_budget,
    relatedRuleIds: parsed.related_rule_ids,
    record: {
      status: "safe_to_execute",
      blockers: [],
      raw_metadata_bytes: rawMetadataBytes,
      persisted_metadata_bytes: persistedMetadataBytes,
      payload_exposed: false
    }
  };
}

function normalizedAssessment(assessment, inputsRecord, metadataRecord) {
  const recordSafe = inputsRecord.status === "safe_to_execute" && metadataRecord.status === "safe_to_execute";
  const originalDecision = DECISION_SET.has(assessment?.decision) ? assessment.decision : "manual_verification_required";
  const originalRisk = RISK_LEVEL_SET.has(assessment?.riskLevel) ? assessment.riskLevel : "medium";
  const decision = recordSafe || ["blocked", "needs_approval"].includes(originalDecision)
    ? originalDecision
    : "manual_verification_required";
  const riskLevel = recordSafe || ["high", "critical"].includes(originalRisk) ? originalRisk : "medium";
  const fixedReason = "Decision inputs or metadata could not be recorded within the bounded redacted contract.";
  const reason = boundedRedactedText(
    recordSafe ? assessment?.reason : fixedReason,
    DECISION_RECORD_CONTRACT.max_reason_bytes,
    fixedReason
  ).text;
  return {
    decision,
    riskLevel,
    requiredApproval: Boolean(assessment?.requiredApproval),
    reason
  };
}

function persistenceStep(outcome) {
  return {
    attempted: outcome !== "not_attempted",
    outcome,
    payload_exposed_on_failure: false
  };
}

function decisionPersistence() {
  return {
    status: "safe_to_execute",
    policy: DECISION_RECORD_CONTRACT.persistence_policy,
    blockers: [],
    steps: {
      evidence_write: persistenceStep("not_attempted"),
      ledger_append: persistenceStep("not_attempted"),
      database_insert: persistenceStep("not_attempted")
    },
    payload_exposed_on_failure: false
  };
}

function markPersistenceFailure(payload, persistence, blocker) {
  if (!persistence.blockers.includes(blocker)) persistence.blockers.push(blocker);
  persistence.status = "manual_verification_required";
  if (!["blocked", "needs_approval"].includes(payload.decision)) {
    payload.decision = "manual_verification_required";
  }
  if (payload.risk_level === "low") payload.risk_level = "medium";
  payload.reason = "Decision persistence could not be confirmed across every required truth layer.";
}

function confirmedEvidencePath(value) {
  return typeof value === "string"
    && /^\.pala\/evidence\/raw\/[a-zA-Z0-9._-]+\.log$/.test(value)
    ? value
    : null;
}

function confirmedDecisionLedgerPath(value) {
  return value === ".pala/ledger/decisions.jsonl" ? value : null;
}

function insertDecisionRecord(db, input, payload, evidencePath) {
  db.prepare(`
    INSERT INTO decisions
      (id, run_id, decision_type, inputs_json, decision, reason, confidence, risk_level, required_approval, evidence_path, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.id,
    input.runId,
    payload.decision_type,
    JSON.stringify(payload.inputs),
    payload.decision,
    payload.reason,
    payload.confidence,
    payload.risk_level,
    payload.required_approval ? 1 : 0,
    evidencePath,
    nowIso()
  );
  return payload.id;
}

export function assessGoal(goal) {
  const lower = String(goal || "").toLowerCase();
  const matched = RISK_TERMS.filter((term) => lower.includes(term));
  if (matched.some((term) => ["push", "publish", "delete", "remove", "rm -rf", "activate", "deploy", "secret", "token"].includes(term))) {
    return {
      decision: "needs_approval",
      riskLevel: "high",
      requiredApproval: true,
      reason: `Goal mentions approval-gated risk terms: ${matched.join(", ")}.`
    };
  }

  if (matched.length > 0) {
    return {
      decision: "dry_run_only",
      riskLevel: "medium",
      requiredApproval: false,
      reason: `Goal touches sensitive setup terms and may proceed only as a dry-run: ${matched.join(", ")}.`
    };
  }

  return {
    decision: "safe_local_write",
    riskLevel: "low",
    requiredApproval: false,
    reason: "Local writes inside PROJECT_ROOT are allowed when evidence is recorded."
  };
}

export function recordDecision(db, input, options = {}) {
  const id = makeId("dec");
  const assessment = input.assessment || assessGoal(input.goal || input.decisionType);
  const boundedInputs = boundedRedactedInputs(input.inputs ?? { goal: input.goal ?? null });
  const boundedMetadata = boundedRedactedDecisionMetadata(input.tokenBudget, input.relatedRuleIds);
  const safeAssessment = normalizedAssessment(assessment, boundedInputs.record, boundedMetadata.record);
  const safeDecisionType = boundedRedactedText(
    input.decisionType,
    DECISION_RECORD_CONTRACT.max_decision_type_bytes,
    "unknown"
  ).text;
  const confidence = CONFIDENCE_SET.has(input.confidence) ? input.confidence : "medium";
  const payload = {
    id,
    decision_type: safeDecisionType,
    inputs: boundedInputs.value,
    inputs_record: boundedInputs.record,
    metadata_record: boundedMetadata.record,
    decision: safeAssessment.decision,
    reason: safeAssessment.reason,
    confidence,
    risk_level: safeAssessment.riskLevel,
    required_approval: safeAssessment.requiredApproval,
    token_budget: boundedMetadata.tokenBudget,
    related_rule_ids: boundedMetadata.relatedRuleIds
  };
  const writeDecisionEvidence = options.writeEvidence || writeEvidence;
  const appendDecisionLedger = options.appendLedger || appendLedger;
  const insertDecision = options.insertDecision || insertDecisionRecord;
  const skipLedgerAppend = options.skipLedgerAppend === true;
  const persistence = decisionPersistence();
  let evidencePath = null;
  let ledgerPath = null;

  try {
    evidencePath = confirmedEvidencePath(writeDecisionEvidence(`decision-${safeDecisionType}`, {
      ...payload,
      persistence: {
        status: "pending",
        policy: DECISION_RECORD_CONTRACT.persistence_policy,
        final_outcome_available_in_returned_record: true,
        payload_exposed_on_failure: false
      }
    }));
    if (!evidencePath) throw new Error("decision_evidence_path_not_confirmed");
    persistence.steps.evidence_write = persistenceStep("confirmed");
  } catch {
    persistence.steps.evidence_write = persistenceStep("unknown_after_attempt");
    markPersistenceFailure(payload, persistence, "decision_evidence_write_outcome_unknown");
  }

  if (skipLedgerAppend) {
    persistence.steps.ledger_append = persistenceStep("not_attempted");
  } else {
    try {
      ledgerPath = confirmedDecisionLedgerPath(appendDecisionLedger("decisions", {
        id,
        run_id: input.runId,
        decision_type: safeDecisionType,
        decision: payload.decision,
        reason: payload.reason,
        risk_level: payload.risk_level,
        evidence_path: evidencePath,
        persistence: {
          status: "pending_database_insert",
          evidence_write_outcome: persistence.steps.evidence_write.outcome,
          payload_exposed_on_failure: false
        }
      }));
      if (!ledgerPath) throw new Error("decision_ledger_path_not_confirmed");
      persistence.steps.ledger_append = persistenceStep("confirmed");
    } catch {
      persistence.steps.ledger_append = persistenceStep("unknown_after_attempt");
      markPersistenceFailure(payload, persistence, "decision_ledger_append_outcome_unknown");
    }
  }

  try {
    const insertedId = insertDecision(db, input, payload, evidencePath);
    if (insertedId !== id) throw new Error("decision_database_insert_not_confirmed");
    persistence.steps.database_insert = persistenceStep("confirmed");
  } catch {
    persistence.steps.database_insert = persistenceStep("unknown_after_attempt");
    markPersistenceFailure(payload, persistence, "decision_database_insert_outcome_unknown");
  }

  return {
    ...payload,
    persistence,
    evidence_path: evidencePath,
    ledger_path: ledgerPath
  };
}
