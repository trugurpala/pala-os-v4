# Pala OS v28 - Kullanim

## 1. Klasoru Ac

Pala OS'u kullanacagin proje klasorunu `PROJECT_ROOT` olarak ac.

## 2. Yerel Kurulumu Dogrula

```powershell
npm run pala -- db init
npm run pala -- runtime-check
npm run pala -- status
```

Model ve effort degerleri non-interactive ortamda gorulemiyorsa `Unknown` kalir. Belirli bir Opus surumu aktifmis gibi davranilmaz.

## 3. Claude Code Icin

Interactive Claude Code oturumunda gerekirse:

```txt
/status
/model
/effort
/mcp
```

Ardindan `00-CLAUDE-CODE-A-YAPISTIR-TEK-METIN.md` dosyasini kullan.

## 4. Cursor, Codex veya Baska Agent Icin

`00-ANY-AI-CODING-AGENT-PASTE.md` dosyasini kullan.

## 5. Kabul Zinciri

```powershell
npm test
npm run pala -- verify
npm run pala -- drift-check
npm run pala -- sync-check
npm run pala -- push-check
```

Pala OS'ta kanit yoksa PASS yok.
