# V28 - Ne Değişti?

Bu sürüm, v27'nin üzerine Claude Code limitleri ve güncel kaynaklardan çıkan
gerçek çalışma kurallarıyla inşa edildi.

## Büyük Değişiklikler

1. **Model ve effort gözlemi dürüst hale geldi**
   - Model/effort isimleri hardcode edilmez.
   - İstenen model adı ile gerçekten gözlenen model birbirinden ayrılır.
   - Gözlem yoksa durum `Unknown` kalır; final doğrulama bunu engel sayar.

2. **Yerel hafıza ve kanıt katmanı güçlendi**
   - SQLite, ledger, rules, memory ve evidence katmanları repository-local çalışır.
   - Public ledger'lar kişisel yol ve secret-benzeri değerler için taranır.
   - Ledger repair, public dosyayı sanitize etmeden önce gitignored özel yedek alır.

3. **Komutlar gerçek denetim ve plan kapılarına dönüştü**
   - Mimari, dead-code, duplicate, test-gap, prompt, playbook ve example kontrolleri gerçek dosya durumunu okur.
   - Worker, n8n, autopilot, drift-fix, archive, locale ve refactor komutları gerçek yerel durumdan plan üretir.
   - Plan komutları süreç başlatmaz, import/activation yapmaz ve dış sisteme yazmaz.

4. **Dashboard truth snapshot eklendi**
   - Her komut `.pala/state/dashboard-state.json` ve ilgili state dosyalarını yeniler.
   - Komut kabul durumu ile proje kabul durumu ayrı tutulur.
   - Frontend yalnızca truth kaynaklarını okur; durum icat etmez.

5. **Reference radar genişledi**
   - Resmi kaynak freshness ve kategori coverage kapıları eklendi.
   - Coding agent, developer portal, MCP, token economy, backtesting ve public GitHub readiness kategorileri izlenir.
   - Rakiplerden yalnızca ders çıkarılır; kod, marka, UI metni veya paket adı kopyalanmaz.

6. **No-fake-done doğrulaması sertleşti**
   - Test, quality radar, ledger safety, drift, sync, push readiness ve model/effort gözlemi ayrı kapılardır.
   - Local kontroller PASS olsa bile unresolved external/operational blockers proje PASS'ini engeller.
   - Push, publish, delete, deploy, gerçek global config yazımı ve dış workflow activation yapılmaz.
