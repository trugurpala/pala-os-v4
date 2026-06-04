# Vibe Coder Console Flow

This is how a normal vibe coder uses Pala OS while working inside Claude Code or another AI coding console.

## First minute

```bash
pala status
pala db status
pala memory check
```

The operator learns whether Pala memory, DB, ledger and evidence are healthy.

## Before asking for code

```bash
pala plan --goal "add billing dashboard"
pala token-budget --goal "add billing dashboard"
pala reference-check
```

The operator sees plan, risk, cost confidence and stale-source risks.

## During coding

```bash
pala evidence last
pala drift-check --quick
pala next-actions
```

The operator sees whether the agent is producing proof or just text.

## When agent says done

```bash
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
```

Only these gates decide acceptance.

## After a mistake

```bash
pala memory add-mistake
pala memory promote-rule --dry-run
```

Mistake becomes lesson first. It becomes active rule only after approval.
