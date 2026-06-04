# PALA OS v28 — PASTE INTO ANY AI CODING AGENT

You are inside PROJECT_ROOT.

Build Pala OS as a local-first control/evidence layer for AI/vibe coding agents.

Pala OS is NOT a coding agent. Do not position it as a coding agent.

Core line:

```txt
Agent does the work. Pala OS verifies the work.
```

## Non-negotiable rules

- PROJECT_ROOT = current working directory.
- Do not hardcode personal local paths in public files.
- No push.
- No publish.
- No deletion.
- No real MCP config write.
- No n8n activation.
- No secrets in DB, ledger, evidence, docs, or screenshots.
- No fake PASS.
- No exact token cost if estimated.
- No cost-saving claim without before/after evidence.

## Phase order

### Phase 0 — Read session pack

Read:

```txt
CLAUDE.md
AGENTS.md
REVIEW.md
.pala/bootstrap/*
.pala/rules/*
docs/architecture/* if present
```

Return a short implementation plan before mutating large sections.

### Phase 1 — Mini-kernel

Create/verify:

```txt
.pala/rules
.pala/state
.pala/ledger
.pala/memory
.pala/evidence
.pala/evidence/raw
.pala/archive
docs/evidence
.pala/schema
```

Create/verify core files:

```txt
.pala/rules/core-rules.md
.pala/rules/local-persistence-policy.md
.pala/rules/mistake-to-rule-policy.md
.pala/rules/decision-engine-policy.md
.pala/rules/claude-code-memory-policy.md
.pala/rules/reference-radar.yaml
.pala/state/project-state.json
.pala/state/control-tower-state.json
.pala/ledger/events.jsonl
.pala/ledger/handoffs.jsonl
.pala/ledger/decisions.jsonl
.pala/ledger/mistakes.jsonl
.pala/ledger/token-economy.jsonl
.pala/memory/mistake-registry.jsonl
.pala/memory/lessons-learned.md
.pala/schema/001_init.sql
```

### Phase 2 — Local DB memory

Implement local SQLite support.

Required files/contracts:

```txt
src/lib/db.ts
src/lib/ledger.ts
src/lib/evidence.ts
src/lib/memory.ts
src/lib/redaction.ts
src/lib/decision-engine.ts
src/lib/token-economy.ts
```

Required CLI commands:

```txt
pala db init
pala db status
pala status
pala memory check
pala memory list
pala memory add-mistake
pala memory promote-rule --dry-run
pala memory sync-claude --dry-run
```

DB path:

```txt
.pala/db/pala.sqlite
```

The DB file must be gitignored.

### Phase 3 — Decision engine

Implement commands that record decisions:

```txt
pala plan --goal "..."
pala token-budget --goal "..."
pala reference-check
pala benchmark-check
pala stop-if-risk
pala next-actions
```

Every decision must output one of:

```txt
blocked
needs_approval
dry_run_only
safe_local_write
manual_verification_required
pass_allowed
```

Each decision must write:

- SQLite decision row
- `.pala/ledger/decisions.jsonl`
- evidence file or raw log reference

### Phase 4 — Vibe coder console workflow

Add CLI/support for three moments:

Before coding:

```txt
pala status
pala memory check
pala plan --goal "..."
pala token-budget --goal "..."
pala reference-check
```

While coding:

```txt
pala dashboard-state
pala evidence last
pala drift-check --quick
pala token-economy
pala next-actions
```

After coding:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```

### Phase 5 — Dashboard/control tower skeleton

Create local dashboard pages/routes:

```txt
/control/overview
/control/evidence
/control/decisions
/control/memory
/control/mistakes
/control/token-economy
/control/drift
/control/sync
/control/push-readiness
/control/mcp-installer
/control/references
/control/quality-radar
/control/architecture
```

Dashboard rule:

```txt
Frontend reads truth. It does not create truth.
```

If data missing, show:

```txt
Unknown / Not checked / Partial / Blocked / Manual verification required
```

### Phase 6 — MCP installer safe dry-run

Implement:

```txt
pala setup --repair --dry-run --all
pala mcp-smoke --dry-run
```

Do not modify real MCP configs.
Use temp HOME/USERPROFILE/APPDATA/XDG_CONFIG_HOME fixtures in tests.
Preserve existing MCP servers.

### Phase 7 — Quality and release gates

Implement:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala dashboard-truth-check
pala docs-honesty-check
pala public-readiness-check
```

`push-check` reports only. It never pushes.

### Phase 8 — Evidence and final proof

Run safe commands and return:

| Command | Exit Code | Result | Raw Log |
|---|---:|---|---|

Also return:

- created/changed files
- DB status
- at least one run record
- at least one decision record
- a real mistake record only when a real mistake was captured; otherwise an explicit empty state
- dashboard pages reading from DB/state/evidence
- blockers
- next phase proposal

## Competitor/reference learning loop

Add benchmark/reference categories from `.pala/rules/reference-radar.yaml`.

Learn from:

- OpenHands / OpenCode / WrongStack as AI coding agent benchmarks
- Backstage as developer portal/control tower benchmark
- Langfuse / Helicone or current OSS equivalent as token economy benchmarks
- Claude Code / Cursor official docs and Context7 as MCP installer references
- OpenSSF Scorecard and GitHub community/security docs as public GitHub readiness references
- vectorbt / backtesting.py / backtrader as backtesting references

Do not copy code, copy, branding, UI text, or package names.
Extract lessons only.

## Final response format

```md
## v28 Execution Result

### Status Table
| Area | Status | Evidence |
|---|---|---|

### Created/Changed Files
- ...

### Commands Run
| Command | Exit Code | Result | Raw Log |
|---|---:|---|---|

### DB Status
- ...

### Memory / Mistake Status
- ...

### Dashboard Contract
- ...

### Blockers
- ...

### Next Step
- ...
```


## Additional note for non-Claude agents

If you are Cursor, Codex, OpenCode, or another coding agent, use `AGENTS.md` as the agent contract and treat `CLAUDE.md` as Claude-specific context, not as your only rule source.
