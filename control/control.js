"use strict";

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
    strong.textContent = value && typeof value === "object" ? JSON.stringify(value) : valueOrUnknown(value);
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
