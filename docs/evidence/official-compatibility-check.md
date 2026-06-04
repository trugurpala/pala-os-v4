# Official Compatibility Check

Checked: 2026-06-04T11:45:20.971Z

Process observation policy:
`bounded_fixed_command_process_metadata_with_redacted_first_line`. Each fixed local command has a
5000 ms timeout and 64000
byte stdout/stderr budget. Only a redacted first-line summary is stored; raw
stdout and stderr are never returned or written to evidence.

| Check | Result |
|---|---|
| `claude --version` | exit 0: 2.1.153 (Claude Code) |
| `node --version` | exit 0: v24.14.1 |
| `npm.cmd --version` | exit 0: 11.11.0 |
| `git --version` | exit 0: git version 2.54.0.windows.1 |
| `claude mcp --help` | exit 0: Usage: claude mcp [options] [command] |
| Active agent surface | codex-desktop (environment_marker) |
| Active model | unknown |
| Active effort | unknown |
| Interactive slash commands | manual_verification_required |
| Project Claude assets | safe_to_execute |

Installed CLIs are compatibility evidence, not proof that they are the active
agent surface. Model and effort remain Unknown unless observed from the runtime
or environment. No model version is claimed from a user prompt alone.
