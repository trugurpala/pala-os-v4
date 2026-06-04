# Security Policy

## Supported Status

This v28 session pack is a local-first implementation. Treat all commands as local tools and review evidence before relying on results.

## Reporting

Report security issues through a private maintainer channel before public disclosure. Do not include secrets in issues, screenshots, DB files, or evidence logs.

## Local Safety Rules

- `.pala/db/pala.sqlite` is local runtime state and is gitignored.
- `.pala/evidence/raw/*` is gitignored because raw logs may include local context.
- MCP setup commands are dry-run first and must preserve unrelated servers.
- Real config writes, n8n activation, push, publish, delete, and deployment require explicit approval.
