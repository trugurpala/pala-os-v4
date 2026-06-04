# Dashboard Truth Check Demo

## Goal

Prove that control routes declare real truth sources and missing-data states.

## Commands

```bash
pala dashboard-state
pala dashboard-truth-check
```

## Expected evidence

Every route declares DB/state/ledger/evidence sources and the truth contract.

## Failure / no-fake-done

A route missing its source or contract produces manual verification, never fake green.
