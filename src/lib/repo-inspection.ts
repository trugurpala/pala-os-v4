import crypto from "node:crypto";
import path from "node:path";
import { PROJECT_ROOT } from "./paths.ts";
import { createBoundedRepoTextReader, inspectRepoInventory, inspectRepoPath, REPO_PATH_INSPECTION_CONTRACT, REPO_SCAN_CONTRACT, repoScanOptions } from "./repo-scan.ts";

export { inspectRepoInventory, REPO_SCAN_CONTRACT } from "./repo-scan.ts";

const TEXT_EXTENSIONS = new Set([".css", ".html", ".js", ".json", ".jsonl", ".md", ".mjs", ".ts", ".txt", ".yaml", ".yml"]);
const REQUIRED_ARCHITECTURE_PATHS = [
  { name: "CLI entry exists", path: "src/cli.ts", kind: "file" },
  { name: "SQLite schema exists", path: ".pala/schema/001_init.sql", kind: "file" },
  { name: "Rules layer exists", path: ".pala/rules/core-rules.md", kind: "file" },
  { name: "State layer exists", path: ".pala/state/project-state.json", kind: "file" },
  { name: "Ledger layer exists", path: ".pala/ledger/events.jsonl", kind: "file" },
  { name: "Evidence layer exists", path: ".pala/evidence", kind: "directory" },
  { name: "Dashboard layer exists", path: "control/overview/index.html", kind: "file" }
];

export const ARCHITECTURE_PATH_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_fixed_architecture_path_metadata_scan",
  required_path_count: REQUIRED_ARCHITECTURE_PATHS.length,
  path_policy: REPO_PATH_INSPECTION_CONTRACT.policy,
  payload_exposed: false,
  writes_allowed: false
});

export const CLAUDE_SKILL_INSPECTION_CONTRACT = Object.freeze({
  policy: "bounded_project_skill_readiness_scan",
  root: ".claude/skills",
  required_filename: "SKILL.md",
  required_checks: [
    "frontmatter_delimited",
    "description_declared",
    "markdown_title_present",
    "body_has_substance",
    "skill_bytes_within_limit",
    "placeholder_free"
  ],
  min_body_bytes: 80,
  max_skill_bytes: 4000,
  inventory_policy: REPO_SCAN_CONTRACT.policy,
  payload_exposed: false,
  writes_allowed: false
});

function readText(relativePath, bounded = repoScanOptions(), blockers = [], textReader = createBoundedRepoTextReader(bounded)) {
  const inspected = textReader.read(relativePath);
  if (inspected.status !== "safe_to_execute") blockers.push(inspected.blocker);
  return inspected.text || "";
}

function inspectResult(checks, extra = {}) {
  const failures = checks.filter((check) => !check.ok);
  const blockers = [...new Set(extra.blockers || [])];
  return {
    status: failures.length === 0 && blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    checks,
    failures,
    blockers,
    ...extra
  };
}

export function listRepoFiles(dir = PROJECT_ROOT, output = []) {
  const inventory = inspectRepoInventory({ projectRoot: PROJECT_ROOT, startDir: dir });
  output.push(...inventory.files);
  return output;
}

function inventoryAt(relativeRoot, bounded) {
  return inspectRepoInventory({
    ...bounded,
    startDir: path.join(bounded.projectRoot, relativeRoot)
  });
}

function scanTruth(inventory, blockers = [], textReader = null) {
  const textRead = textReader?.summary?.() || {
    text_read_policy: REPO_SCAN_CONTRACT.policy,
    total_text_byte_limit: REPO_SCAN_CONTRACT.max_total_text_bytes,
    total_text_bytes_read: 0,
    text_file_read_count: 0,
    text_read_budget_complete: true,
    text_read_blockers: []
  };
  const uniqueBlockers = [...new Set([...(inventory?.blockers || []), ...blockers, ...textRead.text_read_blockers])];
  return {
    contract: REPO_SCAN_CONTRACT,
    root_inspection: inventory?.root_inspection || null,
    blockers: uniqueBlockers,
    scan_complete: uniqueBlockers.length === 0,
    scan_truncated: Boolean(inventory?.scan_truncated),
    scanned_entry_count: inventory?.scanned_entry_count || 0,
    file_count: inventory?.file_count || 0,
    file_count_exact: Boolean(inventory?.file_count_exact),
    ...textRead,
    payload_exposed: false,
    writes_performed: false
  };
}

function findingCollector(limit) {
  const findings = [];
  let findingCount = 0;
  return {
    add(finding) {
      findingCount += 1;
      if (findings.length < limit) findings.push(finding);
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

function inspectSkillReadiness(file, text) {
  const frontmatterMatch = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  const frontmatter = frontmatterMatch?.[1] || "";
  const body = frontmatterMatch ? text.slice(frontmatterMatch[0].length).trim() : text.trim();
  const checks = [
    { name: "frontmatter_delimited", ok: Boolean(frontmatterMatch) },
    { name: "description_declared", ok: /^description:\s*\S.+$/im.test(frontmatter) },
    { name: "markdown_title_present", ok: /^#\s+\S/m.test(body) },
    { name: "body_has_substance", ok: Buffer.byteLength(body, "utf8") >= CLAUDE_SKILL_INSPECTION_CONTRACT.min_body_bytes },
    { name: "skill_bytes_within_limit", ok: Buffer.byteLength(text, "utf8") <= CLAUDE_SKILL_INSPECTION_CONTRACT.max_skill_bytes },
    { name: "placeholder_free", ok: !/\bplaceholder\b|status:\s*scaffolded/i.test(text) }
  ];
  return {
    file,
    ready: checks.every((check) => check.ok),
    checks
  };
}

export function inspectArchitecture(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const blockers = [];
  const testsInventory = inventoryAt("tests", bounded);
  blockers.push(...testsInventory.blockers);
  const pathInspections = REQUIRED_ARCHITECTURE_PATHS.map((required) => {
    const inspected = inspectRepoPath(required.path, { ...bounded, expectedKind: required.kind });
    if (inspected.status !== "safe_to_execute") blockers.push(inspected.blocker);
    return inspected;
  });
  const checks = [
    ...REQUIRED_ARCHITECTURE_PATHS.map((required, index) => ({
      name: required.name,
      ok: pathInspections[index].status === "safe_to_execute"
        && pathInspections[index].exists
        && pathInspections[index].kind === required.kind,
      evidence: required.path
    })),
    { name: "Tests layer exists", ok: testsInventory.files.some((file) => file.endsWith(".test.ts")), evidence: "tests/" },
    { name: "Architecture contract exists", ok: readText("docs/ARCHITECTURE.md", bounded, blockers, textReader).includes("Frontend reads truth. It does not create truth."), evidence: "docs/ARCHITECTURE.md" },
    { name: "Package exposes local CLI", ok: readText("package.json", bounded, blockers, textReader).includes("\"pala\"") && readText("package.json", bounded, blockers, textReader).includes("./src/cli.ts"), evidence: "package.json" }
  ];
  return inspectResult(checks, {
    architecture_path_contract: ARCHITECTURE_PATH_INSPECTION_CONTRACT,
    path_inspections: pathInspections,
    ...scanTruth(testsInventory, blockers, textReader),
    boundaries: {
      agent: "performs coding work",
      cli_backend: "records decisions, DB, ledger, evidence, and gates",
      dashboard: "reads truth only",
      external_actions: "approval-gated"
    }
  });
}

export function buildCodeMap(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const inventory = inspectRepoInventory(bounded);
  const blockers = [...inventory.blockers];
  const files = inventory.files;
  const byTopLevel = {};
  const byExtension = {};
  for (const file of files) {
    const topLevel = file.split("/")[0];
    const extension = path.extname(file) || "(none)";
    byTopLevel[topLevel] = (byTopLevel[topLevel] || 0) + 1;
    byExtension[extension] = (byExtension[extension] || 0) + 1;
  }
  const cliText = readText("src/cli.ts", bounded, blockers, textReader);
  const directlyRoutedCommands = [...cliText.matchAll(/if \(name === "([^"]+)"/g)].map((match) => match[1]);
  const declaredCommands = [...cliText.matchAll(/^\s*"pala\s+([^"]+)"/gm)].map((match) => `pala ${match[1]}`);
  const routedCommands = declaredCommands.map((command) => command.slice("pala ".length).split(/\s+/)[0]);
  const truth = scanTruth(inventory, blockers, textReader);
  return {
    status: truth.scan_complete ? "safe_to_execute" : "manual_verification_required",
    ...truth,
    file_count: files.length,
    by_top_level: byTopLevel,
    by_extension: byExtension,
    source_modules: files.filter((file) => file.startsWith("src/") && file.endsWith(".ts")),
    test_files: files.filter((file) => file.startsWith("tests/")),
    declared_commands: [...new Set(declaredCommands)].sort(),
    routed_commands: [...new Set(routedCommands)].sort(),
    directly_routed_commands: [...new Set(directlyRoutedCommands)].sort(),
    note: "Command inventory comes from the CLI's declared help surface; direct-if routes are reported separately and runtime reachability is not inferred."
  };
}

export function inspectDuplicates(options = {}) {
  const bounded = repoScanOptions(options);
  const inventory = inspectRepoInventory(bounded);
  const blockers = [...inventory.blockers];
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const groups = new Map();
  let checkedTextFileCount = 0;
  for (const file of inventory.files) {
    if (!TEXT_EXTENSIONS.has(path.extname(file))) continue;
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    checkedTextFileCount += 1;
    const text = inspected.text.trim();
    if (text.length < 80) continue;
    const hash = crypto.createHash("sha256").update(text).digest("hex");
    const files = groups.get(hash) || [];
    files.push(file);
    groups.set(hash, files);
  }
  const duplicateGroups = [...groups.values()].filter((files) => files.length > 1);
  const duplicates = duplicateGroups.slice(0, bounded.maxReturnedFindings);
  const textRead = textReader.summary();
  const uniqueBlockers = [...new Set([...blockers, ...textRead.text_read_blockers])];
  const scanComplete = uniqueBlockers.length === 0;
  return {
    status: duplicateGroups.length === 0 && scanComplete ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    duplicate_groups: duplicates,
    duplicate_group_count: duplicateGroups.length,
    duplicate_groups_truncated: duplicateGroups.length > duplicates.length,
    checked_text_file_count: checkedTextFileCount,
    blockers: uniqueBlockers,
    scan_complete: scanComplete,
    scan_truncated: inventory.scan_truncated,
    scanned_entry_count: inventory.scanned_entry_count,
    file_count: inventory.file_count,
    file_count_exact: inventory.file_count_exact,
    ...textRead,
    payload_exposed: false,
    writes_performed: false,
    note: "Exact-content duplicates only; generated or intentionally mirrored files require human review."
  };
}

export function inspectDeadCode(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const inventory = inspectRepoInventory(bounded);
  const blockers = [...inventory.blockers];
  const sourceFiles = inventory.files.filter((file) => file.startsWith("src/") && file.endsWith(".ts"));
  const searchableFiles = [
    ...sourceFiles,
    ...inventory.files.filter((file) => file.startsWith("tests/") && file.endsWith(".ts"))
  ];
  const searchableText = [];
  for (const file of searchableFiles) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    searchableText.push({ file, text: inspected.text });
  }
  const candidates = sourceFiles.filter((file) => file !== "src/cli.ts");
  const collector = findingCollector(bounded.maxReturnedFindings);
  for (const file of candidates) {
    const moduleName = path.basename(file, ".ts");
    const references = searchableText.filter((entry) => entry.file !== file && new RegExp(`[/\\\\]${moduleName}\\.ts["']`).test(entry.text));
    if (references.length === 0) {
      collector.add({ severity: "medium", file, summary: "No static TypeScript import reference found." });
    }
  }
  const collected = collector.result();
  const truth = scanTruth(inventory, blockers, textReader);
  return {
    status: collected.finding_count === 0 && truth.scan_complete ? "safe_to_execute" : "manual_verification_required",
    ...truth,
    ...collected,
    checked_modules: candidates.length,
    note: "Heuristic static-import scan; dynamic imports and executable entry points need manual review."
  };
}

export function inspectTestGaps(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const inventory = inspectRepoInventory(bounded);
  const blockers = [...inventory.blockers];
  const testTexts = [];
  for (const file of inventory.files.filter((candidate) => candidate.startsWith("tests/") && candidate.endsWith(".ts"))) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    testTexts.push(inspected.text);
  }
  const testText = testTexts.join("\n");
  const modules = inventory.files.filter((file) => file.startsWith("src/lib/") && file.endsWith(".ts"));
  const collector = findingCollector(bounded.maxReturnedFindings);
  let gapCount = 0;
  for (const file of modules) {
    if (testText.includes(path.basename(file))) continue;
    gapCount += 1;
    collector.add({ severity: "medium", file, summary: "No direct module import/reference found in tests." });
  }
  const collected = collector.result();
  const truth = scanTruth(inventory, blockers, textReader);
  return {
    status: gapCount === 0 && truth.scan_complete ? "safe_to_execute" : "manual_verification_required",
    ...truth,
    ...collected,
    module_count: modules.length,
    directly_referenced_module_count: modules.length - gapCount,
    note: "Direct-reference coverage heuristic; it is not a line or branch coverage measurement."
  };
}

function inspectMarkdownCollection(root, requirements, options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const inventory = inventoryAt(root, bounded);
  const blockers = [...inventory.blockers];
  const files = inventory.files.filter((file) => file.endsWith(".md"));
  const collector = findingCollector(bounded.maxReturnedFindings);
  for (const file of files) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    const text = inspected.text;
    if (options.rejectPlaceholder && /placeholder|status:\s*scaffolded/i.test(text)) {
      collector.add({ severity: "medium", file, summary: "Artifact is still explicitly scaffolded/placeholder." });
    }
    for (const requirement of requirements) {
      if (!requirement.pattern.test(text)) {
        collector.add({ severity: "medium", file, summary: `Missing ${requirement.name}.` });
      }
    }
  }
  if (files.length === 0) {
    collector.add({ severity: "high", file: root, summary: "No Markdown artifacts found." });
  }
  return {
    files,
    ...collector.result(),
    ...scanTruth(inventory, blockers, textReader)
  };
}

export function inspectPlaybooks(options = {}) {
  const result = inspectMarkdownCollection("docs/recipes", [
    { name: "goal", pattern: /goal/i },
    { name: "Pala command", pattern: /\bpala\s+[a-z]/i },
    { name: "expected behavior or evidence", pattern: /expected|evidence|dashboard/i },
    { name: "failure, blocker, or safety rule", pattern: /failure|blocked|approval|rule|no (?:push|activation|copying|performance)/i }
  ], options);
  return {
    status: result.finding_count === 0 && result.scan_complete ? "safe_to_execute" : "manual_verification_required",
    ...result,
    recipe_count: result.files.length,
    note: "Playbooks are checked for an executable goal, command, evidence expectation, and failure/safety path."
  };
}

export function inspectExamples(options = {}) {
  const result = inspectMarkdownCollection("examples", [
    { name: "goal or scenario", pattern: /goal|scenario|before coding/i },
    { name: "Pala command", pattern: /\bpala\s+[a-z]/i },
    { name: "expected result", pattern: /expected/i },
    { name: "evidence or dashboard result", pattern: /evidence|dashboard|ledger|DB/i },
    { name: "failure or no-fake-done path", pattern: /failure|blocked|approval|no[- ]fake[- ]done/i }
  ], { ...options, rejectPlaceholder: true });
  return {
    status: result.finding_count === 0 && result.scan_complete ? "safe_to_execute" : "manual_verification_required",
    ...result,
    example_count: result.files.length,
    note: "Examples must show an executable flow and an honest failure/no-fake-done path."
  };
}

export function inspectPrompts(options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const blockers = [];
  const promptFiles = [
    "00-ANY-AI-CODING-AGENT-PASTE.md",
    "00-CLAUDE-CODE-A-YAPISTIR-TEK-METIN.md",
    "docs/prompts/PASTE-INTO-ANY-AI-CODING-AGENT.md",
    "docs/prompts/PASTE-INTO-CLAUDE-CODE.md"
  ];
  const collector = findingCollector(bounded.maxReturnedFindings);
  for (const file of promptFiles) {
    const inspected = textReader.read(file);
    if (inspected.status !== "safe_to_execute") {
      blockers.push(inspected.blocker);
      continue;
    }
    const text = inspected.text;
    if (!inspected.exists) {
      collector.add({ severity: "high", file, summary: "Prompt file is missing." });
      continue;
    }
    for (const [name, pattern] of [
      ["Pala positioning", /Pala OS is (?:NOT|not) a coding agent/],
      ["core line", /Agent does the work\. Pala OS verifies the work\./],
      ["no fake PASS rule", /No fake PASS/i],
      ["no push rule", /No push/i],
      ["local DB or ledger evidence", /SQLite|\.pala\/db|ledger/i]
    ]) {
      if (!pattern.test(text)) collector.add({ severity: "medium", file, summary: `Missing ${name}.` });
    }
    if (/\bv27\b/i.test(text)) collector.add({ severity: "medium", file, summary: "Prompt still identifies itself as v27." });
  }
  const collected = collector.result();
  const textRead = textReader.summary();
  const uniqueBlockers = [...new Set([...blockers, ...textRead.text_read_blockers])];
  return {
    status: collected.finding_count === 0 && uniqueBlockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: REPO_SCAN_CONTRACT,
    checked_files: promptFiles,
    ...collected,
    blockers: uniqueBlockers,
    scan_complete: uniqueBlockers.length === 0,
    scan_truncated: false,
    ...textRead,
    payload_exposed: false,
    writes_performed: false
  };
}

export function inspectClaudeAssets(kind, options = {}) {
  const bounded = repoScanOptions(options);
  const textReader = options.textReader || createBoundedRepoTextReader(bounded);
  const checks = [];
  const blockers = [];
  if (kind === "skills") {
    const inventory = inventoryAt(".claude/skills", bounded);
    blockers.push(...inventory.blockers);
    const skillFiles = inventory.files.filter((file) => file.endsWith("/SKILL.md"));
    checks.push({ name: "Project skills exist", ok: skillFiles.length > 0, evidence: ".claude/skills" });
    const skillReadiness = [];
    for (const file of skillFiles) {
      const text = readText(file, bounded, blockers, textReader);
      const readiness = inspectSkillReadiness(file, text);
      skillReadiness.push(readiness);
      for (const check of readiness.checks) {
        checks.push({ name: `${file} ${check.name}`, ok: check.ok, evidence: file });
      }
    }
    const readySkillCount = skillReadiness.filter((skill) => skill.ready).length;
    return inspectResult(checks, {
      ...scanTruth(inventory, blockers, textReader),
      scan_contract: REPO_SCAN_CONTRACT,
      contract: CLAUDE_SKILL_INSPECTION_CONTRACT,
      kind,
      assets: skillFiles,
      skill_readiness: skillReadiness,
      ready_skill_count: readySkillCount,
      unready_skill_count: skillReadiness.length - readySkillCount,
      active_install_performed: false
    });
  }
  if (kind === "agents") {
    const inventory = inventoryAt(".claude/agents", bounded);
    blockers.push(...inventory.blockers);
    const agentFiles = inventory.files.filter((file) => file.endsWith(".md"));
    checks.push({ name: "Project agents exist", ok: agentFiles.length > 0, evidence: ".claude/agents" });
    for (const file of agentFiles) {
      const text = readText(file, bounded, blockers, textReader);
      checks.push({ name: `${file} has frontmatter`, ok: text.startsWith("---"), evidence: file });
      checks.push({ name: `${file} defers final PASS`, ok: /final (?:PASS|acceptance)/i.test(text), evidence: file });
    }
    return inspectResult(checks, { ...scanTruth(inventory, blockers, textReader), kind, assets: agentFiles, agent_run_performed: false });
  }
  const activeSettings = readText(".claude/settings.json", bounded, blockers, textReader);
  const recommendedSettings = readText(".claude/settings.recommended-after-smoke.json", bounded, blockers, textReader);
  const guard = readText(".claude/hooks/pretooluse-guard.mjs", bounded, blockers, textReader);
  checks.push({ name: "Hook guard exists", ok: Boolean(guard), evidence: ".claude/hooks/pretooluse-guard.mjs" });
  checks.push({ name: "Recommended settings reference guard", ok: recommendedSettings.includes("pretooluse-guard.mjs"), evidence: ".claude/settings.recommended-after-smoke.json" });
  checks.push({ name: "Default settings keep hooks inactive", ok: !activeSettings.includes("\"hooks\""), evidence: ".claude/settings.json" });
  checks.push({ name: "Guard blocks push and publish", ok: guard.includes("git push") && guard.includes("npm publish"), evidence: ".claude/hooks/pretooluse-guard.mjs" });
  const textRead = textReader.summary();
  return inspectResult(checks, {
    contract: REPO_SCAN_CONTRACT,
    blockers: [...new Set([...blockers, ...textRead.text_read_blockers])],
    scan_complete: blockers.length === 0 && textRead.text_read_blockers.length === 0,
    scan_truncated: false,
    ...textRead,
    payload_exposed: false,
    writes_performed: false,
    kind: "hooks",
    hook_activated: false
  });
}
