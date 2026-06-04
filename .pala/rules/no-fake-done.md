# No Fake Done

Pala OS must not mark work as passed only because an agent says it is done.

Required evidence for completion:

- command
- exit code
- raw log path
- changed files
- risk status
- next action

If evidence is missing, use `manual_verification_required`, `partial`, `blocked`, or `not_checked`.
