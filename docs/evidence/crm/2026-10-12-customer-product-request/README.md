# 12 Ekim müşteri ürün talebi — kaynak hazır, gerçek katalog bağımlılığı açık

**PARTIAL / gerçek ürün akışı bloke.** Başarılı HTTP veya offline fixture, insan PASS olarak kaydedilmedi. Ürün seçimi/adet/gönderim/personel readback için gerçek ERP listesi henüz dönmedi; bu alanlarda başarı iddiası yok.

| Doğrulama | Gerçek sonuç |
| --- | --- |
| Normal Semih girişi | 62800 normal parola formu → doğrulanmış patron → gerçek inbox →7733 konuşması açıldı. Anonim TEST ADMIN kullanılmadı. |
| Müşteri bağlantısı | Normal UI'dan yalnız7733 gerçek konuşması için bağımsız link üretildi; customer session200, ayrı kalıcı journal session kaydı. Staff bearer müşteri tarayıcısına verilmedi. |
| ERP oturumu | Mevcut korumalı Ilker read hesabı normal auth200; **291ms**, product.view/sales.view doğrulandı. Secret, token veya capability bu kayda alınmadı. |
| Gerçek fotoğraflı liste | `/api/catalog/products?image=available&page=1&limit=24` **25.304ms sonra TimeoutError**. CRM adapter15s bütçesinde503 `CUSTOMER_REQUEST_SOURCE_UNAVAILABLE`. |
| ERP kendi sonucu | Güncel owner logunda12Ekim02:47:34/02:48:34TR `/catalog/products` **503 CATALOG_UNAVAILABLE**. Driver SQL bütçesi60s; CRM abort başlamış native SQL sorgusunu iptal etmiyor. Art arda retry yapılmadı. |
| Alt teşhis | Tek küçük salt okunur DB identity SELECT hızlı ve exactDB02; sysadmin/control/original/LIVE erişimi0. Server-state yetkisi yok; kilit/plan/witness alt sebebi kesinleştirilmedi. |
| Mobil | Gerçek CSS390×844, scrollWidth390, grid2sütun; ürün0 ve hata görünümü. Resim/adet/başarılı talep ekranı doğrulanmış değildir. |
| Güvenlik / regresyon | Frontend433, gateway574, kontrat/CI158; toplam **1165 offline PASS**. Paket offline build/manifest doğrulaması geçti. Bağımsız reviewer açıkP1/P2 yok; panel state endpoint bulgusu kapatıldı. Testler gerçek kullanıcı kabulü değildir. |

CRM çalışan prova source **fb34c293fa58154e00b132d13b8246939ce8cbbb**, immutable manifest **f3818f6cb1925ca652f36bdcc5334a75fb8ce1b4f09a9250011dce30c7498d9f**; ownerSEMIH\\Xaser, PID38000, yalnız loopback62800/62801/62802. Ortak62700 kaynak **09ca1dac346e42037fd02901baf3240aa6ce6285** ve sahipli supervisor değişmedi. ERP'nin taze source'u **2d371c41442e4e92630f9191f4bae801fd1baebd**, DB02/copy **e16b70f0-4057-428b-9abc-6bbcaf35fe82**; 204b eski gözlemdir.

8 mevcut normal kullanıcı kaydı ve eski personel/Semih/owner state korunur. Yalnız ayrı proof config'te normal `personel`/`crm.view` test aktörü hazırlandı; gerçek Chatwoot ataması değiştirilmedi. Bu aktörde ürün talebi görünümü gerçek ürün olmadan PASS sayılmadı. Store session1/request0; native ERP/Chatwoot mesaj/PG yazısı0, ücretliAI/WhatsApp/provider worker kapalı. Kaynak endpoint/default/LIVE ve gerçek müşteri kapsamı genişletilmedi. Main/tag/LIVE/ortak deploy/restart yapılmadı.

**Tek dış bağımlılık:** ERP sahibi mevcut R3 fotoğraflı katalog liste okumasının başarısız/yavaş alt adımını giderip gerçek liste sonucunu sağlamalıdır. Mevcut fiyat-exclusion/identity/hold/permission kontrolleri kaldırılmayacak; sahte/cached ürünle sorun gizlenmeyecek. Sonra aynı hazır linkte arama → gerçekfoto → seç/çıkar/adet → yenile/readback → çift tıklama tek kayıt → atanmış normal personel ve yanlış rol/müşteri negatifleri tamamlanacaktır. Yeni onay döngüsü yok.

Görsel kanıt [kaynak blokajı390](customer-catalog-source-blocked-390.png). [Seçilen tasarım](../../../design/customer-catalog-flow-20261012.png) örnek görseldir; içindeki yaş ve ürünler veri kaynağı değildir. [Design QA](../../../../design-qa.md) sonucu blocked; gerçek ürünlü render, review ve başarı surfaces bekler.

GitHub sourcefb34 push, PR3 açık. [Taze CI38185910659](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38185910659) ve paralel38185910649/38185906952 tüm işlerdeFAILURE/steps0; annotations hesap ödeme/harcama engeli. Uzak test başlangıcı yok, local1165PASS GitHubCI yerine geçmez. Main merge veya yayın yapılmadı.
