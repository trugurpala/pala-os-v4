# Admin Privilege Inspection

`pala admin-check` observes whether the current process token is standard or
elevated. It never requests elevation, changes system state, or treats an
elevated token as permission to perform an approval-gated action.

```bash
npm run pala -- admin-check --strict
```

Detection is platform-specific and read-only:

- Windows uses `windows_principal_administrator_role_read_only`. A hidden,
  non-interactive, no-profile PowerShell process checks the current
  `WindowsPrincipal` Administrator role and must return exactly `standard` or
  `elevated` within 3,000 ms.
- POSIX platforms use `posix_getuid`; UID `0` is reported as elevated and
  another nonnegative UID as standard.

The result exposes the policy, completion state, timeout state, exit code,
output validity, stdout byte count, and whether stderr was present. Captured
stdout and stderr are never returned. Missing commands, nonzero exits,
timeouts, invalid output, or unavailable platform APIs remain
`manual_verification_required`.

`elevation_requested`, `external_call_performed`, `writes_performed`, and
`destructive_action_performed` always remain false.
