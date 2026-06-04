import { makeId, nowIso } from "./db.ts";
import { appendLedger } from "./ledger.ts";

export function estimateTokenBudget(goal) {
  const words = String(goal || "").trim().split(/\s+/).filter(Boolean).length;
  const estimatedTokens = Math.max(1200, Math.ceil(words * 22 + 1800));
  return {
    known_input_tokens: null,
    known_output_tokens: null,
    known_cached_tokens: null,
    known_reasoning_tokens: null,
    estimated_tokens: estimatedTokens,
    confidence: words > 8 ? "medium" : "low",
    model: process.env.ANTHROPIC_MODEL || "unknown",
    effort: process.env.CLAUDE_CODE_EFFORT_LEVEL || "unknown",
    source: "local heuristic; no exact model usage available",
    exact_cost_available: false
  };
}

export function recordTokenUsage(db, runId, commandId, budget) {
  const id = makeId("tok");
  db.prepare(`
    INSERT INTO token_usage
      (id, run_id, command_id, model, effort, known_input_tokens, known_output_tokens, known_cached_tokens, known_reasoning_tokens, estimated_tokens, confidence, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    runId || null,
    commandId || null,
    budget.model,
    budget.effort,
    budget.known_input_tokens,
    budget.known_output_tokens,
    budget.known_cached_tokens,
    budget.known_reasoning_tokens,
    budget.estimated_tokens,
    budget.confidence,
    budget.source,
    nowIso()
  );
  const ledgerPath = appendLedger("token-economy", {
    id,
    run_id: runId,
    command_id: commandId,
    model: budget.model,
    effort: budget.effort,
    estimated_tokens: budget.estimated_tokens,
    confidence: budget.confidence,
    exact_cost_available: false,
    source: budget.source
  });
  return { id, ledger_path: ledgerPath };
}

export function tokenSummary(db) {
  const row = db.prepare(`
    SELECT
      COUNT(*) AS records,
      COALESCE(SUM(estimated_tokens), 0) AS estimated_tokens,
      COALESCE(SUM(known_input_tokens), 0) AS known_input_tokens,
      COALESCE(SUM(known_output_tokens), 0) AS known_output_tokens
    FROM token_usage
  `).get();
  return {
    records: row.records,
    known_input_tokens: row.known_input_tokens || null,
    known_output_tokens: row.known_output_tokens || null,
    estimated_tokens: row.estimated_tokens || 0,
    model: "unknown unless observed",
    effort: "unknown unless observed",
    exact_cost_available: false,
    confidence: row.records > 0 ? "estimated" : "unknown",
    rule: "No exact token or cost claim unless measured usage exists."
  };
}
