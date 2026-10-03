# MELISA CRM

> **Source of truth:** CRM’in ana bitiş planı, öncelik sırası, operasyon ve “BİTTİ” kriterleri [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md) dosyasındadır. Aşağıdaki kayıtlar geçmiş durum anlık görüntüsüdür; görev/yetki/sıra ifadeleri güncel planın yerine geçmez ve çalışan baseline’ı yeniden ispatlama zorunluluğu oluşturmaz.

LIVE: 4076 frontend / mevcut 4200 gateway · WAAPI text-only
TEST/CANDIDATE: REV3 · NOT_INSTALLED · candidate/rev3
Son deploy: Kesin zaman bilinmiyor; bu görevde deploy yok.
Rollback durumu: Geçmişte 90 dosyalık hash proof var; runtime rollback hiç uygulanmadı, gerçek tatbikat yapılmadı.
Şu anki tek görev: Yerel repo için bağımsız inceleme.
Bugün kapanan işler: İzole baseline, hash/build/test kanıtı, yerel Git, REV3 ayrımı.
Kritik kalan işler: Bağımsız inceleme; installer owner/path uyarlaması; gerçek medya ve ERP kabulü.

## Özellikler

- 🟡TEST BEKLİYOR: Yerel baseline build ve 4212 HTML/JS/CSS bit eşleşmesi geçti; gerçek özellik acceptance yok.
- 🟡TEST BEKLİYOR: İzole gateway 107 + ERP mock 2, frontend 47 test geçti; gerçek işletme kabulü yok.
- 🟡TEST BEKLİYOR: Gerçek 7733 mesaj/medya acceptance; bu görevde tüm gönderimler yasak.
- 🟡TEST BEKLİYOR: ERP write acceptance ve rollback tatbikatı.
- 🔴FAIL-BLOCKED: REV3 installer NORMAL_OWNER_REQUIRED; eski mutlak yol/manifest uyarlaması.
- ⚫SONRA: Production deploy, GitHub repo/push; ayrı yetki ve inceleme sonrası.


