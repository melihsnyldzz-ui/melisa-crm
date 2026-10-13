# Ortak normal CRM ürün talebi — kaynak hazırlığı

13 Ekim2026, ortak sıra2 / CRM06 / CRM-DEC-014. Önceki fb34 müşteri seçimi/adet/tek talep/atanmış personel çekirdeği yeniden yazılmadan normal shared62700/62701 TEST'e kaynakta bağlandı. Çalışan09ca paketi bu teslimle otomatik güncellenmez; insan kabulü bekler.

## Tamamlanan kaynak alt kapsam

- Normal launcher ve app mount, public enabled-state, açık default-off owner ayarları. ExactDB02/ERP4184, izinliorigin, isolated/send/paidAI kapalı sınırı; Semih helper açılmaz.
- Mevcut uygun normal yöneticilerden açık ID seçimi; ayrı resmi normalSID/refresh ailesi. Eski7profil/personel aileleri, rolleri ve parolaları değiştirilmez; proof state veya credential taşınmaz.
- Legacygrantless normalJWT issuer sayılmaz. Normal yeni giriş/refresh `/me` doğrulaması gerçekissuer ailesine bağlıdır; SID public-user cevabına eklenmez.
- RAMrefresh kaybolmuş hardreload oturumunda mevcut logout yalnız kendiSID ailesini kapatır. Başka kullanıcı veya aynı kullanıcının bağımsız aileleri etkilenmez; karışıkcredential reddedilir.
- Yerel anahtar silinse bile bekleyen kapanış/giriş sıralanır. Belirsiz kapanış yeni parolaPOST'unu engeller. Eski geçerli issuer anahtarı sonradan süre aşımı/iptal nedeniyle401 alırsa aynı anahtarın `/me`401 doğrulaması yerel kapanışı tamamlar; geçerli200,503 veya abort engeli korur. Yerel kapanış server-revoked iddiası değildir.
- İç katalogJWT yalnız RAM'de issuerID+SID+fingerprint+expiry anahtarında; gerçek ürün/fotoğraf, güncel atama ve pre/postauthority sınırları korunur. Yetki/fiyat cache'i yok. Process restart sonrası eski müşteri katalog okuyucusu yeniden üretilmez; yeni normal link gerekir. Kalıcı personel talep geçmişi journal'da kalır.

## Hedefli teknik doğrulama

| Kontrol | Sonuç | Sınır |
| --- | --- | --- |
| Son backend6dosya |49/49 PASS;0fail/skip |Root offlineguard, yalnız süreç tarafından açılan ephemeral loopback/sentetik fixture |
| Son frontend oturum/API ve actualApp |55/55 PASS:46+9 |Frontend ajanı; native/personel/legacy, hardreload, kapanış ve eşzamanlı giriş |
| Son bağlı frontend/backend |10/10 PASS |Root, frozenfrontend sonrası aynı sharedintegration fixture; backend49 ile örtüşür, yeniden toplama yok |
| Bağımsız kaynak incelemesi |AçıkP1/P2 yok |High reviewer;16source/test dosyası ve son üç frontend dosyasının frozenhash'leri |

Komutlar ve kaynak hash'leri [verification.json](verification.json) içindedir. Önceki1165 baseline yeniden koşulmadı; build, sentetik/offline veya reviewer normal fiziksel/personel/insan kabulü değildir. Bu tur gerçekWhatsApp/provider/AI/SQL/nativeERP yazması, kullanıcı/rol reseti, sharedruntime restart/config ve main/LIVE yoktur. İptal edilen Semih düğmesi/Windows programı teslim şartı yapılmadı.

## Gerçek kalan

1. ERP owner yeni dörtenvkey whitelist/config, immutableCRMpackage/manifest, dependency-lock ve hub/source projection pinlerini bağlamalı; ortak runtime/startup tek sahibindedir.
2. Candidate yalnız mevcut crm-patron/agent2 issuer seçer. Bu hesabın korumalı normal giriş teslimi henüz doğrulanmadı; başka personel/EskiSemih/proofDPAPI yerine kullanılamaz.
3. Aktivasyon sonrası yalnız değişen7733normal müşteri seç/adet/reopen/tek talep → atanmış personel/yanlışpersonel ve mobil ekran akışı doğrulanmalı. CRM-UA11 insan kabulü bekler; CRM06 ana başlığı kapanmadı.
4. Başlamadan owner mevcut ortaksettings/privatebaseline/personeljournal için korumalı state snapshot kapsamını doğrulamalı. [Ayrı koruma kaydı](../2026-10-13-state-preservation-status/README.md) yalnız eskiCRMproofstate/same-machine hazırlığıdır; tam işletme/offsite/DBrestore kanıtı değildir.

GitHub aktif `codex/crm-agents-on-completion-20261003`, mevcut [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3). Yeni source/manifest/owner-handoff receipt build sonrasında ayrı kaydedilir; belgeHEAD çalışan09ca sayılmaz. Exact-head CI ödeme/harcama engeliyle başlamadıysa PASS değildir.

## Exact paket ve owner dosya hazırlığı

Source **1be727746a22cd6ca3232c74272a93a5749e7dc1** remote branch/PR3 head ile eşleşti. Tek immutable sharedTEST paket kilitli offline dependency kurulumu ve frontend build sonrasında manifest/source blob doğrulamasından geçti; manifest **f7e193644c5595e942a95457456ac4f54a06957d81da874e9f9defee8b9fbc3a**. **Aktive edilmedi.** Paket builder eski release/runtime'ı değiştirmedi; yalnız yeni staging/build dependency temizliğini doğrulanmış sınırda yaptı.

Owner-only yeni private klasörde hazırlanan candidate eski aktivasyonun yalnız source/package/manifest3değerini değiştirir ve4requestkey ekler. Baseline7profil, katalogaccess, mevcut normal-personel journal, ERP2bf/nativeOrder60e/DB02/copye16b pinleri aynıdır. Candidate pure shared-config doğrulamasını geçti; mevcut owner whitelist'i hâlâ bu4key'i desteklemez ve candidate activeconfig'e yazılmadı. Yeni request store ve issuer refresh dosyaları henüz yoktur; eski proof state/grant kopyalanmadı. Handoff digest **4d7eb8ddd59d68b67d719ec8328483152f496fc98f7046a66129da7044943164**, candidate digest **f54bd892b9f20266b5ba69bc78f28aaf0921eb120013a92ae3841217fd30b0f8**. [Public metadata receipt](delivery.json) özel dosya/credential/state içermez. Dosya hazırlığı owner'ın bunu aldığı veya aktivasyon yaptığı teyidi değildir.

Source1be7277 taze CI7job/0step **FAILURE**, bütün annotations hesap ödeme/harcama engelini doğruladı: [PR CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38386048282), [AI offline](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38386047843), [push CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38386042913). Testler başlamadı; localPASS/temiz scan uzakCI veya insanPASS değildir. İzleyen belgeHEAD farklıdır; çalışan09ca source ve inaktif1be source ayrı kalır.
