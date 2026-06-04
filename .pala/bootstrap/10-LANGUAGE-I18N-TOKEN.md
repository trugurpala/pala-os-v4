# 10 — Language / i18n / Token

Policy:

- code, CLI, API, schemas, file names: English
- public GitHub README: English-first
- Turkish docs/user guide: mirror
- dashboard: bilingual where feasible
- UI copy must not be scattered hardcoded strings
- token economy must separate exact vs estimate

Required commands:

```bash
pala language-policy-check
pala i18n-check
pala locale-sync --dry-run
pala token-economy
pala token-language-check
```
