# B5 / C01–C02 / CRM-UA11 — rol ve kaynak yeteneğiyle atama

## 24 Ekim 11:00 TR — dokuz kişi ve desteklenen normal yönetim yolu: salt okunur uygulama devri

**B5'in kalan teknik engeli insan kabulü değildir.** Envanter/sunum daha önce tamamlandı; bu incelemede tekrar geliştirilmedi veya test edilmedi. Gerçek kişilere ait yeni kişisel TEST hesaplarının oluşturulması, onaylı yetkinin aynı kişiye bağlanması ve normal TEST'te olumlu/olumsuz erişimi henüz kanıtlanmadı. İnsan kabulü E2 son turunda ayrı kalır; teknik kapanış ona bağlanmaz.

Kanıt kapsamı: mevcut [JSON](normal-user-inventory.json) `installation.normalApiReadback` tam configuredCRM kapsamıdır: **4hesap/4aktif/0kapalı/1temsilcisiz/0çakışma**, sourcec1,24Ekim03:15:33TR. Önceki owner'ın mevcut sırsız `b5-current-normal-inventory.json` dosyası yalnız RO okundu;30096bayt/SHA256 `16550f62193f774e63fb824c8a1ae60a586f1e493609dbfd93616c92f3e27e78` kayıtla aynı,24Ekim02:44:59TR/sourceb40. ERP11kayıt: `1/admin`, `15/ornek-satis`, `16/ornek-okuyucu`, `17/ornek-sorumlu`, `18/ornek-depo`, `19/ornek-kontrol`, `20/ornek-finans`, `21/ornek-sayim`, `22/ornek-inceleme`, `23/ornek-finans-kontrol`, `10018/semih`. Hepsi o makbuzda aktif; yeni canlı sorgu yapılmadı. Bugünkü aktif/pasif çakışma kontrolü uygulama öncesi normal overview'dan yapılır; eski snapshot tüm sistemlerde güncel hesap yokluğu değildir.

TamCRM4: `clean-manager-20261022/ornek-mudur/patron/agent1`, `clean-staff-20261022/ornek-personel/personel/agent2`, `clean-stranger-20261022/ornek-diger/personel/agent3`, `clean-semih-20261023/semih/patron/agentNULL`. Tek kayıtlı sentetik atama55→agent2→clean-staff. İlk üç örnek hesap hiçbir gerçek personele atanmaz/yeniden adlandırılmaz. **Korunacak kesin bağ:** Semih ERP10018/rol28 veCRMclean-semih/Patron; agentNULL yönetici genel okumasını bozmaz, yeni agent uydurulmaz.

| Kişi / onaylı görev | Mevcut makbuzdaki kesin kişisel hesap bağı | Teknik olarak tamamlanacak somut alanlar / sorumlu |
|---|---|---|
| Mehmet: satış, mal kabul, sayım, atanmış CRM; toplama-kolileme | ERP11veCRM4'te kişisel kayıt yok; `ornek-satis/depo/personel` ona ait sayılmaz. İstenen kullanıcı adı **Mehmet** kayıtlı. | ERP sahibi yeni kişisel TEST `erpUserId`+görev rolü+terminal için `employeeId→userId`; CRM'de yeni `crmUserId/personel`+tekil açık temsilci bağı; ERP→CRM ID bağı ve sentetik atama/readback. Gerçek müşteri sahipliği verilmez. |
| Turgay: Mehmet ile aynı görevler | ERP11veCRM4'te kişisel kayıt yok. İstenen kullanıcı adı **Turgay** kayıtlı. | Kendisine ait ayrı ERP/CRM ID'leri, personel kaydı, görev rolü, tekil temsilci ve açık ID ilişkisi; Mehmet'in hesabı/temsilcisi paylaşılmaz. Uygulayıcı ERP sahibi; CRM yazma kaynağı aşağıda eksik. |
| Rüstem: satış, mal kabul, sayım, atanmış CRM | İki makbuzda kişisel kayıt yok; oturum/hesap ID'si bulunmadı. | Yeni kişisel TEST ERP hesabı/rolü+terminal personel bağı veCRMpersonel hesabı/tekil temsilci/IDbağı; atama yalnız sentetik TEST. Toplama-kolileme ek yetkisi çıkarılmaz. ERP sahibi uygular. |
| İsmail: aynı ortak görevler | İki makbuzda kişisel kayıt yok. | Kendi `erpUserId/erpRoleId/employeeId`, `crmUserId/personel/agentId` ve açık IDbağı. Normal yönetici yeni teknik kullanıcı adını çakışmasız belirleyebilir; kullanıcıdan görev/isim tekrar istenmez. ERP sahibi uygular. |
| Yaman: aynı ortak görevler | İki makbuzda kişisel kayıt yok. | Aynı alanlar Yaman'a ait ayrı yeni TEST kayıtlardan üretilir; başka örnek hesabı sahiplenme/ortak agent yok. ERP sahibi uygular. |
| Veronica: aynı ortak görevler | İki makbuzda kişisel kayıt yok. | Aynı ayrı kişisel ERP/CRM ID/rol/personel/temsilci/ilişki alanları; uygun sentetik atama readback'i. ERP sahibi uygular. |
| Ahmet: aynı ortak görevler | Bu temiz ERP11/CRM4'te kişisel kayıt yok. Önceki başka ortamın Ahmet atama kabulü buraya kimlik bağı sağlamaz. | Kendi yeni TEST ERP/CRM ID/rol/personel/temsilci/ilişki alanları; eski Ahmet veyaornek-personel ID'si benzer ada göre alınmaz. ERP sahibi uygular. |
| Angela: ERP/CRM yönetimi, tüm konuşma/atama; satış/mal toplama | ERP11/CRM4'te Angela hesabı yok; istenen kullanıcı adı **Angela**. `ornek-mudur` gerçektePatron, Angela'nın hesabı değildir. | Ayrı ERP yöneticilik+satış/toplama görev rolü vepersonel bağı; ayrıCRM `mudur` hesabı ve açık ERP→CRM ilişki. Genel okuma/atama kendi hesabıyla; Semih rolü/hesabı kopyalanmaz veyaSQL/OS yönetim hakkı verilmez. ERP sahibi uygular. |
| İlker: muhasebe/kasa | ERP11'de İlker yok; `ornek-finans` İlker'e atanmaz. | Ayrı ERP kişisel TEST `userId`+muhasebe/kasa görev rolü ve normal finans erişim kanıtı. **Yeni CRM hesabı/temsilci/genel konuşma/atama yetkisi bu karar için gerekli değildir.** ERP sahibi uygular. |

### Mevcut yol ve dar kaynak eksikleri

**ERP normal yönetim yolu kaynakta var, mevcut clean TEST'te uygulanabilir yazma yolu henüz yok:** `AuthAdminScreen.jsx` Yeni Kullanıcı→`authAdminApi.js`→`POST /api/auth-admin/users`→`settings.manage`→`authAdminService.createAuthAdminUser`→`createManagedAuthUserCore` (benzersiz kullanıcı, aktif rol, bcrypt, transaction/audit). `PATCH /api/auth-admin/users/:id` mevcut rol/aktiflik/adı değiştirebilir; `GET /api/auth-admin/overview` sorgusu kapalı hesapları da kapsar. Personel Tanımları→`POST/PATCH /api/personnel/employees` mevcut ERPuserId'yi employee'ye açıkça bağlayabilir. **Fakat** [cleanSyntheticServer.mjs:33](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/5b616c1577d5d1318978e39d415a3ef111fd708c/apps/api/src/cleanSyntheticServer.mjs#L33) bu POST/PATCH'leri `CLEAN_TEST_OPERATION_DISABLED` ile reddeder; sonra [authAdminService.js:170](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/5b616c1577d5d1318978e39d415a3ef111fd708c/apps/api/src/services/authAdminService.js#L170)/personnelService generic `assertMelisaWriteEnabled` temiz hedefi kabul etmez. Yalnız route'u açmak yetmez. ERP sahibi mevcut core/transaction/audit yolunu exactclean+normalsettings.manage+onaylı kişisel TEST hesapları için dar yetkili yönetim kapsamına bağlamalı; genel writeguard kapatılmaz. Eski `prepare-semih-test-account.mjs` başkaDB/copy/Semih hedefiyle sabittir; dokuz kişi için hazır desteklenen kurulum aracı değildir.

**ERP görev rolü ve gerçek işlem admission'ı da tamamlanmalı:** tek `roleId` seçmek bütün onaylı görevleri birleştirmez. Kayıtlı rol20 yalnız satış,23mal kabul,26sayım örneğidir; sevenstaff için satış+mal kabul+sayım, yalnız Mehmet/Turgay için toplama-kolileme gerekir. Muhasebe örneği rol25'tir, İlker hesabı değildir. Normal UI'de yetki matrisi okunur; mevcut `authAdminRoutes` rol/izin oluşturma-yazma rotası sunmaz. Ayrıca `cleanFinanceRehearsalModel.mjs:27` normal finansıörnekuser20/rol25'e, `cleanOrderSaleScope.mjs:10` belirli doğrudan satışıSemih10018'e sabitler. Yeni doğru roleId verilmesi tek başına yeni kişinin işlemi yapacağını kanıtlamaz. ERP sahibi onaylı normal kişisel hesap/rol bağını mevcut native admission'a dar biçimde taşımalı; finans/diğer kişi/atanmamış iş retleri korunmalı. Semih veya örnek hesabı kişilere devretmek çözüm değildir.

**CRM normal yazma akışı kaynakta eksik:** [CrmUserInventory.jsx](../../../../apps/frontend/src/CrmUserInventory.jsx) ve `GET /crm/users`, `GET /crm/agents` salt okunur; `WHATSAPP_CRM_AUTH_USERS_JSON`/`normalizeUser` config okuması normal hesap oluşturma veya rol/agent kaydetme yönetimi değildir. Yedi personel+Angela için, mevcut normal `crm.manage` ile benzersiz kişisel TEST hesap oluşturma/aktiflik-rol/explicittemsilciID bağını kalıcı kaydedip yeniden okuyan dar yönetim akışı gerekir; başkalarının mevcut hesapları veSemih korunur. Yeni auth motoru değil, mevcut kullanıcı deposu/normal issuer ve envanter ekranının eksik yönetim yazısıdır. İlker'e otomatikCRM hesabı açılmaz.

Mevcut E1 normal-refresh/handoff politikası ayrıca yalnız explicit `clean-staff-20261022` sentetik hesabını kapsar; yeni kişisel hesap eklemek3218SSO'sunu dokuz kişiye kendiliğinden açmaz. Terminal korumalı oturum genişlemesi aynı E1 normal kimlik politikasının ayrı, onaylı-ID bağlı kaynak halkasıdır; B5 teknik hesap/rol/atanmış okuma kapanışını insanE2 veya fiziksel cihaz kabulüne bağlamak için kullanılamaz.

**Konuşma atama motoru mevcut; clean uygulama halkası kapalı:** mevcut App→`POST /crm/conversations/:id/assign`→Chatwoot POSTassignments→GETreadback zinciri vardır. Ancak clean gateway preparation POST'u reddeder; sentetik projection en fazla55/56 ve `assign:false` üretir. Gerçek müşterilere atama yapılmaz. ERP sahibi/CRM kaynak sahibi yalnız ayrı sentetik TEST kayıtları için mevcut atama zincirinin desteklenen, kalıcı/readback'li clean adapteri ve kapalı sınırlarını ayırmalı; `canAssign` veya genelPOSTguard zorla açılmaz. İsim/email benzerliğinden `chatwootPersonnelMappingService.automatic` önerisi ve router'a mount edilmemiş eskiERP mapping okuması gerçek bağ veya yazma yolu değildir.

**B5 teknik bitiş ölçütü:** (1) her gereken yeni kişisel TEST hesabı normal yönetimden oluşturulur veya kesin ID'li mevcut kayıt açıkça eşlenir; benzer isim, paylaşım/reset/örnekhesabı devretme yok; duplicate409/kapalı-pasif kontrolü ve kalıcı reopen/readback; (2) doğru görevler normal kullanıcıda olumlu, yetkisiz/başka kişi/anonim/iptal oturumda olumsuz; (3) yedi personelin yalnız kendi atanmış sentetik görüşmesi, Angela'nın kendi yönetici hesabında tümü ve yetkili TEST ataması, İlker'de yalnız onaylı finans/kasa; (4) gerçek müşteri sahipliği değişmez, mevcut örnekler/Semih/diğerveri korunur. İnsan E2 kabulü ayrı kalır. Bu RO tespit yeni hesap/API/SQL/login/rol/atama/runtime yazısı veya teknikPASS değildir;25/12/13/0 ve17/74 aynı.

24 Ekim 04:44 TR güncellemesi: B5 sunum source635/backendc1 gerçekten kuruldu:762dosya/3A5F7D93, normal owner Ayarlar/yenile/tamreload ve aynı4hesap doğrulandı. CRM yeni GUI/SQL/API çalıştırmadan762dosyayı,3kaynak blobunu ve mevcut normal ekran artefaktını RO okudu. Gerçek kişi eşlemesi ve insan/cihaz kabulü BEKLİYOR. Güncel tek yürütme kaydı [CRM_STATUS.md](../../../../CRM_STATUS.md), ayrıntı bu klasördeki JSON'dadır. Aşağıdaki kaynak-hazır/kurulmamış ifadeleri önceki04:15/04:11 tarihli aşamalardır.

## 24 Ekim 04:11 TR — B5 iki sunum eksiği kaynakta düzeltildi

**63513b21ff931f2b6516c735479c095955213a13** yalnız frontend sunumunu değiştirir: envanter kartı avatarsız iki sütunlu başlıkla tam ad/kullanıcı adını sarar; Ayarlar atama açıklaması menü/handler ile aynı mevcut etkin `canAssign` sonucunu kullanır. Yetki/rol/atama işlemi/API değişmedi. Yeni iki App regresyonu eski kaynakta2FAIL → düzeltmede2PASS (4senaryo); doğru profilli üretim build11,66sn PASS. Bağımsız kaynak review açıkP1/P2=0; 635 exact CI PR40048602545/push40048594210/AI40048602594 tamamlandı: SUCCESS /7job.

Gerçek bileşen/CSS, API sınırı mock olan izole IAB ekranında denendi: eski ad alanı43px/ellipsis; düzeltmede gerçek `window.innerWidth`1440/1024/390 ve yatay taşma yok. Boşluksuz uzun ad390'da iki satıra sarıldı. Bu **sentetik bileşen tarayıcı kanıtı**, kurulu CRM/normal giriş veya insan/telefon kabulü değildir. Geçici loopback fixture durduruldu; viewport sıfırlandı. İlk1440 isteği tarayıcı zoom'uyla gerçek1600 olduğu görülünce dosyalar1600 olarak adlandırıldı; sonraki boyutlar DOM'dan doğrulandı.

**SOURCE_READY / kurulum ve yeni normal GUI BEKLİYOR:** Mevcut kurulu frontend a32/backend c1 korunuyor; yeni source635 henüz ERP tarafından paketlenmiş/kurulmuş sayılmaz. Kurulum ERP sahibine devredilir. Gerçek kişi eşlemesi ve son insan/cihaz kabulü ayrıca BEKLİYOR;25/12🟢/13🟡/0🔴 ve17/74 aynı. Kullanıcı adına seçilen geri alınabilir karar, sadece envanter kartında sarma ve mevcut etkin atama sonucunu açıklamada tekrar kullanmaktır. Yeni auth/plan/ajan/Goal/otomasyon yok.

[1600 önce](ux-before-1600.jpg) · [1600 sonra](ux-after-1600.jpg) · [1440](ux-after-1440.jpg) · [1024](ux-after-1024.jpg) · [390](ux-after-390.jpg) · [Sırsız source/build/layout kaydı](normal-user-inventory.json). Bu JPG'ler yalnız sentetik bileşen içindir; önceki normal owner PNG'sini değiştirmez.

23 Ekim2026. Bu, mevcut bitiş ağacının dar CRM kaynak düzeltmesi ve salt okunur erişim denetimidir. Yeni gereksinim, atama motoru, yardımcı servis veya kurulum değildir. Teknik kaynak sonucu, kurulu normal hesap kanıtı ve insan kabulü ayrı tutulur.

## 24 Ekim03:37TR — B5 teknik envanter normal ekranda tamam

Kurulu frontend **a32e071 / CLEAN-CRM-20261024-a32e071221f5-B5PROFILE**, backend **c1bc351**,761dosya/manifest70CB2066 source/paket/runtime eşlendi. Normal ownerChrome **Hesabım → Ayarlar → Hesap envanterini göster**, yenile/fullreload ve oturum korunumu PASS; aynı4hesap ve55→clean-staff. CRM manifest/dosya/kaynak/publicHTTP ve [kaydedilen ekranı](inventory-normal-settings-a32.png) RO gördü; SQL/login yazısı yok.53ownerSQLözet dosyası before/afterGUI byteeş,16listenerkorunumu owner kanıtı. Exacta32CI7/7SUCCESS. [Tam sırsız kanıt](normal-user-inventory.json).

**Bu yalnız teknik hesap envanteri kapanışıdır.** Gerçek personel kimlik/rol/atama uygulaması ve insan/cihaz kabulü BEKLİYOR; örnek Patron gerçek Müdür değildir. Uzun hesap adları kesiliyor ve genel Ayarlar atama açıklaması read-only/assign=false ile tutarsız; mevcut B5 sınırlamalarıdır, yeni atama yapılmadı. SemihagentNULL korunur.25/12/13/0 ve17/74 aynı; terminal Bserisidışında, tek etkin sıra CRM_STATUS.md. Aşağıdaki bekleyen kurulum/boşprofil kayıtları tarihsel aşamalardır.

## 24 Ekim03:30TR — Gerçek compiled profil / düzeltme a32

4ead frontend761dosya/1621C47B gerçekten kuruldu, backendc1 aynı; fakat owner normal GUI'de panel gizli. Gerçek compiledbundle boşenv `n1={}` gösterdi. Önceki25,22/11,43sn “cleanbuild” yalnız derleme başarısıdır; preload VITEbayraklarını silmiş, profil/GUI kanıtı değildir.

**a32e071** mevcut build-frontend'e yalnız exact `--profile=clean-synthetic-20261022` ekler: mevcutguard/sırtemizliği sonra4sabit sırsızbayrak; default/.envyasağı/ağkoruması aynı, serbestoverride yok. GerçekViteartifact4senaryo1PASS3FAIL→4PASS (+üst ve3guard=8PASS); üretim9,78sn/panelpermissionmountdoğru, reviewP1P2=0. **a32 exactCI PR40045201834/push40045197040/AI40045201865 completedSUCCESS/7job; yeni paket SOURCE_UNAPPLIED / owner normalGUI ve insan BEKLİYOR.** Backendc1/App4ead ve4CRMhesap korunur. Owner yeniimmutable frontend'i explicitprofil ile kurar; önceki yanlışderlenmişartifactler tarihsel kalır. [Sırsız kaynak/paket/GUI ayrımı](normal-user-inventory.json).25/12/13/0 ve17/74 aynı; tek etkin sıra CRM_STATUS.md. Aşağıdaki03:21aşaması güncelGUI PASS değildir.

Owner kurulum çağrısı mevcut frontend çalışma dizininde `node ../../scripts/ci/build-frontend.mjs --profile=clean-synthetic-20261022` olmalıdır. Helper seçilen profil için mevcut guard'ı kendi yükler; caller preloaded olsa da bayraklar guard sonrasında atanır. Varsayılan `build.mjs` profil seçmez; önceden environment içine bayrak yazmak yeni sözleşme değildir. `.env` yüklenmez, yenihelper veya runtimebayrak enjeksiyonu kurulmaz. Gerçek build testi guard'ın caller preload'uyla ve onsuz çalışmasını, dört exactflag dışındaVITE/credential/dotenv taşınmamasını ve bilinmeyen argümanların build öncesi reddini doğrular. Bu teknik kanıt normal tarayıcı veya insan kabulü değildir.

## 24 Ekim03:21TR — c1 kuruldu; normal Ayarlar erişim düzeltmesi

ERP sahibi c1 backend+frontend'i `CLEAN-CRM-20261024-c1bc351218c3-B5` /760dosya/manifest `A5999B06F7ECDF5D2E6F49DAEA14CB8494EAA279D2246BA8665CA65F9B12D4AE` olarak03:13:33TR'de kurdu. Kurulum makbuzu SHA256 `F26E74872F7381344BEF147556694B5EB64F77A417EF65CA59C90877A02A424B`. CRM yalnız RO760manifest dosyası, yedi üretim kaynağı/exactc1Gitblob (gereken yerde sadeceCRLF→LF) ve taze LANindex/modülJS disk-HTTP hash eşliğini doğruladı. Raw/git hash'leri JSON'da ayrı; raw byte eşliği ilk karşılaştırmada sağlanmadığından satır sonu normalizasyonu açıkça kaydedildi. Bağımsız SQL/PID/credential sorgusu yapılmadı. Owner'ın16diğerlistener ve53SQLözet korunumu owner kanıtıdır. Kurulu ERPAPI04a83e53/web0993a123/native035fcc08 pinleri CRM kaynağından ayrıdır.

Normal yönetici API readback'i03:15:33TR'de tam kapsamı gösterdi: **4CRM hesap kaydı/active4/inactive0/unlinked1/conflict0/complete=true**. Dördüncü hesap **`clean-semih-20261023` / `semih` / Patron / agentNULL**; eski üç örnek ve55→temsilci2→clean-staff korunur. Patron global okuma yetkilidir; agentNULL otomatik hata sayılıp temsilci uydurulmaz. Bu dört configuredCRM hesabı11etkinERP hesabıyla ayrı ad alanıdır. Yedi personel/Angela/İlker bu dört CRM kaydında yok; gerçek personel yetki uygulaması yapılmış sayılmaz. Owner normal yönetici200+no-store/personel403/anonim401/send=false/assign=false ve ticariyazı0 kanıtını verdi. Özel readback2860bayt/SHA256 `292BD3A6937CF62CE52502D3D5C1F0E7CF4F4B64E06A13B40D1501BDF564E73F`; yalnız sırsız metadata JSON'a alındı.

### Gerçek normal GUI'de yakalanan hata

c1 paneli menüsü olmayan **Kullanıcılar** dalına eklenmişti. Owner normal Chrome/LAN girişinden Hesabım ve Ayarlar'ı dolaştı; envantere ulaşamadı. API200 ve önceki4izole panel testi normal gezinmeyi kanıtlamıyordu. Bu eksik **normal UI FAIL** olarak kaydedildi; Reactstate/DOM/token enjeksiyonuyla ekran açılmadı.

**[4ead69a](https://github.com/melihsnyldzz-ui/melisa-crm/commit/4ead69a529b45e00669ad930c744a12af37f631d)** yalnız aynı panel mount'unu mevcut **Hesabım → Ayarlar** bölümünde bağlantı kartının altına taşır. Yeni menü/dal, CSS, auth/rol, backend, deploy, hesap veya atama yazısı yoktur; `isLive + cleanbuild + crm.manage` koşulu aynen korunur. Tek üretim farkı `apps/frontend/src/App.jsx`; mevcut App test fixture'ına clean build parametresi ve üç gezinme regresyonu eklendi.

- C1kaynak: yeni3test **2PASS/1FAIL**, pozitif normal yol paneli bulamadı. Düzeltme: **3PASS/0FAIL**; gerçek App'in Hesabım/Ayarlar event handler'ları çağrılır, doğrudan setActiveView enjeksiyonu yoktur.
- Müdür ve Patron aynı normal yoldan panel/düğmeyi görür; personel/`crm.manage` olmayan müdür ve clean dışı build görmez. Gezinmek kendiliğinden hesap okuması yapmaz.
- Fixture normal sentetik oturum + App/SSR testidir; gerçek tarayıcı/insan kabulü değildir. Aynı clean bayraklarıyla offline frontend build **PASS/11,43sn**. Mevcut bağımsız reviewer iki dosyada açıkP1/P2=0; App/test fiziksel hash'leri JSON'dadır.
- **4ead exactCI PR40044335083/push40044329524/AI40044335082 completedSUCCESS/7job; frontend SOURCE_UNAPPLIED.** Kurulu backendc1 aynı kalır; owner yalnız frontend'i mevcut sahipli paket/rollback yolunda günceller. Normal **Hesabım → Ayarlar → Hesap envanterini göster**, yenile/reopen ve aynı4hesap makbuzu gelmeden kurulu ekran PASS yazılmaz. Gerçek insan/telefon/TC21 ayrı BEKLİYOR;25/12/13/0 ve17/74 aynı.

Aşağıdaki03:03 kaynak devrindeki `SOURCE_UNAPPLIED`/Kullanıcılar yolu kurulum öncesi tarihsel aşamadır; bu yeni kurulum ve GUI bulgusunu geçersiz kılmaz.

## 24 Ekim — B5 tam CRM hesap okuması kaynak teslimi

Önceki e1 atama-kapalı düzeltmesi korunur. ERP ana konuşmasındaki doğrudan kullanıcı onayı `01a16b29-ac26-75a2-8554-1d304f61072c` ile mevcut B5'in eksik sırsız normal hesap/rol/temsilci/atama okuması tamamlandı. [Kaynak c1bc351](https://github.com/melihsnyldzz-ui/melisa-crm/commit/c1bc351218c3db70ac2b3fa7cff5ba2bf7560ffb), mevcut feature/[PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3); yeni ana iş veya takip sistemi değildir. [Yapılandırılmış kaynak ve kapsam kanıtı](normal-user-inventory.json).

### Eksik ve uygulanan davranış

`/crm/agents` yalnız etkin, temsilciye bağlı hesapları döndürür. Owner'ın 24Ekim02:44:59TR tarihli hazır `b5-current-normal-inventory.json` dosyası (30096bayt/SHA256 `16550F62193F774E63FB824C8A1AE60A586F1E493609DBFD93616C92F3E27E78`) ERPb40 kaynağındaki11etkin ERP hesabını ve ayrı3CRM temsilci bağlantısını gösterir; kapalı/temsilcisiz CRM hesaplarını kapsamaz. Görüşme55→temsilci2→`clean-staff-20261022` kanıtlı; örnek ERP15 ile aynı kişi olduğu veya gerçek personel eşlemesi çıkarılmaz. Ham özel makbuz repoya alınmadı; yeni ortak sorgu/SQL yapılmadı.

Yeni **GET `/crm/users`**, mevcut normal auth + `crm.manage` ile yalnız exact clean ortamında çalışır. Güncel kullanıcı/revoke ve mevcut projection/topoloji/DB/E662/synthetic doğrulamaları aynen kullanılır. Configured CRM namespace içindeki geçerli hesapların kapalı/temsilcisiz olanları dahil açık metadata DTO'su döner; eksik config kapsamı veya çift ID/ad/temsilci bağlantısı açıkça belirtilir. ERP kullanıcılarıyla veya ad benzerliğiyle birleştirme, yazma endpoint'i, yeni kullanıcı/yetki/atama, credential/hash/token, müşteri telefon/içeriği ve cache yoktur. Diğer ortam404; personel403/anonim401; iptal edilmiş hesap/rol tokenı mevcut fingerprint ile401.

Mevcut **Kullanıcılar** ekranında yalnız normal yönetici ve clean build için talep üzerine okuma paneli eklendi. İlk açılışta ek istek yok. Eski hesap verisi oturum değişiminin ilk render'ında gizlenir; istek iptal edilir ve geç yanıtlar reddedilir. Yeniden okuma/ret eski listeyi temizler. Tasarım/CSS veya atama özelliği yeniden geliştirilmedi.

### Hedefli teknik kanıt

- Backend yeni route regresyonu: **11 PASS** =10alt test+1üst test. Kapalı/temsilcisiz hesaplar, gerçek `mudur` ve `patron` fixture yetkisi, retler, DTO sır dışlama, çakışmalar, partial kapsam, güncel revoke ve write reddi. Önceki kaynakta route404; eski test beklentisindeki rol değişimi403→401 düzeltmesi ürün hatası sayılmadı.
- Frontend: **4 PASS**, gerçek ReactDOM/effect'leri inert DOM host'ta ve API sınırı mock'uyla. Gerçek tarayıcı/GUI değildir. Talep üzerine okuma, oturum değişimi/ilk render, abort/geç yanıt, ret/partial kapsam ve normal GET transport doğrulandı.
- Doğrudan etkilenen mevcut clean projection testi yalnız `clean conversation seed` filtresiyle **1 PASS**; önceki kabul paketleri topluca yeniden çalıştırılmadı.
- Offline guard dış/sabit TEST/provider/SQL erişimini kapattı. Exact clean bayraklarıyla kaynak frontend derlemesi **PASS /25,22sn**; bu immutable paket veya kurulum değildir. Syntax/diff ve staged gitleaks0 bulgu.
- Mevcut bağımsız reviewer dokuz source/test dosyasını RO inceledi, açık **P1/P2=0**. Fiziksel review hash'leri ve exact Git blob hash'leri JSON'da ayrı tutulur.
- Exact c1 source için [PR40042765600](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/40042765600), [push40042760521](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/40042760521) ve [AI40042765647](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/40042765647) **completed SUCCESS /7job**, GitHub'dan tek tek geri okundu; JSON her job kimliğini/sonucunu tutar. Eski e1 CI yeni c1 kanıtı sayılmadı. Son bağımsız RO belge/kanıt incelemesi de açıkP1/P2=0; üç ad alanı/kapsam ve yedi üretim dosyalı devir doğrulandı. Kaynak/CI/build pinleri mevcut ERP sahibine iletildi; kurulum tek yazarı ERP olmaya devam eder.

### ERP sahibine dar kurulum devri

**SOURCE_UNAPPLIED / GUI DENENMEDİ / insan BEKLİYOR.** Son yayımlanmış kurulum frontend `e1ce12b7218ef003198f4955fc1e5871e7430383` / `CLEAN-CRM-FRONTEND-20261023-e1ce12b7218e-CLEAN`, backend `bc8c307ee29f115b2bb7fd4e61f87e9bf482ba54`; bu tur taze runtime health veya süreç sorgusu yapılmadı. B7 nihai makbuzu hazır olmadan paralel kurulum yok. Yeni endpoint yalnız frontend güncellemesiyle çalışmaz; owner mevcut sahipli kurulum yolunda **backend+frontend birlikte** kaynak c1 adayını kurar:

| Kurulu taban → c1 | Değişen üretim dosyaları |
|---|---|
|Backend bc8|`apps/gateway/src/controllers/agentController.js`, `apps/gateway/src/routes/agentRoutes.js`, `apps/gateway/src/services/chatwootInboxService.js`, yeni `apps/gateway/src/services/crmUserInventory.js`|
|Frontend e1|`apps/frontend/src/App.jsx`, `apps/frontend/src/liveApi.js`, yeni `apps/frontend/src/CrmUserInventory.jsx`|

`packages`/`deploy` farkı0; mevcut clean auth/config/roller ve kapalı assign/send/provider/AI korunur. Yeni SQL/migration, rol motoru, hesap hazırlığı veya izin genişletme gerekmiyor. Yerel clean build bayrakları `VITE_CRM_TEST=1`, `VITE_CRM_ISOLATED_PREPARATION=1`, `VITE_CRM_CLEAN_SYNTHETIC_TEST=1`, `VITE_ERP_ORDER_TEST_DATABASE=MELISA_ERP_CLEAN_TEST_20261022`; owner'ın mevcut exact profilini değiştirme yetkisi CRM'de değildir. Owner pinli paket/manifest/bundle ve backend source/PID ile kurulum/readback verir; başarısızlıkta önceki korunan backend+frontend çiftine kendi rollback yoluyla döner.

Kurulumdan sonra mevcut normal yönetici **Kullanıcılar → Hesap envanterini göster** ile tam CRM kapsamını okur; personelin bu listeye erişememesi korunur. Kapsam/kimlik/rol/temsilci ve mevcut sentetik atama metadata'sı sırsız kaydedilir. Kaynak/full config okuması olmadan gerçek hesap yokluğu veya kurulmuş yetki iddia edilmez; Semih ve mevcut ID/atamalar korunur. Onaylı yedi çalışan/Angela/İlker gerçek eşlemesi ancak bu readback'ten sonra uygulanabilir; insan/fiziksel telefon/TC21 son kabulü ayrıca BEKLİYOR. Özgün25/12🟢/13🟡/0🔴 ve17/74 aynı; terminal tek giriş/görsel işi bu B serisi turunun dışında.

## Aşağıdaki 23 Ekim kayıtları tarihsel kaynak ve kurulum aşamalarıdır

## Karar ve kurulu gözlem

[CRM-DEC-017](https://github.com/melihsnyldzz-ui/melisa-crm/blob/5342b4358d8cd7e0ffb606a93fa532e3049e6f55/PROJECT_DECISIONS.md#crm-dec-017--15-ekim-2026--sanal-personel-test%C3%A7isi-crm-alt-rol%C3%BC) personel için atanmış görüşme ve yanlış personel reddi; müdür için genel erişim/atama kontrolü ister. [Şirket LOCKED kararları](https://github.com/melihsnyldzz-ui/melisa-os/blob/bfa3b00f221f33c3a101a112adc34dbf82fb83f0/docs/operations/ecosystem-decisions.md) en az yetki, kişi başına hesap, TEST/gerçek veri ayrımı ve sırların korunmasını gerektirir. Bu dar çalışma MFA, ticari indirim veya tüm şirket yetkilerinin kabulü değildir.

- Kanonik root/origin/feature doğru, başlangıç belge HEAD9830bef ve dirty0. Kurulu clean CRM clone **bc8c307ee29f115b2bb7fd4e61f87e9bf482ba54**; UI62800/gateway62801 PID49984, yalnız UI loopback/LAN/Tailscale ve gatewayloopback. Kurulu server SHA256 **12ea8954d92356e7d3065dde32f961e9c6d9a16eae8f932bd291123a826c44e8**, önceki [kaynak/runtime eşlemesi](../2026-10-23-clean-network/README.md) ile aynı.
- Bu tur fresh publichealth API4194 **7b3d9b8b0c9198dc6eeb04de1db697b1d22271e9 / CLEAN-ERP-20261022-7b3d9b8b0c91**, native4196 **035fcc08d8f56cdd0cbc437a290285328fce1ec9 / CLEAN-ERP-20261022-035fcc08d8f5** gösterdi. İkisi aynı `MELISA_ERP_CLEAN_TEST_20261022`, ortam `e662fd94-d797-4b3b-938a-d143ad758b67`, synthetictrue/actualT1false. ERP sahibi B4'te ilerliyor; önceki035/035 snapshot'ı bugünkü uygulama eşliği diye taşınmadı. CRM yeni kurulum yapmadı.
- LAN62800 üzerinde credentialsiz dört **GET**: inbox, görüşme55, görüşme56 ve agents **401 / WHATSAPP_CRM_AUTH_TOKEN_REQUIRED**, data yok. Bu yalnız anonim erişim reddidir; atanmış/yanlış personel403 veya müdür200 kanıtı değildir.
- Kendi bağımsız IAB sekmesi normal giriş formunda açıldı; hazır personel/müdür oturumu bulunmadı. ERP'nin açık Chrome/ERP oturumları değiştirilmedi. Normal hesapla rol GUI denemesi **GUI DENENMEDİ**.
- Güncel ERP worktree `AGENTS.md` başındaki **ERP-DEC-069** okundu: yeni clean hedefte owner'ın DPAPI kaydını güvenli CUA belleğinden normal parola formuna aktarıp gerçek giriş yaptığı kabul edildi. Eski15Ekim blanket engeli bu clean hedefe genellenmedi. Bu CRM turunun IAB aracında belgeli yetenekler pageAssets/webmcp/cdp ve normal form işlemleridir; korumalı secret-reference/DPAPI form aktarımı sunulmuyor. Sır okuma/çıktı/pano/HTTP/process köprüsü, cookie/JWT enjeksiyonu veya farklı araçla ret dolanma denenmedi. Kullanıcıdan parola istenmedi.

## Rol kanıtının sınırı

| Davranış | Kanıt | Bu tur sonucu |
|---|---|---|
| Personelin atanmış görüşmeyi görmesi | Kurulu normal personel katalog/refresh owner kanıtı önceki ağ makbuzunda; kaynak `chatwootInboxService.js` agent filtresi ve detay denetimi | Önceki teknik kanıt REUSE; yeni personel GUI kabulü yok |
| Başka personele ait / atanmamış görüşmenin reddi | Kaynak `crmAuthService.js` personelde agent eşliğini zorunlu tutar; önceki clean owner HTTP kaydında stranger403 | Tarihsel teknik kanıt; yeni kurulu rol403 testi yapılmadı |
| Müdürün genel erişimi ve rol atama izni | Kaynakta mudur/patron `crm.view,crm.assign,crm.agents,crm.manage,crm.send`; personelde assign yok | Kaynak/önceki test içeriği; bu tur müdür GUI200 yok |
| Semih/Patron normal giriş ve yenileme | ERP sahibinin önceki açık devir kaydı; kurulu sourcebc8, eski üç örnek hesap korundu | Kabul edilmiş owner teknik sonucu REUSE; tekrar giriş yok |
| Clean kaynağın atama kapalı demesi | Kurulu bc8 kaynak projection/inbox `assign:false`, mesaj gönderimi kapalı | Atama başarı kabulü değildir; mutasyon denenmedi |

Mevcut `tests/clean-synthetic-profile.test.mjs` içindeki adı `manager` olan fixture **patron** rolündedir; gerçek `mudur` hesap/ekran kabulü diye sunulmadı. Eski testler yeniden çalıştırılmadı. Graph index12Ekim'de ve cited path'lerde `metadata_changed` olduğundan güncel disk kaynakları esas alındı; index/cache/altyapı kurulmadı.

## Somut hata ve dar düzeltme

Backend clean inbox/görüşme `assign:false` bildirirken frontend yalnız müdür/patron rolünden atama izni üretiyordu. Atama penceresi açılabiliyor; mevcut submit yolu gerçek Chatwoot adapterine gidiyordu. Clean profil provider sırlarını boşalttığından bu yol kapalı kalır; yetki yükselmesi veya başarılı gerçek atama iddiası yok. Bu uyumsuzluk normal müdür-atama kabulünü kanıtlamıyordu.

Yalnız `App.jsx` / `liveApi.js` değişti:

- Normal rol izni ile oturum, inbox ve ilgili görüşmenin açık retleri birlikte uygulanır. Bir kaynağın `false` bildirimi başka olumlu bayrakla ezilmez.
- Inbox capability normalizasyonda korunur; oturum açma, güncel inbox/sayfa okuma ve çıkışta kendi scope'uyla güncellenir. Menü, müşteri paneli, kuyruk ve onay penceresi aynı sınırı kullanır.
- Doğrudan atama handler'ları ve eski onay callback'i güncel oturum/inbox/görüşme ref'lerinden tekrar kontrol eder. Kaynak yeteneği kapanınca açık pencere kapanır/gizlenir ve çağrı yapılmaz.
- Desteklenen yönetici ataması ve capability bildirmeyen mevcut yönetici sözleşmesi korunur. Backend auth/rol/atama, mesaj, SQL, katalog, paidAI veya provider ayarı değiştirilmedi; clean gerçek Chatwoot yazısı açılmadı.

## Hedefli doğrulama

İlk11 yeni kontrol eski kaynakta **2 PASS /9 FAIL**; aynı11 düzeltmeden sonra **11 PASS**. Sonradan eklenen legacy yönetici ve gecikmiş görüşme/rol retleriyle son hedef **13 PASS /0 FAIL**. Son iki test için eski-kaynak red kanıtı iddia edilmedi. Denied durumda mock assign çağrısı0; desteklenen müdür yolunda aynı hedefe tek çağrı1. Bunlar yerel React hook/SSR ve API normalization kontrolleridir, gerçek tarayıcı veya insan kabulü değildir.

```text
node --import ./tests/offline-test-guard.mjs --test --test-concurrency=1 --test-name-pattern=B5 apps/frontend/tests/assignment-capability.test.mjs apps/frontend/tests/text-draft-app.test.mjs
```

Değişen izin/normalizasyonun doğrudan etkilenen7 uyumluluk kontrolü ayrıca PASS. Offline guard uygulama credential'larını temizledi ve dış/sabit TEST soketlerini engelledi; gerçek CRM POST/mesaj/sipariş/atama yazısı yapılmadı. `node --check` ve credential temizleyen mevcut `scripts/ci/build.mjs` başarılı. Build kanonik kaynakta yereldir; kurulu dist veya immutable paket değildir. Mevcut bağımsız reviewer dört source/test dosyasını salt okunur inceledi: açık **P1/P2=0**. App/normalizer/test review fiziksel hash'leri [verification.json](verification.json) içindedir.

## Teslim ve kalan tek erişim halkası

Kaynak **[e1ce12b7218ef003198f4955fc1e5871e7430383](https://github.com/melihsnyldzz-ui/melisa-crm/commit/e1ce12b7218ef003198f4955fc1e5871e7430383)** mevcut feature/[PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) OPEN üzerinden push edildi; exact-source [PR39937110494](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39937110494), [push39937104202](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39937104202), [AI39937110495](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39937110495) üç workflow **completed/success,7/7 job** olarak GitHub'dan geri okundu. İzleyen belge HEAD'i bu CI source'u veya kurulu uygulama değildir; belge makbuzu [skip ci] ile ayrı teslim edilir. **SOURCE_UNAPPLIED**: kurulu CRMbc8 ve ERP sahibinin B4 kurulumu değiştirilmedi; yeni CRM paket hazırlama/restart/servis/SQL/hesap yazısı yok. Owner uygun zamanda exact kaynakla mevcut kurulum yolunu kullanır; ikinci paralel kurulum istenmedi.

Eksik normal giriş halkası, **bu CRM aracında korumalı örnek personel/müdür kimliğini normal forma sır sızdırmadan aktarabilen desteklenen oturum**dur. Bu eksik kaynak düzeltmesini veya ERP B4'ü durdurmadı. Gerçek kişi→görev/rol eşlemesi, kurulu personel/müdür GUI, fiziksel telefon/TC21 ve insan CRM-UA04/UA11 kabulü **BEKLİYOR**. C01/C02 sarı;25/12🟢/13🟡/0🔴 ve17başlık/74yaprak aynı.
