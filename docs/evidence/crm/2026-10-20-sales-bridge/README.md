# CRM06 / P04 — mevcut siparişten tek ERP satış fişine sözleşme incelemesi

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
