# MELISA CRM

LIVE: 4076 frontend / mevcut 4200 gateway · WAAPI text-only
TEST/CANDIDATE: REV3 · NOT_INSTALLED · candidate/rev3
Son deploy: Kesin zaman bilinmiyor; bu görevde deploy yok.
Rollback durumu: Geçmişte 90 dosyalık hash proof var; runtime rollback hiç uygulanmadı, gerçek tatbikat yapılmadı.
Şu anki tek görev: Yerel repo için bağımsız inceleme.
Bugün kapanan işler: İzole baseline, hash/build/test kanıtı, yerel Git, REV3 ayrımı.
Kritik kalan işler: Bağımsız inceleme; installer owner/path uyarlaması; gerçek medya ve ERP kabulü.

## Özellikler

- 🟡TEST BEKLİYOR: Candidate yerel build, gateway 209, frontend 230 ve ERP mock 2 test geçti; gerçek özellik acceptance yok.
- 🟡TEST BEKLİYOR: Gerçek 7733 mesaj/medya acceptance; bu görevde tüm gönderimler yasak.
- 🟡TEST BEKLİYOR: ERP write acceptance ve rollback tatbikatı.
- 🔴FAIL-BLOCKED: REV3 installer NORMAL_OWNER_REQUIRED; eski mutlak yol/manifest uyarlaması.
- ⚫SONRA: Production deploy, GitHub repo/push; ayrı yetki ve inceleme sonrası.
