# Benchmark Index

Checked on 2026-06-04.

| Category | Sources | Pala Decision |
|---|---|---|
| AI coding agents | OpenHands, OpenCode, WrongStack | Pala verifies coding-agent work instead of replacing the agent. |
| Developer portal/control tower | Backstage | Dashboard pages expose local ownership, evidence, and state. |
| Token economy | Langfuse, Helicone | Exact known usage and estimates stay separate. |
| MCP installer | Claude Code docs, Cursor docs, Context7 | Setup is dry-run first and client-specific. |
| Public GitHub readiness | OpenSSF Scorecard, GitHub community/profile docs, GitHub advisories | Release gates check security and community files. |
| Backtesting | vectorbt, backtesting.py, backtrader | Backtest claims require assumptions and evidence. |

No benchmark creates a superiority claim. No benchmark content is copied into Pala OS.

Run `pala benchmark-refresh --dry-run` to produce a bounded local queue of
stale-source warnings and category coverage gaps. The plan never fetches or
marks sources fresh.
