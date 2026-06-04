# Reference Radar

Checked on 2026-06-04. References are lessons only; no copying.

| Category | Current References | Pala Decision |
|---|---|---|
| Claude Code runtime | [Overview](https://code.claude.com/docs/en/overview), [memory](https://code.claude.com/docs/en/memory), [hooks](https://code.claude.com/docs/en/hooks), [settings](https://code.claude.com/docs/en/settings), [MCP](https://code.claude.com/docs/en/mcp), [skills](https://code.claude.com/docs/en/slash-commands), [subagents](https://code.claude.com/docs/en/sub-agents), [model config](https://code.claude.com/docs/en/model-config) | Follow current scopes and limits; never invent model identity or config paths. |
| Coding agents | OpenHands, OpenCode, WrongStack | Pala controls and verifies agents; it does not replace them. |
| Developer portal / local control surface | Backstage, OpenHands Local GUI | Dashboard acts as a local control tower backed by stored truth. |
| Token/cost observability | Langfuse, Helicone | Exact, estimated, and unknown usage stay separate with confidence. |
| Public security | OpenSSF Scorecard, GitHub community/security docs | Security readiness is a gate, not marketing. |
| Backtesting | vectorbt, backtesting.py, backtrader | Trading claims require assumptions, limitations, and evidence. |

Machine-readable state: `.pala/state/reference-radar-state.json`
Append-only refresh ledger: `.pala/ledger/reference-refresh.jsonl`

## Bounded Refresh Queue

```bash
npm run pala -- benchmark-refresh --dry-run
```

The local-only plan reports `age_days`, category-specific `max_age_days`,
priority, explicit `stale_reasons`, category coverage gaps, and a bounded
`refresh_queue`. Fast-changing AI-agent, MCP, and token-economy sources use a
30-day threshold; other categories use 90 days.

The command performs no external fetch and no source is marked fresh
automatically. An official-source recheck and new evidence are required before
stored freshness can change.

The machine-readable state is written through
`bounded_project_contained_single_handle_state_json_with_atomic_replace`.
Unsafe, oversized, or junction-backed targets block the write, and the
append-only refresh ledger is updated only after the atomic state replace
succeeds. The command exposes payload-free `state_io` metadata.

Ledger append truth follows `state_then_ledger_with_explicit_append_outcome`
and `not_attempted_confirmed_or_unknown_after_attempt`. The result reports
`ledger_write_attempted` and `ledger_write_outcome`. A non-empty returned
ledger path is required for `confirmed`; any append exception or missing path
becomes payload-free `unknown_after_attempt` with blocker
`reference_refresh_ledger_write_outcome_unknown`. This avoids claiming that a
record was definitely absent when an append may have completed before a close
failure.
