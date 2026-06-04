#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { CONTROL_ROUTES, ensureDashboardRoutes } from "./lib/dashboard.ts";
import { panelRouteData } from "./lib/panel-data.ts";
import { PROJECT_ROOT } from "./lib/paths.ts";
import { redact } from "./lib/redaction.ts";

const CONTENT_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};
const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;

export const PANEL_READ_CONTRACT = Object.freeze({
  policy: "loopback_read_only_realpath_contained_single_handle_max_bytes",
  allowed_hosts: ["127.0.0.1", "::1"],
  max_state_file_bytes: 1_000_000,
  max_static_file_bytes: 1_000_000,
  max_route_response_bytes: 1_000_000,
  metadata_failure_policy: "structured_fail_closed_no_throw",
  close_failure_reason: "file_close_failed",
  database_close_failure_reason: "route_database_close_failed",
  database_post_read_path_recheck: true,
  database_path_change_reason: "route_database_path_changed_after_read",
  route_response_limit_reason: "route_response_exceeds_byte_limit",
  state_head_validation_policy: "same_validation_status_as_get_without_body",
  static_head_validation_policy: "same_read_status_as_get_without_body",
  startup_failure_policy: "structured_payload_free_without_raw_error",
  startup_failure_error: "panel_start_failed",
  raw_startup_error_exposed: false,
  payload_exposed_on_failure: false,
  nofollow_supported: NOFOLLOW_FLAG !== 0,
  writes_allowed: false
});

function boundedInteger(value, fallback, maximum) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function send(res, status, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "Content-Type": contentType,
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY"
  });
  res.end(body);
}

export function panelStartupFailureResult(error) {
  let errorCode = null;
  try {
    if (typeof error?.code === "string" && /^[a-z][a-z0-9_:-]{0,79}$/i.test(error.code)) {
      errorCode = error.code;
    }
  } catch {
    errorCode = null;
  }
  return {
    status: "blocked",
    error: PANEL_READ_CONTRACT.startup_failure_error,
    error_code: errorCode,
    raw_error_exposed: PANEL_READ_CONTRACT.raw_startup_error_exposed,
    payload_exposed_on_failure: false
  };
}

function pathIsInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function pathHasSymlinkAtOrBelowRoot(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return true;
  let current = root;
  for (const segment of ["", ...relative.split(path.sep).filter(Boolean)]) {
    if (segment) current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) return true;
    } catch {
      break;
    }
  }
  return false;
}

function sameFileSnapshot(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs;
}

function failedRead(reason, extra = {}) {
  return {
    status: "manual_verification_required",
    reason,
    body: null,
    file_bytes: null,
    target_read_performed: false,
    single_file_handle_used: false,
    content_stable_during_read: false,
    ...extra
  };
}

function readContainedFile(filePath, rootPath, maxBytes, readBody = true) {
  const resolvedRoot = path.resolve(rootPath);
  const resolvedPath = path.resolve(filePath);
  if (!pathIsInside(resolvedRoot, resolvedPath)) {
    return failedRead("path_outside_allowed_root");
  }

  let targetStats;
  try {
    targetStats = fs.lstatSync(resolvedPath);
  } catch {
    return failedRead("not_found");
  }
  if (
    targetStats.isSymbolicLink()
    || !targetStats.isFile()
    || pathHasSymlinkAtOrBelowRoot(resolvedRoot, resolvedPath)
  ) {
    return failedRead("not_realpath_contained_regular_file");
  }
  try {
    if (!pathIsInside(fs.realpathSync(resolvedRoot), fs.realpathSync(resolvedPath))) {
      return failedRead("not_realpath_contained_regular_file");
    }
  } catch {
    return failedRead("path_inspection_failed");
  }
  if (targetStats.size > maxBytes) {
    return failedRead("file_exceeds_byte_limit", { file_bytes: targetStats.size });
  }

  let fileDescriptor;
  try {
    fileDescriptor = fs.openSync(resolvedPath, fs.constants.O_RDONLY | NOFOLLOW_FLAG);
  } catch {
    return failedRead("open_failed");
  }

  let readResult;
  try {
    readResult = (() => {
      const openedStats = fs.fstatSync(fileDescriptor);
      let currentPathStats;
      try {
        currentPathStats = fs.statSync(resolvedPath);
      } catch {
        currentPathStats = null;
      }
      if (
        !openedStats.isFile()
        || openedStats.size > maxBytes
        || !currentPathStats
        || !sameFileSnapshot(openedStats, currentPathStats)
        || pathHasSymlinkAtOrBelowRoot(resolvedRoot, resolvedPath)
      ) {
        return failedRead(openedStats.size > maxBytes ? "file_exceeds_byte_limit" : "file_changed_after_open", {
          file_bytes: openedStats.size,
          single_file_handle_used: true
        });
      }
      if (!readBody) {
        return {
          status: "safe_to_execute",
          reason: null,
          body: Buffer.alloc(0),
          file_bytes: openedStats.size,
          target_read_performed: false,
          single_file_handle_used: true,
          content_stable_during_read: true
        };
      }

      const buffer = Buffer.alloc(Math.min(openedStats.size + 1, maxBytes + 1));
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
        || pathHasSymlinkAtOrBelowRoot(resolvedRoot, resolvedPath)
      ) {
        return failedRead("file_changed_during_read", {
          file_bytes: openedStats.size,
          target_read_performed: true,
          single_file_handle_used: true
        });
      }
      return {
        status: "safe_to_execute",
        reason: null,
        body: buffer.subarray(0, bytesRead),
        file_bytes: openedStats.size,
        target_read_performed: true,
        single_file_handle_used: true,
        content_stable_during_read: true
      };
    })();
  } catch {
    readResult = failedRead("read_failed", { single_file_handle_used: true });
  }

  try {
    fs.closeSync(fileDescriptor);
  } catch {
    return failedRead(PANEL_READ_CONTRACT.close_failure_reason, {
      file_bytes: readResult?.file_bytes ?? null,
      target_read_performed: readResult?.target_read_performed === true,
      single_file_handle_used: true,
      content_stable_during_read: false
    });
  }
  return readResult;
}

function controlFile(urlPath, projectRoot) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (!decoded.startsWith("/control/")) return null;
  const relative = decoded.slice(1).replace(/\/$/, "/index.html");
  const fullPath = path.resolve(projectRoot, relative);
  const controlRoot = path.resolve(projectRoot, "control");
  if (fullPath !== controlRoot && !fullPath.startsWith(`${controlRoot}${path.sep}`)) return null;
  return fullPath;
}

export function createPanelServer(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const controlRoot = path.join(projectRoot, "control");
  const statePath = path.resolve(options.statePath || path.join(projectRoot, ".pala", "state", "dashboard-state.json"));
  const dbPath = path.resolve(options.dbPath || path.join(projectRoot, ".pala", "db", "pala.sqlite"));
  const maxStateFileBytes = boundedInteger(options.maxStateFileBytes, PANEL_READ_CONTRACT.max_state_file_bytes, PANEL_READ_CONTRACT.max_state_file_bytes);
  const maxStaticFileBytes = boundedInteger(options.maxStaticFileBytes, PANEL_READ_CONTRACT.max_static_file_bytes, PANEL_READ_CONTRACT.max_static_file_bytes);
  const maxRouteResponseBytes = boundedInteger(options.maxRouteResponseBytes, PANEL_READ_CONTRACT.max_route_response_bytes, PANEL_READ_CONTRACT.max_route_response_bytes);
  if (options.ensureRoutes !== false) {
    if (projectRoot !== path.resolve(PROJECT_ROOT)) {
      throw new TypeError("Custom panel projectRoot requires ensureRoutes: false.");
    }
    ensureDashboardRoutes();
  }
  return http.createServer((req, res) => {
    if (!req.url || !["GET", "HEAD"].includes(req.method || "")) {
      send(res, 405, "Method not allowed");
      return;
    }
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      send(res, 400, "Malformed request URL");
      return;
    }
    if (url.pathname === "/") {
      res.writeHead(302, { Location: "/control/overview/" });
      res.end();
      return;
    }
    if (url.pathname === "/health") {
      send(res, 200, JSON.stringify({ status: "safe_to_execute", read_only: true }), CONTENT_TYPES[".json"]);
      return;
    }
    if (url.pathname === "/api/state") {
      const inspected = readContainedFile(statePath, projectRoot, maxStateFileBytes, true);
      if (inspected.status !== "safe_to_execute") {
        const body = JSON.stringify({
          status: "manual_verification_required",
          error: `dashboard_state_${inspected.reason}`,
          read_contract: PANEL_READ_CONTRACT.policy
        });
        send(res, 503, req.method === "HEAD" ? "" : body, CONTENT_TYPES[".json"]);
        return;
      }
      try {
        const parsed = JSON.parse(inspected.body.toString("utf8"));
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new TypeError("state root must be an object");
      } catch {
        const body = JSON.stringify({
          status: "manual_verification_required",
          error: "dashboard_state_invalid_json",
          read_contract: PANEL_READ_CONTRACT.policy
        });
        send(res, 503, req.method === "HEAD" ? "" : body, CONTENT_TYPES[".json"]);
        return;
      }
      send(res, 200, req.method === "HEAD" ? "" : inspected.body, CONTENT_TYPES[".json"]);
      return;
    }
    if (url.pathname.startsWith("/api/route/")) {
      let route;
      try {
        route = decodeURIComponent(url.pathname.slice("/api/route/".length)).replace(/^\/+|\/+$/g, "");
      } catch {
        send(res, 400, JSON.stringify({ status: "blocked", error: "malformed_dashboard_route" }), CONTENT_TYPES[".json"]);
        return;
      }
      if (!CONTROL_ROUTES.includes(route)) {
        send(res, 404, JSON.stringify({ status: "blocked", error: "unknown_dashboard_route" }), CONTENT_TYPES[".json"]);
        return;
      }
      const dbInspection = readContainedFile(dbPath, projectRoot, Number.MAX_SAFE_INTEGER, false);
      if (dbInspection.status !== "safe_to_execute") {
        send(res, 503, JSON.stringify({
          status: "manual_verification_required",
          error: `local_db_${dbInspection.reason}`,
          read_contract: PANEL_READ_CONTRACT.policy
        }), CONTENT_TYPES[".json"]);
        return;
      }
      let db;
      let routeBody;
      let routeError = null;
      try {
        db = new DatabaseSync(dbPath, { readOnly: true });
        db.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;");
        routeBody = redact(panelRouteData(db, route, {
          limit: url.searchParams.get("limit"),
          offset: url.searchParams.get("offset"),
          query: url.searchParams.get("q")
        }));
      } catch {
        routeError = "route_data_unavailable";
      }
      if (db) {
        try {
          db.close();
        } catch {
          routeBody = undefined;
          routeError = PANEL_READ_CONTRACT.database_close_failure_reason;
        }
      }
      if (!routeError) {
        const postReadDbInspection = readContainedFile(dbPath, projectRoot, Number.MAX_SAFE_INTEGER, false);
        if (postReadDbInspection.status !== "safe_to_execute") {
          routeBody = undefined;
          routeError = PANEL_READ_CONTRACT.database_path_change_reason;
        }
      }
      if (!routeError && Buffer.byteLength(routeBody, "utf8") > maxRouteResponseBytes) {
        routeBody = undefined;
        routeError = PANEL_READ_CONTRACT.route_response_limit_reason;
      }
      if (routeError) {
        send(res, 503, JSON.stringify({
          status: "manual_verification_required",
          error: routeError,
          read_contract: PANEL_READ_CONTRACT.policy
        }), CONTENT_TYPES[".json"]);
        return;
      }
      send(res, 200, req.method === "HEAD" ? "" : routeBody, CONTENT_TYPES[".json"]);
      return;
    }
    const fullPath = controlFile(url.pathname, projectRoot);
    if (!fullPath) {
      send(res, 404, "Not found");
      return;
    }
    const inspected = readContainedFile(fullPath, controlRoot, maxStaticFileBytes, true);
    if (inspected.status !== "safe_to_execute") {
      const status = inspected.reason === "file_exceeds_byte_limit"
        ? 413
        : inspected.reason === "not_realpath_contained_regular_file" || inspected.reason === "path_outside_allowed_root"
          ? 403
          : inspected.reason === "not_found"
            ? 404
            : 503;
      const body = status === 413 ? "Static file exceeds byte limit" : status === 403 ? "Forbidden" : status === 404 ? "Not found" : "Static file unavailable";
      send(res, status, req.method === "HEAD" ? "" : body);
      return;
    }
    send(res, 200, req.method === "HEAD" ? "" : inspected.body, CONTENT_TYPES[path.extname(fullPath)] || "application/octet-stream");
  });
}

export function startPanelServer(options = {}) {
  const host = options.host || "127.0.0.1";
  if (!PANEL_READ_CONTRACT.allowed_hosts.includes(host)) {
    throw new TypeError("Panel server requires an allowed loopback host.");
  }
  const port = Number.isFinite(Number(options.port)) ? Number(options.port) : 4173;
  const server = createPanelServer(options);
  server.listen(port, host, () => {
    const address = server.address();
    const actualPort = typeof address === "object" && address ? address.port : port;
    process.stdout.write(`Pala OS panel: http://${host}:${actualPort}/control/overview/\n`);
  });
  return server;
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const server = startPanelServer({ port: process.env.PALA_PANEL_PORT || 4173 });
  server.on("error", (error) => {
    process.stderr.write(`${JSON.stringify(panelStartupFailureResult(error))}\n`);
    process.exitCode = 1;
  });
}
