import fs from "node:fs";
import path from "node:path";
import { redact } from "./redaction.ts";
import { inspectRepoPath } from "./repo-scan.ts";

export const MCP_FIXTURE_FILES = {
  cursor: ".cursor/mcp.json",
  claude: ".claude/.mcp.fixture.json",
  codex: ".codex/mcp.fixture.json",
  "claude-desktop": "AppData/Roaming/Claude/claude_desktop_config.json"
};

export const MCP_FIXTURE_INSPECTION_CONTRACT = Object.freeze({
  policy: "realpath_contained_single_handle_max_1mb_payload_free",
  max_clients: 20,
  max_file_bytes: 1_000_000,
  max_returned_names: 200,
  path_metadata_policy: "realpath_contained_symlink_free_path_metadata_only",
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_blocker: "fixture_file_close_failed",
  payload_exposed: false,
  payload_exposed_on_failure: false,
  writes_allowed: false
});

const PALA_SERVER = {
  command: "pala-mcp",
  args: ["--stdio"],
  env: {}
};
const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function inspectionResult(overrides = {}) {
  const blockers = [...new Set(overrides.blockers || [])];
  return {
    status: blockers.length === 0 ? "safe_to_execute" : "manual_verification_required",
    policy: MCP_FIXTURE_INSPECTION_CONTRACT.policy,
    blockers,
    scan_complete: blockers.length === 0,
    path_safe: false,
    target_exists: false,
    regular_file: false,
    file_bytes: 0,
    file_byte_limit: MCP_FIXTURE_INSPECTION_CONTRACT.max_file_bytes,
    target_open_performed: false,
    target_read_performed: false,
    parse_performed: false,
    parse_valid: false,
    single_file_handle_used: false,
    content_stable_during_read: false,
    payload_exposed: false,
    writes_performed: false,
    ...overrides,
    blockers
  };
}

function inspectFixture(filePath, fixtureRoot, maxFileBytes) {
  if (!filePath || !fixtureRoot) {
    return {
      config: { mcpServers: {} },
      inspection: inspectionResult({
        path_safe: true,
        scan_complete: true,
        blockers: [],
        file_byte_limit: maxFileBytes
      })
    };
  }
  const resolvedRoot = path.resolve(fixtureRoot);
  const resolvedPath = path.resolve(filePath);
  const pathInspection = inspectRepoPath(resolvedPath, {
    projectRoot: resolvedRoot,
    expectedKind: "file"
  });
  if (pathInspection.status !== "safe_to_execute") {
    return {
      config: null,
      inspection: inspectionResult({
        blockers: [pathInspection.blocker === "repo_path_inspection_failed"
          ? "fixture_file_inspection_failed"
          : "fixture_path_not_realpath_contained_or_symlink_free"],
        target_exists: pathInspection.exists === true,
        file_byte_limit: maxFileBytes
      })
    };
  }
  if (!pathInspection.exists) {
    return {
      config: { mcpServers: {} },
      inspection: inspectionResult({
        path_safe: true,
        scan_complete: true,
        blockers: [],
        file_byte_limit: maxFileBytes
      })
    };
  }

  const stat = { size: pathInspection.bytes };
  if (stat.size > maxFileBytes) {
    return {
      config: null,
      inspection: inspectionResult({
        blockers: ["fixture_file_exceeds_byte_limit"],
        path_safe: true,
        target_exists: true,
        regular_file: true,
        file_bytes: stat.size,
        file_byte_limit: maxFileBytes
      })
    };
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(resolvedPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return {
      config: null,
      inspection: inspectionResult({
        blockers: ["fixture_file_open_failed"],
        path_safe: true,
        target_exists: true,
        regular_file: true,
        file_bytes: stat.size,
        file_byte_limit: maxFileBytes,
        target_open_performed: true
      })
    };
  }

  let text;
  let openedStats;
  try {
    openedStats = fs.fstatSync(fileDescriptor);
    if (!openedStats.isFile()) {
      return {
        config: null,
        inspection: inspectionResult({
          blockers: ["fixture_path_not_realpath_contained_or_symlink_free"],
          target_exists: true,
          file_byte_limit: maxFileBytes,
          target_open_performed: true
        })
      };
    }
    if (openedStats.size > maxFileBytes) {
      return {
        config: null,
        inspection: inspectionResult({
          blockers: ["fixture_file_exceeds_byte_limit"],
          path_safe: true,
          target_exists: true,
          regular_file: true,
          file_bytes: openedStats.size,
          file_byte_limit: maxFileBytes,
          target_open_performed: true
        })
      };
    }
    let pathStats;
    try {
      pathStats = fs.statSync(resolvedPath);
    } catch {
      pathStats = null;
    }
    if (!pathStats || !sameFileSnapshot(openedStats, pathStats)) {
      return {
        config: null,
        inspection: inspectionResult({
          blockers: ["fixture_file_changed_during_scan"],
          path_safe: true,
          target_exists: true,
          regular_file: true,
          file_bytes: openedStats.size,
          file_byte_limit: maxFileBytes,
          target_open_performed: true
        })
      };
    }

    const buffer = Buffer.alloc(Math.min(openedStats.size + 1, maxFileBytes + 1));
    let bytesRead = 0;
    while (bytesRead < buffer.length) {
      const count = fs.readSync(fileDescriptor, buffer, bytesRead, buffer.length - bytesRead, null);
      if (count === 0) break;
      bytesRead += count;
    }
    const afterReadStats = fs.fstatSync(fileDescriptor);
    let afterReadPathStats;
    try {
      afterReadPathStats = fs.statSync(resolvedPath);
    } catch {
      afterReadPathStats = null;
    }
    if (
      bytesRead !== openedStats.size
      || !sameFileSnapshot(openedStats, afterReadStats)
      || !afterReadPathStats
      || !sameFileSnapshot(afterReadStats, afterReadPathStats)
    ) {
      return {
        config: null,
        inspection: inspectionResult({
          blockers: ["fixture_file_changed_during_scan"],
          path_safe: true,
          target_exists: true,
          regular_file: true,
          file_bytes: openedStats.size,
          file_byte_limit: maxFileBytes,
          target_open_performed: true,
          target_read_performed: true,
          single_file_handle_used: true
        })
      };
    }
    text = buffer.subarray(0, bytesRead).toString("utf8");
  } catch {
    return {
      config: null,
      inspection: inspectionResult({
        blockers: ["fixture_file_read_failed"],
        path_safe: true,
        target_exists: true,
        regular_file: true,
        file_bytes: openedStats?.size || stat.size,
        file_byte_limit: maxFileBytes,
        target_open_performed: true,
        target_read_performed: true,
        single_file_handle_used: true
      })
    };
  } finally {
    try {
      fs.closeSync(fileDescriptor);
    } catch {
      return {
        config: null,
        inspection: inspectionResult({
          blockers: [MCP_FIXTURE_INSPECTION_CONTRACT.close_failure_blocker],
          path_safe: true,
          target_exists: true,
          regular_file: true,
          file_bytes: openedStats?.size || stat.size,
          file_byte_limit: maxFileBytes,
          target_open_performed: true,
          target_read_performed: true,
          target_close_performed: true,
          target_close_succeeded: false,
          single_file_handle_used: true
        })
      };
    }
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      config: null,
      inspection: inspectionResult({
        blockers: ["invalid_fixture_json"],
        scan_complete: true,
        path_safe: true,
        target_exists: true,
        regular_file: true,
        file_bytes: openedStats.size,
        file_byte_limit: maxFileBytes,
        target_open_performed: true,
        target_read_performed: true,
        parse_performed: true,
        parse_valid: false,
        single_file_handle_used: true,
        content_stable_during_read: true
      })
    };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      config: null,
      inspection: inspectionResult({
        blockers: ["invalid_fixture_json"],
        scan_complete: true,
        path_safe: true,
        target_exists: true,
        regular_file: true,
        file_bytes: openedStats.size,
        file_byte_limit: maxFileBytes,
        target_open_performed: true,
        target_read_performed: true,
        parse_performed: true,
        parse_valid: false,
        single_file_handle_used: true,
        content_stable_during_read: true
      })
    };
  }
  return {
    config: parsed,
    inspection: inspectionResult({
      path_safe: true,
      target_exists: true,
      regular_file: true,
      file_bytes: openedStats.size,
      file_byte_limit: maxFileBytes,
      target_open_performed: true,
      target_read_performed: true,
      parse_performed: true,
      parse_valid: true,
      single_file_handle_used: true,
      content_stable_during_read: true,
      scan_complete: true,
      blockers: []
    })
  };
}

function isPalaOwned(entry) {
  return Boolean(entry && entry.command === PALA_SERVER.command && Array.isArray(entry.args) && entry.args.includes("--stdio"));
}

function boundedNames(names, limit) {
  return {
    names: names.slice(0, limit),
    count: names.length,
    count_exact: true,
    names_truncated: names.length > limit
  };
}

export function planMcpRepair(options = {}) {
  const requestedClients = Array.isArray(options.clients) ? options.clients.map(String) : Object.keys(MCP_FIXTURE_FILES);
  const maxClients = boundedInteger(options.maxClients, MCP_FIXTURE_INSPECTION_CONTRACT.max_clients, MCP_FIXTURE_INSPECTION_CONTRACT.max_clients);
  const maxFileBytes = boundedInteger(options.maxFixtureBytes, MCP_FIXTURE_INSPECTION_CONTRACT.max_file_bytes, MCP_FIXTURE_INSPECTION_CONTRACT.max_file_bytes);
  const maxReturnedNames = boundedInteger(options.maxReturnedNames, MCP_FIXTURE_INSPECTION_CONTRACT.max_returned_names, MCP_FIXTURE_INSPECTION_CONTRACT.max_returned_names);
  const clients = requestedClients.slice(0, maxClients);
  const clientsTruncated = requestedClients.length > clients.length;
  const fixtureRoot = options.fixtureRoot ? path.resolve(options.fixtureRoot) : null;
  const action = ["check", "remove", "repair", "setup"].includes(options.action) ? options.action : "repair";
  const plans = clients.map((client) => {
    const relativePath = MCP_FIXTURE_FILES[client] || `${client}/mcp.fixture.json`;
    const fixturePath = fixtureRoot ? path.resolve(fixtureRoot, relativePath) : null;
    const observed = inspectFixture(fixturePath, fixtureRoot, maxFileBytes);
    const config = observed.config;
    const mcpServersShapeValid = !config
      || config.mcpServers === undefined
      || (config.mcpServers && typeof config.mcpServers === "object" && !Array.isArray(config.mcpServers));
    const existingServers = mcpServersShapeValid && config?.mcpServers ? config.mcpServers : {};
    const existingPala = existingServers.pala;
    const palaOwned = isPalaOwned(existingPala);
    const ownershipConflict = Boolean(existingPala && !palaOwned);
    const proposedServers = { ...existingServers };
    let palaEntryAction = "none";
    if (action === "remove" && palaOwned) {
      delete proposedServers.pala;
      palaEntryAction = "remove";
    } else if (action === "remove" && ownershipConflict) {
      palaEntryAction = "blocked_conflict";
    } else if (["repair", "setup"].includes(action) && !ownershipConflict) {
      proposedServers.pala = PALA_SERVER;
      palaEntryAction = existingPala ? "retain" : "add";
    } else if (["repair", "setup"].includes(action) && ownershipConflict) {
      palaEntryAction = "blocked_conflict";
    }
    const proposedConfig = config && mcpServersShapeValid
      ? { ...config, mcpServers: proposedServers }
      : null;
    const blockers = [
      ...observed.inspection.blockers,
      ...(!mcpServersShapeValid ? ["invalid_mcp_servers_shape"] : []),
      ...(ownershipConflict ? ["pala_server_ownership_conflict"] : [])
    ];
    const unrelatedNames = Object.keys(existingServers).filter((name) => name !== "pala");
    const existingNameTruth = boundedNames(Object.keys(existingServers), maxReturnedNames);
    const proposedNameTruth = boundedNames(Object.keys(proposedServers), maxReturnedNames);
    return {
      client,
      action,
      config_path_redacted: fixtureRoot ? redact(fixturePath) : `<TEMP_FIXTURE>/${relativePath.replace(/\\/g, "/")}`,
      discovered: observed.inspection.target_exists,
      invalid_json: observed.inspection.blockers.includes("invalid_fixture_json"),
      blockers,
      fixture_inspection: observed.inspection,
      existing_server_names: existingNameTruth.names,
      existing_server_count: existingNameTruth.count,
      existing_server_count_exact: existingNameTruth.count_exact,
      existing_server_names_truncated: existingNameTruth.names_truncated,
      existing_servers_preserved: unrelatedNames.every((name) => proposedServers[name] === existingServers[name]),
      unrelated_top_level_keys_preserved: config && proposedConfig
        ? Object.keys(config).filter((name) => name !== "mcpServers").every((name) => proposedConfig[name] === config[name])
        : false,
      pala_entry_present: Boolean(existingPala),
      pala_entry_owned: palaOwned,
      ownership_conflict: ownershipConflict,
      pala_entry_action: action === "check" ? "none" : palaEntryAction,
      proposed_change: action === "check" || !config || !proposedConfig
        ? false
        : JSON.stringify(config) !== JSON.stringify(proposedConfig),
      backup_plan: "Create a timestamped backup before any approved real write.",
      proposed_diff: {
        action: action === "check" ? "none" : palaEntryAction,
        existing_server_names: existingNameTruth.names,
        existing_server_count: existingNameTruth.count,
        existing_server_names_truncated: existingNameTruth.names_truncated,
        proposed_server_names: proposedNameTruth.names,
        proposed_server_count: proposedNameTruth.count,
        proposed_server_names_truncated: proposedNameTruth.names_truncated,
        unrelated_server_count: unrelatedNames.length,
        unrelated_top_level_key_count: config ? Object.keys(config).filter((name) => name !== "mcpServers").length : 0,
        payload_exposed: false
      },
      payload_exposed: false,
      secret_values_exposed: false,
      writes_performed: false
    };
  });

  const blockers = [
    ...(clientsTruncated ? ["mcp_client_plan_limit_reached"] : []),
    ...plans.flatMap((plan) => plan.blockers.map((blocker) => `${plan.client}:${blocker}`))
  ];
  return {
    status: blockers.length > 0 ? "manual_verification_required" : action === "check" ? "safe_to_execute" : "dry_run_only",
    contract: MCP_FIXTURE_INSPECTION_CONTRACT,
    action,
    dry_run: true,
    writes_performed: false,
    real_config_modified: false,
    payload_exposed: false,
    secret_values_exposed: false,
    secret_redaction: "payload_not_exposed",
    manual_approval_required: action !== "check",
    requested_client_count: requestedClients.length,
    planned_client_count: clients.length,
    clients_truncated: clientsTruncated,
    blockers,
    plans
  };
}
