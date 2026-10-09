# 9 Ekim 2026 — ortak izole TEST hazırlığı

CRM-DEC-007 kapsamındaki teknik hazırlık kanıtıdır. Tam işletme TEST'i başlamadı; kullanıcı/personel/fiziksel cihaz kabulü bekler. İki seçilmiş gerçek ürün kopyasıyla kontrollü TRY taslak işlemi, bütün katalog veya günlük mağaza operasyonunun hazır olduğu anlamına gelmez. Önceki insan kabulleri kendi tarihsel kapsamlarıyla korunur.

## Çalışan kaynak ve ortam

| Bileşen | Doğrulanmış kimlik |
|---|---|
| CRM kaynak / immutable paket | `81754aaefb4eff85420ed491c8656ce3defa5c05`; koordinatör final çalışan paketi ve normal UI readback'i doğruladı. |
| CRM UI / gateway / katalog / adapter | `http://127.0.0.1:62600/`,62601,62602,62603. |
| Ayrı native draft API | 62604, kaynak `7b083a628628c59f7930a1571992fadaccb0ac7a`, paket `CRM-ORDER-DRAFT-TEST-SHARED-7b083a6`. |
| ERP ortak UI / API / ayrı read API | 5224 /4174 /4176; son çalışan source6c47c37dc3100da494e44831a7e55fa541f2e1a1. CRM ve ERP hesapları ayrı doğrulanır; SSO veya numeric aktör eşleme varsayılmaz. |
| SQL hedefi | Yalnız `MELISA_ERP_CRM_SHARED_TEST_20261009_01`, `ISOLATED_TEST_COPY`; eski624xx ve normal veritabanları korunur. |
| Mühürlü ürün/fiyat bağlamı | `PRODUCT-4161d6d9-0716-469e-8c67-c165a20fa674`, `sourceAsOf=2026-10-08`, native health ürün16743 / fiyat64333, `actualT1=false`. Güncel source/plan/bindings/snapshot pinleri sunucuya aittir. |

Native `/test-health` bu kaynak/paket/DB/port kimliğini ve `externalOperations=false`, `stockEffect=false`, `ledgerEffect=false`, `reservationEffect=false`, `actualT1=false` değerlerini verdi. Bu tarihli kaynak, bugünün tüm ticari hareketlerini içeriyor iddiası değildir. Tam hashler ve süreç/paket kimlikleri özel kanıtta tutulur; ticari kayıtlar, mesajlar, credential, token ve ham ekranlar Git'e eklenmez.

Mevcut Chatwoot/Redis ve mevcut CRM hesapları salt okunur erişimle kullanılır. Ayrı SQL kopyası ERP'ye aittir; tüm CRM/provider veritabanının klonlandığı iddia edilmez. Shared gateway atama, arşiv/kapatma, read-state dahil dış yazıları reddeder. Yalnız mevcut process-local stateless oturum ve ayrı izole ERP taslak yolu kendi sınırında çalışır.

## Teknik akış ve güvenlik sonucu

- Ücretli AI varsayılan kapalı; shared çeviri/copilot/provider/gönderim ve incoming worker kapalı. Açılış pasif, çeviri düğmeleri kapalı; composer handler ve backend de provider çağrısına geçmeden reddeder. UI runtime policy'yi açamaz. Gerçek model veya WhatsApp gönderimi bu hazırlık kanıtının parçası değildir.
- Mevcut crm-ahmet hesabı normal terminal yüzünde **Personel** olarak açıldı;22 kendine atanmış sohbet görünür. Allowlisted deneme sohbeti başka mevcut aktöre atandığı için listede görünmedi. Atama/kullanıcı/rol değiştirilmedi. Bu liste okuması gönderim yetkisi veya insan kabulü değildir. TESTADMIN ayrı sentetik teknik aktördür; gerçek patron kabulü yerine geçmez.
- Normal CRM ekranı katalog → insan ürün seçimi → ayrı mevcut ERP hesabı → izole native taslak → GET/readback zincirini çalıştırdı. Exact telefon sorgusu0 sonucunda operatör mevcut ERP müşterisini gerekçeyle manuel seçti. **Bu işlem gerçek telefon tarafının müşteriyle kesin eşleştiğini kanıtlamaz.** Müşteri adı/numarası ve sipariş UUID'si anonimleştirildi.
- Aynı taslak final paket restart ve ekran refresh sonrasında korundu; yeniden ERP login ve bağımsız GET/readback aynı kayıt/UUID'yi gösterdi. Refresh yeni taslak oluşturma işlemi değildir; pending/recovery yolu aynı intent'i korur. Native replay sözleşmesi aynı UUID'nin farklı içerikle tekrar kullanılmasını reddeder; server-owned frozen source provenance ilk kayıtla birlikte saklanır, daha sonra aktif kaynakla yeniden etiketlenmez.
- Final ekran tutarı `TRY 228,50` gösterdi. Fiyat/satır/toplam etiketleri iki ondalıktır; native exact4/exact8 kaynak değerleri, payload ve hesaplama hassasiyeti değişmez. Hedefli render testi iki ondalık görünüm ile ham çarpım/toplamın korunmasını birlikte doğruladı.
- Native taslak contract stok/cari/tahsilat/rezervasyon hareketi üretmez. Ayrı hazırlık kanıtı ve koordinatör incelemesi stok etkisiz taslak/readback kapsamındadır; buradan satış/fatura/tahsilat işletme kabulü çıkarılmaz.

## Kanıt ve kalan kabul

Koordinatör özel ekran kanıtları: `crm-personnel-session.png`, `crm-order-refresh-readback.png`, `crm-order-final-readback.png`. Bunlar ticari bilgiler nedeniyle repo dışındaki özel evidence alanında tutulur. Source testleri, finite health, kaynak/paket kimliği ve normal ekran provası teknik sonuçtur; insan PASS değildir. Exact yeni commit CI sonucu koordinatörün teslim kaydında ayrıca doğrulanır.

Kalanlar: gerçek patron/müdür/personel ekran/yetki kabulü; personel-müşteri/sohbet bağının insan kararı; iki ürün ve manuel ERP müşteri seçiminin insan değerlendirmesi; fiziksel cihaz; gerçek Windows logon/reboot; ayrıca yetkilendirilmiş yalnız7733 WhatsApp/telefon ve AI dil/iş kuralı kabulü. Geniş işletme TEST'i, main/tag/LIVE ve gerçek rollback bu hazırlığın dışında kalır.
