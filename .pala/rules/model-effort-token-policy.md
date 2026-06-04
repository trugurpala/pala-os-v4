# Model / Effort / Token Policy

## Goal

Use strong reasoning when it matters, without hiding token risk.

## Rules

1. Do not hardcode model identity.
2. Detect active model/effort when possible.
3. If user requests Opus 4.8 Max, verify support first.
4. `max` effort is allowed for architecture, risk, security, migration and final review work.
5. Use cheaper/normal effort for repetitive implementation when safe.
6. Token economy must separate:
   - exact tokens
   - estimated tokens
   - confidence
   - model/effort source
   - unknown/unavailable
7. No exact cost if only estimated.
8. No savings claim without before/after measurement.
9. Dashboard must show token confidence, not just total.
10. If token data is unavailable, status = `unknown`, not zero.
