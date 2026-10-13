# Müşteri kataloğu → CRM ürün talebi TEST sözleşmesi

## 13 Ekim — ortak normal TEST kaynak sözleşmesi

CRM-DEC-014 / ortak sıra2 / CRM06. Mevcut fb34 talep çekirdeği yeniden yazılmadan normal62700/62701 sunucusuna bağlanır. Feature default-off'tur; owner config şu dört alanı açıkça sağlamalıdır:

- `CRM_CUSTOMER_PRODUCT_REQUEST_ENABLED=true`
- `CRM_CUSTOMER_PRODUCT_REQUEST_ISSUER_IDS`: mevcut normal kullanıcı ID'lerinden JSON liste; hazırlanan candidate yalnız mevcut `crm-patron`/agent2 kimliğini seçer.
- `CRM_CUSTOMER_PRODUCT_REQUEST_STORE_FILE`: ayrı CRM-only talep journal'ı.
- `CRM_CUSTOMER_PRODUCT_REQUEST_REFRESH_JOURNAL_PATH`: ayrı issuer refresh journal'ı.

Exactshared DB02/ERP4184, isolatedPreparation, izinli62700origin ve loopback gateway, gönderim/ücretliAI=false şartları sürer. Private dosyalar kanonik CRM runtime içinde farklı yollarda olmalıdır; mevcut normal personel/Semih journal'ları kullanılamaz. Bilinmeyen, inaktif, personel, anonim TEST veya agent eşlemesi olmayan issuer ID startup hatasıdır; rol veya kullanıcı üretilmez. Semih yardımcı düğmesi bu candidate'te kapalıdır ve aktivasyon şartı değildir. Proof bayrağı shared launcher'da kapalı tutulur.

Seçili mevcut yönetici resmi parola girişinden ayrı normal SID/refresh ailesi alır. `/auth/me` issuer işaretini yalnız doğrulanmış geçerli issuer ailesinde verir; feature öncesi grantless normal JWT bu aile sayılmaz ve eski normal kullanımı korunur. Session storage'daki access anahtarı sayfa yenilenince RAM refresh olmadan kalabilir: mevcut logout yolu yalnız kendi doğrulanmış SID ailesini iptal eder; başka personel/aile iptal edilmez. Belirsiz kapanış veya `/me` ağ hatası yeni parola POST'unu engeller; iptali doğrulanmış/geçersiz oturum yerel kapanışla tekrar girişi engellememelidir. Bekleyen çıkış veya hesap geçişi, yerel anahtar silinse bile eşzamanlı girişten önce tamamlanır. SID, refresh veya iç staff JWT müşteri URL/cevabına veya kalıcı talep kaydına konmaz.

Katalog okuma JWT'si yalnız RAM'de, issuer ID+SID+fingerprint+access expiry anahtarıyla tutulur. Her operasyon fresh issuer ve konuşma/atama sınırını kontrol eder; yetki/fiyat cache'i eklenmez. Süreç yeniden başlayınca bu RAM okuyucu yeniden üretilemez: eski müşteri katalog okuması kapalı kalır ve normal girişten yeni müşteri linki gerekir. Kalıcı personel talep geçmişi journal'da korunur. Bu sınır kesintisiz eski-link restart kabulü değildir. Müşteri fotoğraf katmanının3MiB/MIME/signature kontrolü sürer; mevcut upstream reader'ın buffer davranışı bu entegrasyonla yeniden tasarlanmadı.

**Runtime teslimi ayrı:** ERP owner'ın mevcut supervisor whitelist'i bu dört yeni alanı henüz kabul etmiyor. Yeni source/package/manifest, inaktif aktivasyon dosyası/hash, dependency-lock ve hub/source projection pinleri owner yoluna bağlanmadan ortak09ca yeni talep paketi sayılmaz. Eski7 kullanıcı/baseline ve korumalı normal-personel journal'ı birebir korunmalıdır; proof grant/state kopyalanmaz. Mevcut `crm-patron` için korumalı normal giriş teslimi henüz doğrulanmadı; başka personel tokenıyla issuer taklidi veya parola reseti yapılmaz. Kaynak/offline kontrol, normal ekran/mobil/personel ve CRM-UA11 insan kabulünden ayrıdır.

## Önceki 12 Ekim çekirdek sözleşmesi

12 Ekim 2026, CRM-DEC-013. ERP cari kaydı bulunmayan yeni mağaza müşterisi de doğrulanmış normal CRM konuşması üzerinden ürün ilgisini bildirebilir. Bu akış satış, rezervasyon, ödeme veya ERP taslak sipariş değildir.

Normal korumalı patron/müdür oturumu konuşmadan bağımsız rastgele müşteri oluşturmaz: sunucu gerçek Chatwoot account/inbox/contact/conversation/assignee ve izin verilen 7733 numarasını doğrular. Linkte 32 rastgele byte'tan üretilen bağımsız opaque capability bulunur; staff JWT veya parola bulunmaz. Tarayıcı adres parçasını temizler, yalnız ayrı müşteri sessionStorage anahtarını kullanır. Grant en fazla bir saat ve issuer access expiry kadar yaşar; korumalı normal SID, rol/parola/izin/atama değişimi ve revoke her işlem öncesi/sonrası kontrol edilir. İlk TEST yalnız7733 içindir; genel müşteri erişimi kanıtlanmış değildir.

ERP DB02'nin mevcut `melisa-catalog.v1` salt okunur adaptörü kullanılır. Gerçek aktif/hold dışı, kaynak fotoğrafı CONFIRMED ürün; orijinal JPG/PNG/WebP signature ve 3MiB sınırı korunur. Arama/kategori/sayfa/total kaynaktan gelir; kategori sayısı bilinmiyorsa null kalır, yaş filtresi mevcut kaynak desteklemediği için sunulmaz. Ürün talebi stok, fiyat, MOQ veya teslimat taahhüdü üretmez.

Seçim `{productId,quantity}` ve revision ile ayrı özel TEST journal'ına atomik yazılır. Sunucu ürün/adet snapshot'ını yeniden okur. UUID operation ve tek session submission kalıcıdır; aynı oturumun yeniden gönderimi tek kayıt/readback döndürür. Corruption, storage lock, yanlış müşteri/rol ve belirsiz sonuç başarı değildir. Eski owner cart/session ve `/customer-catalog/order` native ERP taslak yolu kullanılmaz. Dış Chatwoot conversation ID, yerel PG ID'si sayılmaz; bu journal explicit Chatwoot namespace taşır, PG'ye yazmaz.

Atanmış normal personel `crm.view` ile aynı konuşmada Ürün talepleri panelinden kayıtları okur. Issuance yalnız korumalı normal yönetici içindir; panel otomatik WhatsApp gönderimi yapmaz. Mevcut conversation/send/assignment politikaları değiştirilmez.

## Prova ve ortak runtime sınırı

`deploy/customer-product-request-test.mjs` yalnız ayrı, owner'a özel config/paket/hash ile `127.0.0.1:62800/62801/62802` açar. ERP4184/DB02/source/package/copy ve private file pinleri başlangıçta doğrulanır. Eski ortak62700 servis ve Windows supervisor ayarları değiştirilmez. Proof cookie ve normal-personel/Semih/customer journal'ları ayrıdır. Provider/AI/PG/Redis/native ERP yazıları kapalıdır; normal parola doğrulaması ve scrypt korunur. Ortak süreçte default mount kapalıdır. Bu prova autostart veya ortak paketin kurulması değildir.

## Önceki gerçek sonuç — ERP2d blokajı

[12 Ekim kanıtı](../evidence/crm/2026-10-12-customer-product-request/README.md): normal Semih girişi, gerçek7733 konuşması ve müşteri capability/session readback çalıştı. ERP normal girişi291ms; gerçek fotoğraflı ürün listesi25.304ms'de süre aşımına düştü, ERP kendi logunda503 `CATALOG_UNAVAILABLE` var. Bu nedenle ürün seçimi → talep → personel kayıt akışı gerçek ekranda tamamlanmış değildir. Kaynak teknik kontrolü ve tasarım hata görünümü gerçek kabul yerine geçmez.

## Önceki checkpoint — 12 Ekim çekirdek sonucu0424ac7

ERP625 fotoğraflı katalog200/4113ms. Gerçek8023erp36724×3 ve101erp30740×2: adet/çıkarma, reload kalıcılığı, talep/success, exactsameoperation replay/count1, normal assignedpersonel agent2 UI/list/detail çalıştı. Foreignconversation403 ve auth-type401 reddi var. Issuance view-onlyactor401 normalprotectedSIDrequired; shared grant kopyalanmadı. Prova issuerlogout eski cap401. [Redacted kanıt](../evidence/crm/2026-10-12-customer-product-request/README.md). Actualsame-targetagent3, tam mobil/fiziksel/insan kabulü bekler. Başlangıç ERPsource2d config değişmedi; actual625/sameDB02 freshcheck ayrıdır. Her read DB/server/isolation/effect sınırını kontrol eder; source/copy per-requestpin iddiası yok. Uygulama/paket/sharedruntime değişmedi.

## 12 Ekim normal diğer temsilci kapanışı

Desteklenen startupauthJSON +scrypt/DPAPI ile ayrıordinarypersonelagent3/crm.view hazırlığı: current normal login/me200, same55list+sameexistingrequestdetail403/noData; normalassignedagent2same200/actualUI. Eski9user ve env/JWT/grantentries değişmedi, sharedgrantcopy/passwordreset yok. Rootonly628xxrestart; currentPID25616/sourcefb34/startupERP625/sealedconfigcb8345c5. SharedcheckpointPID değişimi rootrestart sayılmaz. Ordinaryview-only hardreload korumalıpasswordreentry, cookiekalıcılığı kapsamı değil. Aynı interestjournal tekrequest/bytehash; privatecopyrestore-check ayrı, activejournaloverwrite0. [Taze kanıt](../evidence/crm/2026-10-12-customer-product-request/other-personel-scope.json). İnsan/mobile/physical ve ortakpaketowneraktivasyonu bekler; eskiagent3pending satırı önceki checkpoint.
