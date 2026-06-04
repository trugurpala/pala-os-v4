import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { DatabaseSync, constants as SQLITE } from "node:sqlite";
import { PATHS, toProjectPath as relativeToProject } from "./paths.ts";
import { inspectRepoPath, readBoundedRepoText } from "./repo-scan.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;

export const PROJECT_ROOT = process.cwd();
export const PALA_DIR = path.join(PROJECT_ROOT, ".pala");
export const STATE_DIR = path.join(PALA_DIR, "state");
export const LEDGER_DIR = path.join(PALA_DIR, "ledger");
export const MEMORY_DIR = path.join(PALA_DIR, "memory");
export const EVIDENCE_DIR = path.join(PALA_DIR, "evidence");
export const RAW_EVIDENCE_DIR = path.join(EVIDENCE_DIR, "raw");
export const ARCHIVE_DIR = path.join(PALA_DIR, "archive");
export const DB_DIR = path.join(PALA_DIR, "db");
export const DB_PATH = path.join(DB_DIR, "pala.sqlite");
export const DB_RELATIVE_PATH = ".pala/db/pala.sqlite";
export const SCHEMA_PATH = path.join(PALA_DIR, "schema", "001_init.sql");
export const DOCS_EVIDENCE_DIR = path.join(PROJECT_ROOT, "docs", "evidence");

export const DECISIONS = ["blocked", "needs_approval", "dry_run_only", "safe_local_write", "manual_verification_required", "pass_allowed"];

const KERNEL_DIRECTORY_PATHS = [
  ".pala",
  ".pala/rules",
  ".pala/state",
  ".pala/ledger",
  ".pala/memory",
  ".pala/evidence",
  ".pala/evidence/raw",
  ".pala/archive",
  ".pala/schema",
  ".pala/db",
  "docs",
  "docs/evidence"
];
const KERNEL_LEDGER_FILES = [
  "events.jsonl",
  "handoffs.jsonl",
  "decisions.jsonl",
  "mistakes.jsonl",
  "token-economy.jsonl",
  "reference-refresh.jsonl"
];
const KERNEL_INITIALIZED_FILE_PATHS = [
  ...KERNEL_LEDGER_FILES.map((file) => `.pala/ledger/${file}`),
  ".pala/state/project-state.json",
  ".pala/state/control-tower-state.json",
  ".pala/state/benchmark-state.json"
];
const KERNEL_PROTECTED_FILE_PATHS = [
  ...KERNEL_INITIALIZED_FILE_PATHS,
  ".pala/db/pala.sqlite",
  ".pala/memory/mistake-registry.jsonl"
];

export const KERNEL_BOOTSTRAP_CONTRACT = Object.freeze({
  policy: "fixed_project_contained_create_only_kernel_bootstrap",
  directory_count: KERNEL_DIRECTORY_PATHS.length,
  initialized_file_count: KERNEL_INITIALIZED_FILE_PATHS.length,
  protected_file_count: KERNEL_PROTECTED_FILE_PATHS.length,
  max_initialized_file_bytes: 1_000_000,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  concurrent_directory_creation_policy: "rechecked_eexist_tolerant",
  create_only: true,
  atomic_create_link: true,
  initialized_file_temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match",
  initialized_file_identity_safe_temp_cleanup: true,
  initialized_file_post_publish_identity_policy: "temporary_and_initialized_file_dev_ino_match",
  existing_files_overwritten: false,
  payload_exposed: false,
  writes_allowed: true
});

export const DATABASE_SCHEMA_EXECUTION_CONTRACT = Object.freeze({
  policy: "bounded_project_contained_single_handle_schema_with_authorized_sqlite_execution",
  max_file_bytes: 1_000_000,
  allowed_pragmas: ["foreign_keys", "journal_mode"],
  authorizer_required: true,
  defensive_mode_required: true,
  attach_allowed: false,
  load_extension_allowed: false,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_blocker: "database_schema_file_close_failed",
  payload_exposed: false,
  payload_exposed_on_failure: false
});

export const DATABASE_PATH_INSPECTION_CONTRACT = Object.freeze({
  policy: "fixed_project_contained_database_path_metadata_only",
  path: DB_RELATIVE_PATH,
  expected_kind: "file",
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  payload_exposed: false,
  writes_allowed: false
});

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function unlinkIfSameFileIdentity(fullPath, expectedStats) {
  if (!expectedStats) return false;
  try {
    const currentStats = fs.lstatSync(fullPath);
    if (!currentStats.isFile() || currentStats.isSymbolicLink() || !sameFileIdentity(expectedStats, currentStats)) {
      return false;
    }
    fs.unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

export const REFERENCE_SOURCES = [
  {
    category: "ai_coding_agents",
    name: "OpenHands",
    url: "https://github.com/OpenHands/OpenHands",
    lesson: "Coding agents need sandboxed execution, tool use, and observable task loops.",
    pala_decision: "Pala records and verifies agent work instead of replacing the coding agent."
  },
  {
    category: "ai_coding_agents",
    name: "OpenCode",
    url: "https://github.com/sst/opencode",
    lesson: "Terminal-native agents need permission-aware local workflows.",
    pala_decision: "Pala keeps permission and evidence checks outside the agent loop."
  },
  {
    category: "ai_coding_agents",
    name: "WrongStack",
    url: "https://wrongstack.com/",
    lesson: "Agent autonomy still needs user-visible permission and state surfaces.",
    pala_decision: "Pala treats coding-agent output as untrusted until evidence is stored."
  },
  {
    category: "developer_portal_control_tower",
    name: "Backstage Software Catalog",
    url: "https://backstage.io/docs/features/software-catalog/",
    lesson: "A control tower needs ownership, metadata, and discoverable state.",
    pala_decision: "Pala dashboard pages read local DB/state/evidence as their catalog of truth."
  },
  {
    category: "developer_portal_control_tower",
    name: "OpenHands Local GUI",
    url: "https://docs.openhands.dev/overview/introduction",
    lesson: "A local agent GUI can combine a REST API and a single-page application while keeping local operation visible.",
    pala_decision: "Pala exposes a local control surface but keeps stored DB/state/evidence as final truth."
  },
  {
    category: "token_economy",
    name: "Langfuse Token and Cost Tracking",
    url: "https://langfuse.com/docs/model-usage-and-cost",
    lesson: "Token usage and cost fields must be explicit and separated by usage type.",
    pala_decision: "Pala separates known token counts from estimates and confidence."
  },
  {
    category: "token_economy",
    name: "Helicone Cost Tracking",
    url: "https://docs.helicone.ai/guides",
    lesson: "Cost observability should expose source and calculation confidence.",
    pala_decision: "Pala blocks exact cost claims unless measured data is present."
  },
  {
    category: "mcp_installer",
    name: "Claude Code MCP Docs",
    url: "https://code.claude.com/docs/en/mcp",
    lesson: "MCP configuration is client-specific and must be verified from current docs.",
    pala_decision: "Pala setup defaults to dry-run and preserves unrelated servers."
  },
  {
    category: "mcp_installer",
    name: "Cursor MCP Docs",
    url: "https://docs.cursor.com/context/model-context-protocol",
    lesson: "IDE MCP clients have their own config surfaces and scopes.",
    pala_decision: "Pala records client-specific setup plans before any real config write."
  },
  {
    category: "mcp_installer",
    name: "Context7 MCP Docs",
    url: "https://context7.com/docs",
    lesson: "Current, version-specific documentation reduces stale API decisions.",
    pala_decision: "Pala reference checks track source freshness before standards."
  },
  {
    category: "public_github_readiness",
    name: "OpenSSF Scorecard",
    url: "https://github.com/ossf/scorecard",
    lesson: "Public repos benefit from repeatable security-health checks.",
    pala_decision: "Pala public-readiness checks look for security and community files."
  },
  {
    category: "public_github_readiness",
    name: "GitHub Community Profile Docs",
    url: "https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/accessing-a-projects-community-profile",
    lesson: "Community health files should be visible and reviewable.",
    pala_decision: "Pala public-readiness checks verify README, contribution, support, governance, security, and release artifacts."
  },
  {
    category: "public_github_readiness",
    name: "GitHub Advisory Database Docs",
    url: "https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/browsing-security-advisories-in-the-github-advisory-database",
    lesson: "Security advisory workflows should be documented before public release.",
    pala_decision: "Pala keeps SECURITY.md and advisory references in the release gate."
  },
  {
    category: "backtesting",
    name: "vectorbt",
    url: "https://vectorbt.dev/",
    lesson: "Backtesting claims need transparent assumptions and reproducible evidence.",
    pala_decision: "Pala blocks unsupported trading/performance claims."
  },
  {
    category: "backtesting",
    name: "backtesting.py",
    url: "https://kernc.github.io/backtesting.py/doc/backtesting/",
    lesson: "Execution timing and model constraints must be explicit in trading examples.",
    pala_decision: "Pala requires disclaimers and evidence for Pine/backtesting recipes."
  },
  {
    category: "backtesting",
    name: "backtrader",
    url: "https://www.backtrader.com/docu/",
    lesson: "Reusable strategy, data feed, and analyzer boundaries help avoid fake performance claims.",
    pala_decision: "Pala treats backtest outputs as evidence only with command logs and assumptions."
  }
];

export function toProjectPath(filePath) {
  return relativeToProject(filePath);
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

export function slug(value) {
  return String(value || "item")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 72) || "item";
}

export function rootHash(projectRoot = PROJECT_ROOT) {
  return crypto.createHash("sha256").update(projectRoot).digest("hex");
}

function kernelInitializedFiles(projectRoot) {
  const categories = {};
  for (const source of REFERENCE_SOURCES) {
    categories[source.category] ||= [];
    categories[source.category].push({
      name: source.name,
      url: source.url,
      status: "checked",
      lesson: source.lesson
    });
  }
  return [
    ...KERNEL_LEDGER_FILES.map((file) => ({ path: `.pala/ledger/${file}`, text: "" })),
    {
      path: ".pala/state/project-state.json",
      text: JSON.stringify({
      schemaVersion: 28,
      project: "pala-os-community-session-pack",
      status: "partial",
      positioning: "Pala OS is not a coding agent. It is a local control/evidence layer for AI/vibe coding agents.",
      coreLine: "Agent does the work. Pala OS verifies the work.",
        rootPathHash: rootHash(projectRoot),
      truthSources: [".pala/db/pala.sqlite", ".pala/state", ".pala/ledger", ".pala/evidence", "docs/evidence"],
      updatedAt: nowIso()
      }, null, 2) + "\n"
    },
    {
      path: ".pala/state/control-tower-state.json",
      text: JSON.stringify({
      schemaVersion: 28,
      dashboardRule: "Frontend reads truth. It does not create truth.",
      emptyStates: ["Unknown", "Not checked", "Partial", "Blocked", "Manual verification required"],
      status: "not_checked",
      updatedAt: nowIso()
      }, null, 2) + "\n"
    },
    {
      path: ".pala/state/benchmark-state.json",
      text: JSON.stringify({
      schemaVersion: 28,
      status: "checked",
      checkedAt: "2026-06-04",
      copyPolicy: "Lessons only; do not copy code, branding, UI text, or package names.",
      categories
      }, null, 2) + "\n"
    }
  ];
}

function summarizeKernelBootstrap(projectRoot, blockers, directoryResults, fileResults, inspections, writesPerformed) {
  const unsafePaths = inspections
    .filter((inspection) => inspection.status !== "safe_to_execute")
    .map((inspection) => ({
      path: inspection.path,
      expected_kind: inspection.expected_kind,
      blocker: inspection.blocker
    }));
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    contract: KERNEL_BOOTSTRAP_CONTRACT,
    project_root: relativeToProject(projectRoot, projectRoot),
    blockers: [...new Set(blockers)],
    directory_summary: {
      planned_directory_count: KERNEL_BOOTSTRAP_CONTRACT.directory_count,
      safe_directory_count: directoryResults.filter((item) => item.status === "safe_to_execute").length,
      created_directory_count: directoryResults.filter((item) => item.created === true).length,
      existing_directory_count: directoryResults.filter((item) => item.existing === true).length,
      failed_directory_count: directoryResults.filter((item) => item.status !== "safe_to_execute").length
    },
    file_summary: {
      planned_initialized_file_count: KERNEL_BOOTSTRAP_CONTRACT.initialized_file_count,
      created_file_count: fileResults.filter((item) => item.created === true).length,
      existing_file_count: fileResults.filter((item) => item.existing === true).length,
      failed_file_count: fileResults.filter((item) => item.status !== "safe_to_execute").length,
      bytes_initialized: fileResults.reduce((total, item) => total + Number(item.bytes_written || 0), 0)
    },
    unsafe_paths: unsafePaths,
    payload_exposed: false,
    writes_performed: writesPerformed
  };
}

function createKernelFileIfMissing(projectRoot, initializedFile) {
  const fullPath = path.join(projectRoot, initializedFile.path);
  const bytes = Buffer.byteLength(initializedFile.text, "utf8");
  const target = inspectRepoPath(initializedFile.path, { projectRoot, expectedKind: "file" });
  const parent = inspectRepoPath(path.dirname(initializedFile.path), { projectRoot, expectedKind: "directory" });
  if (target.status !== "safe_to_execute" || parent.status !== "safe_to_execute" || parent.exists !== true) {
    return { status: "manual_verification_required", path: initializedFile.path, blocker: "kernel_bootstrap_path_not_safe", created: false, existing: false, bytes_written: 0, writes_performed: false };
  }
  if (target.exists) {
    return { status: "safe_to_execute", path: initializedFile.path, blocker: null, created: false, existing: true, bytes_written: 0, writes_performed: false };
  }
  if (bytes > KERNEL_BOOTSTRAP_CONTRACT.max_initialized_file_bytes) {
    return { status: "manual_verification_required", path: initializedFile.path, blocker: "kernel_bootstrap_file_exceeds_byte_limit", created: false, existing: false, bytes_written: 0, writes_performed: false };
  }

  const tempPath = path.join(
    path.dirname(fullPath),
    `.${path.basename(fullPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let fileDescriptor;
  let tempExists = false;
  let createdTempStats = null;
  try {
    fileDescriptor = fs.openSync(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW_FLAG,
      0o600
    );
    tempExists = true;
    fs.writeFileSync(fileDescriptor, initializedFile.text, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      return { status: "manual_verification_required", path: initializedFile.path, blocker: "kernel_bootstrap_file_create_failed", created: false, existing: false, bytes_written: 0, writes_performed: true };
    }
    const recheckedTarget = inspectRepoPath(initializedFile.path, { projectRoot, expectedKind: "file" });
    const recheckedParent = inspectRepoPath(path.dirname(initializedFile.path), { projectRoot, expectedKind: "directory" });
    if (recheckedTarget.status !== "safe_to_execute" || recheckedParent.status !== "safe_to_execute" || recheckedParent.exists !== true) {
      return { status: "manual_verification_required", path: initializedFile.path, blocker: "kernel_bootstrap_path_not_safe", created: false, existing: false, bytes_written: 0, writes_performed: true };
    }
    if (recheckedTarget.exists) {
      return { status: "safe_to_execute", path: initializedFile.path, blocker: null, created: false, existing: true, bytes_written: 0, writes_performed: true };
    }

    fs.linkSync(tempPath, fullPath);
    const written = inspectRepoPath(initializedFile.path, { projectRoot, expectedKind: "file" });
    let initializedFileIdentityVerified = false;
    try {
      const openedTempStats = fs.fstatSync(fileDescriptor);
      const publishedSourceStats = fs.lstatSync(tempPath);
      const initializedFileStats = fs.lstatSync(fullPath);
      initializedFileIdentityVerified = publishedSourceStats.isFile()
        && !publishedSourceStats.isSymbolicLink()
        && initializedFileStats.isFile()
        && !initializedFileStats.isSymbolicLink()
        && sameFileIdentity(openedTempStats, publishedSourceStats)
        && sameFileIdentity(openedTempStats, initializedFileStats);
    } catch {
      initializedFileIdentityVerified = false;
    }
    if (written.status !== "safe_to_execute" || written.exists !== true || written.bytes !== bytes || !initializedFileIdentityVerified) {
      return { status: "manual_verification_required", path: initializedFile.path, blocker: "kernel_bootstrap_file_post_create_verification_failed", created: false, existing: false, bytes_written: bytes, writes_performed: true };
    }
    return { status: "safe_to_execute", path: initializedFile.path, blocker: null, created: true, existing: false, bytes_written: bytes, writes_performed: true };
  } catch (error) {
    if (error?.code === "EEXIST") {
      const existing = inspectRepoPath(initializedFile.path, { projectRoot, expectedKind: "file" });
      if (existing.status === "safe_to_execute" && existing.exists === true) {
        return { status: "safe_to_execute", path: initializedFile.path, blocker: null, created: false, existing: true, bytes_written: 0, writes_performed: tempExists };
      }
    }
    return { status: "manual_verification_required", path: initializedFile.path, blocker: "kernel_bootstrap_file_create_failed", created: false, existing: false, bytes_written: 0, writes_performed: tempExists };
  } finally {
    if (fileDescriptor !== undefined) {
      try {
        fs.closeSync(fileDescriptor);
      } catch {
        // Cleanup continues below.
      }
    }
    if (tempExists) {
      unlinkIfSameFileIdentity(tempPath, createdTempStats);
    }
  }
}

export function bootstrapKernel(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const initializedFiles = kernelInitializedFiles(projectRoot);
  const inspections = [
    inspectRepoPath(".", { projectRoot, expectedKind: "directory" }),
    ...KERNEL_DIRECTORY_PATHS.map((relativePath) => inspectRepoPath(relativePath, { projectRoot, expectedKind: "directory" })),
    ...KERNEL_PROTECTED_FILE_PATHS.map((relativePath) => inspectRepoPath(relativePath, { projectRoot, expectedKind: "file" }))
  ];
  if (inspections[0].status !== "safe_to_execute" || inspections[0].exists !== true || inspections.some((inspection) => inspection.status !== "safe_to_execute")) {
    return summarizeKernelBootstrap(projectRoot, ["kernel_bootstrap_path_not_safe"], [], [], inspections, false);
  }

  const directoryResults = [];
  let writesPerformed = false;
  for (const relativePath of KERNEL_DIRECTORY_PATHS) {
    let inspected = inspectRepoPath(relativePath, { projectRoot, expectedKind: "directory" });
    let created = false;
    if (!inspected.exists) {
      try {
        fs.mkdirSync(path.join(projectRoot, relativePath));
        created = true;
        writesPerformed = true;
      } catch (error) {
        if (error?.code !== "EEXIST") {
          directoryResults.push({ status: "manual_verification_required", path: relativePath, blocker: "kernel_bootstrap_directory_create_failed", created: false, existing: false });
          return summarizeKernelBootstrap(projectRoot, ["kernel_bootstrap_directory_create_failed"], directoryResults, [], inspections, writesPerformed);
        }
      }
      inspected = inspectRepoPath(relativePath, { projectRoot, expectedKind: "directory" });
    }
    if (inspected.status !== "safe_to_execute" || inspected.exists !== true) {
      directoryResults.push({ status: "manual_verification_required", path: relativePath, blocker: "kernel_bootstrap_path_not_safe", created, existing: false });
      return summarizeKernelBootstrap(projectRoot, ["kernel_bootstrap_path_not_safe"], directoryResults, [], inspections, writesPerformed);
    }
    directoryResults.push({ status: "safe_to_execute", path: relativePath, blocker: null, created, existing: !created });
  }

  const fileResults = [];
  for (const initializedFile of initializedFiles) {
    const result = createKernelFileIfMissing(projectRoot, initializedFile);
    fileResults.push(result);
    writesPerformed ||= result.writes_performed;
    if (result.status !== "safe_to_execute") {
      return summarizeKernelBootstrap(projectRoot, [result.blocker], directoryResults, fileResults, inspections, writesPerformed);
    }
  }
  return summarizeKernelBootstrap(projectRoot, [], directoryResults, fileResults, inspections, writesPerformed);
}

export function ensureKernel(options = {}) {
  const result = bootstrapKernel(options);
  if (result.status !== "safe_to_execute") {
    const error = new Error("kernel_bootstrap_blocked");
    error.code = "PALA_KERNEL_BOOTSTRAP_BLOCKED";
    error.bootstrap = result;
    throw error;
  }
  return result;
}

function boundedSchemaBytes(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0
    ? Math.min(parsed, DATABASE_SCHEMA_EXECUTION_CONTRACT.max_file_bytes)
    : DATABASE_SCHEMA_EXECUTION_CONTRACT.max_file_bytes;
}

function readDatabaseSchema(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const maxFileBytes = boundedSchemaBytes(options.maxFileBytes);
  const inspected = readBoundedRepoText(".pala/schema/001_init.sql", {
    projectRoot,
    maxTextFileBytes: maxFileBytes,
    maxReadBytes: maxFileBytes
  });
  const blockers = [];
  if (inspected.status !== "safe_to_execute") {
    blockers.push(
      inspected.blocker === "repo_text_file_close_failed"
        ? DATABASE_SCHEMA_EXECUTION_CONTRACT.close_failure_blocker
        : ["repo_text_file_exceeds_byte_limit", "repo_text_total_byte_limit_reached"].includes(inspected.blocker)
          ? "database_schema_exceeds_byte_limit"
          : "database_schema_not_project_contained_stable_regular_file"
    );
  } else if (!inspected.exists) {
    blockers.push("database_schema_missing");
  } else if (inspected.bytes === 0 || !inspected.text.trim()) {
    blockers.push("database_schema_empty");
  } else if (inspected.text.includes("\0")) {
    blockers.push("database_schema_contains_nul");
  }
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers: [...new Set(blockers)],
    sql: blockers.length === 0 ? inspected.text : null,
    path: ".pala/schema/001_init.sql",
    exists: Boolean(inspected.exists),
    bytes: Number.isInteger(inspected.bytes) ? inspected.bytes : null,
    max_file_bytes: maxFileBytes,
    single_file_handle_used: inspected.single_file_handle_used === true,
    content_stable_during_read: inspected.content_stable_during_read === true,
    post_read_path_recheck_performed: inspected.post_read_path_recheck_performed === true,
    payload_exposed: false,
    payload_exposed_on_failure: false,
    writes_performed: false
  };
}

export function inspectDatabaseSchema(options = {}) {
  const { sql, ...inspection } = readDatabaseSchema(options);
  return {
    ...inspection,
    contract: DATABASE_SCHEMA_EXECUTION_CONTRACT,
    execution_performed: false,
    authorizer_used: false
  };
}

const DENIED_SCHEMA_ACTIONS = new Set([
  SQLITE.SQLITE_ATTACH,
  SQLITE.SQLITE_DETACH,
  SQLITE.SQLITE_CREATE_TEMP_INDEX,
  SQLITE.SQLITE_CREATE_TEMP_TABLE,
  SQLITE.SQLITE_CREATE_TEMP_TRIGGER,
  SQLITE.SQLITE_CREATE_TEMP_VIEW,
  SQLITE.SQLITE_CREATE_TRIGGER,
  SQLITE.SQLITE_CREATE_VIEW,
  SQLITE.SQLITE_DROP_INDEX,
  SQLITE.SQLITE_DROP_TABLE,
  SQLITE.SQLITE_DROP_TEMP_INDEX,
  SQLITE.SQLITE_DROP_TEMP_TABLE,
  SQLITE.SQLITE_DROP_TEMP_TRIGGER,
  SQLITE.SQLITE_DROP_TEMP_VIEW,
  SQLITE.SQLITE_DROP_TRIGGER,
  SQLITE.SQLITE_DROP_VIEW,
  SQLITE.SQLITE_ALTER_TABLE,
  SQLITE.SQLITE_ANALYZE,
  SQLITE.SQLITE_CREATE_VTABLE,
  SQLITE.SQLITE_DROP_VTABLE,
  SQLITE.SQLITE_FUNCTION,
  SQLITE.SQLITE_SAVEPOINT,
  SQLITE.SQLITE_COPY
]);

function createSchemaAuthorizer() {
  let denied = false;
  const callback = (action, first, _second, databaseName) => {
    const pragma = String(first || "").toLowerCase();
    const writesSchemaTable = [SQLITE.SQLITE_INSERT, SQLITE.SQLITE_UPDATE, SQLITE.SQLITE_DELETE].includes(action)
      && first === "sqlite_master";
    const createsAllowedMainObject = [SQLITE.SQLITE_CREATE_TABLE, SQLITE.SQLITE_CREATE_INDEX].includes(action)
      && databaseName === "main";
    const allowed = !DENIED_SCHEMA_ACTIONS.has(action)
      && (action !== SQLITE.SQLITE_PRAGMA || DATABASE_SCHEMA_EXECUTION_CONTRACT.allowed_pragmas.includes(pragma))
      && (![SQLITE.SQLITE_INSERT, SQLITE.SQLITE_UPDATE, SQLITE.SQLITE_DELETE].includes(action) || writesSchemaTable)
      && (![SQLITE.SQLITE_CREATE_TABLE, SQLITE.SQLITE_CREATE_INDEX].includes(action) || createsAllowedMainObject);
    if (!allowed) denied = true;
    return allowed ? SQLITE.SQLITE_OK : SQLITE.SQLITE_DENY;
  };
  return { callback, wasDenied: () => denied };
}

export function executeDatabaseSchema(db, options = {}) {
  const inspected = readDatabaseSchema(options);
  if (inspected.status !== "safe_to_execute") {
    throw new Error(`database_schema_read_blocked:${inspected.blockers.join(",")}`);
  }
  const authorizer = createSchemaAuthorizer();
  db.enableLoadExtension(false);
  db.enableDefensive(true);
  db.setAuthorizer(authorizer.callback);
  try {
    db.exec(inspected.sql);
  } catch {
    throw new Error(authorizer.wasDenied()
      ? "database_schema_execution_not_authorized"
      : "database_schema_execution_failed");
  } finally {
    db.setAuthorizer(null);
  }
  const { sql, ...metadata } = inspected;
  return {
    ...metadata,
    contract: DATABASE_SCHEMA_EXECUTION_CONTRACT,
    execution_performed: true,
    authorizer_used: true,
    defensive_mode_enabled: true,
    load_extension_enabled: false
  };
}

export function inspectDatabasePath(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const inspection = inspectRepoPath(DB_RELATIVE_PATH, {
    projectRoot,
    expectedKind: "file"
  });
  return {
    ...inspection,
    contract: DATABASE_PATH_INSPECTION_CONTRACT,
    path_inspection_contract: inspection.contract
  };
}

export function openDatabase() {
  ensureKernel();
  const beforeOpen = inspectDatabasePath();
  if (beforeOpen.status !== "safe_to_execute") {
    throw new Error(`database_path_inspection_blocked:${beforeOpen.blocker || "unknown"}`);
  }
  const databaseExisted = beforeOpen.exists === true;
  const db = new DatabaseSync(DB_PATH);
  try {
    const afterOpen = inspectDatabasePath();
    if (afterOpen.status !== "safe_to_execute" || afterOpen.exists !== true) {
      throw new Error(`database_path_post_open_inspection_failed:${afterOpen.blocker || "database_path_missing"}`);
    }
    db.enableLoadExtension(false);
    db.enableDefensive(true);
    db.exec("PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON");
    const hasCoreSchema = databaseExisted && Boolean(db.prepare(`
      SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'projects'
    `).get());
    if (!hasCoreSchema) {
      executeDatabaseSchema(db);
    }
    migrateDatabase(db);
    ensureProject(db);
    seedReferenceSources(db);
    return db;
  } catch (error) {
    try {
      db.close();
    } catch {
      // Preserve the original initialization error.
    }
    throw error;
  }
}

function tableSql(db, tableName) {
  return db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName)?.sql || "";
}

function tableColumns(db, tableName) {
  return new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((column) => column.name));
}

function ensureColumn(db, tableName, columnName, definition) {
  if (!tableColumns(db, tableName).has(columnName)) {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function migrateDecisionVocabulary(db) {
  const sql = tableSql(db, "decisions");
  if (!sql.includes("CHECK (decision IN")) {
    return;
  }
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("ALTER TABLE decisions RENAME TO decisions_v27_archive");
  db.exec(`
    CREATE TABLE decisions (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      decision_type TEXT NOT NULL,
      inputs_json TEXT NOT NULL,
      decision TEXT NOT NULL,
      reason TEXT NOT NULL,
      confidence TEXT NOT NULL DEFAULT 'unknown',
      risk_level TEXT NOT NULL DEFAULT 'unknown',
      required_approval INTEGER NOT NULL DEFAULT 0,
      evidence_path TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(run_id) REFERENCES runs(id)
    );
    INSERT INTO decisions
      (id, run_id, decision_type, inputs_json, decision, reason, confidence, risk_level, required_approval, evidence_path, created_at)
    SELECT
      id, run_id, decision_type, inputs_json, decision, reason, confidence, risk_level, required_approval, evidence_path, created_at
    FROM decisions_v27_archive;
    CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
  `);
  db.exec("PRAGMA foreign_keys = ON");
}

export function migrateDatabase(db) {
  migrateDecisionVocabulary(db);
  ensureColumn(db, "runs", "model_observed", "TEXT");
  ensureColumn(db, "runs", "effort_observed", "TEXT");
  ensureColumn(db, "evidence", "type", "TEXT");
  ensureColumn(db, "evidence", "summary", "TEXT");
  ensureColumn(db, "evidence", "sanitized", "INTEGER NOT NULL DEFAULT 0");
  ensureColumn(db, "token_usage", "effort", "TEXT");
  ensureColumn(db, "token_usage", "known_cached_tokens", "INTEGER");
  ensureColumn(db, "token_usage", "known_reasoning_tokens", "INTEGER");
  ensureColumn(db, "mcp_config_checks", "config_path_redacted", "TEXT");
  ensureColumn(db, "mcp_config_checks", "proposed_diff_json", "TEXT");
  ensureColumn(db, "reference_sources", "freshness_status", "TEXT NOT NULL DEFAULT 'not_checked'");
  ensureColumn(db, "reference_sources", "risk", "TEXT");
  db.exec(`
    CREATE TABLE IF NOT EXISTS operator_sessions (
      id TEXT PRIMARY KEY,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      agent_surface TEXT,
      model_observed TEXT,
      effort_observed TEXT,
      status TEXT NOT NULL,
      evidence_path TEXT
    );
    CREATE TABLE IF NOT EXISTS model_effort_observations (
      id TEXT PRIMARY KEY,
      session_id TEXT,
      observed_model TEXT,
      observed_effort TEXT,
      source TEXT NOT NULL,
      confidence TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES operator_sessions(id)
    );
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      summary TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT OR IGNORE INTO schema_migrations (version, applied_at, summary)
    VALUES (?, ?, ?)
  `).run("v28", nowIso(), "Added model/effort observations, reference freshness, MCP dry-run diff fields, and v28 decision vocabulary.");
  db.prepare(`
    UPDATE mistakes
    SET summary = ?, root_cause = NULL, prevent_next_time = NULL, status = 'template', evidence_path = NULL
    WHERE id = ? OR summary = ?
  `).run(
    "Legacy v27 example; not a real captured mistake.",
    "mistake_mpyprvza_288487f1",
    "Sample v27 verification mistake record"
  );
}

export function ensureProject(db) {
  const id = `project_${rootHash().slice(0, 16)}`;
  const timestamp = nowIso();
  db.prepare(`
    INSERT OR IGNORE INTO projects (id, root_path_hash, name, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, rootHash(), "pala-os-community-session-pack", timestamp, timestamp);
  db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, id);
  return id;
}

export function seedReferenceSources(db) {
  const checkedAt = "2026-06-04";
  for (const source of REFERENCE_SOURCES) {
    const id = `ref_${crypto.createHash("sha1").update(`${source.category}:${source.name}`).digest("hex").slice(0, 16)}`;
    db.prepare(`
      INSERT OR IGNORE INTO reference_sources
        (id, category, name, url, last_checked_at, status, freshness_status, lesson, pala_decision, risk, evidence_path)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      source.category,
      source.name,
      source.url,
      checkedAt,
      "checked",
      "checked",
      source.lesson,
      source.pala_decision,
      "reference_only",
      "docs/evidence/current-sources.md"
    );
    db.prepare(`
      UPDATE reference_sources
      SET url = ?, last_checked_at = ?, status = ?, freshness_status = ?, lesson = ?, pala_decision = ?, risk = ?, evidence_path = ?
      WHERE id = ?
    `).run(source.url, checkedAt, "checked", "checked", source.lesson, source.pala_decision, "reference_only", "docs/evidence/current-sources.md", id);
  }
}

export function beginRun(db, goal, agent = "codex") {
  const id = makeId("run");
  const projectId = ensureProject(db);
  db.prepare(`
    INSERT INTO runs (id, project_id, started_at, agent, goal, status, risk_level, model_observed, effort_observed, token_confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    projectId,
    nowIso(),
    agent,
    goal || "unspecified",
    "running",
    "unknown",
    process.env.ANTHROPIC_MODEL || "unknown",
    process.env.CLAUDE_CODE_EFFORT_LEVEL || "unknown",
    "unknown"
  );
  return id;
}

export function beginCommand(db, runId, commandText) {
  const id = makeId("cmd");
  db.prepare(`
    INSERT INTO commands (id, run_id, command, started_at, status)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, runId, commandText, nowIso(), "running");
  return id;
}

export function finishCommand(db, runId, commandId, result) {
  const status = result.exitCode === 0 ? "completed" : "failed";
  db.prepare(`
    UPDATE commands
    SET ended_at = ?, exit_code = ?, status = ?, raw_log_path = ?, changed_files_count = ?
    WHERE id = ?
  `).run(nowIso(), result.exitCode, status, result.rawLogPath || null, result.changedFilesCount || 0, commandId);
  db.prepare(`
    UPDATE runs
    SET ended_at = ?, status = ?, risk_level = ?, evidence_path = ?
    WHERE id = ?
  `).run(nowIso(), result.runStatus || (result.exitCode === 0 ? "partial" : "failed"), result.riskLevel || "unknown", result.rawLogPath || null, runId);
}

export function tableCount(db, tableName) {
  return db.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

export function dbStatus(db) {
  const pathInspection = inspectDatabasePath();
  const blockers = pathInspection.status === "safe_to_execute" && pathInspection.exists === true
    ? []
    : [pathInspection.blocker || "database_path_missing"];
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    blockers,
    dbPath: DB_RELATIVE_PATH,
    exists: pathInspection.status === "safe_to_execute" && pathInspection.exists === true,
    path_inspection: pathInspection,
    gitignored: true,
    tables: {
      projects: tableCount(db, "projects"),
      runs: tableCount(db, "runs"),
      commands: tableCount(db, "commands"),
      decisions: tableCount(db, "decisions"),
      mistakes: tableCount(db, "mistakes"),
      token_usage: tableCount(db, "token_usage"),
      reference_sources: tableCount(db, "reference_sources")
    },
    v28: {
      schema_migrations: tableCount(db, "schema_migrations"),
      operator_sessions: tableCount(db, "operator_sessions"),
      model_effort_observations: tableCount(db, "model_effort_observations"),
      decision_outputs: DECISIONS
    }
  };
}
