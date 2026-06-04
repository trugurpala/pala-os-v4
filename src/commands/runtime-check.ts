import { recordRuntimeObservation, observeRuntime } from "../lib/runtime.ts";
import { writeEvidence, writePublicEvidence } from "../lib/evidence.ts";
import { appendLedger } from "../lib/ledger.ts";

export function runRuntimeCheck(db) {
  const runtime = observeRuntime();
  const rawEvidencePath = writeEvidence("official-compatibility-check", runtime);
  const records = recordRuntimeObservation(db, runtime, rawEvidencePath);
  const markdown = `# Official Compatibility Check

Checked: ${runtime.checked_at}

Process observation policy:
\`${runtime.contract.policy}\`. Each fixed local command has a
${runtime.contract.timeout_ms} ms timeout and ${runtime.contract.max_output_bytes}
byte stdout/stderr budget. Only a redacted first-line summary is stored; raw
stdout and stderr are never returned or written to evidence.

| Check | Result |
|---|---|
${runtime.observations.map((item) => `| \`${item.command}\` | ${item.output_valid ? `exit ${item.exit_code}: ${item.summary.replace(/\|/g, "\\|")}` : `manual verification: ${item.blockers.join(", ") || "invalid observation"}`} |`).join("\n")}
| Active agent surface | ${runtime.agent_surface} (${runtime.agent_surface_source}) |
| Active model | ${runtime.observed_model} |
| Active effort | ${runtime.observed_effort} |
| Interactive slash commands | ${runtime.interactive_checks.status} |
| Project Claude assets | ${runtime.project_asset_status} |

Installed CLIs are compatibility evidence, not proof that they are the active
agent surface. Model and effort remain Unknown unless observed from the runtime
or environment. No model version is claimed from a user prompt alone.
`;
  const publicEvidencePath = writePublicEvidence("official-compatibility-check.md", markdown);
  const ledgerPath = appendLedger("events", {
    type: "official_compatibility_check",
    raw_evidence_path: rawEvidencePath,
    public_evidence_path: publicEvidencePath,
    model_observed: runtime.observed_model,
    effort_observed: runtime.observed_effort
  });
  const commandsAvailable = runtime.process_observation_status === "safe_to_execute"
    && runtime.project_asset_status === "safe_to_execute";
  const modelEffortObserved = runtime.observed_model !== "unknown" && runtime.observed_effort !== "unknown";
  return {
    status: commandsAvailable && modelEffortObserved ? "safe_to_execute" : "manual_verification_required",
    runtime,
    records,
    raw_evidence_path: rawEvidencePath,
    public_evidence_path: publicEvidencePath,
    ledger_path: ledgerPath
  };
}
