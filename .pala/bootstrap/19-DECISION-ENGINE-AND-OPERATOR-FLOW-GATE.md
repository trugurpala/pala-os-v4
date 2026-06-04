# 19 — Decision Engine and Operator Flow Gate

Pala OS must explain how backend, frontend, worker, MCP installer, and dashboard connect.

## Decision engine pipeline

```txt
Goal
↓
Memory check
↓
Current source / benchmark check
↓
Risk and permission check
↓
Token budget and confidence check
↓
Skill / playbook selection
↓
Dry-run plan
↓
Approval gate if needed
↓
Execution inside PROJECT_ROOT only
↓
Evidence write
↓
Verification gates
↓
Lesson / mistake update
↓
Dashboard state refresh
```

## Decision outputs

Every decision must produce one of:

- `blocked`
- `needs_approval`
- `dry_run_only`
- `safe_local_write`
- `manual_verification_required`
- `pass_allowed`

## Decision record schema

Every decision must record:

- decision type
- inputs
- output
- reason
- risk level
- token budget
- evidence path
- approval requirement
- related rule IDs
- related mistake IDs

## No invisible decisions

A decision that is not in DB + ledger + evidence does not exist.
