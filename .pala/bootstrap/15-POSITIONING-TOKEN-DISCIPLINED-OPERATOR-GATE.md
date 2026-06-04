# 15 — Positioning + Token-Disciplined Operator Gate

This gate locks Pala OS positioning and token-economy language.

## Core truth

Pala OS is not a coding agent.
Pala OS is the local control tower and operating layer for AI/vibe coding agents.

It helps Claude Code, Cursor, Codex, and other agents behave like disciplined senior operators by enforcing:

- memory through `.pala/rules`, `.pala/state`, `.pala/ledger`, `.pala/evidence`
- evidence through command output, exit code, raw logs, changed files, and risk status
- token economy through known/estimated usage tracking
- dashboard visibility through `/control` pages
- drift checks across README, docs, panel, package metadata, examples, and state
- push readiness without automatic push
- safe MCP setup without touching real configs in tests
- benchmark/reference freshness before standards
- no-fake-done rules

## Approved public copy

Use:

> Pala OS turns AI coding agents into evidence-driven, memory-aware, cost-aware, dashboard-visible operators.

Use:

> Agent does the work. Pala OS verifies the work.

Use:

> Stop trusting "done". Require evidence.

Do not use:

- best coding agent
- God mode
- ultimate
- world's best
- unstoppable autopilot
- unlimited autonomy
- guaranteed viral
- star magnet
- any claim not backed by evidence

## Internal marketing analogy

Allowed only in launch/marketing drafts, not as technical truth:

> Make your AI coding agent work like a disciplined high-value operator — with evidence, memory, cost tracking, and a local control tower.

## Required files

Create/update:

```txt
docs/product/positioning.md
docs/product/public-copy.md
docs/evidence/positioning-check.md
.pala/state/project-state.json
.pala/rules/core-rules.md
```

## Dashboard requirements

`/control/overview` must show:

```txt
Agent does the work. Pala OS verifies the work.
```

`/control/token-economy` must show:

- exact known usage if available
- estimated usage if exact unavailable
- confidence level
- source of measurement
- no fake exact cost
- no savings claim without before/after evidence

## CLI requirements

Add/check commands:

```bash
pala positioning-check
pala copy-check
pala token-economy
pala token-economy --json
pala token-language-check
```

If not implemented yet, command stubs must be honest and write evidence/TODO.

## Acceptance

PASS is forbidden unless:

```txt
README does not call Pala OS a coding agent
docs/product/positioning.md exists
dashboard overview shows the correct positioning
exact vs estimated token usage are separate
copy-check blocks hype claims
no fake token/cost numbers
```
