import { createBoundedRepoTextReader } from "./repo-scan.ts";

const WORKFLOW_SPECS = {
  ".github/workflows/ci.yml": {
    node: true,
    commands: [
      "npm run check",
      "npm run pala -- workflow-check --strict",
      "npm run pala -- db init --strict",
      "npm run pala -- doctor --strict",
      "npm run pala -- decision-review --strict",
      "npm run pala -- quality-radar --strict",
      "npm run pala -- dashboard-truth-check --strict",
      "npm run pala -- benchmark-refresh --dry-run",
      "npm run pala -- drift-check --strict",
      "npm run pala -- verify"
    ]
  },
  ".github/workflows/security.yml": {
    node: true,
    commands: [
      "npm run pala -- workflow-check --strict",
      "npm run pala -- docs-honesty-check --strict",
      "npm run pala -- public-readiness-check --strict",
      "npm run pala -- ledger-safety-check --strict",
      "npm run pala -- evidence schema-check --strict",
      "npm run pala -- quality-radar --strict"
    ]
  },
  ".github/workflows/docs-drift.yml": {
    node: true,
    commands: [
      "npm run pala -- workflow-check --strict",
      "npm run pala -- db init --strict",
      "npm run pala -- benchmark-refresh --dry-run",
      "npm run pala -- drift-check --strict",
      "npm run pala -- dashboard-truth-check --strict"
    ]
  },
  ".github/workflows/scorecard.yml": {
    node: false,
    commands: []
  }
};

const FORBIDDEN_RUN_PATTERNS = [
  /\bgit\s+push\b/i,
  /\b(?:npm|pnpm)\s+(?:publish|deploy)\b/i,
  /\byarn\s+(?:npm\s+)?publish\b/i,
  /\b(?:twine|poetry)\s+publish\b/i,
  /\bgh\s+release\s+create\b/i,
  /\bdocker\s+push\b/i,
  /\bnpx\s+vercel\b/i,
  /\bvercel\s+(?:deploy|--prod)\b/i,
  /\bkubectl\s+(?:apply|create|delete|rollout|set)\b/i,
  /\bterraform\s+apply\b/i
];

const FORBIDDEN_ACTION_PATTERNS = [
  /actions\/create-release/i,
  /softprops\/action-gh-release/i,
  /peaceiris\/actions-gh-pages/i,
  /vercel\/action/i
];

export const WORKFLOW_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_single_handle_workflow_contract_scan",
  max_file_bytes: 1_000_000,
  max_total_text_bytes: 2_000_000,
  workflow_count: Object.keys(WORKFLOW_SPECS).length,
  mutation_payload_exposed: false,
  writes_allowed: false,
  external_calls_allowed: false
});

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function hasRunCommand(text, command) {
  return text.split(/\r?\n/).some((line) => line.trim() === `- run: ${command}`);
}

function addCheck(checks, file, name, ok) {
  checks.push({ name, ok, evidence: file, file });
}

function extractWorkflowValues(text, key) {
  const lines = text.split(/\r?\n/);
  const values = [];
  const pattern = new RegExp(`^(\\s*)(?:-\\s+)?${key}:\\s*(.*?)\\s*$`);
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    const indent = match[1].length;
    const inline = match[2];
    if (!/^[>|][+-]?$/.test(inline)) {
      values.push(inline);
      continue;
    }
    const block = [];
    let next = index + 1;
    for (; next < lines.length; next += 1) {
      const line = lines[next];
      if (line.trim() && line.match(/^\s*/)[0].length <= indent) break;
      block.push(line);
    }
    values.push(block.join("\n"));
    index = next - 1;
  }
  return values;
}

export function inspectWorkflowMutations(text) {
  const runLines = extractWorkflowValues(text, "run").filter(Boolean);
  const usesLines = extractWorkflowValues(text, "uses").filter(Boolean);
  return {
    forbidden_run_step_count: runLines.filter((line) => FORBIDDEN_RUN_PATTERNS.some((pattern) => pattern.test(line))).length,
    forbidden_action_count: usesLines.filter((line) => FORBIDDEN_ACTION_PATTERNS.some((pattern) => pattern.test(line))).length,
    mutation_payload_exposed: false
  };
}

export function inspectWorkflowContracts(options = {}) {
  const maxFileBytes = boundedInteger(options.maxFileBytes, WORKFLOW_INSPECTION_CONTRACT.max_file_bytes, WORKFLOW_INSPECTION_CONTRACT.max_file_bytes);
  const maxTotalTextBytes = boundedInteger(options.maxTotalTextBytes, WORKFLOW_INSPECTION_CONTRACT.max_total_text_bytes, WORKFLOW_INSPECTION_CONTRACT.max_total_text_bytes);
  const textReader = options.textReader || createBoundedRepoTextReader({
    projectRoot: options.projectRoot,
    maxTextFileBytes: maxFileBytes,
    maxTotalTextBytes
  });
  const checks = [];
  const fileInspections = [];
  const workflowTexts = new Map();
  for (const [file, spec] of Object.entries(WORKFLOW_SPECS)) {
    const inspected = textReader.read(file);
    fileInspections.push({
      file,
      status: inspected.status,
      exists: Boolean(inspected.exists),
      blocker: inspected.blocker || null,
      file_bytes: Number.isInteger(inspected.bytes) ? inspected.bytes : null,
      file_byte_limit: maxFileBytes,
      target_read_performed: Boolean(inspected.exists && inspected.single_file_handle_used),
      single_file_handle_used: Boolean(inspected.single_file_handle_used),
      content_stable_during_read: Boolean(inspected.content_stable_during_read),
      post_read_path_recheck_performed: Boolean(inspected.post_read_path_recheck_performed),
      payload_exposed: false
    });
    addCheck(checks, file, `${file} exists`, inspected.status === "safe_to_execute" && inspected.exists);
    if (inspected.status !== "safe_to_execute" || !inspected.exists) continue;
    const text = inspected.text || "";
    workflowTexts.set(file, text);

    addCheck(checks, file, `${file} checks out the repository`, text.includes("actions/checkout@v4"));
    addCheck(checks, file, `${file} declares explicit permissions`, text.includes("permissions:") && text.includes("contents: read"));
    addCheck(checks, file, `${file} does not use pull_request_target`, !/(?:^|\n)\s*pull_request_target\s*:/m.test(text));
    addCheck(
      checks,
      file,
      `${file} has no release-capable write permission`,
      !/^\s*(?:actions|contents|deployments|discussions|issues|packages|pages|pull-requests):\s+write\s*$/im.test(text)
    );

    if (spec.node) {
      addCheck(checks, file, `${file} uses setup-node v4`, text.includes("actions/setup-node@v4"));
      addCheck(checks, file, `${file} uses Node 24`, /node-version:\s*["']?24["']?/.test(text));
      addCheck(checks, file, `${file} has no write permission`, !/^\s+[a-z0-9-]+:\s+write\s*$/im.test(text));
    }

    for (const command of spec.commands) {
      addCheck(checks, file, `${file} runs ${command}`, hasRunCommand(text, command));
    }

    const mutations = inspectWorkflowMutations(text);
    addCheck(
      checks,
      file,
      `${file} contains no push, publish, release, or deploy run step`,
      mutations.forbidden_run_step_count === 0
    );
    addCheck(
      checks,
      file,
      `${file} contains no release or deploy action`,
      mutations.forbidden_action_count === 0
    );
  }

  const ciText = workflowTexts.get(".github/workflows/ci.yml") || "";
  addCheck(
    checks,
    ".github/workflows/ci.yml",
    "CI final verify remains informational",
    hasRunCommand(ciText, "npm run pala -- verify")
      && !hasRunCommand(ciText, "npm run pala -- verify --strict")
      && !hasRunCommand(ciText, "npm run verify")
  );

  const scorecardText = workflowTexts.get(".github/workflows/scorecard.yml") || "";
  addCheck(checks, ".github/workflows/scorecard.yml", "Scorecard action exists", scorecardText.includes("ossf/scorecard-action@"));
  addCheck(checks, ".github/workflows/scorecard.yml", "Scorecard uploads SARIF", scorecardText.includes("github/codeql-action/upload-sarif@"));

  const textRead = textReader.summary();
  const blockers = [...new Set(textRead.text_read_blockers)];
  const scanComplete = blockers.length === 0;
  const failures = checks.filter((check) => !check.ok);
  return {
    status: failures.length === 0 && scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: WORKFLOW_INSPECTION_CONTRACT,
    checks,
    failures,
    blockers,
    scan_complete: scanComplete,
    file_inspections: fileInspections,
    ...textRead,
    checked_workflows: Object.keys(WORKFLOW_SPECS),
    payload_exposed: false,
    mutation_payload_exposed: false,
    writes_performed: false,
    external_call_performed: false,
    note: scanComplete
      ? "Bounded payload-free local workflow contract check; it does not execute Actions, publish, push, release, or deploy."
      : "Workflow contract PASS is blocked until every fixed workflow file is read completely and safely."
  };
}
