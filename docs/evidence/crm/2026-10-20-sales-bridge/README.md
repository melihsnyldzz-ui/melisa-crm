# CRM06 / P04 — mevcut siparişten tek ERP satış fişine sözleşme incelemesi

## Güncel22Ekim — kurulu teknik bağlantı ve makbuz eşlemesi tamam

CRM c8 / ERP3db, son f9231d81 makbuz ve kaynak/paket/bundle/PID/health eşlemesi RO tamamlandı; aynı order3→invoice1/CRS-20261022-3/376.50TRY/FINALIZED sonucu iki normal ekranda ve yalnızGET yeniden okumada uyumlu. Owner stok24→21/customer0→376.50, tek stok/tek müşteri hareketi ve rollback/replay/rolret kayıtlarını verdi; CRM yeniSQL/GUI/POST/akıştekrarı yapmadı. CRMpackageId null, ERPfrontendbuilt9f/appdiff0 ve insan kabulü ayrı tutulur. [Nihai ekran/makbuz/RO kapsam](../2026-10-22-clean-current-source/README.md), [makine kaydı](../2026-10-22-clean-current-source/order-sale-ro-mapping.json). Son bağımsız ROreview açıkP1/P2=0; CRMc8 CI7/ERP3db CI6 SUCCESS. Sonraki aynı mevcut örnek mağaza günü ERP ortak sırasındadır; bu RO teslimde başlamadı.25/12/13/0/74 ve gerçek personel/telefon/reboot BEKLİYOR. Aşağıdaki kaynak hazırlığı ve retler tarihsel checkpointlerdir.


## Tarihsel22Ekim kaynak tüketicisi — hazırlık checkpointi

ERP sahibi mevcut PR54 worktree'sinde native4196 `GET /api/test/crm/orders/v2/drafts/:requestId/sale` / `melisa-order-sale.v1` sözleşmesini kesinleştirdi. Aynı ERP Bearer ve CRM authorization ile eski draftGET önce/sonra, aynı CRM actor/conversation/peer/assignment kontrolü korunur. DTO yalnız doğrulanmış mevcut sipariş için NOT_CONVERTED/sale:null, DRAFT veya FINALIZED döndürür. Eksik draft404, erişim401/403, kurulu olmayan şema/bozuklink503 veya ağ kaybı satışyok değildir. Native draft-only health/effectfalse pini korunur; satışPOST yalnız ERP4194'te owner'dadır.

CRM tüketicisi yalnız clean profile'da bu GET'i aktarır. Önce normal taslak makbuzu, sonra aynı requestId/orderID/documentNo/customerID/TRY/exact4tutar ve ayrı satışID/durum/etki/revision/capabilities doğrulanır. Müşteri adı DTO'da güncel ERP adıdır; kimlik aynı customerID'yle bağlanır, isim değişikliği sahte hata yapılmaz. NOT_CONVERTED/DRAFT/FINALIZED harici durum uydurulmaz. Satışta collection/reservation false, stock/ledger yalnız FINALIZED'ta true olmalıdır; bu bağımsız SQL kanıtı değil, doğrulanmış ERP okuma sözleşmesidir.

- `nativeOrder.js` yeni `readNativeOrderSale` yalnız resolved journal'ın tam envelope'unu okuma öncesi/sonrası karşılaştırır; eski draft/CAS/POST-GET algoritmasına dokunmaz. Satış404 veya belirsiz sonuç draft404→POST recovery koluna hiç girmez. Close/kimlik/ERPactor/journal değişiminde geç sonuç taşınmaz; satış sonucu storage'a yazılmaz.
- `test-erp-orders.mjs` yalnız cleanGET, exact nativehealth/source/package ve ERP/CRM auth ile orijinal sipariş ve konuşma erişimini önce/sonra kontrol eder. Sonuç requestId/orderID bağı doğrulanır; queryextra/POSTsale/legacyprofil bu yeni yola giremez.
- Mevcut diyalog ve kart üç doğru satış durumunu veya “satış durumu okunamadı”yı gösterir. Taslak etkisizliği tarihsel “oluşturulurken” açıklamasıdır. “ERP durumunu yenile” yalnız draftGET+saleGET yapar; onay/satış/ödeme düğmesi yoktur. Loading/hata eski satış başarısını temizler; browser yenilenince satış durumu tekrar okunmalıdır.

Hedefli kaynak kanıtı: yeni native validator/async/recovery50NodePASS; native proxy18NodePASS; gerçek JSX SSR+eski kart/ondalık uyumluluğu5PASS. Node parent testleri bu sayılara dahildir; bunlar73gerçek personel senaryosu diye sunulmaz. Son normal frontend build22.22snPASS; mevcut bağımsız reviewer kaynak/test RO incelemesi açıkP1/P2=0. Eski57+7,12+4,4.4gerçek GUI veya SQL kabulleri bu değişiklik için manuel tekrar edilmedi. Kaynak **c8d0e28f0ea6cf16133c87dd548a4281381abfb7** origin/PR3 exacthead doğrulandı; [PR39779665785](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39779665785), [push39779654667](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39779654667) ve [AIoffline39779665786](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39779665786) SUCCESS/7job; stagedsecret0. Kurulu1dd/970 ve önceki makbuz, yeni tüketici kurulumu değildir.15:39TR RO makbuz kontrolünde9407d352 hâlâ önceki kurulumdur; yeni kurulum makbuzu yoktur. Belge takip HEAD'i uygulama kaynağı veya bu CI koşumlarının yeni head'i sayılmaz.

Sonraki halka ERP tek sahibindedir: kendi source/review/CI ve CRM sourceCI hazır olunca yeni temiz alana tek kurulum; mevcut order3'ü normal onay/satış/stock-cari/readback ve yenileme/yanıt kaybında tek etkiyle doğrular. CRM runtime/SQL/GUI yazmaz. ERP409eski-revision journal kilidi owner dar reconciliation düzeltmesiyle kapandı; son metadata/triggername/health ayrımı RO incelemesinde de açıkP1/P2=0. Owner6SQLnegatif/rollback ve7sourcePASS bildirdi; CRM bunları çalıştırmış sayılmaz. Yeni kurulu satış GUI sonucu henüz yok. İnsan/fiziksel cihaz/reboot ve25/12/13/0/74 korunur.

## 22 Ekim15:56TR — önceki P2 kapandı, gerçek aktarımda barcode-null bağı sürüyor

Önceki runtime()/transactionbegin hata sınırı düzeltmesi mevcut reviewer tarafından yeniden RO okundu ve yalnız bu kapsamda P1/P2=0 ile kapandı; özel yeni regresyon gözlenmediği owner'a iletildi. Bu barcode veya tüm satış GO'su değildir. Owner'ın sonraki normalGUI denemesinde orijinal v2 sipariş satırının barkod saklamadığı ortaya çıktı; satışa aktarım güvenli reddedildi, satış/stok etkisi oluşmadı. ERP sahibi boşluğu tahmini barkodla doldurmadan ve orijinal kaydı değiştirmeden köprüyü düzeltiyor. Yeni finalERPsource/exactCI/kurulum makbuzu/normal satış ve CRMreadback kanıtı henüz yok. CRMc8/7CI kaynak teslimi hazır ve unchanged; kurulum/SQL/GUI owner'da kalır.

## 22 Ekim15:52TR — yeni kurulum owner bildirimi, nihai makbuz bekleniyor

ERP sahibi9f541f98/CRMc8d0e28 temiz adaylarını kurduğunu, ERP4194 operasyonel satış yetkisi/native4196 draft-only ayrımının korunduğunu bildirdi. CRM clean frontend build23.56snPASS owner çıktısından RO okundu. Yeni nihai kurulum makbuzu henüz yoktur; eski9407d352 makbuzu bu yeni kaynaklara atanmaz. İlk normalERPpersonel ekranı aynı order3/3adet/376.50TRY kaydını gösterir; bu dönüşüm/onay/tek-etki sonucu değildir. Dört mevcut temiz TEST tablosunda eksik SELECT için owner dar düzeltme yaptı; genel DBcontrol/sysadmin/eskiDB yetkisi açılmadı.

Son ek bağımsız inceleme dört SELECT sınırını uygun buldu fakat service runtime()/transactionbegin yeni hata maskelemesinin dışında kaldığı için1P2 bildirdi. Bulguyu owner'a exact dosya/konumla ilettik; nihai düzeltme/exactsourceCI/makbuz/komple satışGUI bekleniyor. CRM ortak SQL/runtime/servis/GUI yazmadı ve yeni satışPOST'u yapmadı. Kurulum eşlemesi yalnız owner'ın nihai makbuzu hazır olduğunda kapanacak; kaynakc8 ve exact7CIbaşarısı ayrı hazır kanıttır.

## Tarihsel ilk22Ekim incelemesi — kurulu normal taslak ile onaylı satışın sonuç bağı

CRM-DEC-024 doğrudan kullanıcı mesajından doğrulandı. İnceleme anında kanonik CRM `0064cf2f57cc8b04f4c29e87ad82f96288c1a1ce`, origin/dal doğru, dirty0; kurulu uygulama1dd07d1 ve ERP970cfc2'dir. Güncel temiz alan ve gerçek teknik GUI/kesinti kanıtı [22 Ekim arşivinde](../2026-10-22-clean-current-source/README.md) korunur. Aşağıdaki20Ekim BLOCKED tanısı geçmişteki ayrı kaynak kapsamıdır; yeniden koşulmadı ve normal/native satışa dönüşüm kanıtı sayılmaz.

| Exact mevcut kaynak | Çalışan kısım | Bu hedefte gerçekten eksik olan |
| --- | --- | --- |
| `apps/frontend/src/liveApi.js:647–649` | Normal müşteri arama, native v2 draftPOST ve aynıUUID detailGET. | Aynı siparişin ERP onay/satış sonucunu okuma sözleşmesi tüketilmiyor; CRM satışPOST'u eklenmeyecek. |
| `apps/frontend/src/lib/nativeOrder.js:35–39,51–83` | Immutable aynıbody/tutar/para birimi; yalnız draft/effectsfalse receipt; CAS ve GET-first recovery. | Bağlı satışın doğrulanmış kimlik/durum/tutar/etki bilgisi mevcut makbuz doğrulaması içinde yok. Draft doğrulaması genel olarak gevşetilemez. |
| `apps/frontend/src/ERPOrderDialog.jsx:13` ve `lib/nativeOrderHistory.js:27–29` | ERP taslağını ve doğrulanmış taslak kartını gösterir. | Mevcut açıklama taslak oluşturma sonucudur; sonradan oluşan satışın güncel durumu gösterilemez. Dönüşüm sonrası da “hareket oluşmadı” yazısını güncel durum diye sunmamak gerekir. |
| `deploy/test-erp-orders.mjs:31–37,69–76,93–99` | Exact native4196 source/package/health, normal CRM+ERP auth/rol ve yeniden assignment kontrolü; üç v2draft route aktarımı. | ERP'nin kesinleştirdiği read-only bağlı sonuç için aynı kapsam/yetki ve hedef pinlerinin korunması gerekir. Native draft-only purpose/effectsfalse sağlık sözleşmesi belirsiz biçimde gevşetilmez. |
| ERP970 `apps/api/src/routes/crmOrderV2Routes.mjs`, `services/crmOrderV2Contract.mjs:53–59`, `cleanSyntheticServer.mjs:9` | Üç v2draft route, strict immutable draft document ve yalnız draftPOST allowlist. | Bu incelenen normal/native kesitte onaylı satışa bağlı readback DTO'su yok. Bu bütün ERP'de satış motoru olmadığı iddiası değildir. |

**ERP tek sahibindeki bağlı iş:** Owner mevcut `invoiceDraftService` create/finalize motorunu, temiz transaction/journal ve UNIQUE order→invoice bağıyla kullanacağını; v2receipt/order1–3'ü değiştirmeyeceğini bildirdi. İlk dar aday aynı TRY order3; güncel ürün/fiyat/barkod/stok witness uyuşmazsa409. Kesin endpoint/DTO henüz yayımlanmadı; bu yön bilgisi çalışan köprü veya CRM'nin uyduracağı sözleşme değildir. PR20CRM f5ad566b ve ERP55 d78474ae halen açık aynı sentetik ayrı hattır, normal motor olarak alınmaz.

**Sonraki tek CRM halkası:** ERP sahibi exact kaynak, read-only endpoint/DTO, onay/satış-yok/belirsiz durum semantiği, kaynak requestId→tek belge bağı, tutar/döviz/etki doğrulaması ve yetki/retry sözleşmesini verir. CRM aynı mevcut store/recovery ve normal UI içinde yalnız bu sonucu doğrulayıp gösterir; yenileme/yanıt kaybı satış veya sipariş POST'u üretmez. Önce değişen davranışın hedefli kontrolleri/review/source teslimi, sonra tek sahipli kurulum. Şimdilik üretim kodu, TEST/SQL/GUI veya yeni test çalışması yoktur; graph aracı bağlantısı kapalı olduğundan inceleme exact bilinen dosya ve pinli ERP kaynağıyla sınırlıdır.

Yeni ajan/yardımcı/Goal/tree/kurulum yok. Gerçek personel/telefon/reboot kabulü BEKLİYOR,25/12/13/0/74 aynı.5.1cmd politika reddi bu işin önkoşulu değildir ve aşılmaz. Yalnız yeni temiz yapay TEST'te owner'a yetkili sentetik satış/etki; gerçek müşteri/ticari kayıt/LIVE/Vega/T1/ücretli servis/main merge/tag yok.

## Tarihsel — 20 Ekim kaynak ve tanısal vaka

20 Ekim 2026 · `DOT-CRM-BRIDGE-20261020-0945-1` · **ERP sözleşmesi bağımlılığı açık**.

Bu teslim uygulama köprüsünü tamamlamaz. Üretim CRM kodu, ERP deposu, kurulu TEST ve müşteri kayıtları değiştirilmedi. Native Goal `paused`; manuel kaynak incelemesi zamanlamayı yeniden açmadı.

## Korunan mevcut sonuç

- PR17/18'in müşteri → ürün/adet → tek ERP taslak → aynı UUID ile geri okuma/yenileme kanıtı korunur; eski12+4 sentetik tarayıcı senaryosu tekrar koşulmadı. [Mevcut ekranlar ve sonuçlar](../2026-10-16-combined-candidate/README.md), [taslak kaydı](../2026-10-16-combined-candidate/flow/04-order-saved-readback.png), [yenilemeden sonra aynı kayıt](../2026-10-16-combined-candidate/flow/06-order-reopened-after-refresh.png). Bunlar bu tur çekilmiş yeni ekranlar veya gerçek personel kabulü değildir.
- [CRM PR20 / f5ad566b](https://github.com/melihsnyldzz-ui/melisa-crm/pull/20), mevcut katalog ve ERP diyaloglarını ayrı sentetik Cloud API'ye bağlar. Normal giriş veya Windows TEST'e taşınmadı.
- [ERP PR55 / d78474ae](https://github.com/melihsnyldzz-ui/melisa-erp-v2/pull/55) sentetik `createSale(orderId)` yolunda tek fiş ve UUID journal korumasını zaten sağlar. Bu iş bunları yeniden geliştirmez.
- Normal CRM'deki `nativeOrder.js` ve `ERPOrderDialog.jsx`, af84b6d ve PR20'de aynı Git bloblarıdır. `validateNativeReceipt` halen yalnız `draft`, `erpPersisted`, aynı request ve dört etki=false doğrular; satış makbuzu diye gevşetilmedi.

## Normal hat ile sentetik hattın somut farkı

| İncelenen mevcut sözleşme | Mevcut davranış | Aynı sipariş → mevcut tek fiş için açık halka |
| --- | --- | --- |
| CRM `POST /crm/erp/v2/drafts`, `GET /crm/erp/v2/drafts/:requestId` → ERP `POST /api/test/crm/orders/v2/drafts`, `GET /api/test/crm/orders/v2/drafts/:requestId` | Taslak oluşturur ve aynı requestId'yi okur; üç v2 route müşteri/create/read ile sınırlı. | İncelenen route/DTO'da kayıtlı CRM taslağını mevcut ERP satış fişine bağlayan işlem ve bağlı fiş geri okuması bulunmadı. Genel ERP satışını ikinci kez oluşturmak çözüm değildir. |
| Normal ERP work-sales router'ındaki `POST /work-sales/drafts` (router içi yol) | `requestId`, `previewHash`, `expectedRevision`, `customerId`, tarih/döviz/ürün seçimiyle mevcut satış taslağı üretir. | Bu body whitelist'inde CRM siparişinin kaynak bağı yok. Tek başına aynı UUID kullanmak iki sözleşmenin aynı ticari kayıt olduğunu kanıtlamaz. |
| Normal CRM müşteri seçimi | Pozitif sayısal `customerId`, `customerMatch` ve doğrulanmış müşteri revision zorunlu. | Ad + Peşin USD/EUR/TL seçimini ifade eden yayımlı sözleşme bu DTO'da yok. Sahte ID/revision veya zorunlu yeni müşteri kartı eklenmedi. |
| Sentetik `/api/cloud-test/erp/orders/:id/sale` | Body yalnız `{requestId}`; `order.lines` snapshotından satış oluşturur. | Sipariş revizyonu veya güncel fiyat/quote witness aktarımı kabul edilmiyor. Bu yol normal/native köprü desteği sayılmaz. |

Normal ERP route/parser kaynaklarının beş Git blobu, salt okunur incelenen `ea0384208116d878c54a7e9cda404ae2ea925f2a` ile owner'ın yayımladığı kurulu uygulama kaynağı `e59e07abf7ae2567cdc2adb93811fe29e0032fe5` arasında aynı. Bu **kaynak karşılaştırmasıdır**; yeni native HTTP, SQL veya kurulum testi değildir. Exact yollar/bloblar `verification.json` içindedir.

## Tek yeni çevrimdışı tanısal vaka

[Tanısal betik](../../../../scripts/crm-sales-bridge-contract.mjs), hash'i sabitlenmiş gerçek PR20 API adaptörü + PR55 Application/Store kodunu, güncel gerçek CRM payload/receipt doğrulayıcısıyla çalıştırır. `Request/Response` doğrudan bellekte çağrılır; listener veya dış HTTP yoktur. Yalnız yeni geçici sentetik SQLite dosyası kullanılır ve kapanışta silinir. SQL Server, Vega veya ortak DB02 kullanılmaz.

1. Önkoşul olarak sentetik müşteri501 için2×25 TRY taslak oluşturuldu; gerçek CRM doğrulayıcısı50 TRY makbuzunu doğruladı. Bu, eski akışın yeni kabulü diye sayılmadı.
2. Yalnız geçici fixture'da katalog fiyatı30 TRY yapıldı.
3. Dönüşüme `expectedRevision` eklemek **400 / INVALID_FIELDS** döndürdü; satış oluşmadı. Bu revision **değişmemiş sipariş revizyonudur, ürün/fiyat revizyonu değildir**.
4. Mevcut yalın body dönüşümü ve finalize **200** döndürdü; saklanan sipariş fiyatıyla toplam50 TRY korundu. Güncel katalogla60 TRY olurdu. Sessiz yeniden fiyatlama gözlenmedi.

**Çıkarımın sınırı:** Saklanan sipariş fiyatını korumak tek başına ERP fiyatlama hatası değildir. İstenen köprüde güncel fiyat/stok kontrolü ile mevcut onaylı teklif fiyatı politikasının nasıl temsil edildiği açıklığa kavuşmalıdır. Örneğin stale durumda409 veya doğrulanmış teklif fiyatını koruyan mevcut witness akışı olabilir; bu dosya yeni fiyat kararı/endpoint icat etmez. Mevcut endpoint bu kararı gösterecek sözleşmeyi sunmadığından sonuç **`BLOCKED_UPSTREAM_CONTRACT`**, köprü PASS değildir.

## Yeniden üretim

Node24 ve repo bağımlılıkları yeterlidir; yeni servis, konteyner veya TEST kurulmaz. Kaynak dosyaları mevcut ignored `apps/frontend/.sites-runtime/` altında yeni bir referans klasörüne alınır; aşağıdaki exact commit/blob hashleri dışında kod yüklenmez:

- ERP d78474ae: `apps/cloud-shared-test/application.mjs`, `store.mjs`, `marker.mjs`.
- CRM f5ad566b: `apps/frontend/src/cloudTest/api.js`, referans klasöründe `crm-cloud-api.mjs` adıyla.

Her dosya `gh api repos/<owner>/<repo>/contents/<path>?ref=<tam SHA>` ile base64 içeriğinden edinilir; Git blob başlığı+SHA1 ve betikteki SHA256 pinleri kontrol edilir. Kaynak edinme GitHub okumasıdır, tanısal çalışmanın bir parçası değildir; betiğin içinde ağ/indirme yoktur.

```powershell
node --import ./scripts/ci/offline-guard.mjs scripts/crm-sales-bridge-contract.mjs apps/frontend/.sites-runtime/<pinli-referans-klasörü>
exit $LASTEXITCODE
```

Beklenen tanısal çıkış **3**: kanıt üretildi, upstream sözleşme bağımlılığı açık. Bu başarısızlık yeşil teste veya CI/insan kabulüne çevrilmez. Çıktı sır, cookie veya oturum anahtarı içermez. Makine çıktısı `probe.json`; kaynak/inceleme/teslim kapsamı `verification.json` içindedir.

## Devir sınırı

ERP sahibi mevcut v2 sipariş ile mevcut work-sales fişi arasındaki tekil bağ ve geri okuma sözleşmesini, kendi sırasında ele almalıdır. CRM bundan sonra yalnız doğrulanmış sözleşmeye bağlanabilir. Aktif B264 sahibine ikinci görev veya mesaj gönderilmedi. Ödeme/“Mal gitti” kilidi ve izli düzeltme bu dar vakada çalıştırılmadı; bunların kabulü çıkarılamaz.

Kurulu CRM6bc bilgisi19 Ekim owner'ın [d74ace8a kanıtına](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/d74ace8afa43e4a7a721e79ab36435512645e022/docs/evidence/erp/2026-10-19-light-hub-rehearsal.md) dayanır; bu tur yeni runtime sağlığı ölçülmedi. Eski17 Ekim439/e85/SOURCE_UNAPPLIED notu güncel kurulum gerekçesi yapılmadı. **GUI DENENMEDİ; fiziksel cihaz ve insan kabulü BEKLİYOR.** Özgün25/12/13/0 ve49+25 kapsamı korunur; LIVE/main/gerçek mesaj/ücretli servis yok.

## GitHub teslimi

Tanısal kaynak ve ilk kanıt kaydı: [e2aab0c9fb644bf863b1d2cb3a0e46236c8a4579](https://github.com/melihsnyldzz-ui/melisa-crm/commit/e2aab0c9fb644bf863b1d2cb3a0e46236c8a4579), mevcut [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3). Exact [PR CI39406144637](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39406144637), [push CI39406136792](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39406136792) ve [AI offline39406144328](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39406144328) SUCCESS; toplam yedi job başarılı. Bağımsız kaynak/kanıt incelemesinde açık P1/P2=0, staged secret taraması0. Bu otomatik kontroller yeni native köprü veya insan kabulü değildir; tanısal sonuç exit3 olarak açık kalır. Yalnız belge makbuzu takip commit'i `[skip ci]` ile ayrılır; source CI ona ait yeni koşum diye sunulmaz.
