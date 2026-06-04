-- Pala OS local database schema v28
-- Path: .pala/db/pala.sqlite
-- The database is local-first and must be gitignored.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  root_path_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  agent TEXT,
  goal TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('planned','running','blocked','failed','passed','partial','manual_verification_required')),
  risk_level TEXT NOT NULL DEFAULT 'unknown',
  model_observed TEXT,
  effort_observed TEXT,
  token_estimate INTEGER,
  token_confidence TEXT DEFAULT 'unknown',
  evidence_path TEXT,
  FOREIGN KEY(project_id) REFERENCES projects(id)
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  command TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  exit_code INTEGER,
  status TEXT NOT NULL,
  raw_log_path TEXT,
  changed_files_count INTEGER DEFAULT 0,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  command_id TEXT,
  kind TEXT NOT NULL,
  type TEXT,
  path TEXT NOT NULL,
  summary TEXT,
  sanitized INTEGER NOT NULL DEFAULT 0,
  is_public_safe INTEGER NOT NULL DEFAULT 0,
  redaction_status TEXT NOT NULL DEFAULT 'unknown',
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id),
  FOREIGN KEY(command_id) REFERENCES commands(id)
);

CREATE TABLE IF NOT EXISTS decisions (
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

CREATE TABLE IF NOT EXISTS mistakes (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  summary TEXT NOT NULL,
  root_cause TEXT,
  severity TEXT NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  prevent_next_time TEXT,
  status TEXT NOT NULL DEFAULT 'captured',
  linked_rule TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  mistake_id TEXT NOT NULL,
  lesson TEXT NOT NULL,
  proposed_rule TEXT,
  approved_by_user INTEGER NOT NULL DEFAULT 0,
  promoted_at TEXT,
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(mistake_id) REFERENCES mistakes(id)
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  decision_id TEXT,
  approval_type TEXT NOT NULL,
  approved INTEGER NOT NULL,
  approved_by TEXT,
  reason TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id),
  FOREIGN KEY(decision_id) REFERENCES decisions(id)
);

CREATE TABLE IF NOT EXISTS token_usage (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  command_id TEXT,
  model TEXT,
  effort TEXT,
  known_input_tokens INTEGER,
  known_output_tokens INTEGER,
  known_cached_tokens INTEGER,
  known_reasoning_tokens INTEGER,
  estimated_tokens INTEGER,
  confidence TEXT NOT NULL DEFAULT 'unknown',
  estimated_cost REAL,
  currency TEXT,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id),
  FOREIGN KEY(command_id) REFERENCES commands(id)
);

CREATE TABLE IF NOT EXISTS drift_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  checked_at TEXT NOT NULL,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  status TEXT NOT NULL,
  diff_summary TEXT,
  evidence_path TEXT,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS sync_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  checked_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  summary TEXT,
  evidence_path TEXT,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS push_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  checked_at TEXT NOT NULL,
  status TEXT NOT NULL,
  blockers_json TEXT NOT NULL DEFAULT '[]',
  evidence_path TEXT,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS mcp_config_checks (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  client TEXT NOT NULL,
  scope TEXT,
  action TEXT NOT NULL,
  dry_run INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL,
  existing_servers_preserved INTEGER NOT NULL DEFAULT 1,
  config_path_redacted TEXT,
  proposed_diff_json TEXT,
  evidence_path TEXT,
  checked_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

CREATE TABLE IF NOT EXISTS reference_sources (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,
  last_checked_at TEXT,
  status TEXT NOT NULL DEFAULT 'not_checked',
  freshness_status TEXT NOT NULL DEFAULT 'not_checked',
  lesson TEXT,
  pala_decision TEXT,
  risk TEXT,
  evidence_path TEXT
);

CREATE TABLE IF NOT EXISTS quality_findings (
  id TEXT PRIMARY KEY,
  run_id TEXT,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  summary TEXT NOT NULL,
  file_path TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  evidence_path TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES runs(id)
);

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

CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
CREATE INDEX IF NOT EXISTS idx_commands_run ON commands(run_id);
CREATE INDEX IF NOT EXISTS idx_decisions_run ON decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_mistakes_category ON mistakes(category);
CREATE INDEX IF NOT EXISTS idx_reference_category ON reference_sources(category);
