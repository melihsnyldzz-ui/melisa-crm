# 22 Ekim — CRM06/E02 temiz kaynak → paket → runtime eşlemesi

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
