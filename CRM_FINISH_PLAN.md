# Melisa CRM bitiş planı

Bu dosya 2026-10-03 tarihinde kanonik repodaki mevcut belgelerden oluşturuldu. Başlangıçta bu adla plan veya `AGENTS.md` yoktu. Mevcut durum belgeleri değiştirilmedi; aşağıdaki açık maddeler kabul edildiği veya tamamlandığı varsayılarak kapatılmadı.

Kaynaklar: [CRM_STATUS.md](CRM_STATUS.md), [docs/BASELINE.md](docs/BASELINE.md), [deploy/README.md](deploy/README.md), [docs/baseline-verification.json](docs/baseline-verification.json). Tarihsel port/owner/yol bilgileri mevcut Semih PC runtime'ının kanıtı değildir.

## Doğrulanabilen başlangıç ve sınırlar

- Baseline belgesi frontend build, 109 gateway/ERP sentetik test, 47 frontend test ve 4212 asset eşleşmesi için geçmiş kanıt kaydeder. Bu kurulum görevinde ürün kontrolleri yeniden çalıştırılmış sayılmaz; gerçek işletme kabulü yoktur.
- Status REV3 için `NOT_INSTALLED` ve installer için `NORMAL_OWNER_REQUIRED` belirtir. Son deploy zamanı ve runtime rollback tatbikatı doğrulanmamıştır.
- Gateway sözleşmesi ayrı ERP foto/catalog sağlayıcısı, identity doğrulamalı session ve `/api/crm-catalog/products` gerektirir; ERP uygulaması bu repoya kopyalanmamıştır. Sentetik sözleşme testi server route/session/credential provisioning kabulü yerine geçmez.
- Offline kaynak hazırlığına ait eski GitHub/push yasağı bu kurulum için kullanıcının açık feature branch/commit/push/PR yetkisiyle aşılır. LIVE, provider gönderimi, SQL yazımı ve installer sınırları korunur.

## Açık maddeler

Her tur tek kırmızı madde seçilir. Aşağıdaki kabul ölçütleri gelecekte hangi kanıtın gerekeceğini tanımlar; kabul sonucu değildir.

| ID | Durum | İş ve kaynak | Kapanış için gereken kanıt |
| --- | --- | --- | --- |
| CRM-01 | 🔴 Açık | Bağımsız repo incelemesi; `CRM_STATUS.md` şu anki tek görev ve kritik kalan iş olarak belirtir | Explorer kaynak haritası, reviewer somut bulgu/eksik listesi, ana thread'de tek takip maddesine bağlanmış sonuç; ürün PASS iddiası olmadan |
| CRM-02 | 🔴 FAIL-BLOCKED | REV3 installer normal owner/path/manifest uyarlaması; status ve deployment belgesi | Hedef PC/runtime/owner/SID kimliği, doğru yol/manifest doğrulaması, korumaları atlatmadan izole TEST kurulumu ve geri dönüş kanıtı; LIVE adımı için ayrıca gerekli açık onay |
| CRM-03 | 🟡 TEST BEKLİYOR | Gerçek mesaj ve medya kullanıcı kabulü; status | Açıkça yetkilendirilmiş hedef ve gönderim kapsamı, gerçek arayüz akışında teslim/indirme/görüntüleme kanıtı, owner kabulü; mevcut kurulum yetkisi gönderime yetmez |
| CRM-04 | 🟡 TEST BEKLİYOR | ERP entegrasyonu ve write acceptance; status + baseline ERP dependency | Ayrı kanonik ERP'de route/session/source identity, credential sınırı ve yetkili TEST sözleşme/akış kabulü; gerçek ticari kayıt veya LIVE yazma için açık onay |
| CRM-05 | 🟡 TEST BEKLİYOR | Runtime rollback tatbikatı; status + deployment | Doğrulanmış TEST hedefinde dönüş öncesi/sonrası sağlık ve kullanıcı akışı; eski hash proof'un ötesinde runtime tatbikat kaydı |
| CRM-06 | ⚫ Sonra | Production deploy; status | Önce bağımsız inceleme, installer, medya/ERP kabulü ve rollback kanıtı; tanımlı LIVE scope/onay, gerçek deploy ve sonrası kabul |

Sıradaki varsayılan kırmızı madde CRM-01'dir. CRM-02 ortam erişimi gerektirirse önce erişim kimliğini doğrula; kullanıcıya yalnız gerçekten gerekli manuel adım için dön. Ajan kurulumunun doğrulaması [docs/codex-multi-agent.md](docs/codex-multi-agent.md) içindedir; bu ürün planının açık kabul maddelerini otomatik kapatmaz.
