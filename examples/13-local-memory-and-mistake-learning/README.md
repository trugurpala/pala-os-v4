# Example 13 — Local Memory and Mistake Learning

## Scenario

A coding agent makes a wrong assumption about a tool install method or config path.

## Pala flow

```txt
pala memory add-mistake --interactive
pala memory check --category official-compatibility
pala memory promote-rule --dry-run
pala memory sync-claude --dry-run
```

## Expected result

- Mistake is added to DB and ledger.
- Sanitized entry appears in `.pala/memory/mistake-registry.jsonl`.
- A lesson is proposed.
- Rule promotion is only a dry-run until approved.
- Future similar tasks are blocked or warned before execution.
