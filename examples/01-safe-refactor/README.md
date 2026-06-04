# Safe Refactor Demo

## Goal

Assess whether a refactor can start without changing behavior blindly.

## Commands

```bash
pala architecture-check
pala test-gap-check
pala refactor-plan --dry-run --target .
```

## Expected evidence

Architecture and test-gap logs identify the baseline. The refactor plan remains a dry-run.

## Failure / no-fake-done

Missing baseline tests or architecture evidence keeps the refactor blocked or under manual verification.
