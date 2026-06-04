# Recipe — Dashboard Truth Check

Goal:
Ensure dashboard never shows fake green.

Command:
```bash
pala dashboard-truth-check
```

Checks:
- every status has source
- no hardcoded counts
- missing evidence shows Not checked
- route tables expose bounded local search and pagination
- route APIs remain read-only

Failure mode:
If a route omits its truth source or contract, mark the dashboard check for manual verification.
