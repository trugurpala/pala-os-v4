# 02 — World First / Current Source / Benchmark Gate

Before writing standards, check current references.

Minimum rule:

- critical decision requires at least 2 current references
- no current source = no decision
- no benchmark = no standard
- no reference dashboard = no PASS

Reference categories:

- AI coding agents: OpenCode, OpenHands, WrongStack
- MCP installer: Context7, Claude Code MCP docs, Cursor MCP docs
- Local control tower: Backstage, OpenHands GUI, GitHub Agent HQ if available
- Token economy: Langfuse, Helicone or current OSS equivalent
- Backtesting: vectorbt, backtesting.py, backtrader
- Public GitHub readiness: OpenSSF Scorecard, GitHub Community docs, GitHub Security Advisories
- UI/UX skill systems: ui-ux-pro-max-skill, shadcn/ui, Material Design, Apple HIG or current equivalent

Create/update:

- `docs/evidence/current-sources.md`
- `docs/evidence/benchmark-index.md`
- `.pala/state/benchmark-state.json`
- `/control/references`
- `/control/benchmarks`
