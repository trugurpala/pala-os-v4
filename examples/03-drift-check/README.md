# Drift Check Demo

## Goal

Detect mismatches between README, docs, control routes, and state evidence.

## Commands

```bash
pala drift-check --quick
pala drift-check
```

## Expected evidence

Each checked contract has an evidence path and failures are listed explicitly.

## Failure / no-fake-done

Any missing contract produces manual verification instead of a fake PASS.
