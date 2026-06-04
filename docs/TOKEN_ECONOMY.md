# Token Economy

Pala OS separates measured usage from estimates.

Tracked fields include:

- known input, output, cached, and reasoning tokens when available
- estimated tokens when exact usage is unavailable
- model, effort, source, and confidence
- estimated cost only when current source pricing is known

Unknown usage is reported as `unknown`, not zero. Pala OS does not claim exact
cost or savings without measurement and before/after evidence.

Use:

```bash
npm run pala -- token-budget --goal "describe the task"
npm run pala -- token-economy
```

Current local estimates use a documented heuristic and do not represent
provider billing records.
