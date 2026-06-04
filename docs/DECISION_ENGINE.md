# Decision Engine

The decision engine evaluates a goal before risky work proceeds.

Inputs include the goal, repository state, active rules, mistake memory,
reference freshness, risk, token budget, permissions, and available evidence.

## Outputs

| Output | Meaning |
|---|---|
| `blocked` | A blocker prevents continuation. |
| `needs_approval` | Explicit user approval is required. |
| `dry_run_only` | Only a non-mutating plan or fixture test is allowed. |
| `safe_local_write` | Evidence-backed writes inside `PROJECT_ROOT` are allowed. |
| `manual_verification_required` | Pala cannot prove acceptance automatically. |
| `pass_allowed` | The relevant evidence gate has no unresolved failures. |

Every real decision is recorded in SQLite, `.pala/ledger/decisions.jsonl`, and
an evidence log. A decision missing from any required truth layer is not
complete.

Decision persistence follows
`bounded_redacted_decision_record_before_persistence`. Inputs are serialized,
redacted, and capped at 100,000 UTF-8 bytes before SQLite, evidence, ledger, or
the returned decision payload can use them. Reasons are redacted and capped at
2,000 bytes; decision types are redacted and capped at 120 bytes.

Input-adjacent metadata is bounded separately before evidence or returned
payloads can use it. `token_budget` plus `related_rule_ids` is redacted and
capped at 25,000 UTF-8 bytes; at most 100 related rule IDs are accepted, each
capped at 256 bytes. The metadata record exposes byte counts and blocker IDs,
never the rejected payload.

If inputs or metadata exceed their bounds, have an invalid shape, or cannot be
serialized, Pala records only
payload-free blocker metadata under the
`metadata_only_manual_verification_required` policy. A nominally safe or PASS
decision is downgraded to `manual_verification_required`; an existing
`blocked` or `needs_approval` result remains at least as restrictive.

Decision persistence follows
`evidence_then_ledger_then_database_with_explicit_outcomes`. Evidence, the
decision ledger, and the final SQLite insert each report `not_attempted`,
`confirmed`, or `unknown_after_attempt`. Evidence and ledger records carry a
pending marker because they cannot truthfully claim the outcome of a later
step. Any missing confirmation or exception becomes
`manual_verification_required_without_raw_error`; the returned record exposes
fixed blocker IDs and never the underlying exception payload. The SQLite
insert runs last so it can store a failure-downgraded decision when evidence
or ledger confirmation is missing.

Push, publish, deletion, deployment, real MCP config writes, and external
workflow activation remain approval-gated.

## Decision Review Queue

```bash
npm run pala -- decision-review --strict
```

The bounded read-only queue keeps the latest reviewable decision per decision
type. It includes blocked, approval-required, manual-verification, and dry-run
follow-up decisions; safe local writes and PASS decisions are excluded.

Priority, approval requirement, evidence status, and explicit review reasons
are visible. The queue never grants approval, resolves a decision, or writes a
decision record.
Queue truncation and source-scan truncation are reported separately so a
bounded scan is never presented as a complete queue.

### Aging Policy

- Critical: 1 day
- High: 7 days
- Medium: 30 days

Items approaching a threshold are `due_soon`. Items beyond a threshold are
`overdue`, receive `review_age_exceeds_threshold`, and rise one priority level
where possible. Aging changes visibility only; it never grants approval or
resolves a decision.

See `docs/architecture/decision-engine.md` for the operator pipeline.
