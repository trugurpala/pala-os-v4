import path from "node:path";
import { PROJECT_ROOT } from "./paths.ts";
import { inspectLedgerSafety } from "./ledger-safety.ts";
import { inspectDeadCode, inspectDuplicates, inspectExamples, inspectPlaybooks, inspectPrompts, inspectTestGaps } from "./repo-inspection.ts";
import { createBoundedRepoTextReader, inspectRepoInventory, inspectRepoPath, REPO_PATH_INSPECTION_CONTRACT, REPO_SCAN_CONTRACT, repoScanOptions } from "./repo-scan.ts";
import { inspectWorkflowContracts } from "./workflow-contract.ts";

export const PUBLIC_CLAIM_FILES = [
  "README.md",
  "README-KULLANIM.md",
  "docs/INSTALL.md",
  "docs/PUBLIC_RELEASE.md",
  "docs/product/positioning.md",
  "package.json"
];

export const QUALITY_REQUIRED_ARTIFACTS = [
  "docs/evidence/current-sources.md",
  "docs/evidence/v28-web-research.md",
  "control/overview/index.html",
  "tests/pala.test.ts"
];

export const QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_fixed_quality_required_artifact_path_metadata_scan",
  required_path_count: QUALITY_REQUIRED_ARTIFACTS.length,
  path_policy: REPO_PATH_INSPECTION_CONTRACT.policy,
  payload_exposed: false,
  writes_allowed: false
});

export function walkPublicFiles(dir = PROJECT_ROOT, output = []) {
  const inventory = inspectRepoInventory({ projectRoot: PROJECT_ROOT, startDir: dir });
  output.push(...inventory.files.filter(isPublicTextFile));
  return output;
}

function isPublicTextFile(file) {
  return /\.(md|json|jsonl|yaml|yml|ts|js|mjs|html|css|txt)$/.test(file)
    || ["README.md", "LICENSE", "NOTICE"].includes(path.basename(file));
}

function createFindingCollector(limit) {
  const findings = [];
  let findingCount = 0;
  return {
    add(finding) {
      findingCount += 1;
      if (findings.length < limit) findings.push(finding);
    },
    addOmitted(count) {
      findingCount += Math.max(0, Number(count) || 0);
    },
    result() {
      return {
        findings,
        finding_count: findingCount,
        findings_truncated: findingCount > findings.length
      };
    }
  };
}

export function hardcodedPathFindings(options = {}) {
  return inspectHardcodedPaths(options).findings;
}

export function inspectHardcodedPaths(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const inventory = inspectRepoInventory(bounded);
  const blockers = [...inventory.blockers];
  const findings = [];
  let findingCount = 0;
  let checkedFileCount = 0;
  const publicFiles = inventory.files.filter(isPublicTextFile);
  for (const file of publicFiles) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    checkedFileCount += 1;
    if (/[A-Za-z]:[\\/]Users[\\/][^\\/\s"'<>]+|\/Users\/[^/\s"'<>]+|\/home\/[^/\s"'<>]+/.test(inspected.text)) {
      findingCount += 1;
      if (findings.length >= bounded.maxReturnedFindings) continue;
      findings.push({ severity: "high", file, summary: "Public file appears to contain a personal local path." });
    }
  }
  const textRead = textReader.summary();
  const uniqueBlockers = [...new Set([...blockers, ...textRead.text_read_blockers])];
  const scanComplete = uniqueBlockers.length === 0;
  return {
    status: findingCount === 0 && scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    findings,
    finding_count: findingCount,
    findings_truncated: findingCount > findings.length,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    scan_truncated: inventory.scan_truncated,
    scanned_entry_count: inventory.scanned_entry_count,
    public_file_count: publicFiles.length,
    public_file_count_exact: inventory.file_count_exact,
    checked_file_count: checkedFileCount,
    ...textRead,
    payload_exposed: false,
    writes_performed: false
  };
}

export function workspaceHygieneFindings(options = {}) {
  return inspectWorkspaceHygiene(options).findings;
}

export function inspectWorkspaceHygiene(options = {}) {
  const bounded = repoScanOptions(options);
  const inventory = inspectRepoInventory(bounded);
  const suspicious = inventory.files
    .filter((file) => !file.includes("/"))
    .filter((file) => file === "-" || /\.(?:bak|log|sqlite|sqlite-shm|sqlite-wal|tmp)$/i.test(file));
  const findings = suspicious.slice(0, bounded.maxReturnedFindings).map((file) => ({
    severity: "medium",
    file,
    summary: "Unexpected runtime/temporary artifact exists at repository root."
  }));
  return {
    status: suspicious.length === 0 && inventory.scan_complete ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    findings,
    finding_count: suspicious.length,
    findings_truncated: suspicious.length > findings.length,
    blockers: inventory.blockers,
    scan_complete: inventory.scan_complete,
    scan_truncated: inventory.scan_truncated,
    scanned_entry_count: inventory.scanned_entry_count,
    payload_exposed: false,
    writes_performed: false
  };
}

export function hasUnsupportedPublishClaim(text) {
  return text.split(/\r?\n/).some((line) => {
    if (/not published|has not been published|isn't published|is not available/i.test(line)) {
      return false;
    }
    return /npm install -g pala|published to npm|published to pypi/i.test(line);
  });
}

export function hasUnsupportedHypeClaim(text, phrase) {
  return text.split(/\r?\n/).some((line) => {
    if (!line.toLowerCase().includes(phrase.toLowerCase())) return false;
    return !/\b(?:avoid|do not|does not|don't|forbidden|is not|never|no|not|without)\b/i.test(line);
  });
}

export function docsHonestyFindings(options = {}) {
  return inspectDocsHonesty(options).findings;
}

export function inspectQualityRequiredArtifacts(options = {}) {
  const bounded = repoScanOptions(options);
  const inspections = QUALITY_REQUIRED_ARTIFACTS.map((artifact) => inspectRepoPath(artifact, {
    ...bounded,
    expectedKind: "file"
  }));
  const missing = inspections
    .filter((inspection) => inspection.status === "safe_to_execute" && !inspection.exists)
    .map((inspection) => inspection.path);
  const unsafe = inspections
    .filter((inspection) => inspection.status !== "safe_to_execute")
    .map((inspection) => inspection.path);
  const blockers = [...new Set(inspections
    .filter((inspection) => inspection.status !== "safe_to_execute")
    .map((inspection) => inspection.blocker)
    .filter(Boolean))];
  const scanComplete = blockers.length === 0;
  return {
    status: missing.length === 0 && unsafe.length === 0 && scanComplete
      ? "safe_to_execute"
      : "manual_verification_required",
    contract: QUALITY_REQUIRED_ARTIFACT_INSPECTION_CONTRACT,
    inspections,
    missing,
    unsafe,
    blockers,
    scan_complete: scanComplete,
    payload_exposed: false,
    writes_performed: false
  };
}

export function inspectDocsHonesty(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const blockers = [];
  const collector = createFindingCollector(bounded.maxReturnedFindings);
  for (const file of PUBLIC_CLAIM_FILES) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    const text = inspected.text;
    for (const phrase of ["best coding agent", "god mode", "ultimate", "guaranteed viral", "star magnet", "unlimited autonomy", "world's best", "unstoppable autopilot"]) {
      if (hasUnsupportedHypeClaim(text, phrase)) {
        collector.add({ severity: "high", file, summary: `Forbidden hype claim found: ${phrase}` });
      }
    }
    if (hasUnsupportedPublishClaim(text)) {
      collector.add({ severity: "high", file, summary: "Public copy appears to claim publication or global install without evidence." });
    }
    if (/exact cost|cost saving|saves .*%/i.test(text) && !/estimated|without before\/after evidence|does not claim|unless measured/i.test(text)) {
      collector.add({ severity: "medium", file, summary: "Token/cost copy may imply exact savings without evidence." });
    }
  }
  const collected = collector.result();
  const textRead = textReader.summary();
  const uniqueBlockers = [...new Set([...blockers, ...textRead.text_read_blockers])];
  return {
    status: collected.finding_count === 0 && uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    ...collected,
    blockers: uniqueBlockers,
    scan_complete: uniqueBlockers.length === 0,
    scan_truncated: false,
    checked_files: PUBLIC_CLAIM_FILES,
    ...textRead,
    payload_exposed: false,
    writes_performed: false
  };
}

export function inspectQualityRadar(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const sharedOptions = { ...bounded, textReader };
  const hardcodedPaths = inspectHardcodedPaths(sharedOptions);
  const workspaceHygiene = inspectWorkspaceHygiene(sharedOptions);
  const docsHonesty = inspectDocsHonesty(sharedOptions);
  const testGaps = inspectTestGaps(sharedOptions);
  const playbooks = inspectPlaybooks(sharedOptions);
  const prompts = inspectPrompts(sharedOptions);
  const examples = inspectExamples(sharedOptions);
  const deadCode = inspectDeadCode(sharedOptions);
  const duplicates = inspectDuplicates(sharedOptions);
  const ledgerSafety = inspectLedgerSafety({ projectRoot: bounded.projectRoot });
  const requiredArtifacts = inspectQualityRequiredArtifacts(bounded);
  const workflowFailures = inspectWorkflowContracts().failures.map((failure) => ({
    severity: "high",
    file: failure.file,
    summary: failure.name
  }));
  const collector = createFindingCollector(bounded.maxReturnedFindings);
  const reports = [hardcodedPaths, workspaceHygiene, docsHonesty, testGaps, playbooks, prompts, examples, deadCode];
  for (const report of reports) {
    for (const finding of report.findings) collector.add(finding);
    collector.addOmitted((report.finding_count || report.findings.length) - report.findings.length);
  }
  for (const finding of workflowFailures) collector.add(finding);
  for (const finding of ledgerSafety.findings) collector.add(finding);
  collector.addOmitted((ledgerSafety.finding_count || ledgerSafety.findings.length) - ledgerSafety.findings.length);
  for (const files of duplicates.duplicate_groups) {
    collector.add({
      severity: "medium",
      file: files.join(", "),
      summary: "Exact-content duplicate group requires review."
    });
  }
  collector.addOmitted(duplicates.duplicate_group_count - duplicates.duplicate_groups.length);

  const textRead = textReader.summary();
  const blockers = [...new Set([
    ...reports.flatMap((report) => report.blockers || []),
    ...duplicates.blockers,
    ...ledgerSafety.blockers,
    ...requiredArtifacts.blockers,
    ...textRead.text_read_blockers
  ])];
  for (const blocker of blockers) {
    collector.add({
      severity: "high",
      file: blocker.startsWith("ledger_") ? ".pala/ledger" : ".",
      summary: `Quality scan incomplete: ${blocker}`
    });
  }
  for (const required of requiredArtifacts.missing) {
    collector.add({ severity: "medium", file: required, summary: "Required v28 evidence or test artifact is missing." });
  }
  for (const required of requiredArtifacts.unsafe) {
    collector.add({ severity: "high", file: required, summary: "Required v28 evidence or test artifact path is unsafe or has the wrong kind." });
  }
  const collected = collector.result();
  const scanComplete = blockers.length === 0;
  return {
    status: collected.finding_count === 0 && scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    ...collected,
    blockers,
    scan_complete: scanComplete,
    scan_truncated: reports.some((report) => report.scan_truncated) || duplicates.scan_truncated || ledgerSafety.file_scan_truncated,
    required_artifacts: requiredArtifacts,
    ...textRead,
    payload_exposed: false,
    writes_performed: false,
    checked: [
      "hardcoded personal paths",
      "workspace root hygiene",
      "forbidden public hype",
      "v28 evidence",
      "dashboard route",
      "test gaps",
      "playbooks",
      "prompts",
      "examples",
      "dead code",
      "exact duplicates",
      "ledger safety",
      "bounded ledger scan completeness",
      "bounded repo inventory and text reads",
      "bounded required-artifact path metadata",
      "workflow contracts"
    ]
  };
}
