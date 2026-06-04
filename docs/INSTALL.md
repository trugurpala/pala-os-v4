# Install

Pala OS v28 currently runs as a local workspace package.

## Requirements

- Node.js 24 or newer.
- A local git worktree.

## Local Use

```bash
npm run pala -- db init
npm run pala -- status
npm run pala -- panel
```

This package is not published. Do not use registry install commands unless publication evidence exists.

## Runtime Files

- `.pala/db/pala.sqlite` is local and gitignored.
- `.pala/evidence/raw/*` is local and gitignored.
- `.pala/state/*`, `.pala/ledger/*`, and `.pala/archive/*` are local and gitignored.
- `.pala/ledger/*.jsonl` is append-only local audit state.
