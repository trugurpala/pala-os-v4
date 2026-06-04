# Memory

Pala OS memory is repository-local and does not rely on chat history.

| Layer | Path | Purpose |
|---|---|---|
| SQLite | `.pala/db/pala.sqlite` | Queryable local application state |
| State | `.pala/state/*` | Volatile dashboard/runtime snapshots |
| Ledger | `.pala/ledger/*.jsonl` | Append-only local audit history |
| Rules | `.pala/rules/*` | Reviewable operating law |
| Memory | `.pala/memory/*` | Mistake registry and lessons |
| Raw evidence | `.pala/evidence/raw/*` | Local command proof |
| Public evidence | `docs/evidence/*` | Sanitized summaries |

The SQLite DB, runtime state, local ledgers, archives, and raw evidence logs
are gitignored. Secrets and personal paths must not be written to DB, ledgers,
public evidence, or docs.

Local ledgers are checked before any public export with:

```bash
npm run pala -- ledger-safety-check
npm run pala -- ledger-redact --dry-run
```

Ledger append uses `fixed_allowlisted_project_contained_single_handle_append`.
Only the six kernel-owned JSONL names are accepted. Each redacted record is
capped at 1,000,000 bytes, and the contained symlink/junction-free parent and
target are checked before a single no-follow append handle is opened and again
after writing. Invalid names, unsafe paths, short writes, and changed targets
fail closed without exposing the event payload or writing outside
`.pala/ledger`. A descriptor-close failure after append returns
`ledger_append_blocked:file_close_failed` instead of claiming success; the
mutation lock is still released before the failure reaches the caller.

All Pala ledger appends and explicit repair apply runs share
`bounded_fixed_create_only_lock_serialized_ledger_mutations`. The fixed
project-contained create-only lock is acquired with at most 100 bounded
attempts before any live-ledger mutation. This prevents an append from being
silently lost between repair's final source recheck and atomic replacement.
Unsafe, changed, unreleasable, or stale locks block; stale-lock reclamation is
intentionally not automatic.

Ledger safety uses `bounded_single_handle_jsonl_scan_with_true_finding_count`:
at most 100 directory entries, 10 MB per ledger file, 50,000 physical lines
per file, and the first 200 returned findings while preserving the true finding
count. `scan_complete` must be true before PASS or repair. An oversized,
truncated, changed, unsafe, or unreadable ledger blocks repair without writing.
Descriptor-close failures follow `structured_fail_closed_no_throw`; the file
is not scanned, `ledger_file_close_failed` makes the scan incomplete, and no
source text is exposed. `ledger_directory_close_failed` discards gathered
ledger-file candidates and also blocks repair and PASS.
Ledger inventory root truth is exposed as payload-free `root_inspection`
metadata from the contained, symlink/junction-free directory contract. A
missing root is an exact empty inventory; an unsafe root blocks scanning and
repair before directory iteration.

An explicit local `ledger-redact --apply` repair uses
`bounded_project_contained_atomic_backup_then_replace`. It rechecks and creates
the gitignored `.pala/private/ledger-redaction-backups/` path one segment at a
time, publishes every bounded original as a create-only backup, and only then
atomically replaces each ledger from a same-directory temporary file. Unsafe,
changed, oversized, or failed backup/replacement paths stop the repair without
writing outside the project. Canonical redaction markers are accepted by the
post-repair safety scan. The safety check reports file and line only; it never
echoes sensitive source text. Repair holds the shared ledger mutation lock
from its first apply scan through backup, replacement, and final safety scan.
Each backup must pass `temporary_and_backup_dev_ino_match` before replacement
begins, and repair output reports `backup_identity_verified_count`.
Each live atomic replacement must also pass
`temporary_and_live_ledger_dev_ino_match`; repair output reports
`atomic_replace_identity_verified_count`.
Temporary sources must remain the file created through the write handle under
`write_handle_and_temporary_path_dev_ino_match`. Cleanup unlinks a temp path
only while that identity still matches.

## Mistake-to-rule flow

```txt
capture mistake -> propose lesson -> dry-run rule proposal -> user approval -> promote
```

A lesson is not an active rule until explicitly approved. Use:

```bash
npm run pala -- memory check
npm run pala -- memory list
npm run pala -- memory add-mistake --interactive
npm run pala -- memory promote-rule --dry-run
```

Interactive collection follows `tty_only_validated_confirmation_before_write`
and closes its prompt interface before returning a safe input. Prompt close
failure follows `payload_free_manual_verification_no_write`: it returns
`interactive_prompt_close_failed`, discards the pending input, and prevents
the local mistake writer from running.

Mistake-registry reads use
`bounded_single_handle_jsonl_without_invalid_raw_line_exposure`: the fixed
project-local regular file is capped at 5,000,000 bytes and 10,000 physical
lines, read through one stable handle, and rechecked after reading. Commands
return at most 500 parsed records and 100 findings with explicit exactness and
truncation truth. An invalid raw line is never returned; only its line number
and a counts-only finding are exposed. Incomplete, oversized, unsafe, changed,
or invalid registry state blocks memory PASS and dry-run rule proposals.
Descriptor-close failure follows `structured_fail_closed_no_throw`, returns
`memory_registry_file_close_failed`, and discards all parsed records before
memory status or rule-proposal logic can consume them.
Shared payload-free path metadata is checked before reading, so a missing
registry below a symlink/junction is unsafe rather than an empty registry.

Memory registry append uses
`fixed_project_contained_create_or_single_handle_memory_registry_append`.
Each redacted JSON record is capped at 1,000,000 bytes and the complete
registry cannot exceed the reader's 5,000,000-byte limit. A missing fixed
registry is published through an atomic create-only link; an existing registry
is written through one verified no-follow append handle. Parent/target path
changes, invalid redacted JSON, unsafe metadata, and short writes fail closed
without exposing the record payload. An existing-registry descriptor-close
failure returns `memory_registry_append_blocked:file_close_failed` instead of
claiming success; the write lock is still released before the error returns.
The first create must pass `temporary_and_registry_dev_ino_match`, so a
same-size target replacement cannot be reported as a successful registry
write.
Its temporary source follows
`write_handle_and_temporary_path_dev_ino_match`; cleanup unlinks the temp path
only while the created-file identity still matches.

Concurrent create-or-append uses
`bounded_fixed_create_only_lock_serialized_create_or_append`. Writers acquire
one fixed project-contained create-only lock with at most 100 bounded attempts
before rechecking the registry and creating or appending. This serializes the
aggregate 5,000,000-byte bound and prevents first-create races from dropping a
record. An existing lock that disappears during safe metadata observation is
retried through `bounded_retry_on_existing_lock_inspection_race`; it is never
treated as acquired. Release succeeds only when the released identity is
absent or a safely inspected different successor lock has already acquired the
fixed path (`released_identity_absent_or_safe_successor`). Unsafe, changed,
unreleasable, or stale locks block; stale-lock reclamation is intentionally not
automatic.

Interactive mistake capture follows
`tty_only_validated_confirmation_before_write`. It opens prompts only from a
real TTY, sends prompts to stderr so JSON stdout stays parseable, validates
bounded fields and the closed severity set, and requires explicit confirmation
before the existing local mistake writer runs. Cancellation, invalid input,
missing TTY, or declined confirmation performs no write. Interactive mode and
inline mistake fields cannot be combined.

`pala memory sync-claude --dry-run` uses
`bounded_project_contained_single_handle_claude_md_dry_run`. `CLAUDE.md` must
be a project-contained regular file no larger than 1,000,000 bytes; it is read
through one stable handle with a post-read path identity check. Only fixed
required lines, missing-line summaries, and inspection metadata are returned;
the current file payload is never returned. If the file is unsafe, oversized,
unreadable, or unstable, the proposal is blocked and no diff is produced.

See `docs/architecture/local-database-and-memory.md` for the full data model.
