# Governance

Pala OS governance starts from the local rules in `.pala/rules/*`.

Rule changes require review because rules affect future agent behavior. Mistakes may propose rules, but promotion requires explicit maintainer approval.

Release readiness requires local evidence from:

- `pala verify`
- `pala drift-check`
- `pala sync-check`
- `pala push-check`
- `pala quality-radar`
- `pala docs-honesty-check`
- `pala public-readiness-check`
