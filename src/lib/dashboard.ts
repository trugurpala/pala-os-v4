import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT, toProjectPath } from "./db.ts";
import { inspectRepoPath } from "./repo-scan.ts";

const NOFOLLOW_FLAG = typeof fs.constants.O_NOFOLLOW === "number" ? fs.constants.O_NOFOLLOW : 0;
const ATOMIC_REPLACE_WAIT_ARRAY = new Int32Array(new SharedArrayBuffer(4));
const TRANSIENT_ATOMIC_REPLACE_ERROR_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);

export const CONTROL_ROUTES = [
  "overview",
  "evidence",
  "evidence-exchange",
  "commands",
  "decisions",
  "decision-review",
  "memory",
  "mistakes",
  "token-economy",
  "drift",
  "sync",
  "push-readiness",
  "mcp-installer",
  "mcp",
  "references",
  "benchmarks",
  "quality-radar",
  "architecture",
  "tests",
  "security",
  "installer",
  "refactor",
  "playbooks",
  "external-skills",
  "public-release",
  "review",
  "smart-suggestions",
  "test-gaps",
  "performance",
  "dashboard-truth",
  "rollback",
  "risk-register",
  "next-actions"
];

export const DASHBOARD_GENERATION_CONTRACT = Object.freeze({
  policy: "bounded_fixed_project_contained_atomic_dashboard_generation",
  output_file_count: CONTROL_ROUTES.length + 2,
  max_file_bytes: 1_000_000,
  path_policy: "realpath_contained_symlink_free_path_metadata_only",
  max_reported_unsafe_paths: 1 + (CONTROL_ROUTES.length + 1) + (CONTROL_ROUTES.length + 2),
  max_reported_file_failures: CONTROL_ROUTES.length + 2,
  concurrent_directory_creation_policy: "rechecked_eexist_tolerant",
  concurrent_generation_policy: "rechecked_transient_atomic_replace_retry",
  max_atomic_replace_attempts: 20,
  atomic_replace_retry_delay_ms: 5,
  max_atomic_replace_retry_delay_ms: 25,
  temporary_source_identity_policy: "write_handle_and_temporary_path_dev_ino_match_before_each_replace_attempt",
  identity_safe_temp_cleanup: true,
  atomic_replace: true,
  payload_exposed: false,
  writes_allowed: true
});

function title(route) {
  return route.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");
}

function page(route) {
  const routeTitle = title(route);
  const primaryRoutes = ["overview", "evidence", "evidence-exchange", "decisions", "decision-review", "quality-radar", "sync", "push-readiness", "references", "benchmarks", "next-actions"];
  const navigation = primaryRoutes.map((item) => {
    const active = item === route ? " aria-current=\"page\"" : "";
    return `<a href="../${item}/"${active}>${title(item)}</a>`;
  }).join("\n        ");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pala OS Control - ${title(route)}</title>
  <link rel="stylesheet" href="../control.css">
  <script src="../control.js" defer></script>
</head>
<body data-pala-route="/control/${route}" data-pala-source=".pala/db/pala.sqlite .pala/state .pala/ledger .pala/evidence docs/evidence" data-pala-snapshot=".pala/state/dashboard-state.json" data-pala-api="/api/state" data-pala-route-api="/api/route">
  <div class="app-shell">
    <aside>
      <div class="brand">
        <span class="brand-mark">P</span>
        <div><strong>Pala OS</strong><small>Control Tower</small></div>
      </div>
      <nav aria-label="Primary">${navigation}</nav>
      <div class="aside-foot">
        <span class="read-only">READ ONLY</span>
        <small>Frontend reads truth. It does not create truth.</small>
      </div>
    </aside>
    <main>
      <header class="topbar">
        <div>
          <p class="eyebrow">/control/${route}</p>
          <h1>${routeTitle}</h1>
          <p class="core-line">Agent does the work. Pala OS verifies the work.</p>
        </div>
        <div class="topbar-actions">
          <span class="status" data-state-field="project-acceptance">Unknown</span>
          <button type="button" id="refresh-state">Refresh</button>
        </div>
      </header>

      <section class="truth-strip" aria-label="Current truth" aria-live="polite">
        <div class="metric"><span>Project</span><strong data-state-field="project-acceptance">Unknown</strong></div>
        <div class="metric"><span>Command</span><strong data-state-field="command-acceptance">Unknown</strong></div>
        <div class="metric"><span>Risk</span><strong data-state-field="risk-level">Unknown</strong></div>
        <div class="metric"><span>Updated</span><strong data-state-field="updated-at">Unknown</strong></div>
      </section>

      <section class="command-band">
        <span>Current command</span>
        <code data-state-field="current-command">Unknown</code>
        <span class="status" data-state-field="command-status">Unknown</span>
      </section>

      <div class="workspace-grid">
        <section class="panel">
          <div class="section-heading"><h2>Blockers</h2><span data-state-field="blocker-count">Unknown</span></div>
          <ul class="signal-list" id="blockers-list"><li>Unknown</li></ul>
        </section>
        <section class="panel">
          <div class="section-heading"><h2>Runtime</h2><span data-state-field="agent-surface">Unknown</span></div>
          <dl class="fact-grid">
            <div><dt>Agent surface</dt><dd data-state-field="agent-surface">Unknown</dd></div>
            <div><dt>Model</dt><dd data-state-field="model">Unknown</dd></div>
            <div><dt>Effort</dt><dd data-state-field="effort">Unknown</dd></div>
            <div><dt>Quality findings</dt><dd data-state-field="open-quality">Unknown</dd></div>
          </dl>
        </section>
        <section class="panel">
          <div class="section-heading"><h2>Latest evidence</h2><span data-state-field="run-status">Unknown</span></div>
          <code class="path-value" data-state-field="latest-evidence">Unknown</code>
          <dl class="fact-grid compact">
            <div><dt>Decision</dt><dd data-state-field="latest-decision">Unknown</dd></div>
            <div><dt>Sync</dt><dd data-state-field="sync-status">Unknown</dd></div>
            <div><dt>Push</dt><dd data-state-field="push-status">Unknown</dd></div>
          </dl>
          <p class="decision-reason" data-state-field="latest-decision-reason">Unknown</p>
        </section>
        <section class="panel">
          <div class="section-heading"><h2>Local DB</h2><span>SQLite</span></div>
          <div class="count-grid" id="count-grid"><span>Unknown</span></div>
        </section>
      </div>
      <section class="route-data-panel">
        <div class="section-heading"><h2>${routeTitle} data</h2><span data-state-field="route-row-count">Unknown</span></div>
        <div class="route-toolbar">
          <label class="route-search" for="route-filter">
            <span>Filter rows</span>
            <input type="search" id="route-filter" autocomplete="off">
          </label>
          <div class="route-pager">
            <span id="route-page-summary">Unknown</span>
            <button type="button" class="icon-button" id="route-prev" title="Previous page" aria-label="Previous page">&larr;</button>
            <button type="button" class="icon-button" id="route-next" title="Next page" aria-label="Next page">&rarr;</button>
          </div>
        </div>
        <div class="route-summary" id="route-summary" hidden></div>
        <div class="table-wrap" id="route-data"><p class="empty-state">Unknown</p></div>
      </section>
    </main>
  </div>
</body>
</html>
`;
}

const CONTROL_SCRIPT = `"use strict";

const stateFields = (name) => document.querySelectorAll('[data-state-field="' + name + '"]');
const valueOrUnknown = (value) => value === null || value === undefined || value === "" ? "Unknown" : String(value);
const statusClass = (value) => "state-" + valueOrUnknown(value).toLowerCase().replace(/[^a-z0-9]+/g, "-");
const routePage = { limit: 20, offset: 0, query: "" };
let routeFilterTimer;

function setField(name, value, status = false) {
  for (const node of stateFields(name)) {
    const text = valueOrUnknown(value);
    node.textContent = text;
    if (status) node.className = "status " + statusClass(text);
  }
}

function renderBlockers(blockers) {
  const list = document.getElementById("blockers-list");
  list.replaceChildren();
  const items = Array.isArray(blockers) ? blockers : [];
  for (const blocker of items.length > 0 ? items : ["No blockers reported"]) {
    const item = document.createElement("li");
    item.textContent = valueOrUnknown(blocker);
    list.appendChild(item);
  }
  setField("blocker-count", items.length);
}

function renderCounts(tables) {
  const grid = document.getElementById("count-grid");
  grid.replaceChildren();
  for (const [name, count] of Object.entries(tables || {})) {
    const item = document.createElement("div");
    const label = document.createElement("span");
    const value = document.createElement("strong");
    label.textContent = name.replace(/_/g, " ");
    value.textContent = valueOrUnknown(count);
    item.append(label, value);
    grid.appendChild(item);
  }
  if (grid.childElementCount === 0) grid.textContent = "Unknown";
}

function renderRouteSummary(summary) {
  const container = document.getElementById("route-summary");
  container.replaceChildren();
  const entries = Object.entries(summary || {});
  container.hidden = entries.length === 0;
  for (const [name, value] of entries) {
    const item = document.createElement("div");
    const label = document.createElement("span");
    const strong = document.createElement("strong");
    label.textContent = name.replace(/_/g, " ");
    strong.textContent = valueOrUnknown(value);
    item.append(label, strong);
    container.appendChild(item);
  }
}

function renderRouteData(payload) {
  const container = document.getElementById("route-data");
  const summary = document.getElementById("route-page-summary");
  const previous = document.getElementById("route-prev");
  const next = document.getElementById("route-next");
  renderRouteSummary(payload && payload.route_summary);
  container.replaceChildren();
  const rows = Array.isArray(payload && payload.rows) ? payload.rows : [];
  const offset = Number(payload && payload.offset) || 0;
  const total = Number(payload && payload.total_count) || 0;
  const exact = payload && payload.total_count_exact !== false;
  const start = rows.length > 0 ? offset + 1 : 0;
  const end = offset + rows.length;
  setField("route-row-count", rows.length + " shown");
  summary.textContent = start + "-" + end + " of " + total + (exact ? "" : "+");
  previous.disabled = offset <= 0;
  next.disabled = !(payload && payload.has_more);
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "empty-state";
    empty.textContent = valueOrUnknown(payload && payload.empty_state);
    container.appendChild(empty);
    return;
  }
  const table = document.createElement("table");
  const head = document.createElement("thead");
  const headRow = document.createElement("tr");
  const keys = Object.keys(rows[0]);
  for (const key of keys) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = key.replace(/_/g, " ");
    headRow.appendChild(cell);
  }
  head.appendChild(headRow);
  table.appendChild(head);
  const body = document.createElement("tbody");
  for (const row of rows) {
    const tableRow = document.createElement("tr");
    for (const key of keys) {
      const cell = document.createElement("td");
      const value = row[key];
      cell.textContent = value && typeof value === "object" ? JSON.stringify(value) : valueOrUnknown(value);
      tableRow.appendChild(cell);
    }
    body.appendChild(tableRow);
  }
  table.appendChild(body);
  container.appendChild(table);
}

async function loadRouteData() {
  try {
    const route = document.body.dataset.palaRoute.split("/").filter(Boolean).pop();
    const url = new URL(document.body.dataset.palaRouteApi + "/" + encodeURIComponent(route), window.location.origin);
    url.searchParams.set("limit", routePage.limit);
    url.searchParams.set("offset", routePage.offset);
    if (routePage.query) url.searchParams.set("q", routePage.query);
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error("route data unavailable");
    renderRouteData(await response.json());
  } catch {
    renderRouteData({ rows: [], empty_state: "Manual verification required" });
  }
}

function renderState(state) {
  setField("project-acceptance", state.project_acceptance_status, true);
  setField("command-acceptance", state.command_acceptance_status, true);
  setField("command-status", state.current_status, true);
  setField("risk-level", state.project_risk_summary && state.project_risk_summary.level);
  setField("updated-at", state.updated_at ? new Date(state.updated_at).toLocaleString() : "Unknown");
  setField("current-command", state.current_command);
  setField("agent-surface", state.model_effort && state.model_effort.agent_surface);
  setField("model", state.model_effort && state.model_effort.observed_model);
  setField("effort", state.model_effort && state.model_effort.observed_effort);
  setField("open-quality", state.open_quality_findings);
  setField("latest-evidence", state.raw_log_path);
  setField("run-status", state.latest_run && state.latest_run.status, true);
  setField("latest-decision", state.latest_decision && state.latest_decision.decision, true);
  setField("latest-decision-reason", state.latest_decision && state.latest_decision.reason);
  setField("sync-status", state.latest_sync && state.latest_sync.status, true);
  setField("push-status", state.latest_push && state.latest_push.status, true);
  renderBlockers(state.project_risk_summary && state.project_risk_summary.unresolved_blockers);
  renderCounts(state.db && state.db.tables);
}

function renderUnavailable() {
  setField("project-acceptance", "Manual verification required", true);
  setField("command-acceptance", "Unknown", true);
  setField("command-status", "Unknown", true);
  setField("risk-level", "Unknown");
  setField("updated-at", "Unknown");
  renderBlockers(["dashboard_state_unavailable"]);
  renderCounts({});
}

async function loadState() {
  try {
    const response = await fetch(document.body.dataset.palaApi, { cache: "no-store" });
    if (!response.ok) throw new Error("state unavailable");
    renderState(await response.json());
  } catch {
    renderUnavailable();
  }
  await loadRouteData();
}

document.getElementById("refresh-state").addEventListener("click", loadState);
document.getElementById("route-filter").addEventListener("input", (event) => {
  window.clearTimeout(routeFilterTimer);
  routeFilterTimer = window.setTimeout(() => {
    routePage.query = event.target.value.trim();
    routePage.offset = 0;
    loadRouteData();
  }, 180);
});
document.getElementById("route-prev").addEventListener("click", () => {
  routePage.offset = Math.max(0, routePage.offset - routePage.limit);
  loadRouteData();
});
document.getElementById("route-next").addEventListener("click", () => {
  routePage.offset += routePage.limit;
  loadRouteData();
});
loadState();
setInterval(loadState, 15000);
`;

const CONTROL_CSS = `:root {
  color-scheme: light;
  font-family: Bahnschrift, Aptos, "Segoe UI", sans-serif;
  background: #eef1f2;
  color: #172126;
  letter-spacing: 0;
  --ink: #172126;
  --muted: #637078;
  --line: #cbd2d5;
  --paper: #f8f9f9;
  --panel: #ffffff;
  --green: #147a52;
  --red: #b13a32;
  --amber: #9a6410;
  --cyan: #087d91;
}
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; background: #eef1f2; }
button, code, input { font: inherit; }
button {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--ink);
  border-radius: 3px;
  background: var(--ink);
  color: white;
  cursor: pointer;
}
button:hover { background: #314047; }
button:disabled { border-color: var(--line); background: #dfe4e5; color: #859096; cursor: not-allowed; }
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 220px minmax(0, 1fr); }
aside {
  position: sticky;
  top: 0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  border-right: 1px solid #26343a;
  background: #111a1e;
  color: #eef4f5;
}
.brand { height: 82px; display: flex; align-items: center; gap: 12px; padding: 16px; border-bottom: 1px solid #314047; }
.brand-mark { display: grid; place-items: center; width: 36px; height: 36px; border: 2px solid #7bd2dc; color: #7bd2dc; font-size: 21px; }
.brand strong, .brand small { display: block; }
.brand small, .aside-foot small { margin-top: 3px; color: #9ba9ae; }
nav { display: grid; padding: 12px 0; }
nav a { padding: 10px 16px; border-left: 3px solid transparent; color: #c8d1d4; text-decoration: none; font-size: 14px; }
nav a:hover { background: #1c292e; color: white; }
nav a[aria-current="page"] { border-left-color: #7bd2dc; background: #233238; color: white; }
.aside-foot { margin-top: auto; padding: 16px; border-top: 1px solid #314047; }
.read-only { display: inline-block; color: #f1ba55; font-size: 12px; }
main { min-width: 0; }
.topbar { min-height: 82px; display: flex; align-items: center; justify-content: space-between; gap: 20px; padding: 14px 24px; border-bottom: 1px solid var(--line); background: var(--paper); }
.eyebrow { margin: 0 0 4px; color: var(--muted); font: 12px Consolas, monospace; }
h1, h2, p { margin-top: 0; }
h1 { margin-bottom: 0; font-size: 26px; font-weight: 650; }
h2 { margin-bottom: 0; font-size: 16px; }
.core-line { margin: 5px 0 0; color: var(--muted); font-size: 11px; }
.topbar-actions { display: flex; align-items: center; gap: 10px; }
.status { display: inline-flex; align-items: center; min-height: 28px; max-width: 240px; padding: 4px 9px; border: 1px solid var(--line); border-radius: 999px; background: #f4f6f6; color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.state-pass, .state-safe-to-execute, .state-passed { border-color: #80bda3; background: #e5f4ed; color: var(--green); }
.state-partial, .state-manual-verification-required, .state-dry-run-only { border-color: #d5b36d; background: #fff4dd; color: var(--amber); }
.state-blocked, .state-failed, .state-needs-approval { border-color: #d39a95; background: #fae9e7; color: var(--red); }
.truth-strip { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border-bottom: 1px solid var(--line); background: var(--panel); }
.metric { min-height: 86px; padding: 18px 24px; border-right: 1px solid var(--line); }
.metric:last-child { border-right: 0; }
.metric span { display: block; margin-bottom: 10px; color: var(--muted); font-size: 12px; }
.metric strong { display: block; font-size: 15px; overflow-wrap: anywhere; }
.command-band { min-height: 54px; display: grid; grid-template-columns: 120px minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 8px 24px; border-bottom: 1px solid var(--line); background: #e3e9ea; }
.command-band > span:first-child { color: var(--muted); font-size: 12px; }
code { color: #253941; font-family: Consolas, "Courier New", monospace; font-size: 12px; overflow-wrap: anywhere; }
.workspace-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 28px; padding: 8px 24px 32px; }
.panel { min-width: 0; padding: 22px 0 26px; border-bottom: 1px solid var(--line); }
.section-heading { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.section-heading span { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
.signal-list { display: grid; gap: 8px; margin: 0; padding: 0; list-style: none; }
.signal-list li { padding: 9px 12px; border-left: 3px solid var(--amber); background: #f4f6f6; font: 12px Consolas, monospace; overflow-wrap: anywhere; }
.fact-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; border-top: 1px solid var(--line); }
.fact-grid div { min-width: 0; padding: 12px 0; border-bottom: 1px solid var(--line); }
.fact-grid div:nth-child(odd) { padding-right: 16px; border-right: 1px solid var(--line); }
.fact-grid div:nth-child(even) { padding-left: 16px; }
dt { margin-bottom: 6px; color: var(--muted); font-size: 11px; }
dd { margin: 0; font-size: 13px; overflow-wrap: anywhere; }
.compact { margin-top: 18px; }
.path-value { display: block; min-height: 42px; padding: 10px 12px; border: 1px solid var(--line); background: #f4f6f6; }
.decision-reason { margin: 14px 0 0; color: var(--muted); font-size: 12px; line-height: 1.5; }
.count-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--line); }
.count-grid div { min-width: 0; padding: 12px 8px 12px 0; border-bottom: 1px solid var(--line); }
.count-grid span, .count-grid strong { display: block; overflow-wrap: anywhere; }
.count-grid span { margin-bottom: 6px; color: var(--muted); font-size: 11px; }
.count-grid strong { font-size: 18px; }
.route-data-panel { margin: 0 24px 32px; padding: 22px 0 0; border-top: 2px solid var(--ink); }
.route-toolbar { display: flex; align-items: end; justify-content: space-between; gap: 16px; margin: -2px 0 14px; }
.route-search { display: grid; gap: 5px; width: min(420px, 100%); color: var(--muted); font-size: 11px; }
.route-search input { width: 100%; min-height: 36px; padding: 7px 10px; border: 1px solid var(--line); border-radius: 3px; background: var(--panel); color: var(--ink); outline: none; }
.route-search input:focus { border-color: var(--cyan); box-shadow: 0 0 0 2px #d7eef1; }
.route-pager { display: flex; align-items: center; gap: 7px; }
.route-pager > span { min-width: 82px; color: var(--muted); font: 11px Consolas, monospace; text-align: right; }
.icon-button { width: 36px; min-width: 36px; padding: 0; font-size: 17px; }
.route-summary { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); margin: 0 0 14px; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: #f4f6f6; }
.route-summary[hidden] { display: none; }
.route-summary div { min-width: 0; padding: 10px 12px; border-right: 1px solid var(--line); }
.route-summary div:last-child { border-right: 0; }
.route-summary span, .route-summary strong { display: block; overflow-wrap: anywhere; }
.route-summary span { margin-bottom: 5px; color: var(--muted); font-size: 10px; }
.route-summary strong { font-size: 12px; }
.table-wrap { width: 100%; overflow-x: auto; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); background: var(--panel); }
table { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { min-width: 120px; max-width: 360px; padding: 10px 12px; border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); text-align: left; vertical-align: top; overflow-wrap: break-word; }
th:last-child, td:last-child { border-right: 0; }
th { position: sticky; top: 0; background: #e3e9ea; color: var(--muted); font-size: 11px; font-weight: 600; }
tbody tr:last-child td { border-bottom: 0; }
.empty-state { margin: 0; padding: 18px 12px; color: var(--muted); font-size: 12px; }
@media (max-width: 900px) {
  .app-shell { grid-template-columns: 1fr; }
  aside { position: static; height: auto; }
  nav { grid-template-columns: repeat(4, minmax(0, 1fr)); }
  nav a { border-left: 0; border-bottom: 3px solid transparent; text-align: center; }
  nav a[aria-current="page"] { border-left-color: transparent; border-bottom-color: #7bd2dc; }
  .aside-foot { display: none; }
}
@media (max-width: 680px) {
  .topbar { align-items: flex-start; padding: 14px 16px; }
  .topbar-actions { flex-direction: column; align-items: stretch; }
  .truth-strip, .workspace-grid { grid-template-columns: 1fr; }
  .metric { min-height: 68px; border-right: 0; border-bottom: 1px solid var(--line); }
  .command-band { grid-template-columns: 1fr; padding: 12px 16px; }
  .workspace-grid { padding: 6px 16px 24px; }
  .route-data-panel { margin: 0 16px 24px; }
  .route-toolbar { align-items: stretch; flex-direction: column; }
  .route-search { width: 100%; }
  .route-pager { justify-content: flex-end; }
  .route-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .route-summary div:nth-child(2n) { border-right: 0; }
  nav { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
`;

function dashboardRouteUrls() {
  return CONTROL_ROUTES.map((route) => `/control/${route}`);
}

function dashboardOutputDirectories() {
  return ["control", ...CONTROL_ROUTES.map((route) => `control/${route}`)];
}

function dashboardOutputFiles() {
  return [
    { path: "control/control.css", text: CONTROL_CSS },
    { path: "control/control.js", text: CONTROL_SCRIPT },
    ...CONTROL_ROUTES.map((route) => ({ path: `control/${route}/index.html`, text: page(route) }))
  ];
}

function summarizeDashboardInspections(inspections) {
  const unsafePaths = inspections
    .filter((inspection) => inspection.status !== "safe_to_execute")
    .slice(0, DASHBOARD_GENERATION_CONTRACT.max_reported_unsafe_paths)
    .map((inspection) => ({
      path: inspection.path,
      expected_kind: inspection.expected_kind,
      blocker: inspection.blocker
    }));
  return {
    inspection_summary: {
      planned_path_count: inspections.length,
      safe_existing_path_count: inspections.filter((inspection) => inspection.status === "safe_to_execute" && inspection.exists === true).length,
      safe_missing_path_count: inspections.filter((inspection) => inspection.status === "safe_to_execute" && inspection.exists === false).length,
      unsafe_path_count: inspections.filter((inspection) => inspection.status !== "safe_to_execute").length,
      unsafe_paths_truncated: unsafePaths.length < inspections.filter((inspection) => inspection.status !== "safe_to_execute").length
    },
    unsafe_paths: unsafePaths
  };
}

function summarizeDashboardWrites(files) {
  const fileFailures = files
    .filter((file) => file.status !== "safe_to_execute")
    .slice(0, DASHBOARD_GENERATION_CONTRACT.max_reported_file_failures);
  const failedFileCount = files.filter((file) => file.status !== "safe_to_execute").length;
  return {
    write_summary: {
      attempted_file_count: files.length,
      safe_file_count: files.filter((file) => file.status === "safe_to_execute").length,
      failed_file_count: failedFileCount,
      atomic_replace_file_count: files.filter((file) => file.atomic_replace === true).length,
      atomic_replace_attempt_count: files.reduce((total, file) => total + Number(file.atomic_replace_attempt_count || 0), 0),
      atomic_replace_retry_count: files.reduce((total, file) => total + Number(file.atomic_replace_retry_count || 0), 0),
      concurrent_retry_file_count: files.filter((file) => Number(file.atomic_replace_retry_count || 0) > 0).length,
      temporary_source_identity_verified_file_count: files.filter((file) => file.temporary_source_identity_verified === true).length,
      bytes_written_total: files.reduce((total, file) => total + Number(file.bytes_written || 0), 0),
      file_failures_truncated: fileFailures.length < failedFileCount
    },
    file_failures: fileFailures
  };
}

function failedDashboardGeneration(blockers, files = [], writesPerformed = false, inspections = []) {
  const inspectionReport = summarizeDashboardInspections(inspections);
  const writeReport = summarizeDashboardWrites(files);
  return {
    status: "manual_verification_required",
    contract: DASHBOARD_GENERATION_CONTRACT,
    routes: dashboardRouteUrls(),
    blockers: [...new Set(blockers)],
    ...inspectionReport,
    ...writeReport,
    planned_output_file_count: DASHBOARD_GENERATION_CONTRACT.output_file_count,
    output_file_count: writeReport.write_summary.safe_file_count,
    output_file_count_exact: true,
    atomic_replace: false,
    payload_exposed: false,
    writes_performed: writesPerformed
  };
}

function inspectDashboardPath(relativePath, projectRoot, expectedKind) {
  return inspectRepoPath(relativePath, { projectRoot, expectedKind });
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function pathMatchesFileIdentity(fullPath, expectedStats) {
  if (!expectedStats) return false;
  try {
    const currentStats = fs.lstatSync(fullPath);
    return currentStats.isFile()
      && !currentStats.isSymbolicLink()
      && sameFileIdentity(expectedStats, currentStats);
  } catch {
    return false;
  }
}

function unlinkIfSameFileIdentity(fullPath, expectedStats) {
  if (!pathMatchesFileIdentity(fullPath, expectedStats)) return false;
  try {
    fs.unlinkSync(fullPath);
    return true;
  } catch {
    return false;
  }
}

function waitForAtomicReplaceRetry(attempt) {
  const delay = Math.min(
    DASHBOARD_GENERATION_CONTRACT.max_atomic_replace_retry_delay_ms,
    DASHBOARD_GENERATION_CONTRACT.atomic_replace_retry_delay_ms * attempt
  );
  Atomics.wait(ATOMIC_REPLACE_WAIT_ARRAY, 0, 0, delay);
}

function writeAtomicDashboardFile(output, projectRoot) {
  const bytes = Buffer.byteLength(output.text, "utf8");
  const relativeParent = path.dirname(output.path).replace(/\\/g, "/");
  const fullPath = path.join(projectRoot, output.path);
  const parentInspection = inspectDashboardPath(relativeParent, projectRoot, "directory");
  const targetInspection = inspectDashboardPath(output.path, projectRoot, "file");
  if (
    bytes > DASHBOARD_GENERATION_CONTRACT.max_file_bytes
    || parentInspection.status !== "safe_to_execute"
    || parentInspection.exists !== true
    || targetInspection.status !== "safe_to_execute"
  ) {
    return {
      status: "manual_verification_required",
      path: output.path,
      bytes_written: 0,
      atomic_replace: false,
      blocker: bytes > DASHBOARD_GENERATION_CONTRACT.max_file_bytes
        ? "dashboard_output_file_exceeds_byte_limit"
        : "dashboard_output_file_not_safe",
      payload_exposed: false,
      writes_performed: false
    };
  }

  const tempPath = path.join(
    path.dirname(fullPath),
    `.${path.basename(fullPath)}.${process.pid}.${crypto.randomBytes(6).toString("hex")}.tmp`
  );
  let fileDescriptor;
  let tempExists = false;
  let createdTempStats = null;
  let atomicReplaceAttemptCount = 0;
  let atomicReplaceRetryCount = 0;
  try {
    fileDescriptor = fs.openSync(
      tempPath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW_FLAG,
      0o600
    );
    tempExists = true;
    fs.writeFileSync(fileDescriptor, output.text, "utf8");
    fs.fsyncSync(fileDescriptor);
    createdTempStats = fs.fstatSync(fileDescriptor);
    if (!createdTempStats.isFile() || createdTempStats.size !== bytes) {
      return {
        status: "manual_verification_required",
        path: output.path,
        bytes_written: 0,
        atomic_replace: false,
        atomic_replace_attempt_count: atomicReplaceAttemptCount,
        atomic_replace_retry_count: atomicReplaceRetryCount,
        temporary_source_identity_verified: false,
        blocker: "dashboard_output_temporary_source_verification_failed",
        payload_exposed: false,
        writes_performed: true
      };
    }
    fs.closeSync(fileDescriptor);
    fileDescriptor = undefined;

    while (atomicReplaceAttemptCount < DASHBOARD_GENERATION_CONTRACT.max_atomic_replace_attempts) {
      const recheckedParent = inspectDashboardPath(relativeParent, projectRoot, "directory");
      const recheckedTarget = inspectDashboardPath(output.path, projectRoot, "file");
      if (
        recheckedParent.status !== "safe_to_execute"
        || recheckedParent.exists !== true
        || recheckedTarget.status !== "safe_to_execute"
      ) {
        return {
          status: "manual_verification_required",
          path: output.path,
          bytes_written: 0,
          atomic_replace: false,
          atomic_replace_attempt_count: atomicReplaceAttemptCount,
          atomic_replace_retry_count: atomicReplaceRetryCount,
          temporary_source_identity_verified: false,
          blocker: "dashboard_output_file_not_safe",
          payload_exposed: false,
          writes_performed: true
        };
      }
      if (!pathMatchesFileIdentity(tempPath, createdTempStats)) {
        return {
          status: "manual_verification_required",
          path: output.path,
          bytes_written: 0,
          atomic_replace: false,
          atomic_replace_attempt_count: atomicReplaceAttemptCount,
          atomic_replace_retry_count: atomicReplaceRetryCount,
          temporary_source_identity_verified: false,
          blocker: "dashboard_output_temporary_source_changed",
          payload_exposed: false,
          writes_performed: true
        };
      }

      atomicReplaceAttemptCount += 1;
      try {
        fs.renameSync(tempPath, fullPath);
        tempExists = false;
        break;
      } catch (error) {
        const retryAllowed = TRANSIENT_ATOMIC_REPLACE_ERROR_CODES.has(error?.code)
          && atomicReplaceAttemptCount < DASHBOARD_GENERATION_CONTRACT.max_atomic_replace_attempts;
        if (!retryAllowed) throw error;
        atomicReplaceRetryCount += 1;
        waitForAtomicReplaceRetry(atomicReplaceAttemptCount);
      }
    }
    const written = inspectDashboardPath(output.path, projectRoot, "file");
    if (written.status !== "safe_to_execute" || written.exists !== true || written.bytes !== bytes) {
      return {
        status: "manual_verification_required",
        path: output.path,
        bytes_written: bytes,
        atomic_replace: false,
        atomic_replace_attempt_count: atomicReplaceAttemptCount,
        atomic_replace_retry_count: atomicReplaceRetryCount,
        temporary_source_identity_verified: true,
        blocker: "dashboard_output_post_replace_verification_failed",
        payload_exposed: false,
        writes_performed: true
      };
    }
    return {
      status: "safe_to_execute",
      path: output.path,
      bytes_written: bytes,
      atomic_replace: true,
      atomic_replace_attempt_count: atomicReplaceAttemptCount,
      atomic_replace_retry_count: atomicReplaceRetryCount,
      temporary_source_identity_verified: true,
      blocker: null,
      payload_exposed: false,
      writes_performed: true
    };
  } catch {
    return {
      status: "manual_verification_required",
      path: output.path,
      bytes_written: 0,
      atomic_replace: false,
      atomic_replace_attempt_count: atomicReplaceAttemptCount,
      atomic_replace_retry_count: atomicReplaceRetryCount,
      temporary_source_identity_verified: false,
      blocker: "dashboard_output_atomic_replace_failed",
      payload_exposed: false,
      writes_performed: tempExists
    };
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

export function generateDashboardRoutes(options = {}) {
  const projectRoot = path.resolve(options.projectRoot || PROJECT_ROOT);
  const directories = dashboardOutputDirectories();
  const outputs = dashboardOutputFiles();
  const rootInspection = inspectDashboardPath(".", projectRoot, "directory");
  const directoryInspections = directories.map((relativePath) => inspectDashboardPath(relativePath, projectRoot, "directory"));
  const fileInspections = outputs.map((output) => inspectDashboardPath(output.path, projectRoot, "file"));
  const inspections = [rootInspection, ...directoryInspections, ...fileInspections];
  if (rootInspection.status !== "safe_to_execute" || rootInspection.exists !== true) {
    return failedDashboardGeneration(["dashboard_project_root_not_safe"], [], false, inspections);
  }
  if (directoryInspections.some((inspection) => inspection.status !== "safe_to_execute")) {
    return failedDashboardGeneration(["dashboard_output_directory_not_safe"], [], false, inspections);
  }
  if (fileInspections.some((inspection) => inspection.status !== "safe_to_execute")) {
    return failedDashboardGeneration(["dashboard_output_file_not_safe"], [], false, inspections);
  }
  if (outputs.some((output) => Buffer.byteLength(output.text, "utf8") > DASHBOARD_GENERATION_CONTRACT.max_file_bytes)) {
    return failedDashboardGeneration(["dashboard_output_file_exceeds_byte_limit"], [], false, inspections);
  }

  let writesPerformed = false;
  for (const relativePath of directories) {
    let inspection = inspectDashboardPath(relativePath, projectRoot, "directory");
    if (!inspection.exists) {
      try {
        fs.mkdirSync(path.join(projectRoot, relativePath));
        writesPerformed = true;
      } catch (error) {
        if (error?.code !== "EEXIST") {
          return failedDashboardGeneration(["dashboard_output_directory_create_failed"], [], writesPerformed, inspections);
        }
      }
      inspection = inspectDashboardPath(relativePath, projectRoot, "directory");
    }
    if (inspection.status !== "safe_to_execute" || inspection.exists !== true) {
      return failedDashboardGeneration(["dashboard_output_directory_not_safe"], [], writesPerformed, inspections);
    }
  }

  const files = [];
  for (const output of outputs) {
    const written = writeAtomicDashboardFile(output, projectRoot);
    files.push(written);
    writesPerformed ||= written.writes_performed;
    if (written.status !== "safe_to_execute") {
      return failedDashboardGeneration([written.blocker], files, writesPerformed, inspections);
    }
  }
  const inspectionReport = summarizeDashboardInspections(inspections);
  const writeReport = summarizeDashboardWrites(files);
  return {
    status: "safe_to_execute",
    contract: DASHBOARD_GENERATION_CONTRACT,
    routes: dashboardRouteUrls(),
    blockers: [],
    ...inspectionReport,
    ...writeReport,
    planned_output_file_count: DASHBOARD_GENERATION_CONTRACT.output_file_count,
    output_file_count: files.length,
    output_file_count_exact: true,
    atomic_replace: true,
    payload_exposed: false,
    writes_performed: writesPerformed
  };
}

export function ensureDashboardRoutes(options = {}) {
  const generated = generateDashboardRoutes(options);
  if (generated.status !== "safe_to_execute") {
    const error = new Error(`Dashboard route generation blocked: ${generated.blockers.join(", ")}`);
    error.code = "PALA_DASHBOARD_GENERATION_BLOCKED";
    error.generation = generated;
    throw error;
  }
  return generated.routes;
}

export function dashboardState(db) {
  const routeGeneration = generateDashboardRoutes();
  const routes = routeGeneration.routes;
  const evidenceCount = db.prepare("SELECT COUNT(*) AS count FROM evidence").get().count;
  const decisionCount = db.prepare("SELECT COUNT(*) AS count FROM decisions").get().count;
  const mistakeCount = db.prepare("SELECT COUNT(*) AS count FROM mistakes").get().count;
  return {
    rule: "Frontend reads truth. It does not create truth.",
    routes,
    route_files: routes.map((route) => toProjectPath(path.join(PROJECT_ROOT, `${route.slice(1)}`, "index.html"))),
    route_generation: routeGeneration,
    data_sources: [".pala/db/pala.sqlite", ".pala/state", ".pala/ledger", ".pala/evidence", "docs/evidence"],
    counts: {
      evidence: evidenceCount,
      decisions: decisionCount,
      mistakes: mistakeCount
    },
    missing_data_states: ["Unknown", "Not checked", "Partial", "Blocked", "Manual verification required"]
  };
}
