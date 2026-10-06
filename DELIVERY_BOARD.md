# CRM teslim panosu

**2026-10-05 kullanıcı önceliği.** Kalıcı kararlar [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md), tam kapsam [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md), teknik kanıt [CRM_STATUS.md](CRM_STATUS.md), insan sonuçları [USER_ACCEPTANCE.md](USER_ACCEPTANCE.md). Bu pano mevcut finish tree'yi daraltmaz; günlük sıra burada tutulur. Bölüm içindeki satır sırası önceliktir. Bu başlangıç kaydı uygulama geliştirmesi/kabul yapmaz.

`Onaylı` iş seçilebilir; bağımlılığı hazır değilse bekler. `Teknik hazır / kullanıcı kabulü bekliyor` tamam değildir; kullanıcı sonucu ilgili UA kaydına bağlanır. `Tamam` yalnız işin tüm kabul ölçütleri ve GitHub teslimi kanıtlıysa kullanılır. Yeni kapsam veya öncelik kullanıcı kararı ister; kabul edilmiş işi yeniden açma. `ŞİMDİ` içinde tamamlanmamış iş varken `SONRA` öne alınmaz. ŞİMDİ tamamen tamamlandığında onaylı SONRA sırasının ilk işi, bağımlılığı hazırsa aynı sırayla ŞİMDİ’ye taşınır; yeni kapsam veya sıra değişimi sayılmaz. Bağımlılık hazır değilse beklenir; CANLIDAN SONRA otomatik taşınmaz.

## ŞİMDİ

**Goal5 — 6 Ekim 2026:** CRM-DEC-005 kapsamında ERP personel terminali Müşterilerim zinciri teknik tamamlandı; fiziksel/personel ve insan CRM-UA05 bekler. Source4eadb51/paket READY, exact CI SUCCESS. Atanmış liste23/684ms; yabancı konuşma403, ERP dönüşünde sohbet korunması, logout ayrımı, salt okunur kesin pretransport kurtarma ve yalnız7733 manuel fotoğraf/15,78USD paylaşımı201+ayrıGET12281 kanıtlı. Native taslak9 refresh/readback aynı kayıt; stok/cari/finans etkisi yok. M01🟡 ve **25 toplam /12🟢 /13🟡 /0🔴** değişmez. Goal5 burada durur; Goal6/7 veya CRM-D05 yeni geliştirmesi başlamaz. [Teknik kanıt](docs/evidence/crm/2026-10-06-goal5/README.md).

**Tarihsel Goal4 — 6 Ekim 2026:** CRM-DEC-004 ile D02 ortak ERP HTTP katalog tüketimi teknik teslim edildi; D04 iki ürünlü native32,88USD taslak/readback/refresh ve D03 yalnız7733 gerçek fotoğraf/15,78USD paylaşımı provider201/CRM12273 GET kanıtlı. D03/D04 teknik hazır, insan CRM-UA03/04 bekler; telefon delivered/read/açma kabulü yok. Normal katalog1440/1024/390 taşmasız kanıtlı; A05 İngilizce reply/Türkçe özet gerçek modelde doğrulandı; Goal4 teknik tamamlandı / insan kabulü bekliyor. D01 insan kabulü bu teknik sıranın engeli değildir. Güncel finish **12🟢 / 13🟡 / 0🔴**,25toplam,kalan13; insan CRM-UA01–04 bekler. Goal4 sonunda durulur; D05/fiziksel terminal/Goal5 kendiliğinden başlamaz. [Kanıt](docs/evidence/crm/2026-10-06-goal4/README.md).

| ID | Hedef | Kabul kriteri | Durum | Bağımlılık |
| --- | --- | --- | --- | --- |
| M01 / Goal5 | ERP personel terminalinde Müşterilerim ve mevcut CRM günlük akışları. | Normal personel yalnız kendi atanmış konuşmasını görür; başka personelin detail/media/send/catalog/AI/native yolları backend'de reddedilir. Sohbet/çeviri/ERP fiyat-fotoğraf/native taslak, refresh/replay ve çıkış ayrımı çalışır; fiziksel cihaz/personel insan CRM-UA05 sonucu ayrıca gerekir. | Teknik tamamlandı / insan ve fiziksel kabul bekliyor — source4eadb51 exact CI SUCCESS; final gerçek tarayıcı ve API kanıtları hazır. M01 sarı kalır, kullanıcı PASS yok. | CRM-DEC-005; mevcut ERP TEST74 ve ortak katalog; yalnız7733; CRM-UA05 |
| CRM-D02 | Onaylanmış ERP API'sinden ürün/fiyat/fotoğrafı oku. | ERP-D05'in exact sözleşme commit'ine bağlanılır; normal CRM doğru kimlik/fiyat/para birimi/fotoğrafı gösterir; ikinci ticari kaynak/HTML scrape yok; yalnız değişen kapsam CRM-UA02'de denenir. | Tamam — ortak katalog tüketiminin teknik teslimi; source9f81529 exact CI PASS. `melisa-catalog.v1` ve `melisa-photo.v1`,16.622kabul edilmiş+54hold,3.830CONFIRMED,exact8fiyat/döviz/NULL kimliği gerçek normal CRM'de kanıtlı. CRM-UA02 insan sonucu bekler. | ERP-D05 teknik teslimi/a2b9e9f; CRM-DEC-004 |
| CRM-D03 | CRM'den 7733 gerçek paylaşım kabulü. | Yalnız yeni/değişen ürün/fiyat/fotoğraf paylaşımı doğru konuşma/telefonda açılır; kullanıcı CRM-UA03 sonucunu verir; önceki K01–K03 kabulü korunur. | Teknik hazır / insan kabulü bekliyor — yalnız7733 gerçek8023fotoğraf/15,78USD provider201 kabulü ve ayrı CRM12273 GET/source_id/image kanıtlı; providerAccepted/chatwootRecorded=true, delivered/read=false. Toplam8/5dk sınırı aynı; telefon açma/insan CRM-UA03 bekler. | CRM-D02 teknik teslimi; CRM-DEC-004; yalnız +905387217733 |
| CRM-D04 | Aynı katalogdan taslak sipariş akışını tamamla. | Yeni/değişen E02 kapsamı normal CRM'den ayrı ERP readback ile doğrulanır; taslak stok/cari etkisi yaratmaz; CRM-UA04 kaydı tutulur. E01 dar PASS yeniden açılmaz. | Teknik hazır / insan kabulü bekliyor — normal iki ürünlü32,88USD sipariş6/7/8, bağımsız GET/SQL ve aynı UUID refresh;10tabloda count/hash aynı,43eski guard korunur.7733 exact müşteri yok;595 gerekçeli kontrollü TEST seçimi. CRM-UA04 bekler, E02🟡; Goal4 teknik tamamlandı / insan kabulü bekliyor; katalog üç genişlik kanıtlı. | CRM-D02 ortak katalog; CRM-D03 teknik hazır; aynı TEST DB ve mevcut aktör/izinler |
| CRM-D01 | Yalnız TEST'te otomatik TEST ADMIN erişimini tamamla/kabul et. | Doğrulanmış TEST'te normal CRM TEST ADMIN olarak açılır ve yenilenir; yalnız TEST sınırı hedefli kontrolde doğrulanır; kullanıcı CRM-UA01'i dener. | Teknik hazır / kullanıcı kabulü bekliyor; 62400 normal ekran, katalog/fiyat/ayarlar ve gerçek rollere dönüş provası geçti. Önceki paket f1899b0 kabul hazırlığı korunur; güncel paket9f81529, kanıt CRM_STATUS'ta. | CRM-UA01 kullanıcı sonucu |

ERP sözleşmesi teknik hazırdır; kabul edilmiş mesajlaşma baseline'ı korunur. Mevcut I02–I04, T01, K01–K03 ve E01 kabulleri finish tree'de önceki kayıtlı kapsamlarıyla geçerlidir; yeni Goal4 insan kabulü CRM-UA02–04'tür, eski PASS yeniden açılmaz.

## SONRA

| ID | Hedef | Kabul kriteri | Durum | Bağımlılık |
| --- | --- | --- | --- | --- |
| CRM-D05 | Teslim haritasındaki kalan kritik işlere dön. | [Finish tree](CRM_FINISH_PLAN.md) / [ortak harita](MELISA_TESLIM_HARITASI_V1.md) içinden somut kritik dilim kullanıcı önceliğiyle ŞİMDİ'ye taşınır; personel/mobil/AI/logon/yayın açıkları silinmez. | Onaylı dönüş noktası | CRM-D04; ilgili kritik iş bağımlılıkları; yayın ayrıca yetkili |

## CANLIDAN SONRA

| ID | Hedef | Kabul kriteri | Durum | Bağımlılık |
| --- | --- | --- | --- | --- |
| CRM-D06 | Canlı teslimi engellemeyen yeni fikirleri değerlendir. | Yeni fikir ancak açık kullanıcı kararı/ID/kabul ölçütüyle işe dönüşür; insan kontrollü copilot dışındaki otomatik gerçek gönderim ayrıca karar gerektirir. | Bekleyen fikir havuzu; uygulama onayı yok | Mevcut canlı teslim; yeni kullanıcı kararı; CRM-DEC-003 |
