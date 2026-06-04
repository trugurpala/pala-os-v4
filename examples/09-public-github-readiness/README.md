# Public GitHub Readiness Demo

## Goal

Check local public-release artifacts without publishing or pushing.

## Commands

```bash
pala docs-honesty-check
pala public-readiness-check
pala push-check
```

## Expected evidence

Required community/security files, publication honesty, changed files, and push blockers are reported.

## Failure / no-fake-done

Missing files or fake package-publication claims block readiness. No push or publish occurs.
