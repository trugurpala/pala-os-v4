# 12 — Architecture First Safe Refactor

Refactor rule:

First understand architecture.
Then baseline tests.
Then small reversible changes.
Then verification.

Required commands:

```bash
pala architecture-check
pala code-map
pala refactor-plan --target .
pala refactor-check
```

No broad rewrites.
No behavior change without tests/approval.
No performance claim without measurement.
