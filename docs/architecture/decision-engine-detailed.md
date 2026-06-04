# Decision Engine Detailed Spec

## Inputs

- Goal text.
- Current project state.
- Active rules.
- Mistake registry matches.
- Reference/source freshness.
- Token budget and confidence.
- Risk level.
- Permission impact.
- MCP/config impact.
- File operation impact.
- UI/Figma gate impact.
- Public release impact.

## Output states

| Output | Meaning |
|---|---|
| blocked | Cannot continue safely. |
| needs_approval | User approval needed before mutation. |
| dry_run_only | Planning is allowed, real write is not. |
| safe_local_write | Local repo write allowed. |
| manual_verification_required | Human check required before PASS. |
| pass_allowed | All mandatory gates have evidence. |

## Hard-block actions

- `git push`
- package publish
- delete/archive without explicit approval
- real MCP config mutation in tests
- n8n workflow activation
- secrets in logs/docs/evidence
- dashboard fake green

## Evidence contract

Every decision writes:

```txt
.pala/ledger/decisions.jsonl
.pala/db/pala.sqlite decisions table
.pala/evidence/commands/<run>.log or docs/evidence/<summary>.md
```
