# How a Vibe Coder Uses Pala OS

Pala OS must fit the real console workflow.

## Before coding

The vibe coder opens Claude Code, Cursor, Codex, OpenCode, or another coding agent inside the project folder.

Then they ask:

```txt
Run Pala preflight for this goal:
<goal here>
```

Expected commands:

```txt
pala status
pala memory check
pala plan --goal "<goal>"
pala token-budget --goal "<goal>"
pala reference-check
```

Pala should answer:

- known project state
- relevant mistakes from memory
- rules that apply
- estimated token budget
- dry-run plan
- risks and approval needs

## While coding

The vibe coder can ask:

```txt
Show Pala state.
Show last evidence.
Are we drifting?
What is the token cost so far?
What are the blockers?
What should the agent do next?
```

Expected commands:

```txt
pala dashboard-state
pala evidence last
pala drift-check --quick
pala token-economy
pala next-actions
```

## After coding

The user must not accept “done” from the coding agent. They ask:

```txt
Run Pala final verification.
```

Expected commands:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
pala memory check
```

If a mistake happened:

```txt
pala memory add-mistake --interactive
pala memory promote-rule --dry-run
```

## Mental model

```txt
Coding agent = writes code
Pala OS = remembers, audits, verifies, budgets, blocks fake done
```

## First 10-minute demo

```txt
1. Open project.
2. Run pala db init.
3. Run pala panel.
4. Run pala drift-check.
5. Run pala setup --repair --dry-run --all.
6. Run pala push-check.
7. Open dashboard and inspect evidence.
```
