# Recipe — Public GitHub Readiness

Goal:
Prepare free public GitHub release.

Commands:
```bash
pala public-readiness-check
pala community-check
pala security-readiness-check
```

Required:
README, LICENSE, SECURITY, CONTRIBUTING, CODE_OF_CONDUCT, SUPPORT, ROADMAP, CI.

Expected evidence:
- bounded required-artifact inspection metadata
- docs honesty result
- push-readiness blockers

Failure mode:
The `bounded_required_public_artifact_single_handle_scan` policy requires all
30 fixed public artifacts to be non-empty, project-contained regular files
read through stable single handles under per-file and shared byte budgets.
Missing, empty, unsafe, unreadable, oversized, incomplete, or fake-publication
truth blocks readiness. Artifact payloads are never returned, and the check
never writes, publishes, or pushes.
