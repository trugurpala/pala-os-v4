# Local Worker Contract

Pala OS includes a dedicated local worker entrypoint at `src/worker.ts`.
Its current capability is intentionally limited to one fixed smoke-check mode:

```bash
npm run worker:smoke
npm run pala -- worker-check --strict
```

The worker contract policy is `single_bounded_local_read_only_task`.
`--smoke-check` reads only the local Node runtime, `package.json`, and its own
entrypoint metadata. It accepts no task payload or arbitrary command, performs
no external call or file write, starts no workload, and exits after the fixed
self-check. `worker-check` enforces the declared 2,000 ms maximum runtime as a
parent-process timeout.

Both the parent check and smoke subprocess inspect `package.json` through
`bounded_project_contained_single_handle_worker_package_json`. The file must be
a project-contained regular file no larger than 1,000,000 bytes and is read
through one stable handle with a post-read identity check. Only parse/script
status and read metadata are returned; the package payload is never returned.
Unsafe, oversized, unreadable, unstable, or invalid package truth prevents the
smoke subprocess from being trusted.

The parent check inspects `src/worker.ts` through
`fixed_worker_entrypoint_path_metadata_scan`. It requires a project-contained,
symlink/junction-free regular file and returns only payload-free path metadata.
Missing, unsafe, unreadable, or wrong-kind entrypoints prevent the subprocess
from starting.

`worker-check` verifies all of the following with a real bounded subprocess:

- `src/worker.ts` is a regular project-local file, not a symlink.
- `package.json` exposes the exact fixed `worker:smoke` script.
- package metadata inspection is complete, payload-free, and single-handle.
- the smoke process exits successfully and returns JSON.
- the returned contract exactly matches the expected safety policy.
- the returned result reports no workload, external call, write, or destructive
  action.

The inspection exposes only status, counts, byte length, and whether stderr was
present. It does not echo captured stdout or stderr. Missing, malformed,
timed-out, nonzero, or contract-drifting workers remain
`manual_verification_required`.

`pala worker-run --dry-run` runs this same readiness smoke-check and then
returns a plan only. It does not enable or start a workload. Any future
allowlisted workload or n8n integration requires a reviewed contract and
explicit approval before execution.
