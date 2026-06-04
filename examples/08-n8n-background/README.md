# n8n Background Demo

## Goal

Inspect optional local n8n support without activating a workflow.

## Commands

```bash
pala n8n-check
pala n8n-plan --dry-run
pala n8n-import --dry-run
```

## Expected evidence

Local availability and dry-run plans are logged with secrets redacted and no activation performed.

## Failure / no-fake-done

Missing n8n remains an honest optional limitation. Activation and external calls require approval.
