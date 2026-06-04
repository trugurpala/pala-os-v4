# Lessons Learned

This file contains sanitized, human-readable lessons. Raw mistakes live in `.pala/ledger/mistakes.jsonl` and `.pala/memory/mistake-registry.jsonl`.

## Rule

A lesson is not an active rule until it is approved and promoted.

## Initial lessons

### Current source before stack/config decisions

Do not assume a tool runtime, config path, CLI syntax, or install method from memory. Verify official docs and local CLI when possible.

### Agent does the work, Pala verifies the work

Pala OS is not a coding agent. It is the local control/evidence layer that makes AI coding work auditable, cost-aware, and harder to fake.

### Dashboard does not invent truth

Dashboard pages read DB/state/ledger/evidence. Missing evidence means Unknown, Not checked, Partial, Blocked, or Manual verification required.
