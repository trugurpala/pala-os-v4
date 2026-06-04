# v27 — Local Memory, Decision Flow, Vibe Coder Usage

## En büyük değişiklik

Pala OS artık sadece agent prompt paketi değil; local app memory tasarımı var.

```txt
.pala/db/pala.sqlite + .pala/ledger/*.jsonl + .pala/memory/* + .pala/rules/* + .pala/evidence/*
```

## Eklenenler

- SQLite schema: `.pala/schema/001_init.sql`
- Local persistence policy
- Mistake-to-rule promotion policy
- Decision engine policy
- Claude Code memory policy
- Reference radar YAML
- Vibe coder before/during/after usage guide
- Backend/frontend/worker map
- CLI command map
- New examples:
  - local memory and mistake learning
  - vibe coder console flow

## Yeni ana kural

```txt
Bir daha aynı hatayı yapmamak için hata DB’ye, ledger’a, mistake-registry’ye ve ders dosyasına yazılır.
Ama aktif kurala dönüşmesi için approval gerekir.
```

## Yeni kullanım cümlesi

```txt
Coding agent kodu yazar.
Pala OS hafızayı, kanıtı, token ekonomisini, riskleri ve bitti kararını yönetir.
```
