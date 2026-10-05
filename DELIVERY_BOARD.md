# CRM teslim panosu

**2026-10-05 kullanıcı önceliği.** Kalıcı kararlar [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md), tam kapsam [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md), teknik kanıt [CRM_STATUS.md](CRM_STATUS.md), insan sonuçları [USER_ACCEPTANCE.md](USER_ACCEPTANCE.md). Bu pano mevcut finish tree'yi daraltmaz; günlük sıra burada tutulur. Bölüm içindeki satır sırası önceliktir. Bu başlangıç kaydı uygulama geliştirmesi/kabul yapmaz.

`Onaylı` iş seçilebilir; bağımlılığı hazır değilse bekler. `Teknik hazır / kullanıcı kabulü bekliyor` tamam değildir; kullanıcı sonucu ilgili UA kaydına bağlanır. `Tamam` yalnız işin tüm kabul ölçütleri ve GitHub teslimi kanıtlıysa kullanılır. Yeni kapsam veya öncelik kullanıcı kararı ister; kabul edilmiş işi yeniden açma. `ŞİMDİ` içinde tamamlanmamış iş varken `SONRA` öne alınmaz. ŞİMDİ tamamen tamamlandığında onaylı SONRA sırasının ilk işi, bağımlılığı hazırsa aynı sırayla ŞİMDİ’ye taşınır; yeni kapsam veya sıra değişimi sayılmaz. Bağımlılık hazır değilse beklenir; CANLIDAN SONRA otomatik taşınmaz.

## ŞİMDİ

| ID | Hedef | Kabul kriteri | Durum | Bağımlılık |
| --- | --- | --- | --- | --- |
| CRM-D01 | Yalnız TEST'te otomatik TEST ADMIN erişimini tamamla/kabul et. | Doğrulanmış TEST'te normal CRM TEST ADMIN olarak açılır ve yenilenir; yalnız TEST sınırı hedefli kontrolde doğrulanır; kullanıcı CRM-UA01'i dener. | Onaylı; kabul bekliyor; mevcut giriş engeli CRM_STATUS'ta | TEST kimliği ve mevcut görev yetkisi |

ERP sözleşmesi hazır olana kadar kabul edilmiş mesajlaşma baseline'ı korunur. Mevcut I02–I04, T01, K01–K03 ve E01 kabulleri finish tree'de kayıtlı kapsamlarıyla geçerlidir; yeniden geliştirme veya yeniden kabul işi değildir.

## SONRA

| ID | Hedef | Kabul kriteri | Durum | Bağımlılık |
| --- | --- | --- | --- | --- |
| CRM-D02 | Onaylanmış ERP API'sinden ürün/fiyat/fotoğrafı oku. | ERP-D05'in exact sözleşme commit'ine bağlanılır; normal CRM doğru kimlik/fiyat/para birimi/fotoğrafı gösterir; ikinci ticari kaynak/HTML scrape yok; yalnız değişen kapsam CRM-UA02'de denenir. | Onaylı sıra; sözleşme bekliyor | CRM-D01; ERP-D02/04/05; CRM-DEC-001/002 |
| CRM-D03 | CRM'den 7733 gerçek paylaşım kabulü. | Yalnız yeni/değişen ürün/fiyat/fotoğraf paylaşımı doğru konuşma/telefonda açılır; kullanıcı CRM-UA03 sonucunu verir; önceki K01–K03 kabulü korunur. | Onaylı sıra; bağımlılık bekliyor | CRM-D02; yalnız +905387217733 için geçerli açık gönderim yetkisi |
| CRM-D04 | Aynı katalogdan taslak sipariş akışını tamamla. | Yeni/değişen E02 kapsamı normal CRM'den ayrı ERP readback ile doğrulanır; taslak stok/cari etkisi yaratmaz; CRM-UA04 kaydı tutulur. E01 dar PASS yeniden açılmaz. | Onaylı sıra; bağımlılık bekliyor | CRM-D03; onaylı ERP müşteri/ürün kimliği ve taslak sözleşmesi; TEST yetkisi |
| CRM-D05 | Teslim haritasındaki kalan kritik işlere dön. | [Finish tree](CRM_FINISH_PLAN.md) / [ortak harita](MELISA_TESLIM_HARITASI_V1.md) içinden somut kritik dilim kullanıcı önceliğiyle ŞİMDİ'ye taşınır; personel/mobil/AI/logon/yayın açıkları silinmez. | Onaylı dönüş noktası | CRM-D04; ilgili kritik iş bağımlılıkları; yayın ayrıca yetkili |

## CANLIDAN SONRA

| ID | Hedef | Kabul kriteri | Durum | Bağımlılık |
| --- | --- | --- | --- | --- |
| CRM-D06 | Canlı teslimi engellemeyen yeni fikirleri değerlendir. | Yeni fikir ancak açık kullanıcı kararı/ID/kabul ölçütüyle işe dönüşür; insan kontrollü copilot dışındaki otomatik gerçek gönderim ayrıca karar gerektirir. | Bekleyen fikir havuzu; uygulama onayı yok | Mevcut canlı teslim; yeni kullanıcı kararı; CRM-DEC-003 |
