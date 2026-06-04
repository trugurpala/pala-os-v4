# Pala OS Core Rules v28

## 1. Pala OS is not a coding agent

Pala OS controls, verifies, remembers, budgets, and audits AI coding work.

## 2. Agent does the work; Pala verifies the work

No result is accepted only because an agent said it is done.

## 3. No evidence, no PASS

Every completed task needs command output, exit code, changed files, evidence path, and dashboard-visible state.

## 4. Memory lives in repo-local systems

Prompt memory is not enough. Use SQLite DB, JSONL ledger, rules, memory files, and evidence.

## 5. Mistakes become rules only with approval

A captured mistake can propose a rule. It cannot silently become law.

## 6. Dashboard reads truth only

Dashboard cannot invent green states. Missing evidence stays Unknown/Not checked/Partial/Blocked.

## 7. No drift

README, docs, dashboard, package metadata, state, and evidence must stay aligned.

## 8. No push, publish, delete, or real config write without approval

`push-check` reports only. MCP setup is dry-run first. n8n activation is approval-gated.

## 9. Current source before critical decisions

Runtime, install, MCP paths, security, backtesting, and public release decisions need current references.

## 10. Token economy must be honest

Separate known tokens from estimated tokens. Include confidence. No fake exact cost.

## 11. Learn from strong projects without copying

OpenHands/OpenCode/WrongStack, Backstage, Langfuse/Helicone, official docs, Context7, OpenSSF and backtesting tools are benchmarks, not copy sources.

## 12. UI/Product tasks require Figma-first visual planning

For dashboard, landing, onboarding, pricing, product app, or admin UI: no UI code before visual plan, frames, components, responsive states, copy, evidence, and approval gate.
