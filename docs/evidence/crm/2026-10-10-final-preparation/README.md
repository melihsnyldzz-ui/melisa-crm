# CRM son ortak hazırlık / 10 Ekim 2026

CRM-FINAL01 / CRM-DEC-009 / ERP-CRM-FINAL01

Bu kayıt, önceki DB02 geniş katalog ve sipariş kanıtını korur. Güncel CRM paketi ve ERP bağlantıları taze salt okunur kontrolde doğrulandı; normal CRM kataloğu gerçek tarayıcıda açıldı. Koordinatörün seçili TRY günlük işlem provası 25 native kontrolle tamamlandı; bütün mağaza ve insan kapsamını tamamlanmış saymaz. **Tam kapsamlı ortak TEST henüz hazır değil; CRM-UA08 insan kabulü bekliyor.** Ajanın teknik kontrolü insan kabulü değildir.

## Korunan ortak bağlantılar

| Alan | Mevcut kanıt / sınır | Son hazırlıkta kalan |
| --- | --- | --- |
| Ürün, stok, fotoğraf ve fiyat | DB02 ortak ERP kaynağı; 11.843 satışa uygun ürün, TRY/USD/EUR ayrı, onaylı medya ve karantina korunur. CRM ikinci ürün veritabanı oluşturmaz. V2 kaynak c5081be üzerinde altı örneğin stok/fiyat kimliği ve beş onaylı thumbnail karşılaştırıldı; V6 bu kanıtı hash referansıyla korur. | Gerçek personelin günlük kullanım kabulü. |
| Müşteri döviz hesapları | 375 doğrulanmış hesap; aynı dövizli seçim ve kaynak kimliği zorunlu. İki LL müşteri hesabı dışarıda. | Gerçek kişi/telefon bağı bulunmayanlar işletme kararına kalır; tahminle eşleme yok. |
| CRM sipariş taslağı | Önceki native taslak / ayrı GET / refresh / aynı UUID replay kanıtı korunur. Üç mevcut TRY/USD/EUR taslağı güncel adapter ve native GET/yenilemede aynı kaldı; yeni taslak oluşturulmadı. Stok, cari veya fatura etkisi oluşturmaz. | Mağaza günü taslağını mevcut ERP satış belgesiyle manuel ilişkilendirerek kontrol etme. Otomatik satışa çevirme onayı yok. |
| Personel görünümü | Atanmış konuşma ve backend izin sınırları korunur; sentetik TEST aktörü gerçek personel kabulü değildir. | Gerçek personel oturumu ve İlker'in günlük iş onayı. |
| AI ve WhatsApp | Ortak ortamda ücretli AI ve gerçek dış gönderim kapalıdır; başlangıçta model çağrısı yapılmaz. Eski izinli gönderim denemeleri bu tur yapılmış sayılmaz. | Gerçek AI veya müşteri gönderimi için ayrıca açık kullanıcı onayı. |
| Günlük ERP işlemleri | Yeni son hazırlık profili yalnız DB02'de seçili TRY ürün/müşteri/tedarikçi/TEST kasasıyla sınırlı; koordinatörün 25 native kontrolü, iade ters kaydı, tekrar güvenliği ve korunan kapsam kontrolü tamamlandı. Geniş mal kabulü ve katalog kapsamı korunur. | Normal ERP ekranlarının ortak sonucu koordinatör raporundadır; fiziksel personel ve geniş insan kabulü bekler. Bu belge bütün mağazaya PASS vermez. |

Önceki geniş mal kabulü 1.158 ürün / 53 tedarikçi / 57 döviz bağlamı; kaynak fiyatlı alış 636 ürün / 31 tedarikçidir. Bu sayılar yeni günlük satış/finans katmanının bütün mağaza kapsamı olduğu anlamına gelmez. TRY/USD/EUR kaynak kurları tarihli TEST tanıklarıdır; güncel piyasa kuru veya güncel Vega bakiyesi değildir.

## Bu turdaki dar CRM düzeltmesi

Mevcut CRM kayıtlarını değiştirmeyi reddeden 403 mesajının bozuk Türkçe karakterleri düzeltildi. Reddetme davranışı, HTTP durum kodu, roller ve izinler değişmedi. Ayrı çevrimdışı regresyon testi POST/PUT/PATCH/DELETE reddini, GET davranışını ve mevcut giriş yolunu doğruladı: 1/1 PASS. Ticari kayıt, mesaj veya atama yazması yapılmadı.

Çalışan immutable CRM kaynak commit'i `5f8cb2375c8dbc8713c6769da2b5ba65480f2f41`; paket `crm-shared-test-5f8cb2375c8dbc8713c6769da2b5ba65480f2f41`. Taze supervisor ve üç child servisi READY, manifest pini ve normal UI/gateway/katalog/adapter bağlantısı doğrulandı. Güncel ERP API/native kaynak `a51b1170ade29494b3b446a44a8a62974eef687b`, ayrı native sipariş kaynağı `60e424b61febd062668be0ccf3595c546da263a0`; üç sağlık kimliği aynı DB02 hedefinde, otomatik işler/dış işlemler/gerçek T1 kapalıdır. Önceki CRM `38a168c7720de5f1b73bd523a3dff5125fc12097` kendi tarihsel kanıtıyla korunur. Son belge HEAD'i uygulama kaynağı yerine kullanılmaz.

Güncel V6 salt okunur prova **19 yeni kontrol** içerir: güncel kaynak/DB/servis kimlikleri, kapalı AI/gönderim sınırları, mevcut oturumlar ve üç eski TRY/USD/EUR taslağının adapter/native GET ile yenilemesi. Altı ürünün stok/satış fiyatı ve beş CONFIRMED thumbnail kontrolü, ERP source `c5081be7725dac53cf887ebf6500224eac7a3e91` üzerindeki **V2 30 kontrol** kanıtından SHA256 referansıyla yeniden kullanıldı; bunlar a51 paketinde yeni ölçüm diye sunulmaz. Fotoğrafsız örnek V2'de fotoğrafsız kaldı. Önceki V1 provada normal personel hesabı diğer TEST aktörünün üç eski taslağını 404 ile göremedi; bu ayrı kanıt korunur. V2 ve V6'te aynı kayıtlar eski oluşturucu TEST kimliğiyle geri okundu. Bu, izin genişletme veya insan kabulü değildir. Mevcut personel ve ERP satış personeli oturumu kullanıldı; yalnız mevcut auth/session POST'ları yapıldı, yeni ticari POST veya SQL yazması sıfırdır. Token ve gerçek kayıt ayrıntıları yayımlanmaz.

V6 kontrolü, koordinatörün güncel ERP source `a51b1170ade29494b3b446a44a8a62974eef687b` aktivasyonundan sonra yapıldı. V1, V2, V3, V4 ve V5 kanıt dosyaları değiştirilmedi; V6 ayrı private kanıtta tutulur. Son ERP değişiklikleri dar günlük işlem/ayrı kasa etkisi sınırındadır; katalog kanıtı yeniden geniş test edilmedi. ERP günlük işlem provası koordinatörde ayrıca yürür; bu salt okunur CRM kontrolü onun sonucu veya bütün işletme akışlarının PASS'i değildir.

**Güncel normal ekran kanıtı:** CRM source5f8 / ERP sourcea51 ile 62700 normal CRM kataloğu, mevcut TESTADMIN oturumu yenilendikten sonra 50 fotoğraflı ürün ve 3.830 ürün kapsamıyla açıldı. Süresi dolmuş oturumdan dönüşte mevcut taslak korundu. Ekran görüntüsü repo dışı `private/gui/crm-catalog-current-a51.png` kanıtıdır; gerçek kullanıcı/personel kabulü sayılmaz. Yoğun eşzamanlı okuma sırasında gateway/UI listesinde gözlenen 15 saniyelik `ERP_BRIDGE_UNAVAILABLE` zaman aşımı private tanıda korunur. Son dar sıralı kontrol aynı listeyi native/gateway üzerinden 200 ve yaklaşık 2,1 saniyede okudu. Bu transient gözlem silinmedi; kalıcı hız garantisi verilmedi. CRM kodu, rol ve 15 saniyelik köprü koruması değiştirilmedi.

Ortak TEST adresleri: [CRM](http://127.0.0.1:62700/), [ERP](http://127.0.0.1:5234/ornek-akis.html), [terminal](http://192.168.1.46:5234/terminal.html#products). CRM gateway/katalog/taslak/native portları 62701–62704; ERP API/native 4184/4186. Terminal LAN adresi fiziksel cihaz erişim kabulü değildir. TEST125 ve eski servisler korunur.

## Mağaza günü ve gerçek kalanlar

Tam mağaza TEST'i henüz hazır değildir: gerçek kasa/banka açılışı için hazır doğrulanmış kapsam 0; 8 kişi/cari kimlik eşlemesi, 18 kökeni bilinmeyen işlem/belge ve fiziksel Zebra/personel kabulü bekler. GitHub CI hesap/harcama engeli ayrıca sürer; yerel testle yeşil sayılmaz. Bu sayılar koordinatörün son hazırlık sınıflandırmasıdır; yeni kaynak aktarımı veya işletme onayı değildir.

Tek yönetici turunda mevcut atanmış konuşmayı açma → kaynak ürün/fiyat/döviz seçimi → aynı dövizli doğrulanmış müşteri hesabı → mevcut native taslağı açma / ayrı geri okuma / yenileme → mevcut ERP belgesini manuel ilişkilendirme → CRM'e dönüş ve AI kapalı görünümü değerlendirilecektir. Yeni ticari denemeler yalnız koordinatörün izole TEST kapsamındadır; kullanıcıya otomatik satış veya gerçek müşteri gönderimi sözü verilmez. Anonim ayrıntılı kontrol sırası repo dışındaki private CRM kanıtında tutulur.

Seçili TRY native günlük katmanın teknik sonucu tamamlandı; kapsamlı ortak kullanım kararında koordinatörün normal ekran kanıtı ve yukarıdaki somut işletme engelleri birlikte değerlendirilecektir. Güvenli insan TEST'i sırasında personel kullanım kolaylığı, manuel belge bağı, gerçek rol görünümü ve fiziksel Zebra okuyucu/uyku-uyanma kontrol edilebilir. Eksik kişi/cari kimlikleri, bağımsız kasa/banka açılışları, gerçek kaynak driftinin final T1 kapsamı, fiziksel personel ve insan kabulü LIVE öncesi ayrı engellerdir. Bilinmeyen kasa açılışı doğrulanmış sıfır yapılmaz; sentetik TEST kasa başlangıcı gerçek şirket açılışı değildir.

Kaynak karşılaştırmasının satırları, kişiler, bakiyeler ve tutarlar yalnız private kanıtta kalır; bu dosyada yayımlanmaz. Kaynak değişimleri mevcut kabul edilmiş migration'ı tekrar uygulama sebebi yapılmaz. Yeni finans açılışı veya kaynak delta yazması bu CRM belgesiyle yetkilendirilmez.

Dal `codex/crm-agents-on-completion-20261003`, [CRM PR #3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3). GitHub'ın önceki hesap/harcama engeli yerel PASS ile kapatılmış sayılmaz; son teslim commit'inin CI sonucu ana koordinatör tarafından ayrıca doğrulanır. Eğitim PR #27 bekler. Vega, LIVE, main, gerçek T1, ücretli AI ve gerçek WhatsApp gönderimi değişmez.

CRM-UA01–07 ve önceki insan kabulleri tarihsel kapsamlarıyla korunur; CRM-UA08 **bekliyor**. Son ortak readiness kararı ve normal ekran sonuçları tek ERP+CRM yönetici raporunda tamamlanacaktır; bu teslim kendi başına LIVE izni değildir.
