# CRM kullanıcı kabulü

Kullanıcının **normal ekranda gözle denemesi** ve kendi sonucu burada tutulur. Teknik test, ajan tarayıcı provası veya CI PASS kullanıcı kabulü değildir; teknik kanıt [CRM_STATUS.md](CRM_STATUS.md) içindedir. Ayrıntılı kapsam [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md), sıra [DELIVERY_BOARD.md](DELIVERY_BOARD.md). Sonuçlar yalnız `bekliyor / PASS / FAIL`; kullanıcı veya kullanıcı kabulünü açıkça doğrulayan kaynak olmadan PASS yazılmaz.

Her sonuçta kişi, tarih, TEST adresi/ortamı, denenen paket/commit ve kanıt bağlantısı eklenir. Bilinmeyen değer `Durum doğrulanmadı` kalır; mevcut URL/PID geçmiş kayıttan güncel sayılmaz. Kabul edilen kapsam değişirse aynı satırdaki geçmişi silmeden yeni deneme kaydı eklenir. Henüz hazır olmayan deneme kullanıcıya hazır diye sunulmaz.

## Yeni/değişen kapsam

| ID / iş | Kullanıcının gözle deneyeceği şey | Sonuç | Kişi / tarih / ortam-sürüm / kanıt |
| --- | --- | --- | --- |
| CRM-UA01 / CRM-D01 | TEST'i aç ve yenile; TEST ADMIN oturumunda normal inbox açılabilsin. Konuşmalar, katalog/ürün-fiyat ve ayarlara eriş; “Gerçek rollerle giriş” ve TEST ADMIN'e dönüşü dene. | bekliyor | 2026-10-05 kaynak e58dd8b; paket/ekran teknik provası sürüyor. Kullanıcının kendi sonucu henüz yok; teknik kayıt CRM_STATUS'ta. |
| CRM-UA02 / CRM-D02 | Yeni ERP sözleşmesinden gelen ürünü ara/aç; aynı ERP kartı, fiyat/para birimi ve fotoğraf görünsün. | bekliyor | Durum doğrulanmadı |
| CRM-UA03 / CRM-D03 | Yalnız 7733'e yeni/değişen ürün/fiyat/fotoğraf paylaşımını insan kontrolüyle yap; telefonda doğru ürün ve medya açılsın. | bekliyor | Durum doğrulanmadı |
| CRM-UA04 / CRM-D04 | Onaylı TEST kimlikleriyle yeni/değişen taslağı aç; ERP ayrı geri okumada aynı satır/adet/fiyatı göstersin, stok/cari etkisi olmasın. | bekliyor | Durum doğrulanmadı |

## Korunan önceki kabuller ve diğer açıklar

I02–I04, T01, K01–K03 ve E01'in kayıtlı gerçek kullanıcı kabulleri [finish tree](CRM_FINISH_PLAN.md) ve bağlı kanıtlarda korunur; bu tabloda ikinci PASS üretilmez. Personel/roller, genel inbox, fiziksel mobil CRM, AI işletme/dil ve gerçek logon kabulleri aynı ağacın açık kapsamlarıdır; ilgili iş ŞİMDİ'ye alındığında somut deneme burada kaydedilir. WhatsApp telefon medya kabulü fiziksel mobil CRM kabulü değildir.
