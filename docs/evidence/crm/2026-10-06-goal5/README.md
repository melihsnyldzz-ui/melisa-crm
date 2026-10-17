# Goal5 — personel terminali CRM teknik teslimi

6 Ekim 2026. **Teknik tamamlandı; insan ve fiziksel cihaz/personel kabulü bekliyor.** M01 sarı, CRM-UA05 bekliyor; finish tree25/12tamam/13kısmi/0kırmızı korunur. Önceki kabuller tekrar PASS yapılmaz. Goal6/7 başlatılmaz.

## Kaynak ve paket

Çalışan CRM kaynak [4eadb51f0b1428311e253ac049faa49e8fbf02cf](https://github.com/melihsnyldzz-ui/melisa-crm/commit/4eadb51f0b1428311e253ac049faa49e8fbf02cf), paket `crm-test-4eadb51f0b1428311e253ac049faa49e8fbf02cf`, manifest SHA256 `b88c2b5cdda0027974b8c78847af64c363744dc010f8660c94ee271176286bf6`, READY2026-10-06T19:02:13.5530765Z. UI/gateway62400/62401 PID76296, katalog62402 PID44252, adapter62403 PID52600. Ayrı native62404 PID44548/source0940c49 korunur; ERP normal yüz TEST74. Native DB yalnız MELISA_ERP_SIRKET_TEST_20260929_01. Uygulama exact CI SUCCESS; izleyen belge HEAD'i [PR3 Checks](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3/checks) üzerinden ayrı izlenir.

Normal CRM http://127.0.0.1:62400/; ERP terminal http://127.0.0.1:5194/terminal.html → Müşterilerim. Fiziksel telefon bu localhost adresiyle Windows sunucusuna erişmiş sayılmaz. Normal masaüstü CRM menüsü/login korunur. Loopback prova mevcut crm-ahmet kimliği/agent3/15dakika/view+send/assignment/yalnız7733 ile sınırlıdır; kalıcı kullanıcı, parola, personel gönderim rolü veya LAN/production login genişlemesi yok. ERP ve CRM ayrı aktör doğrular; SSO iddiası yok.

## Gerçek ekran ve erişim

Atanmış23 konuşma yalnız personelin kendi kapsamından gelir; yabancı konuşma753 detail403. Detail, çeviri, lokal medya, katalog/AI/native bağlamı backend'de güncel assignment ve aktör/yetkiyle korunur. ERP Ana Sayfa/Ürünler dönüşünde seçili sohbet55/metin bağlamı kaldı. Parent logout iframe CRM oturumunu/metin/medyayı kapattı ve login istedi; iframe düğümü gizli/temizlenmiş halde kaldı, DOM'dan kaldırılmadı. Önceki55/mesaj kutusu görünmedi. ERP16 İlker seller'ın yeni sepetini görmedi; kendi eski iptal NIGHT kaydı görünür kaldı. Native pending journal başka aktöre açılmaz; aynı CRM+ERP aktörü refresh sonrası taslak9'u yalnız GET ile geri alır. Deneme55 ataması sonunda eski agent2'ye döndü. Gerçek kullanıcı rol/parola hash'leri değişmedi.

Katalog tek ERP `melisa-catalog.v1`, fotoğraflı3830 CONFIRMED;67 AMBIGUOUS dışarıda. Kaynak30Eylül açılışı+yerel TEST; güncel Vega/delta/teslim stok taahhüdü değil. Gerçek ürün kimliği, barkod başındaki sıfır, birim, exact fiyat ve TRY/USD/EUR ayrımı korunur. Native9 refresh/readback ikinci create yaratmadı; stok/cari/finans etkisi yok. Fotoğraf960×1220 gerçek decode/open kanıtlı. Teknik responsive/touch kanıtı fiziksel Zebra kabulü değildir.

## Gönderim sonucu ve salt okunur kurtarma

Eski UUID47a84e4c-a8f3-40e2-bf54-c5eb82b731c5 WAAPI_NOT_READY503 ile REJECTED_BEFORE_TRANSPORT; provider ve Chatwoot receipt kimlikleri yok. Exactactor+conversation+UUID+tam normalize metin/fotoğraf fingerprint status200 aynı sonucu okudu; eksik fotoğraf409 ve kilidi korudu. Bu POST status yolu yalnız journal GET yapar, transport/journal yazımı yapmaz. Unknown/timeout/yanlış UUID veya body/assignment/yetki reddi kilidi açmaz. Confirmed readback kabul bilgisini gösterir ve aynı mesajı tekrar göndermeyi kilitli tutar. ERP kapalıyken fiyat kaynağı GET'i başarısız, mesaj POST0; uydurma fiyat fallback yok.

Sonraki ayrı açık manuel UUIDd31dc923-7487-4d65-a62d-4f88fabd32d2 yalnız izinli7733'e201/CONFIRMED; provider ve Chatwoot receipt ID'leri mevcut. Ayrı GET konuşma55/mesaj12281 aynı8023fotoğraf ve güncel ERP15,78USD/ADET'yi gösterdi. **delivered/read=false; telefon açma veya insan PASS yok.** Otomatik gönderim yok,8çağrı/5dk toplam provider sınırı korunur. Ham müşteri listesi, caption dökümü, token ve provider kimlikleri bu rapora kopyalanmaz.

## Hız ve ölçüm fazı

Final4eadb51 üç örnek atanmış23 liste medyan684ms (605/684/1180); metadata poll463, seçili sohbet208,50ürün selector759, ürün kartı409, native GET256ms. Eski15–25,7sn tam dolaşım/history yolu tarihsel ölçümdür. Yetkili assignee/inbox provider filtresi, taze response assignment ve metadata polling ile hızlandı; permission/assignment koruması kaldırılmadı.

ERP TEST74 first50/next50/kod/barkod/kart/HOME/sayım/mal kabul/iade784/664/461/343/172/21/59/259/388ms. Çeviri1957 ve native CREATE5914/GET667ms önceki ebe+ERP73 fazıdır; final4ead hızına eklenmez. Native kaynak aynı. HTTP süresi paint/fiziksel cihaz SLA'sı değildir.

## Merkezi kanıt ve geri dönüş

Ekran/SQL/native/runtime kanıtı ortak işi yürüten ERP kanonik branch'inde tutulur; ikinci müşteri veri dökümü oluşturulmaz:

- [ERP Goal5 kanıt dizini](https://github.com/melihsnyldzz-ui/melisa-erp-v2/tree/codex/erp-finish-20261004/docs/evidence/erp/2026-10-06-goal5)
- [Son browser-completion](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/codex/erp-finish-20261004/docs/evidence/erp/2026-10-06-goal5/browser-completion.json)
- [Runtime kimliği](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/codex/erp-finish-20261004/docs/evidence/erp/2026-10-06-goal5/runtime.json)
- [CRM hız fazları](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/codex/erp-finish-20261004/docs/evidence/erp/2026-10-06-goal5/crm-performance.json)
- [Son ERP hızları](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/codex/erp-finish-20261004/docs/evidence/erp/2026-10-06-goal5/performance-final.json)

Normal photo-onlyad01203 ile yakın9c62702/95465 eski immutable paket ve private config'ler repo dışında korunur. Bunların korunması yeni A→B→A rollback veya Windows logon kabulü değildir. LIVE/Vega/main/başka alıcı/kalıcı roller değişmedi. Fiziksel personel/ikinci cihaz ve geniş insan denemesi CRM-UA05'te bekler; Goal5 burada durur.
