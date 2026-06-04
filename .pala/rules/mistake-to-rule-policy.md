# Mistake-to-Rule Promotion Policy

Pala OS must learn from mistakes, but must not create random laws automatically.

## Flow

```txt
Mistake captured
↓
Root cause written
↓
Lesson proposed
↓
Prevention rule drafted
↓
User/maintainer approves
↓
Rule promoted
↓
Dashboard shows active policy
```

## Mistake statuses

- `captured`
- `lesson_proposed`
- `promotion_requested`
- `promoted_to_rule`
- `rejected`
- `archived`

## Required fields

- id
- date
- category
- summary
- root cause
- severity
- prevention rule
- evidence path
- status
- linked rule path

## Hard rule

A repeated task category must check `.pala/memory/mistake-registry.jsonl` before execution.
