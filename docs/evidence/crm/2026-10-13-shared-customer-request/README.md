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
