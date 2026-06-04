# Strongest Available Model / Max Effort Runbook

The filename is preserved for compatibility with the supplied v28 session pack. It is not proof that Opus 4.8 exists or is active.

## Verify First

Inside an interactive Claude Code session, inspect:

```txt
/status
/model
/effort
```

Use the strongest available planning mode only when architecture, migration, security, or final review needs it. Use a cheaper execution mode when the plan is stable and the task is repetitive.

## Important

- Do not assume a specific Opus version from a prompt or filename.
- Do not assume `max` is active; verify it in the runtime.
- `max` effort can spend substantially more tokens and is session-only in current official documentation.
- Record model and effort with source and confidence.

## Pala Record

```txt
observed_model
observed_effort
source: status/model/environment/user_claim/unknown
confidence: high/medium/low
```

If unknown, the dashboard says `Unknown`, not a model name.
