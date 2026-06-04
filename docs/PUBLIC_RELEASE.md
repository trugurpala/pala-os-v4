# Public Release

Pala OS v28 is not published to npm or PyPI.

This document defines a local readiness gate only. It does not authorize
commit, push, package publication, deployment, or release creation.

## Local checks

```bash
npm run check
npm test
npm run pala -- docs-honesty-check
npm run pala -- public-readiness-check
npm run pala -- workflow-check --strict
npm run pala -- dashboard-truth-check
npm run verify
npm run pala -- drift-check
npm run pala -- sync-check
npm run pala -- push-check
```

Release readiness requires:

- all required community, security, architecture, and operator docs
- honest package/publication status
- no unresolved verification or drift failures
- reviewed third-party notices
- reviewed Git status and intended changed files
- explicit approval before commit, push, publish, or deployment

`push-check` reports readiness only and never pushes.
