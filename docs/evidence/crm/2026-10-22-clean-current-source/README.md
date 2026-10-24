# 22 Ekim — CRM06/E02 temiz kaynak → paket → runtime eşlemesi

## Güncel — 22 Ekim mağaza günü nihai RO eşlemesi

[Nihai makine kaydı](store-day-ro-mapping.json): ERP **5aa4cb3eb143ec1171f0b221e16919d36893883d / CLEAN-ERP-20261022-5aa4cb3eb143**, frontend **7dc6fac/appdiff0**, CRM **c8d0e28**. Son özel makbuz SHA256 **5f804901b42bf40d0970cf39e962df6768616939ca28500d7d3e21ab59523c19**;15kanıt hash'i eş. Ham makbuz repo dışında, güvenli özeti/hashleri bu kayıttadır. ERP'nin [kamuya açık teslimi](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/5546d3d5192a99de4a5920717c97ef096b624afa/docs/evidence/erp/2026-10-22-clean-shared-install.md) ayrıdır.

Cleanclone diff0;7loopbackport/6PID ve eski16actualOS fark0. Canlı iki sağlık/source/paket/DB/ortam ve4194 inbound+sales/4196 yalnız taslak ayrımı uyumlu. CRM3dosya ve ERP'nin gerçek `ornek-akis.html` girişi dahil20dosya disk/HTTP SHAeş. Owner son CRM okuması native5aa üzerinden aynı sipariş3 taslak ve bağlı satış1 FINALIZED/376.50TRY, writes0 gösterir; CRM yeni yetkili çağrı çalıştırmadı. Normal18/19GUI count3→kabul3→fatura4/**TSTB-20261022-GUI3**,2×60=120TRY/kayıtlı iki kur1; kabulde stok21→23, kesinleştirmede tedarikçi0→120 ve ikinci stok etkisi0. OwnerSQL native8/SALE12/compat2/aktif23valid,3sipariş/1satış/1kabul/1alış/2stok/1müşteri/1tedarikçi hareketi/intents0; CRM SQL/provayı tekrarlamadı.

- [Kayıtlı kur1 ve120TRY alış sonucu](store-day-final-purchase-recorded-rate.jpg)
- [Korunmuş CRM kataloğu ve fotoğraf](store-day-crm-catalog-current.jpg)
- [Stok23 ve125.50TRY satış fiyatı](store-day-stock-current.jpg)

HTTP9kontrol **3replay200+6negatif** ve ayrıca **yetkili nativePOST403** içerir. Yanlış9negatif/unauth etiketi yalnız belgede düzeltildi; kaynak/kurulum/prova tekrarlanmadı.12koruma kapsamından11'i aynı; eski sipariş/satış hashleri korunmuş. `old_users` tamhashi değişti: normal login `last_login_at` yazısı ve uygulamanın yalnız o sütundaUPDATE yetkisi ownerSQL kanıtı; sütunbazlı beforeimage yok,12/12aynı denmez. Backup/CHECKSUM/VERIFYONLY ve rollback ownerkanıtıdır; commit sonrası boş-cohort inverse geçerli değildir, otomatik restore/reset yok.

Exact5aa [PR CI39804466004](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39804466004) ve [push CI39804453903](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39804453903) SUCCESS6job. Son bağımsız ROreview açıkP1/P2=0. Bu CRM teslimi yalnız kanıt/durum belgeleridir; uygulama CI'si yeniden açılmadı. İnsan/telefon/Windowsreboot/CRM-UA04/UA11 **BEKLİYOR**;25/12/13/0/74 aynı. Ortak6337512025 raporunu ERP tek sahibi günceller; CRM bu rapora yazmadı.

Sonraki ERP belgeHEAD5546 için [PR39807267938](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39807267938) Windows fixture zamanlaması nedeniyle FAIL, aynıhead [push39807257095](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39807257095) PASS. ERP sahibinin yalnız bu fixture'da stdin/EOF/doğalexit/sınırlıwait düzeltmesi ROreview0; yeni exactWindowsCI BEKLİYOR. Bu sonraki PR durumu, kurulu5aa'nın başarılı uygulama CI'si ve makbuz eşlemesinden ayrıdır; merge/LIVE onayı verilmez.

Son GitHub metadata kontrolünde dar test düzeltmesi8290095 için [PR39809238265](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39809238265)/[push39809226958](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39809226958) IN_PROGRESS; yeniWindowsnativePASS henüz yok. Bu gözlem kurulu5aa makbuzundan ayrıdır.

## Tarihsel ara eşleme — 22 Ekim18:23TR; o anda makbuz bekleniyordu

[Tarihsel RO snapshot](https://github.com/melihsnyldzz-ui/melisa-crm/blob/28fcad91c16eddd7a5ccb6da286ae0b1ef5eed2c/docs/evidence/crm/2026-10-22-clean-current-source/store-day-ro-mapping.json),18:23TR'de kurulu ERP **7dc6fac / CLEAN-ERP-20261022-7dc6fac0898a** ile CRM **c8d0e28** kaynaklarını ayrı kaydeder. Cleanclone diff0;7loopbackport/6PID, canlı sağlık/DB/ortam ve ERP4194 işlem/native4196 yalnız taslak ayrımı uyumlu. Eski16listener actualOS fark0; CRM3/ERP11 dosyanın disk/HTTP SHA256'sı aynı. Pin launcher/health kaynağı eşlendi, yeni yetkili CRM sipariş çağrısı çalıştırılmadı.7dc exact PR39802467273 ve push39802457830 SUCCESS; bu sonuç henüz sonraki dar okuma düzeltmesinin CI'si değildir.

Owner'ın normalGUI kanıtı count3/kabul3/fatura4,2×60=120TRY; kabulde stok21→23, kesinleştirmede tedarikçi0→120 ve ikinci stok etkisi yok. CRM mevcut kabul/fatura görsellerini inceledi; tarayıcıda akışı tekrarlamadı. Fatura görseli kayıtlı-kur düzeltmesinden **öncedir**, kur bilgisinin bu görünümde doğrulanamadığını açıkça gösterir. HTTP kaydı3replay200+6negatif ve ayrıca nativewrite403 içerir;9negatif diye sayılmaz.12koruma kapsamından11'i aynı; eski sipariş/satış hashleri korunmuş. `old_users` farkının normal login `last_login_at` yazısından geldiği owner açıklamasıdır; hash tek başına yalnız bu alanın değiştiğini kanıtlamaz.

Sonraki9satırlık kayıtlı-kur okuma düzeltmesi kaynakta review0; bu snapshot'ta kurulu değildir. Yeni nihai makbuz, son paket/normal-kur ekranı ve native8/SALE12/compat2/aktif guard son hashleri beklenir. Bu dosyalar kaynak/API/SQL/GUI veya insan kabulünü birbirinin yerine koymaz. CRM yalnız dosya/HTTP/OS okumaları ve belge kaydı yaptı; SQL/runtime/servis veya uygulama kodu değiştirmedi.25/12/13/0 ve özgün74 aynı.

## Önceki tamamlanmış eşleme — 22 Ekim aynı siparişten tek satış ve CRM sonucu

CRM uygulama/frontend **c8d0e28f0ea6cf16133c87dd548a4281381abfb7**; ERP uygulama **3db0830df16d36d59cc69b1a19feb593357aaf35**, paket **CLEAN-ERP-20261022-3db0830df16d**. ERP frontend9f build'i ve uygulama farkı0 ayrı; CRM'de bağımsız packageId health alanı yok/null, source/bundle/PID delili vardır. Nihai [makbuz](installation-receipt-order-sale.json) SHA256 **f9231d810a7140f2816ca0ec3edea99be3ccbbe3a675e5b5cc335742f2e19c82**. Önceki495221a1 snapshot'ından yalnız yeni alt-sonuç görselinin eklenmesiyle değişti; rawlistentry çıkarılınca önceki hash birebir yeniden oluşur.

ERP tek sahibinin normal personel15→aynıorder3→satıştaslağı invoice1, ayrı sorumlu17→FINALIZED akışı tamamlandı. Aynı3×125.50=376.50TRY, stok24→21, müşteri hesabı0→376.50; tek stok/tek müşteri hareketi,3order/1invoice/2action/0intent. CRM normal atanmış personel ekranında aynıUUID/satışbelgesi tekrar açıldı; [olay kaydı](order-sale-crm-readback.json) yalnız draftGET200+saleGET200 gösterir, POST0. Bunlar gerçek uygulama ve temiz MSSQL'de **yapay verilerle teknik GUI** kanıtıdır; insan kabulü değildir.

- [CRM tamamlanmış satış](order-sale-crm-final.jpg)
- [ERP sorumlu — görünür nihai sonuç](order-sale-supervisor-final-result.jpg)
- [ERP personel — satış taslağı](order-sale-personnel-draft.jpg)
- [Stok21](order-sale-stock-final.jpg)

[CRM RO eşleme kaydı](order-sale-ro-mapping.json): iki cleanclone appdiff0;23listener/16uniquePID-birth-executable/currenthealth fark0; CRM index+2asset ve ERP index+9asset disk/HTTP hash aynı. Eski16listener before/makbuz/current aynı;7korunan digest beforeSQL çıktısı→finalJSON→makbuz7/7 eş.8native/12eskiSale/2compat definitionhashvalid owner SQL çıktısıdır; CRM yeniSQL/APIişlemi/GUI/prova/restart yapmadı. Süreç çalışma dizini ayrıca OS'den çıkarılmadı. İlk supervisor-final görüntüsü alt sonucu kırpıyordu; saklandı, sonraki yeni-result görseli aynı mevcut ekran kaydırılarak alındı, işlem tekrar edilmedi.

CRM c8 exact [PR CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39779665785), [push CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39779654667), [AIoffline](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39779665786) SUCCESS7job. ERP3db exact [PR CI](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39783687016)/[push CI](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39783679870) SUCCESS6job. Son kaynak/makbuz/görsel bağımsız ROreview açıkP1/P2=0. Bu kayıt yalnız-belge teslimidir; yeni uygulama CI'si veya yeni kurulum sayılmaz.

Owner replay/çatışanistek/personel403/native4196POST403 ve engine-sonrası transactionrollback kanıtı makbuzda; CRM tekrarlamadı. Yedek COPY_ONLY/CHECKSUM+VERIFYONLY var; restore yok. İnsan/telefon/reboot/CRM-UA04/UA11 BEKLİYOR,25/12/13/0/74 aynı.5.1cmd politika reddi ayrı ve aşılmaz; yeni hosting/mesaj/ücretli API/LIVE/Vega/T1/main yok. Aşağıdaki13:54 ve daha eski snapshotlar tarihseldir.


Kurulum yalnız mevcut ERP sahibi tarafından yeni `C:/Sirket/ERP/clean/20261022/` alanında yapıldı. CRM kanonik source, test, review ve GitHub teslimini yaptı; ortak SQL/config/servis yazısı veya ikinci kurulum yapmadı.

## Güncel — 22 Ekim13:54TR / normal ekran ve kurulu iki düzeltme

| Sistem | Kurulu uygulama kaynağı | Owner paket kimliği |
| --- | --- | --- |
| CRM ve frontend build | `1dd07d1f49b01a1847a519a0868294cb05188cd2` | `CLEAN-CRM-20261022-1dd07d1f49b0` |
| ERP ve native | `970cfc24b9fdb0017a79c5ca6c03bb4b59a23bbc` | `CLEAN-ERP-20261022-970cfc24b9fd` |

Son owner makbuzu `runtime/installation-receipt-gui.json`, SHA256 **9407d35235d5b6575706c57d1c624afbc79d3b29f2bac1c0b5705f0906341014**. CRM iki clean clone'un uygulama kaynak farkını0, kurulu ve HTTP ile sunulan index SHA256 **656a01b5b3a059f40d1dbd3e19217a70b2fc50b7055bc155a4442b1d2a8dc233** eşitliğini,7port/6süreç PID/doğum/executable kimliğini ve iki ERP public api/health kaydındaki kaynak/DB/ortam/synthetictrue/actualT1false değerlerini salt okunur eşledi. Makbuzun22listener kimliği halen aynı, fark0; owner'ın16önceki listener koruma kaydı da saklıdır. Süreç→source atfı owner makbuzudur; CRM OS çalışma dizini çıkarmadı. Yeni login, GUI, SQL sorgusu, config/servis/restart veya runtime yazısı yoktur.

- Orijinal fotoğraf ERP970'te düzeldi. CRM normal katalogda yapay ürünün doğal320x320 orijinalini ve küçük görselini açtı; kaynak SVG büyütülmedi, CRM previewfallback yapmadı. Bu gerçek8023 ürün fotoğrafı kabulü değildir. [Kurulu normal katalog](crm-gui-catalog-fixed.jpg).
- ERP sahibi mevcut order3GET'ini keserek yeni Türkçe uyarıyı ve kilitli3adedi normal formda gördü. Engel kalkınca aynı `45064956-9c91-470f-a7b6-a9330b60e456` /376.50TRY kayıt yalnızGET200 ile döndü; yeniPOST0. [Türkçe uyarı](crm-turkish-network-pending.jpg), [aynı taslak geri geldi](crm-turkish-network-recovered.jpg), [normal ERP Onaylar'da aynı kayıt](erp-final-gui-order.jpg).
- Son owner SQL çıktısı3farklıUUID/3order/3line/3journal, herUUIDtek kayıt/ilkorder1korundu/pending0; stokhareketi/fatura/cari etki0 ve stok24/12/0. CRM yalnız bu mevcut çıktının hash ve seçili alanlarını okudu; SQL testini tekrarlamadı. KaynakCI1dd için PR39764301807/push39764294296/AI39764301782 SUCCESS/7job; son13hedef/build/review0 kanıtı korunur. İzleyen yalnız-belge HEAD'i uygulama pini veya bu CI koşumunun head'i değildir.

[Seçilmiş owner makbuzu, ağ olayları, ekran SHA'ları ve bağımsız CRM eşlemesi](gui-network-verification.json). Aynı başarılı kesinti/replay/SQL testleri yeniden çalıştırılmadı. Gerçek personel/CRM-UA11, fiziksel telefon/Zebra ve Windows reboot/logon **BEKLİYOR**;25/12🟢/13🟡/0🔴 ve74yaprak aynı.

**Kalan5.1:** `Melisa-TEST-Ac.cmd` gerçek açılış denemesi ERP ajanında otomatik araç politika incelemesi tarafından komut başlamadan reddedildi. Alt başlatma betiklerinin kullanılması ve syntaxPASS, launcher'ın kendisini veya Windows reboot/logon'u doğrulamaz. Aynı ret başka araçla dolaşılmadı; CRM62800 ve ERP5244 normal URL'leri kullanılabilir. Bu tur yeni ürün işi açmaz.

## Tarihsel — ilk a24/100 kurulumu ve API snapshot'ı

- CRM uygulama kaynağı **a24c00d017ffb76814101013754b70a01cda3a3c**, makbuz paketi **CLEAN-CRM-20261022-a24c00d017ff**. Frontend334fef9 build'idir;334→a24 yalnız backend değişir, frontend kaynak farkı0. Kurulu clone apps/deploy/packages kaynakları a24 ile diff0; sunulan index ile kurulu index SHA256 **8478510ca6b0d8db305573d2e7698df3eceeb998949adf6e1a3b2bf449d32104** aynı. Bu yeni clean kurulum kimliğidir; eski sealed P03 artefaktı kullanılmış sayılmaz.
- ERP uygulama **100a9a5596a9d7b2aff27230b03e3a8fbcc03aa1**, paket **CLEAN-ERP-20261022-100a9a5596a9**. Yeni API4194/native4196 public health source/package, exactDB `MELISA_ERP_CLEAN_TEST_20261022`, environmentId `e662fd94-d797-4b3b-938a-d143ad758b67`, synthetictrue/actualT1false ve eski/LIVE DB erişim0 sınırları CRM tarafından salt okunur eşlendi. ERP'nin genel bütün modülleri tamamlandı iddiası yoktur.
- Makbuz `C:/Sirket/ERP/clean/20261022/runtime/installation-receipt.json`,09:29:45UTC salt okunur snapshot SHA256 **7d331a1b925e34e8b4f8ddd3f126567010dc736536e1ce7e857e6b319ae55bd0**. Owner ilk makbuza process birth/executable alanlarını ekledi; önceki bb1 snapshot'ı güncel dosya hash'i sayılmadı. Makbuzun yeni7port/6process kimlikleri taze listener/PID/creation/executable kaydıyla eşleşti. Geri alma scope'u yalnız bu yeni süreçler; eski16listener'ın korunumu owner makbuzudur. SQL restore veya gerçek Windows reboot yapılmadı. CRM eski süreçlerde yeni stop/restart/SQL sorgusu yapmadı.

## Değişen davranış ve teknik doğrulama

334fef9, normal tam React CRM'ye exact clean profile, normal JWT/rol/atama ve gerçek ERP HTTP+native bağlantısını ekledi. Yalnız konuşma metadata'sı yapaydır; katalog/ürün/fiyat/fotoğraf gerçek ERP servisinden, taslak gerçek yeni MSSQL tablolarından gelir. Backend credential yalnız owner process ortamında kalır; provider ve ücretli AI kapalıdır. Eski shared currentSource/normal auth/price/photo hash/CAS korumaları korunur.

İlk gerçek kurulumda katalog gateway'i clean reader cevabını eski CANONICAL_TEST şartıyla503 reddetti. Gerçek reader→bridge list/detail/photo zinciri yeni offline testte aynı hatayı üretti. a24c00d yalnız geçerli cleanprofile+exact62802origin+synthetictrue+scope/sourceIdentity kabulünü ekledi; yanlış ortam/db/origin/actor/rol/cache reddi korunur. Aynı regresyon önce1FAIL, sonra etkilenen22testPASS/0skip; önceki profile koşumu64PASS/0skip ile örtüşür, toplam86 diye toplanmaz. Normal frontend build PASS; mevcut bağımsız reviewer son kaynak incelemesi açıkP1/P2=0, staged secret taramaları0.

Exact a24 CI: [PR CRM CI39754665944](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39754665944), [push39754658067](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39754658067), [AI offline39754665780](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39754665780) SUCCESS. Kaynak PR3 açık; main merge/yayın yok. İzleyen belge teslim HEAD'i uygulama pini veya bu CI koşumunun head'i değildir.

## Kurulum sonrası gerçek servis / SQL sonucu

ERP sahibinin normal CRM staff JWT→atanmış55→katalog→normal ERP login/customer→native read/replay zinciri makbuzunda:

- Müdür aynı55'i okur, başka personel403 alır. Fotoğraflı katalog1ürün: `0007 MELISA`,125.50000000TRY ve doğrulanmış1359byte görsel. ERP'deki3yapay üründen2'si fotoğrafsızdır; photo-only tercihi korunur.
- Aynı mevcut request `89a4d734-0f03-49c9-a9bd-b5a790521021`, müşteri1/ürün1/adet2 → order1, `CR2-89A4D7340F0349C9A9BDB5A790`,251.0000TRY. GET ve aynıUUID replay aynıID; farklıbody409. Yeni ikinci sipariş oluşturulmadı.
- Owner bağımsız SQL1order/1line/1journal,0stokhareketi/0fatura/0cari-bakiye ve stok24/12/0;8definition/8valid bildirdi. Normal ERP Onaylar veri hattı aynıorder1/adet2/251TRY okur. Bunlar gerçek servis/SQL teknik kanıtıdır; CRM ana ajanının oturumlu GUI denemesi değildir.

## Tarihsel — ilk kurulumdaki tarayıcı ve kabul sınırı

CRM **http://127.0.0.1:62800/** normal TEST giriş ekranı kendi görünür tarayıcımızda açıldı ve son kurulum sonrası yenilendi. [Gerçek ekran görüntüsü](normal-test-login.jpg) yalnız giriş formunu gösterir. Normal hesaptan authenticated katalog→adet→taslak→reopen tarayıcı akışı **DENENMEDİ**: protected first-login handoff desteklenmiyor. Secret/DPAPI/clipboard/HTTP/process köprüsü veya cookie/JWT injection denenmedi. İnsan, fiziksel mobil/Zebra ve Windows reboot/logon kabulü **BEKLİYOR**;25/12🟢/13🟡/0🔴,17başlık/74yaprak ve CRM-UA11 korunur.

Güncel ölçülmüş snapshot ve owner proof ayrımı [verification.json](verification.json) içindedir. Kabul edilmiş eski5Ekim ve gerçek7733 kanıtları yeniden çalıştırılmadı; yeni temiz veri bunların yerine insan kabulü sayılmaz. LIVE/Vega/T1/gerçek müşteri mesajı/ücretli servis/main merge yok.

## İzleyen4.4 gerçek teknik GUI — ERP tek sahibi

Yukarıdaki ilk snapshot yalnız giriş formudur. Kullanıcının sonraki “Ben yerime onlarıda hallet” talimatından sonra ERP sahibi normal personel/ERP hesabıyla gerçek form, katalog, ürün, adet, kayıt ve yeniden açılışı denedi. CRM paralel tarayıcı açmadı; aşağıdaki mevcut görüntü/proof dosyalarını RO inceledi. Bunlar **teknik ajan GUI kanıtıdır, gerçek personel kabulü değildir.** [Ham olmayan seçilmiş makine kanıtı](gui-network-verification.json).

- İstek sunucuya ulaşmadan yalnız taslak yolu kesildi; auth/inbox200 çalıştı. Pending adet2 kilitlendi. Engel kalkınca aynı `fb911576-bfce-4f05-b015-3ea0879c688a` UUID ve body ile GET404→birPOST200→GET200; CRM/ERP251TRY aynı. [Kesinti ekranı](crm-request-cut-pending.jpg), [aynı kayıt geri okundu](crm-request-cut-recovered.jpg).
- Ayrı vakada POST200 yanıtı sunucu kaydından sonra bekletildi; owner SQL'de order3/adet3/376.50TRY kaydını gördü. İstemci zaman aşımına düştü ve otomatik recoveryGET'i de kesildi. Bekleyen adet3 korundu. Engel kalkınca yalnız GET200 ile `45064956-9c91-470f-a7b6-a9330b60e456` aynı kayıt okundu, recoveryPOST0. [Yanıt kaybı ekranı](crm-response-loss-pending.jpg), [GET ile aynı taslak](crm-response-loss-recovered.jpg). Aynı sekme yenilenince CRM personel oturumu ve Taslak Siparişler kartı korundu; aynı ERP hesabıyla GET tekrar aynıID, yeniPOST0.
- Bu iki gerekli yeni sentetik kesinti kaydı ilk order1'e eklenmiştir; ilk makbuzun1order sayımı sonraki toplam sayı diye sunulmaz. Normal gerçek müşteri mesajı veya gerçek ticari kayıt yoktur. Geçici ağ engelleri owner tarafından temizlendi.

Kesinti görüntülerindeki İngilizce `Failed to fetch` **a24 kaynakta önceki hata kanıtıdır.** Dar **1dd07d1** bu ağ uyarısını Türkçeleştirir: journal varsa aynı taslağı doğrulama, yoksa yalın bağlantıretry. Auth/fiyat/timeout/programlama hataları ve CAS/store/POST-GET algoritması korunur.12yaprak+1parent13hedef/build/review/secret ve exact PR39764301807/push39764294296/AI39764301782 CI SUCCESS. İlk görsel hatasının kökü ERP cleanmedia'nın original varyantını reddetmesiydi;970cfc2 original/path/hash/immutable metadata düzeltmesini sağlar. Üstteki güncel bölüm bu iki kaynağın kurulum ve gerçek ekran sonucunu ayrıca kaydeder; bu eski dört ekranın kaynak pinleri a24/100 kalır. İnsan/fiziksel cihaz/Windowsreboot/CRM-UA11 hâlâ BEKLİYOR;25/12/13/0/74 aynı.
