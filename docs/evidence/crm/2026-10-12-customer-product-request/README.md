# 12 Ekim — normal diğer temsilci erişimi kapandı

Desteklenen normal auth yapılandırmasıyla yalnız ayrı proof'a yeni bir personel/crm.view profili eklendi; gerçek/paylaşılan hesabın parolası veya Chatwoot rolü/ataması değiştirilmedi. Eski9 kullanıcı ve tüm eski env/JWT ayarları birebir korundu; normal scrypt parola doğrulaması + DPAPI kayıt kullanıldı. Çalışan kaynak/paketfb34 değişmedi. Bu profil TEST ADMIN/testPersonnel veya taklit JWT değildir.

| Gerçek kontrol | Sonuç |
| --- | --- |
| Diğer normal personel/agent3 | Normal password login200, fresh me200/personel/crm.view. Aynı hedef55 talep listesi403 ve aynı varolan request detayı403 WHATSAPP_CRM_CONVERSATION_FORBIDDEN; data yok. |
| Atanmış normal personel/agent2 | Aynı55 list/detail200; aynı requesthash/8023×3+101×2 =2ürün/5adet. Normal UI'da aynı fotoğraflar tekrar açıldı. |
| Durum ve oturum koruması | Customer journal tüm byte/SHA ile aynı, exact-session/toplam request1. Eski proof Semih grant girişleri birebir aynı; yeni private internalreader için2grant ayrı eklendi. Shared grant/JWT taşınmadı. Ordinary grantless personel hardreload sonrası normal parola formunu kullandı; cookie/otomatik giriş kalıcılığı PASS değildir. |
| Yalnız own TEST yenilemesi | Eski ownPID38000 durdu; kısa shell launchPID39236 ready sonrası sona erdi, aynı sealed config kalıcı exec session ilePID25616 açıldı. Uygulama hatası veya kaynak düzeltmesi iddiası yok. Startup ERP625/sameDB02/copye16b freshguard doğrulandı. Root ortak627xx/ERP/LIVE servisini stop/restart etmedi; eşzamanlı koordinatör checkpoint'inde ortak PID'ler değiştiği gözlendi, sebebi ayrıca denetlenmedi. |
| Bağımsız ana teslim adımı | CRM-only interest journal ve mevcut proof refresh state'i repo dışı owner-only snapshot'a alındı; ayrı restore-check kopyası byte/hash ve aynı request/session ile doğrulandı. Aktif journal üzerine restore yapılmadı. Son own restart gerçek mevcut journal'dan aynı kaydı okudu; tam işletme taşıma/restore veya insan kabulü değildir. |

[Normal diğer personel negative/positive proof](other-personel-scope.json), [yenileme sonrası atanmış personel](assigned-personel-after-proof-restart.jpg), [state koruma/ayrı restore-check](request-state-preservation.json). Eski request-readback.json agent3pending alanı önceki0424ac7 checkpoint'indendir; bu taze kayıt o teknik boşluğu kapatır. Capability, JWT, parola, private snapshot içeriği veya ham müşteri verisi yayınlanmadı.

Güncel proof PID25616 / immutable sourcefb34 / manifestf3818f6c / startup configcb8345c5 / ERP625. Önceki PID38000/startup2d aşağıda tarihsel. Ortak CRM source09ca son okumada korundu; ortak süreç PID sabitliği iddiası yok. Root application source/SQL/mesaj/provider/AI/native sipariş/LIVE/main değişikliği0. [DesignQA](../../../../design-qa.md) tam mobil/fiziksel/insan kabulü nedeniyle PARTIAL; actual yanlış temsilci API boşluğu kapalı. Reviewer açıkP1/P2 yok. Tek tree25/12🟢/13🟡/0🔴; kullanıcı PASS eklenmedi.

**Ana sırada ilerleme:** yeni CRM-only state'in private kurtarma hazırlığı tamamlandı. Sonraki tek iş ortak Semih normal TEST aktivasyonunun sahibi tarafından exact paket/config ve ekran kimliğiyle teslimi; sharedservis sahibi yerine müdahale edilmez. İnsan/mobile açıkları ve CI hesap ödeme/harcama engeli korunur.

## Önceki checkpoint — çekirdek akış0424ac7

# 12 Ekim müşteri ürün talebi — gerçek çekirdek TEST akışı doğrulandı

**Teknik gerçek akış hazır; insan kabulü ve iki dar kontrol bekliyor.** Önceki ERP25sn başarısızlığı bu klasörde tarihsel kanıttır. ERP625969d ile gerçek fotoğraflı katalog tekrar döndü; mevcut CRM sourcefb34c29 değiştirilmedi.

| Kontrol | Gerçek sonuç |
| --- | --- |
| Katalog bağımlılığı | Mevcut korumalı ERP normal auth200/293ms; fotoğraflı liste200/4113ms, ilk24 ürün /3.830 toplam. Arama8023 tek gerçek ürün döndürdü; orijinal1206×1500 açıldı. Sayı bir UI görev beklemesi değil backend ölçümüdür. |
| Seçim/adet/çıkarma | 8023 CONCEPT /erp-36724 adet3; 101 BEBESSİ /erp-30740 adet2. İkinci ürün çıkarılıp sayfa yenilendi: server revision5 yalnız8023adet3/request0 kaldı. Yeniden ekleme ve adet2 sonrası revision7, iki ürün/beş adet. |
| Talebi gönder / yeniden açma | Normal müşteri ekranında Talebiniz alındı; iki ürün/beş adet. Tarayıcı yenilemesi aynı başarı kaydını geri okudu. |
| Kalıcı tekrar | Journal'daki aynı revision ve operationUUID ile gerçek POST tekrarları200, aynı session/request/items. Exact-session kayıt sayısı1, tüm journal'da toplam1 talep; başka talep oluşturulmadı. |
| Atanmış normal personel | Ayrı normal parola girişinde personel/Chatwoot agent2/crm.view; actual normal panel ve list/detail200 aynı ürün/adetleri gösterdi. Orijinal iki fotoğraf1206×1500 ve1023×1280 decode edildi; bağlantı oluşturma düğmesi yok. Bu ajan tarayıcı provası fiziksel personel kabulü değildir. |
| Diğer kapsam | Aynı normal personelin farklı konuşma56 okuması403 WHATSAPP_CRM_CONVERSATION_FORBIDDEN, veri yok. Customer capability→staff ve staffJWT→customer401; anonim staff401. |
| Yönetici işlemi / revoke | View-only normal personel issuance401 CUSTOMER_REQUEST_NORMAL_SESSION_REQUIRED; crm.manage403 diye gösterilmez. Prova Semih çıkışı eski customer capability'yi401 ile kapattı; ortak Semih/personel aileleri değiştirilmedi. |
| Açık dar kontrol | Geçerli proof agent3 ile aynı hedefte yanlış atama kontrolü yapılmadı: mevcut korumalı giriş kaydı bulunamadı. Parola tahmini/reset/sharedgrant kopyalama yok. Offline assignment kontrolü bu gerçek sonucu tamamlamaz. |
| Mobil / görsel | CSS390×844 overflow yok; review/success/normal personel gerçek ekranları bu klasördedir. Gizli IAB mobile capture header'ı tekrar çizdi; DOM birheader/0footer idi. Yanlış foreground yakalayan alternatif de public kanıta alınmadı. Tam mobil beş yüzey/fiziksel kullanıcı kabulü bekler; screenshot arızası ERP arızası sayılmaz. |

[Gerçek request/replay/normal rol geri okuma](request-readback.json), [seçim checkpointleri](selection-checkpoints.json), [review](customer-review-real.jpg), [başarı](customer-success-real.jpg), [normal personel paneli](assigned-personel-request.jpg). Request referansı yalnız SHA256; capability/JWT/parola/müşteri telefonu veya ham mesajlar bu kanıtta yoktur. 101'in güncel gerçek productId'si30740'tır; eski keşif notundaki31091 kullanılmadı.

Prova sourcefb34c293fa58154e00b132d13b8246939ce8cbbb / immutable manifestf3818f6cb1925ca652f36bdcc5334a75fb8ce1b4f09a9250011dce30c7498d9f; PID38000/ownerSEMIH\Xaser/loopback62800–62802. ERP4184 PID5092 current release625969d ve exactDB02/copye16b. Başlangıç config eski2d ERP source pinini taşır ve değiştirilmedi; sonraki read'ler DB/server/port/isolation/permission/T1/effect kontrollerini korur. ERPsource/copyId'nin her request'te yeniden pinlendiği iddia edilmez. Ortak62700/source09ca, servis/config/owner pinleri ve eski8 normal kullanıcı kayıtları aynıdır; ayrı proof view-only aktör korunur. Customer session2/request1; yalnız private CRM interest journal yazısı, normal auth/okuma vardır. Chatwoot mesaj/atama, native ERP/ticari/PG/provider/ücretliAI/LIVE/main etkisi0.

Bağımsız reviewer core gerçek akış, üç ekran ve redacted equality/count kayıtlarını tutarlı buldu; açık kaynakP1/P2 yok. Source değişmediği için önceki1165 offline/build tekrar koşulmadı. Bunlar insan kabulü veya bu belge HEAD'inin CI PASS'i değildir. Finish tree25/12🟢/13🟡/0🔴; K01 eski bloke durumundan kayıtlı katalog baseline'ına döndü, CRM-UA11 bekler. [DesignQA](../../../../design-qa.md) PARTIAL: tam mobil görsel/insan kabulü açık.

**Ana teslim dönüşü:** önceki beş ana aşama korunur; ortak normal Semih paket aktivasyonu sahipli supervisor bağımlılığıdır. Bu turda paylaşılan servis değişikliği/restart izni yok, dolayısıyla eski pinler aşılmadı. Kalan aynı-hedef agent3/fiziksel kabul ayrı açık kanıttır; eski25sn hata güncel kesin blokaj olarak kullanılmaz.

GitHub PR3 açık; kaynakfb34 paketinin CI'si önceki7job/steps0 hesap ödeme/harcama engeliyle başlamadı. İzleyen belge HEAD/CI [PR checks](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3/checks) üzerinden ayrı doğrulanır; main merge/yayın yok.

## Önceki checkpoint — ERP2d katalog blokajı (tarihsel)

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
