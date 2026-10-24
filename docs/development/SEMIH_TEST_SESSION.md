# Semih TEST oturumu — CRM sözleşmesi

12 Ekim 2026. Kullanıcının geçici **Semih olarak devam et** talimatı yalnız izole DB02 TEST içindir. Mevcut personel, gerçek/paylaşılan hesap ve parolaları değiştirilmez. ERP/terminal ayrı issuer ve korumalı kayıt kullanır; ortak etiket SSO veya ortak JWT anlamına gelmez.

## Normal kimlik ve hazırlama

Desteklenen CRM hesabı kaynağı `WHATSAPP_CRM_AUTH_USERS_JSON`; normal `createPasswordHash` / scrypt parola doğrulaması kullanılır. Yalnız ayrılmış aktör:

| Alan | Değer |
| --- | --- |
| id / username | `crm-semih-test-20261012` / `crm-semih-test` |
| displayName / role | `Semih TEST` / `patron` |
| permissions | Mevcut patron rolünün `crm.view`, `crm.send`, `crm.assign`, `crm.agents`, `crm.manage` kümesi |
| chatwootAgentId | Pozitif doğrulanmış Semih eşlemesi; `CRM_SEMIH_TEST_AGENT_ID` ile birebir pin |
| database | `MELISA_ERP_CRM_SHARED_TEST_20261009_02` |
| testAdmin / testPersonnel | İkisi de yok; anonim bootstrap kimliği kabul edilmez |

`crm.send` rol izni mevcut izole ortamın **gönderim kapalı** uygulama sınırını kaldırmaz. Gerçek WhatsApp, ücretli AI ve ticari ERP yazması bu giriş işi kapsamında değildir.

Mevcut personelin `CRM_NORMAL_REFRESH_ENABLED=true`, `CRM_NORMAL_REFRESH_USER_ID=crm-agent-test-20261011` ve `CRM_NORMAL_REFRESH_JOURNAL_PATH` girdileri korunur. Semih hesabı bunların yerine geçirilmez. Ek girdiler: `CRM_SEMIH_TEST_CONTINUE_ENABLED=true`, doğrulanmış `CRM_SEMIH_TEST_AGENT_ID`, `CRM_ISOLATED_PREPARATION=true`, exact DB02 ve repo dışındaki ayrı `CRM_SEMIH_TEST_REFRESH_JOURNAL_PATH`. İki aktör mevcut normal refresh sözleşmesiyle ayrı grant aileleri kullanır; eski personel ailesi taşınmaz veya iptal edilmez. Private baseline/password/device kaydı GitHub'a girmez; korumalı ilk normal giriş sahibi tarafından hazırlanır, kullanıcıdan parola istenmez.

## Tarayıcı ve native taşıma

- `POST /api/live/auth/login`: mevcut normal kullanıcı/parola doğrulaması. Tarayıcıda exact TEST Origin için **HttpOnly, host-only, SameSite=Strict**, path `/api/live/auth` refresh çerezi; JSON refresh sırrı içermez. Native normal giriş `transport:'native'` ile mevcut korumalı kayıt DTO'sunu kullanır.
- `GET /api/live/auth/remembered`: `{enabled,user|null}`. Geçerli grant, güncel fingerprint ve exact kimlik olmadan Semih etiketi yok; JWT/refresh dönmez. Bu metadata UI yetki commit'i değildir.
- Tarayıcı `POST /api/live/auth/refresh` / `logout`: JSON `{}`, exact `http://127.0.0.1:62700` veya `http://192.168.1.46:62700` Origin. SameSite portları ayırmadığından farklı-port/same-site ve yabancı Origin reddedilir; Origin reddi çerezi değiştirmez.
- Native `{refreshToken}` refresh/logout sözleşmesi korunur. Android `MelisaProtectedSession` eski personel kaydını tutar; aynı runtime'da sunucunun eski personel JWT/refresh kabulü de ayrı doğrulanmalıdır. Tarayıcı JS refresh sırrını local/sessionStorage'a koymaz.
- Devam tıklaması: normal grant rotate → fresh `/auth/me` → normal inbox → kimlik/izin commit. Açılışta yardımcı etkinse eski anonim TEST ADMIN otomatiği Semih kimliği yerine geçmez. Başka cihazda kayıt yoksa yönetici oturumu oluşmaz.
- Açık çıkış/hesap değişimi grant ailesini revoke eder; geç login/refresh yanıtı da sıra içinde revoke edilir. Parola, aktiflik, rol, izin veya agent değişiminde eski JWT/grant reddedilir. Gerçek storage/revoke hatası başarı diye sunulmaz.

## Ortak runtime sahibine teslim

Mevcut ERP `terminal-completion-logon` CRM bileşenini paket/source/manifest/config/private-file hash'lerine pinler. Eski supervisor yalnız `crm-agent-test-20261011` personel refresh girdilerini kabul eder. Bu kontrol aşılmaz; ERP sahibi personel pinlerini koruyarak yeni CRM paketini ve yukarıdaki ek Semih girdilerini desteklenen supervisor config yoluna bağlar. CRM sahibi ERP/terminal source veya ortak supervisor ayarını eşzamanlı değiştirmez. Paket hazırlığı ile çalışan paket ve gerçek ekran kanıtı ayrı kaydedilir. Eski tek aktör profilini Semih profiliyle değiştirmek kabul edilmez.

## LIVE'a hazırlama ve kabul

LIVE/default modda yardımcı/metadata/cookie yolu kapalıdır; ayrılmış Semih TEST aktörü configte yanlışlıkla kalsa bile login/JWT/refresh kabul edilmez. Private TEST hesabı ve devam kaydı LIVE'a taşınmaz. Normal hesap girişleri korunur. Main/tag/LIVE ayrıca insan onayı ister.

Gerçek kabul: doğrulanmış Semih hesabıyla konuşma listesi, yetkili modüller ve katalog açılsın; yeniden açılışta devam, ERP↔CRM↔terminal geçişi, açık çıkış ve erişim iptali görülsün. API/unit/build bu ekran veya insan kabulü değildir. Yeni hazırlık önceki personel/7733 kabulünü genişletmez.
