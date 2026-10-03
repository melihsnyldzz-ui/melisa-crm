# MELISA CRM

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



## 4 Ekim 2026 — main altyapı PR hazırlığı

- Kapsam: yalnız çalışma düzeni, ajan/CI/dokümantasyon; main tabanı `53904e9692a542f9ccb449141d5f750452e99865` korunur. Uygulama/SQL/manifest/lockfile/test feature farkı sıfırdır.
- Teslim dalı: `codex/crm-clean-main-infra-20261004`; hedef `main`. Tam head commit, PR ve tamamlanan CI sonucu PR'nin Checks alanında kaydedilir; Yerel teknik kontroller **PASS**: 148 JS syntax modülü, 216 frontend + 107 gateway + 5 contract/CI test (328/328), frontend build ve HEAD geçmiş secret scan (Gitleaks 8.30.1). GitHub CI henüz çalışmadı; sonucu tam PR head commit'inin Checks alanında doğrulanır.
- Kullanıcı PR/commit kabulü: **BEKLİYOR**. Bitiş planındaki eski uygulama kabulleri bu main PR'sinin kabulü değildir.
- TEST/LIVE commit ve runtime sağlığı: **Durum doğrulanmadı**; runtime işlemi yapılmadı.
- Sonraki tek iş: PR'nin tam head CI kontrolleri başarılı olduktan sonra kullanıcı altyapı PR'sini inceler ve main merge kararını verir. Eski PR #4 korunur.
