# 22 Ekim — CRM06/E02 temiz kaynak → paket → runtime eşlemesi

Kurulum yalnız mevcut ERP sahibi tarafından yeni `C:/Sirket/ERP/clean/20261022/` alanında yapıldı. CRM kanonik source, test, review ve GitHub teslimini yaptı; ortak SQL/config/servis yazısı veya ikinci kurulum yapmadı.

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

## Tarayıcı ve kabul sınırı

CRM **http://127.0.0.1:62800/** normal TEST giriş ekranı kendi görünür tarayıcımızda açıldı ve son kurulum sonrası yenilendi. [Gerçek ekran görüntüsü](normal-test-login.jpg) yalnız giriş formunu gösterir. Normal hesaptan authenticated katalog→adet→taslak→reopen tarayıcı akışı **DENENMEDİ**: protected first-login handoff desteklenmiyor. Secret/DPAPI/clipboard/HTTP/process köprüsü veya cookie/JWT injection denenmedi. İnsan, fiziksel mobil/Zebra ve Windows reboot/logon kabulü **BEKLİYOR**;25/12🟢/13🟡/0🔴,17başlık/74yaprak ve CRM-UA11 korunur.

Güncel ölçülmüş snapshot ve owner proof ayrımı [verification.json](verification.json) içindedir. Kabul edilmiş eski5Ekim ve gerçek7733 kanıtları yeniden çalıştırılmadı; yeni temiz veri bunların yerine insan kabulü sayılmaz. LIVE/Vega/T1/gerçek müşteri mesajı/ücretli servis/main merge yok.
