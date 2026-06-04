# Recipe — n8n Background Automation

Goal:
Use local n8n as optional workflow runner.

Commands:
```bash
pala n8n-check
pala n8n-plan --dry-run
pala n8n-import --dry-run --target workflow.json
```

Rules:
- no activation without approval
- API keys redacted
- availability policy: `bounded_optional_n8n_version_metadata_with_redacted_first_line`
- Windows discovery policy: `bounded_windows_where_n8n_cmd_presence_only`
- discovery and version checks use a 5-second timeout and 16,000-byte output budget
- never return raw stdout/stderr, process errors, or a discovered executable path
- a safely observed missing optional CLI is not a blocker
- target policy: `realpath_contained_single_handle_max_1mb_json`
- only project-local `.json` regular files are accepted
- reject symlink/outside targets and files larger than 1,000,000 bytes before reading
- use one file handle and verify identity/content stability around the read
- recheck path identity after the read and before parsing
- report metadata observation failures through `structured_fail_closed_no_throw`
- report descriptor-close failure as `workflow_target_close_failed`, discard the
  parsed payload, and do not throw
- workflow summary policy: `counts_and_boolean_metadata_without_raw_workflow_fields`
- never return the workflow payload, raw workflow name, node fields, or
  credential values

Expected evidence:
- local availability status
- dry-run plan
- target path, byte, regular-file, single-handle, post-read recheck, parse, and stability status
- workflow-name presence plus node/connection and credential-reference-node
  counts only
- explicit confirmation that no workflow was activated
