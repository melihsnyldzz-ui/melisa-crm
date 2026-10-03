# MELISA CRM

LIVE: 4076 frontend / mevcut 4200 gateway · WAAPI text-only
TEST/CANDIDATE: REV3 · NOT_INSTALLED · candidate/rev3
Son deploy: Kesin zaman bilinmiyor; bu görevde deploy yok.
Rollback durumu: Eski kaynak/runtime korundu; gerçek rollback tatbikatı yapılmadı.
Şu anki tek görev: Yerel repo için bağımsız inceleme.
Bugün kapanan işler: İzole baseline, hash/build/test kanıtı, yerel Git, REV3 ayrımı.
Kritik kalan işler: Bağımsız inceleme; installer owner/path uyarlaması; gerçek medya ve ERP kabulü.

## Özellikler

- 🟢PASS: Yerel frontend build ve 4212 HTML/JS/CSS bit eşleşmesi.
- 🟢PASS: İzole gateway 107 + sentetik ERP contract 2 test; frontend seçili 47 test.
- 🟡TEST BEKLİYOR: Gerçek 7733 mesaj/medya acceptance; bu görevde tüm gönderimler yasak.
- 🟡TEST BEKLİYOR: ERP write acceptance ve rollback tatbikatı.
- 🔴FAIL-BLOCKED: REV3 installer NORMAL_OWNER_REQUIRED; eski mutlak yol/manifest uyarlaması.
- ⚫SONRA: Production deploy, GitHub repo/push; ayrı yetki ve inceleme sonrası.
