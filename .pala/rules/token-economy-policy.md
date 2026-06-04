# Token Economy Policy

Pala OS token and cost reporting must distinguish measured values from
estimates.

## Required fields

- exact input/output/cached/reasoning tokens when the provider exposes them
- estimated tokens when exact usage is unavailable
- confidence level
- model, effort, tool, command, task, and source when observable
- estimated cost only when current source pricing is known

## Hard rules

1. Unknown usage is `unknown`, not zero.
2. Estimated usage must never be labeled exact.
3. Exact cost is forbidden when pricing or usage is estimated.
4. Savings claims require measured before/after evidence.
5. Model and effort must not be assumed.
6. Token records must be written to SQLite and the token-economy ledger.

Detailed model and effort behavior is defined in
`.pala/rules/model-effort-token-policy.md`.
