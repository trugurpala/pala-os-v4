# Gate 23 — V28 Final One-Shot Acceptance

Pala OS v28 is not accepted unless all critical flows are implemented or honestly blocked.

## Minimum local proof

```txt
npm run pala -- --help
npm run pala -- status
npm run pala -- db init
npm run pala -- db status
npm run pala -- memory check
npm run pala -- plan --goal "sample"
npm run pala -- drift-check
npm run pala -- sync-check
npm run pala -- push-check
npm run pala -- verify
npm run check
npm test
```

## Evidence required

- raw command logs
- exit codes
- changed file list
- DB migration status
- ledger append proof
- dashboard state proof
- blocker list

## Red flags

- Claiming PASS with stubs only.
- Dashboard hardcoding green statuses.
- Real MCP config modified in tests.
- Personal path written into public docs.
- Token savings claimed without measurement.
- Referencing competitors without source freshness.
