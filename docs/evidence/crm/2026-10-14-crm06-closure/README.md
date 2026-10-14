# CRM06 — mevcut kanıt ve kalan kabul, 14 Ekim 2026

Bu kayıt ikinci finish tree değildir. K01/K02/K03 eski insan kabulleri korunur; CRM06 ve CRM-UA11 kapanmadı. Sabit 55 ana ID / 21 ortak sıra ve CRM 25 toplam / 12 tamam / 13 kısmi / 0 açık sayımı değişmedi.

## Kabul eşlemesi

| Koşul | Korunan kanıt | Son ortak paket için kalan |
|---|---|---|
| K01 katalog, arama, kategori ve özgün fotoğraf | Gerçek ERP ürünleri; 8023 özgün 1206×1500 fotoğraf; önceki normal katalog kabulü | Değişen müşteri talep yüzeyinin normal kullanım kabulü |
| K02 ürün gönderimi | 41140 SÜPERMİNİ doğru görsel/bilgi/fiyatlı PDF telefonda kullanıcı tarafından kabul edildi | Eski kabul yeniden açılmaz; yeni mesaj gönderilmedi |
| K03 fiyat/para birimi | 196 TRY/adet mesaj/PDF kullanıcı kabulü | Diğer fiyat, stok veya teslim garantisi çıkarılmaz; talep kaydı fiyat kabulü yerine geçmez |
| Seç/adet/çıkar/reload | Ayrı fb34/628xx: 8023×3 ve 101×2; çıkar/reload ve yeniden ekleme | Ortak 5b6 normal müşteri ekranı |
| Tek kalıcı talep/replay/yeniden açma | Ayrı fb34/628xx: aynı operation ile tek talep, 2 ürün/5 adet | Ortak normal talep ve müşteri readback |
| Atanmış ve yanlış personel | Ayrı normal prova: atanmış agent2 aynı kayıt; agent3 aynı konuşma/talep 403/veri yok | Ortak sürümde mevcut normal personel ekranı ve sınır kabulü |
| Restart sonrası talep geçmişi | Ayrı prova journal/restart ve korunmuş dosya hash'i | Ortak personel geçmişi ekran kabulü; eski müşteri linkinin RAM okuyucusu restart sonrası kapanır, yeni normal link gerekir |
| Mobil / CRM-UA11 | Ayrı CSS 390×844 kontrolü; fiziksel/human kabul verilmedi | Son ortak pakette müşteri/personel akışları ve kişi/tarih/sonuçlu insan kabulü |

[Önceki gerçek prova](../2026-10-12-customer-product-request/README.md), [ortak kaynak teslimi](../2026-10-13-shared-customer-request/README.md), [normal TEST sözleşmesi](../../../development/CUSTOMER_PRODUCT_REQUEST_TEST.md).

## Kaynak ve güncel runtime ayrımı

Salt okunur explorer ve bağımsız kaynak reviewer incelemesi kesin yeni P1/P2 veya zorunlu kaynak düzeltmesi bulmadı. `git diff fb34c293fa58154e00b132d13b8246939ce8cbbb 5b6dfe5acf1c0c1ea301f66aea39bf2abcec8f36 -- apps/frontend/src/customerProductRequest apps/gateway/src/services/customerProductRequest.mjs` boş: bu çekirdek/UI dosyaları değişmedi. 1be normal issuer ailesi/shared mount değişikliğidir; offline kanıt normal/insan kabulü değildir. Kabul edilmiş testler yeniden çalıştırılmadı, paket yeniden yapılmadı.

14 Ekim 11:30 health, 13:00 kesinti sonrası güncel sayılmaz. ERP sahibi yeni kurtarma kanıtı ile aynı ERP/native `7a41f6492273dd1ec0bcb086f820be5575372be8` ve CRM `5b6dfe5acf1c0c1ea301f66aea39bf2abcec8f36` paketlerini doğruladı. CRM manifest `8209226b9e4fefc1b788fc4bec328b4071c375d77630d29fff424bd4cc6fee47`; owner health kaydı `2026-10-14T10:42:11.856Z`. DB02/copy e16b70f0-4057-428b-9abc-6bbcaf35fe82, T1/dış/otomatik işlemler false; provider/send/bridge/translation kapalı. Owner altı süreç kontrolü ve 21/21 tablo hash/sayı korunması bildirdi; CRM ana ajanının SQL kontrolü değildir. CRM ana ajanı 13:43 TRT listener62700/62701 PID41720 ve exact 5b6 test-server paket yolunu salt okunur doğruladı.

## Erişim ve sonraki tek iş

Kullanıcı bekleyen HTTP ekran sorusuna “Açtım” yanıtını verdi. Ancak bağlı IAB tab2 envanteri hâlâ `data:` hata belgesi / ERR_CONNECTION_REFUSED, tab1 eski62400 hata sayfasıdır. Normal HTTP dokümanı bu bağlı yüzeyde doğrulanmadı; önceki browser güvenlik reddi aşılmadı. Alternatif tarayıcı/tab/CDP/ajan, tekrar ekran sorusu veya backend üzerinden UI işlemi yapılmadı.

Mevcut korumalı normal issuer erişimi doğrulanmadı. TEST ADMIN ürün-talebi personel paneline dahil değildir; mevcut crm-agent-test view-only hesabı issuer yerine geçirilmez. Parola, rol/grant/reset veya eski prova authority/state taşıma yapılmadı. Ortak runtime/config/startup/SQL/restart ERP sahibinde kalır.

Sonraki tek iş: izinli normal HTTP yüzeyi ve zaten yetkili normal issuer erişimi mevcut olduğunda, CRM06'nın yalnız değişen ortak müşteri → tek talep → atanmış/yanlış personel → yeniden açma → mobil kabul halkasını tamamlamak. CRM07/native taslak, AI veya müşteri kartı geliştirmesine geçilmez. Build/HTTP/teknik inceleme bu kabulleri kapatmaz.

## 13:51 TRT — HTTP erişimi düzeldi; normal giriş açık

Kullanıcı “bu sefer senin tarayıcında açtım” dedi. Bağlı IAB tab2 artık normal `http://127.0.0.1:62700/` / Melisa Baby CRM; önceki error-protocol engeli **kalktı**. Kullanıcının önkoşulu değiştirmesi sonrası normal API ile aynı sekme okundu; alternatif araç veya güvenlik aşımı yok. Mevcut TEST ADMIN ekranında 7733 araması ve doğru Semih Ş konuşması açıldı. Yeni mesaj veya eski müşteri katalog URL'si üzerinden işlem yapılmadı. Bu ekran okuması normal issuer veya CRM06 insan kabulü değildir.

“Gerçek rollerle giriş” mevcut normal formunu açtı. Kullanıcı adı ve parola alanları önceden doluydu; yalnız dolu/boş durumları kontrol edildi, değerleri okunmadı veya çıktıya taşınmadı. Mevcut form **bir kez** gönderildi: uygulama “Kullanıcı adı veya parola hatalı” yanıtı verdi. Tekrar deneme, credential/reset/rol/grant/allowlist değişikliği veya prova oturumu aktarımı yapılmadı. Normal giriş başarıyla tamamlanmadı; kalan erişim engeli budur. Ekran kanıtı repo dışında yereldir; giriş alanı görüntüsü Git'e yüklenmedi. Yukarıdaki data: hata checkpoint'i tarihsel olarak korunur.

Mevcut normal yönetici girişinin tamamlanması sonrası yalnız CRM06 akışına dönülür. TEST ADMIN veya view-only hesapla normal issuer başarı iddiası yoktur; kaynak/paket, tree ve kabul sonuçları değişmedi.

## Erişim kararı düzeltmesi

CRM-DEC-011 / ERP-DEC-047 kullanıcıdan parola veya tekrar manuel TEST girişi istemeyi yasaklar. Önceki manuel giriş sorusu bu kararı atladı; geri çekildi ve kullanıcıdan işlem beklenmiyor. Mevcut desteklenen korumalı crm-patron/agent2 teslimi doğrulanamadı. Dar CRM runtime credential/dpapi dosya-adı aramasında yalnız başka personel ve iptal edilmiş Semih hazırlığı bulundu; sır değerleri okunmadı veya decrypt edilmedi. Bu kayıtlar issuer yerine geçirilmez; mevcut view-only ERP ajan erişimi de issuer değildir. Gerçek/paylaşılan parola reseti, rol/issuer allowlist genişletme, bypass veya yeniden giriş denemesi yapılmadı. HTTP erişimi düzeldi; CRM06'nın son normal/personel/mobil/insan kabulü bu tek somut erişim/kurulum engeli nedeniyle tamamlanmadı.

## Son checkpoint — hesap ve runtime hazır; CUA giriş aktarımı desteklenmiyor

ERP sahibi yeni ordinary müdür/agent2 ve personel/agent2 profillerini korumalı startup girdisine bağladı: eski7hesap korunur, toplam9profil; mevcut shared password/role reset yok. AppERP/native7a veCRM5b aynı, supervisor-only7a081 aktif. Native protectedreader2/2 ve normalmanager resmi login/me/issuerSID/refresh/logout/ownJWT401 ownerPASS; yeni staff durable-refresh mevcut özelagent3policy dışında desteklenmiyor ve değiştirilmedi. Bu API sonucu normalGUI veya insanPASS değildir.

CUA normal62700 formu erişilebilir. CLI için düzeltilmiş d3a47 credentialconsumer import edildi, çağrı iki sır içermeyen tanı aşamasında **ReferenceError: process is not defined** verdi; Nodeglobalprocess CUA''da sunulmaz. Doğrudan node:process import denemesi açıkça NOTALLOWED. Current CUA/browser/local-web-development dokümanları DOM/tab/screenshot/CDP API''leri sunar; protectedcredential/browserAuth/yerelOSprocess API''si yok, nativeapps kapalı. Processshim/export, aynıretliAPIbaşkaaraca taşıma, clipboard/HTTPsecretbridge veya JWT/storageinjection yapılmadı. Decryptbaşarısı0, yeniactor resmiGUIlogin0, müşteri capability/session/interest0. Normal API/auth/parola kaynağı çalışıyor; eksik bileşen güvenli desteklenen **UI-credentialtransport**.

Form korundu; özel ekran repo dışı ownerSID+SYSTEM klasöründedir ve Git''e yüklenmedi. Ekrandaki eski kullanıcıadı/parola hatası önceki ERP kullanıcıadıyla denemeden kalır; yeniCRM TESTactor denenmedi. Owner bağımsız21/21businesshash+sayı eşliğini, eskipersoneljournalSHA47e2 korunmasını ve sharedintereststore before/afterABSENT0 doğruladı. Native9taslak/13satır ve fiyat kayıtları öncekiownerkanıtıdır, yeniGUItalebi yok. RootSQL/runtime/restart/gerçekmesaj0. Samsung knownTailscalepeeroffline, presentAndroidaygıtı yok; fizikselmobileinsanPASS yok.

[Anonim typedreceipt](ui-transport-blocker.json). Customer seç/adet/çıkar/reload/tekinterest, atanmışnormalstaff ve sonmobile/insankabulü **denenmedi**. Eskifb34/403/readback veK01/K02/K03 kabulleri korunur; yenidençalıştırılmaz. Yeni bir dokümanlı korumalıgiriş API''si veya gerçekten geçerlinormaloturum mevcut olduğunda **aynıCRM06adımına** dönülür; kullanıcıdan giriş/parola veya tekrarTESTizni istenmez. Bu teknik/araçengeli CRM06kapanışı değildir; ERP09 başlamaz.
