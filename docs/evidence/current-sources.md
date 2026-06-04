# Current Sources Evidence

Checked on 2026-06-04. These are benchmark/reference inputs only. Pala OS does not copy source code, branding, UI copy, package names, or claims from these projects.

## AI Coding Agents

- [OpenHands](https://github.com/OpenHands/OpenHands): coding agents need observable tool use, execution environments, and task loops.
- [OpenCode](https://github.com/sst/opencode): terminal-native agent workflows need permission-aware local operation.
- [WrongStack](https://wrongstack.com/): agent autonomy still needs visible permissions and state.

Pala lesson: Pala OS stays above coding agents as a control/evidence layer.

## Developer Portal / Control Tower

- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/): ownership, metadata, and discoverable state are central control-tower ideas.
- [OpenHands Local GUI](https://docs.openhands.dev/overview/introduction): a local GUI can combine a REST API and single-page application while keeping agent operation visible.

Pala lesson: local dashboard pages should expose stored truth from DB/state/evidence.

## Token Economy

- [Langfuse token and cost tracking](https://langfuse.com/docs/model-usage-and-cost): usage and cost fields must be explicit.
- [Helicone cost tracking](https://docs.helicone.ai/guides): cost observability needs clear source and calculation confidence.

Pala lesson: separate exact known tokens from estimates, confidence, and source.

## MCP Installer

- [Claude Code MCP docs](https://code.claude.com/docs/en/mcp): MCP setup is client-specific and should be verified from current docs.
- [Cursor MCP docs](https://docs.cursor.com/context/model-context-protocol): IDE MCP config has its own surface and scope.
- [Context7 docs](https://context7.com/docs): current, version-specific docs reduce stale API decisions.

Pala lesson: MCP setup defaults to dry-run, backup, and preservation of unrelated servers.

## Public GitHub Readiness

- [OpenSSF Scorecard](https://github.com/ossf/scorecard): public repos benefit from repeatable security-health checks.
- [GitHub community profile docs](https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/accessing-a-projects-community-profile): contribution health files should be visible.
- [GitHub Advisory Database docs](https://docs.github.com/en/code-security/security-advisories/working-with-global-security-advisories-from-the-github-advisory-database/browsing-security-advisories-in-the-github-advisory-database): vulnerability advisory workflows should be documented.

Pala lesson: public-readiness checks must cover community, security, and honesty files.

## Backtesting References

- [vectorbt](https://vectorbt.dev/): backtesting claims need transparent assumptions and reproducible evidence.
- [backtesting.py API docs](https://kernc.github.io/backtesting.py/doc/backtesting/): execution timing and model constraints matter.
- [backtrader docs](https://www.backtrader.com/docu/): strategy/data/analyzer boundaries help avoid fake performance claims.

Pala lesson: trading and Pine examples need disclaimers, assumptions, and command evidence.
