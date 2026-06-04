---
description: Use when operating Pala OS tasks with plan, evidence, memory, token and safety gates.
---

# Pala Operator Skill

Use Pala OS as the control layer, not as a coding agent.

Before work:

```txt
pala status
pala memory check
pala plan --goal "$ARGUMENTS"
pala token-budget --goal "$ARGUMENTS"
```

After work:

```txt
pala verify
pala drift-check
pala sync-check
pala push-check
pala quality-radar
```

Never claim PASS without evidence, DB status, ledger events, exit codes and raw logs.
