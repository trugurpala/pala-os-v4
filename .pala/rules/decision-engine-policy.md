# Decision Engine Policy

Pala OS decides whether an AI coding task can continue.

## Inputs

- user goal
- current project state
- relevant rules
- mistake memory
- current sources / benchmarks
- token budget
- risk level
- permission level
- dry-run result

## Outputs

| Output | Meaning |
|---|---|
| `blocked` | cannot continue until blocker is fixed |
| `needs_approval` | user must explicitly approve |
| `dry_run_only` | only a non-mutating plan or fixture test is allowed |
| `safe_local_write` | evidence-backed local write is allowed inside PROJECT_ROOT |
| `manual_verification_required` | assistant cannot honestly verify alone |
| `pass_allowed` | the relevant gate has evidence and no unresolved blockers |

## Approval required for

- git push
- package publish
- deleting files
- real MCP config write
- n8n workflow activation
- external network side effects
- secrets/config changes
- production deployment

## Evidence

Each decision must be visible in:

- SQLite `decisions` table
- `.pala/ledger/decisions.jsonl`
- evidence file or raw log path
- dashboard decision feed
