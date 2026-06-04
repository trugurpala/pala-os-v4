# Decision Engine

Pala OS uses a decision engine before allowing an AI coding task to move forward.

## Pipeline

```txt
Goal
→ memory check
→ source/reference check
→ risk check
→ token budget
→ playbook selection
→ dry-run plan
→ approval gate
→ execution
→ evidence
→ verification
→ mistake/lesson update
→ dashboard refresh
```

## Backend responsibility

The backend/CLI layer creates decisions, writes DB records, appends ledger events, writes evidence, and exits with honest exit codes.

## Frontend responsibility

The frontend/control tower reads state and evidence. It does not compute fake PASS states.

## Worker responsibility

Workers, including optional n8n flows, can run background checks but cannot bypass approval gates.

## MCP installer responsibility

The MCP installer can inspect and plan repairs. Real config writes require explicit approval and backups.

## Decision outputs

- `blocked`: stop and explain why.
- `needs_approval`: user must approve.
- `dry_run_only`: only a non-mutating plan or fixture test is allowed.
- `safe_local_write`: evidence-backed local write inside PROJECT_ROOT is allowed.
- `manual_verification_required`: assistant cannot honestly prove it alone.
- `pass_allowed`: the relevant gate has evidence and no unresolved blockers.

## Key invariant

No invisible decisions. Every decision goes to DB, ledger, and evidence.
