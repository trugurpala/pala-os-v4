# PALA OS v28 — CLAUDE CODE CODE BÖLÜMÜNE YAPIŞTIR

You are inside PROJECT_ROOT.

Your job: build Pala OS from this session pack as a local-first control/evidence/memory layer for AI/vibe coding agents.

Pala OS is NOT a coding agent.

Core line:

```txt
Agent does the work. Pala OS verifies the work.
```

## 0) Claude Code runtime alignment — do not guess

Before major implementation, verify the local runtime in read-only mode:

```bash
claude --version || true
node --version || true
npm --version || true
git --version || true
```

If interactive commands are available, inspect:

```txt
/status
/model
/effort
/mcp
```

Do not hardcode a model name. The operator may be using Opus 4.8 Max, Opus alias, Sonnet, or another account/provider default. Adapt to the active Claude Code runtime.

If the user explicitly says Opus 4.8 Max, treat it as the intended reasoning mode, but still verify support before claiming it.

Recommended operator mode for this build:

```txt
/model opus
/effort max
```

If `/effort max` or Opus is unavailable, continue with the highest supported mode and record it in evidence.

## 1) Non-negotiable project rules

- PROJECT_ROOT = current working directory.
- No hardcoded personal local paths in public files.
- No push.
- No publish.
- No deletion.
- No real MCP config write.
- No real n8n activation.
- No secrets in DB, ledger, evidence, docs, screenshots, examples, or dashboard state.
- No fake PASS.
- No exact token cost if estimated.
- No cost-saving claim without before/after evidence.
- No external repo/code/branding/copy copying. Reference only, learn only, cite in evidence.
- Dashboard must read real DB/state/ledger/evidence only.
- Frontend may not invent green status.
- Backend command may not report success without DB/ledger/evidence.

## 2) Read these files first

Read before coding:

```txt
CLAUDE.md
AGENTS.md
REVIEW.md
V28-NE-DEGISTI.md
.pala/bootstrap/*
.pala/rules/*
docs/architecture/full-system-from-zero.md
docs/architecture/claude-code-limits-and-pala-response.md
docs/architecture/operator-console-flow.md
docs/architecture/data-memory-recording-contract.md
docs/claude-code/OPUS-4-8-MAX-RUNBOOK.md
docs/claude-code/MEMORY-HOOKS-SKILLS-SUBAGENTS-MCP.md
docs/evidence/v28-web-research.md
```

Then return:

```md
## Startup Verification
| Check | Result | Evidence |
|---|---|---|

## Build Plan
| Phase | Scope | Exit Criteria |
|---|---|---|

## Blockers / Assumptions
- ...
```

Do not implement large sections before returning this plan.

## 3) Final implementation order

Follow this order. Do not jump ahead.

### Phase A — Official/source compatibility gate

Create/update:

```txt
docs/evidence/official-compatibility-check.md
docs/evidence/v28-web-research.md
.pala/state/reference-radar-state.json
.pala/ledger/reference-refresh.jsonl
```

Record:

- Claude Code version
- Active model/effort if discoverable
- Node/npm versions
- Whether project skills, agents, settings and hooks are usable
- Whether MCP commands are available
- Current blockers

### Phase B — Mini-kernel and persistence

Create/verify:

```txt
.pala/rules
.pala/state
.pala/ledger
.pala/memory
.pala/evidence
.pala/evidence/raw
.pala/archive
.pala/db
.pala/schema
docs/evidence
```

Create/verify:

```txt
.pala/schema/001_init.sql
.pala/rules/core-rules.md
.pala/rules/local-persistence-policy.md
.pala/rules/mistake-to-rule-policy.md
.pala/rules/decision-engine-policy.md
.pala/rules/claude-code-limits-policy.md
.pala/rules/model-effort-token-policy.md
.pala/rules/operator-console-usage-policy.md
.pala/rules/current-source-reference-law.md
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
```

### Phase C — Node + TypeScript CLI skeleton

Build Node + TypeScript CLI for the public developer UX.

Required files:

```txt
package.json
tsconfig.json
src/cli.ts
src/lib/paths.ts
src/lib/redaction.ts
src/lib/evidence.ts
src/lib/ledger.ts
src/lib/db.ts
src/lib/memory.ts
src/lib/decision-engine.ts
src/lib/token-economy.ts
src/lib/reference-radar.ts
src/lib/drift.ts
src/lib/sync.ts
src/lib/push-readiness.ts
src/lib/mcp-dry-run.ts
src/lib/quality-radar.ts
src/commands/*
test/* or tests/*
```

Minimum commands:

```txt
pala --help
pala status
pala panel
pala db init
pala db status
pala memory check
pala memory list
pala memory add-mistake
pala memory promote-rule --dry-run
pala plan --goal "..."
pala token-budget --goal "..."
pala token-economy
pala evidence last
pala drift-check
pala sync-check
pala push-check
pala verify
pala quality-radar
pala reference-check
pala reference-refresh --dry-run
pala setup --repair --dry-run --all
```

Every command must:

- Return a clear status.
- Print exit code semantics.
- Write or reference evidence.
- Append a ledger event.
- Never fake PASS.

### Phase D — Local DB memory

Implement SQLite migration.

Required tables:

```txt
projects
runs
commands
evidence
decisions
mistakes
lessons
approvals
token_usage
drift_checks
sync_checks
push_checks
mcp_config_checks
reference_sources
quality_findings
operator_sessions
model_effort_observations
```

Rules:

- `.pala/db/pala.sqlite` is local and gitignored.
- DB stores app state and dashboard query data.
- JSONL ledger is append-only recovery/audit trail.
- Public docs/evidence are sanitized summaries only.
- Raw logs go under `.pala/evidence/raw/` and are gitignored.

### Phase E — Decision engine

Decision engine input:

```txt
goal
risk level
current source status
memory/mistake hits
token budget
required evidence
permission impact
MCP/config impact
UI/Figma gate impact
public release impact
```

Decision outputs:

```txt
blocked
needs_approval
dry_run_only
safe_local_write
manual_verification_required
pass_allowed
```

Never let the decision engine approve:

- push
- publish
- deletion
- secret exposure
- real MCP config write
- n8n activation
- fake dashboard green

### Phase F — Dashboard / Control Tower

Build a local dashboard skeleton that reads real DB/state/evidence.

Required pages:

```txt
/control/overview
/control/evidence
/control/commands
/control/decisions
/control/memory
/control/mistakes
/control/token-economy
/control/drift
/control/sync
/control/push-readiness
/control/mcp
/control/references
/control/quality-radar
/control/architecture
/control/next-actions
```

Rules:

- Dashboard does not create truth.
- Dashboard renders DB/state/ledger/evidence truth.
- Missing evidence = Unknown / Not checked / Manual verification required.
- No manual fake green cards.

### Phase G — Claude Code integration within limits

Create Claude Code project assets only after Phase A proves compatibility:

```txt
.claude/settings.json
.claude/settings.recommended-after-smoke.json
.claude/hooks/pretooluse-guard.mjs
.claude/skills/pala-operator/SKILL.md
.claude/skills/pala-final-verify/SKILL.md
.claude/agents/pala-architect.md
.claude/agents/pala-backend-engineer.md
.claude/agents/pala-frontend-engineer.md
.claude/agents/pala-qa-evidence-reviewer.md
.claude/agents/pala-security-mcp-guard.md
```

Important:

- CLAUDE.md and auto memory are context, not enforcement.
- Enforce blockers with CLI checks, permissions, tests, and hooks where compatible.
- Keep skills short; large docs stay in supporting files to reduce token cost.
- Subagents are helpers; final PASS still requires Pala verification.

### Phase H — MCP dry-run repair

Implement only safe planning at MVP.

Do not modify real configs.

For tests use temp fixtures:

```txt
HOME
USERPROFILE
APPDATA
XDG_CONFIG_HOME
```

Dry-run must show:

- discovered config files
- backup plan
- exact proposed JSON diff
- preserve existing servers
- secret redaction
- manual approval requirement

### Phase I — Reference radar and competitor lessons

Use references only as lessons. Do not copy.

Reference categories:

```txt
Claude Code official docs
OpenHands
OpenCode
Backstage
Langfuse
Helicone
OpenSSF Scorecard
GitHub public/community/security readiness docs
Context7 / MCP installer patterns
vectorbt / backtesting.py / backtrader for trading adapters
```

Store:

```txt
docs/evidence/reference-radar.md
docs/evidence/competitor-lessons.md
.pala/state/reference-radar-state.json
.pala/ledger/reference-refresh.jsonl
```

### Phase J — Vibe coder console flow

Implement commands for real usage during coding:

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
pala evidence last
pala drift-check --quick
pala token-economy
pala next-actions
```

After agent says done:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```

### Phase K — Public GitHub readiness

Create honest open-source-ready files:

```txt
README.md
LICENSE recommendation file
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
SUPPORT.md
GOVERNANCE.md
ROADMAP.md
CHANGELOG.md
.github/ISSUE_TEMPLATE/*
.github/PULL_REQUEST_TEMPLATE.md
.github/workflows/ci.yml
.github/workflows/security.yml
.github/workflows/docs-drift.yml
.github/workflows/scorecard.yml
```

If npm/PyPI not published, README must say:

```txt
NPM package is not published yet.
PyPI package is not published yet.
Use local/dev install for now.
```

## 4) Acceptance criteria

Do not claim completion until these work or are honestly blocked:

```txt
npm run pala -- --help
npm run pala -- status
npm run pala -- db init
npm run pala -- db status
npm run pala -- memory check
npm run pala -- plan --goal "test goal"
npm run pala -- drift-check
npm run pala -- sync-check
npm run pala -- push-check
npm run pala -- verify
npm run pala -- setup --repair --dry-run --all
npm run check
npm test
```

Return final response exactly like this:

```md
# Pala OS v28 Build Result

## Status
PASS / PARTIAL / BLOCKED

## Created / Changed Files
- ...

## Commands Run
| Command | Exit Code | Result | Raw Log |
|---|---:|---|---|

## DB Status
- ...

## Evidence
- ...

## Risks / Blockers
- ...

## What a vibe coder does next
- ...
```

No vague “done”. No evidence = no PASS.
