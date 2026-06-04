# UI/UX Skill Radar Demo

## Goal

Evaluate an external UI/UX skill as a reference without installing or copying it.

## Commands

```bash
pala skills-check
pala external-skill-propose --url "REFERENCE_URL"
pala reference-check
```

## Expected evidence

The proposal records source, license/version questions, copy policy, and `writes_performed: false`.

## Failure / no-fake-done

Unknown license or install behavior keeps the proposal under manual verification. No auto-install occurs.
