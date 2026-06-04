# Pala OS

Local Control Tower for AI/Vibe Coding.

Stop trusting "done". Require evidence.

Pala OS is not a coding agent. It is a local-first control, evidence, memory, token, and dashboard layer for AI/vibe coding agents such as Claude Code, Cursor, Codex, OpenCode, and OpenHands.

Agent does the work. Pala OS verifies the work.

## Current Status

This repository is a v28 local session pack with an executable CLI and evidence skeleton.

NPM package is not published yet.
PyPI package is not published yet.
Use local/dev install for now.

## Quickstart

```bash
npm run pala -- db init
npm run pala -- runtime-check
npm run pala -- status
npm run pala -- plan --goal "verify this change"
npm run pala -- token-budget --goal "verify this change"
npm run pala -- reference-check
npm run pala -- reference-refresh --dry-run
npm run pala -- benchmark-refresh --dry-run
npm run pala -- decision-review --strict
npm run pala -- admin-check --strict
npm run pala -- worker-check --strict
npm run pala -- skills-check
npm run pala -- external-skills-refresh
npm run pala -- verify
npm run verify
npm test
```

The CLI writes local runtime data to:

- `.pala/db/pala.sqlite` for local SQLite state
- `.pala/ledger/*.jsonl` for append-only audit events
- `.pala/evidence/raw/*` for raw command logs
- `docs/evidence/*` for public-safe summaries

The SQLite DB, runtime state, local ledgers, archives, and raw evidence logs
are gitignored. Public-safe summaries live under `docs/evidence/*`.

The dedicated local worker currently supports only a fixed, bounded,
read-only smoke-check. `pala worker-check --strict` verifies the real
subprocess contract without starting a workload; see `docs/WORKER.md`.

`pala admin-check --strict` observes the current standard/elevated token
without requesting elevation or authorizing later actions; see `docs/ADMIN.md`.

## Dashboard

Run:

```bash
npm run panel
```

Then open `http://127.0.0.1:4173/control/overview/`. The read-only local
server exposes `/api/state` from `.pala/state/dashboard-state.json`; dashboard
routes render that snapshot plus bounded route-specific read-only SQLite
queries from `/api/route/<route>`. Route tables support bounded local search
and pagination without write routes. Frontend reads truth; it does not create
truth.

Missing data must stay `Unknown`, `Not checked`, `Partial`, `Blocked`, or `Manual verification required`.

## Safety Model

- No fake PASS.
- No push from `push-check`.
- No package publish claim without evidence.
- No deletion workflow without explicit approval.
- No real MCP config write without explicit approval and backup.
- No n8n activation without explicit approval.
- No exact token or cost claim unless measured.
- Model and effort remain `Unknown` unless observed from the active runtime.

## Public Readiness

Use these local gates before any release:

```bash
npm run pala -- docs-honesty-check
npm run pala -- public-readiness-check
npm run pala -- workflow-check --strict
npm run pala -- dashboard-truth-check
npm run pala -- push-check
```

They report local evidence only; they do not publish or push.
