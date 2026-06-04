import process from "node:process";
import { createInterface } from "node:readline/promises";

const SEVERITIES = new Set(["low", "medium", "high", "critical"]);
const FIELD_LIMITS = Object.freeze({
  summary: 500,
  category: 80,
  rootCause: 1000,
  preventionRule: 1000
});

export const INTERACTIVE_MISTAKE_CONTRACT = Object.freeze({
  policy: "tty_only_validated_confirmation_before_write",
  requires_tty: true,
  confirmation_required: true,
  prompt_stream: "stderr",
  close_before_safe_result: true,
  close_failure_policy: "payload_free_manual_verification_no_write",
  close_failure_blocker: "interactive_prompt_close_failed",
  payload_exposed_on_failure: false,
  arbitrary_write_allowed: false,
  writes_performed: false
});

function baseResult(extra = {}) {
  return {
    contract: INTERACTIVE_MISTAKE_CONTRACT,
    terminal_available: false,
    prompt_performed: false,
    prompt_count: 0,
    confirmation_requested: false,
    capture_confirmed: false,
    prompt_close_status: "not_opened",
    external_call_performed: false,
    payload_exposed_on_failure: false,
    writes_performed: false,
    destructive_action_performed: false,
    ...extra
  };
}

function boundedValue(value, field) {
  const normalized = String(value ?? "").trim();
  return {
    value: normalized,
    valid: normalized.length <= FIELD_LIMITS[field],
    blocker: `interactive_${field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}_too_long`
  };
}

export async function collectInteractiveMistake(options = {}) {
  const input = options.input || process.stdin;
  const output = options.output || process.stderr;
  const terminalAvailable = Object.hasOwn(options, "isTTY")
    ? Boolean(options.isTTY)
    : Boolean(input.isTTY && output.isTTY);
  if (!terminalAvailable) {
    return baseResult({
      status: "manual_verification_required",
      blockers: ["interactive_terminal_required"],
      note: "Interactive mistake capture requires a real TTY and performed no write."
    });
  }

  let readline = null;
  let promptCount = 0;
  const createPromptInterface = options.createInterface || createInterface;
  const ask = options.ask || (async (prompt) => {
    readline ||= createPromptInterface({ input, output, terminal: true });
    return readline.question(prompt);
  });
  const question = async (prompt) => {
    promptCount += 1;
    return ask(prompt);
  };
  const stop = (status, blocker, extra = {}) => baseResult({
    status,
    blockers: [blocker],
    terminal_available: true,
    prompt_performed: promptCount > 0,
    prompt_count: promptCount,
    ...extra
  });

  const collect = async () => {
    try {
      const summary = boundedValue(await question("Mistake summary (required): "), "summary");
      if (!summary.valid) return stop("manual_verification_required", summary.blocker);
      if (!summary.value) return stop("manual_verification_required", "mistake_summary_required");

      const category = boundedValue(await question("Category [implementation]: "), "category");
      if (!category.valid) return stop("manual_verification_required", category.blocker);

      const rootCause = boundedValue(await question("Root cause [optional]: "), "rootCause");
      if (!rootCause.valid) return stop("manual_verification_required", rootCause.blocker);

      const severity = String(await question("Severity [low|medium|high|critical, default low]: ") ?? "").trim().toLowerCase() || "low";
      if (!SEVERITIES.has(severity)) return stop("manual_verification_required", "invalid_mistake_severity");

      const preventionRule = boundedValue(await question("Prevention rule [optional]: "), "preventionRule");
      if (!preventionRule.valid) return stop("manual_verification_required", preventionRule.blocker);

      const confirmation = String(await question("Capture this mistake? [y/N]: ") ?? "").trim().toLowerCase();
      if (!["y", "yes"].includes(confirmation)) {
        return stop("blocked", "interactive_capture_not_confirmed", { confirmation_requested: true });
      }

      return baseResult({
        status: "safe_to_execute",
        blockers: [],
        terminal_available: true,
        prompt_performed: true,
        prompt_count: promptCount,
        confirmation_requested: true,
        capture_confirmed: true,
        input: {
          summary: summary.value,
          category: category.value || "implementation",
          rootCause: rootCause.value || null,
          severity,
          preventionRule: preventionRule.value || null
        },
        note: "Interactive mistake input was validated and explicitly confirmed; the collector itself performed no write."
      });
    } catch {
      return stop("manual_verification_required", "interactive_prompt_cancelled");
    }
  };

  const pendingResult = await collect();
  if (readline === null) {
    return pendingResult;
  }
  try {
    await readline.close();
    return {
      ...pendingResult,
      prompt_close_status: "confirmed"
    };
  } catch {
    return stop("manual_verification_required", INTERACTIVE_MISTAKE_CONTRACT.close_failure_blocker, {
      confirmation_requested: pendingResult.confirmation_requested,
      prompt_close_status: "failed"
    });
  }
}
