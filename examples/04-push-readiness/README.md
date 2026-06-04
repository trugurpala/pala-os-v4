# Push Readiness Demo

## Goal

Report whether the repository is ready for a human-approved push.

## Commands

```bash
pala sync-check
pala push-check
```

## Expected evidence

The output lists changed files, remotes, blockers, and confirms `pushed: false`.

## Failure / no-fake-done

Uncommitted files or no remote keeps push readiness blocked. This example never pushes.
