# 6 Ekim 2026 — A–Z görünür CRM TEST denemesi

## Son uygulama — 16:58

- Uygulama source **48cceed03606d8f423462b2ecf8fe6f1472b800e**, immutable paket manifest **82f58020e51717e2dc2dc32a53a1f928bad6a36081a46f81c2510e09917eb923**; locked offline kurulum/fresh build/verify sonrası **16:48:07 READY**. Uygulama source48 exact7/7 CI SUCCESS;900offline/251syntax ve bağımsız source incelemesi PASS.
- Mevcut taskın normal başlatılması yalnız kapanmış native ERP TEST servisini toparladı. Native63056/creationUTC13:37:05.9946630Z; exact -04/b708f8e/kanonik TEST DB; stok/cari/dış işlem/otomatik işler=false. İlk native kapanma nedeni bilinmiyor. Yeni runtime UI/gateway57400, katalog20748, ERP adapter67096 exact48 pakette. Native ve LIVE4114/4116/5188 PID/creation/adresleri switch öncesiyle aynı; gerçek logon/reboot yapılmadı.
- İlk kontrollü switch kapanma sırasında launcher kimlik kontrolünde reddedildi; önceki paket/config başarıyla korundu. **5021e32a9363dc25aed68a333898e0b8505a7719** yalnız kanonik switch helper/test düzeltmesidir: önceden tam doğrulanmış launcher için3sn pasif PID/creation çıkış beklemesi; PID reuse/sorgu hatası ret, timeout yaşayan sürece aynı owner/exe/script/config guard. Boş executable/yabancı kimlik kabul edilmez. Bağımsız16/16 ve exact7/7 CI SUCCESS. Son gerçek switch bu kaynakla tamamlandı; immutable uygulama source48 ile helper kaynağı ayrı kaydedilir.
- Tam767 konuşma yüklenince Mesajlar **660**, Yönetim Masası **660** Atanmamış gösterdi (after-unassigned-summary.jpg). Eski Yönetim Masası43 tam-kapsam hatası giderildi. Sonraki gerçek değişimde768/661 görüldü; bu canlı sayılar değişebilir. Kısmi25/100/... yükleme tam-kapsam kabulü değildir.
- Normal ekran ikinci7733 TEST metnini **16:48:50.627**'de gönderdi; outgoing journal **16:48:55.272 done**. UI sunucu kabulünü gösterdi (after-new-test-send.jpg). Kullanıcıdan yeni yanıt istendi; bu kayıt anında yeni incoming/gerçek yeni süre **bekleniyor**. Eski yanıt veya225sn sentetik sonucu yeni gerçek alım kabulü yapmaz.
- Yeni pakette katalog1085 gerçek fotoğraf referanslı ürün/12 açılmış fotoğraf ve41140/41142 için196TRY/adet korunur. Formdaki mevcut kayıtlı TEST giriş bilgileriyle normal ERP girişi başarılı oldu; yeniden credential girilmedi/değiştirilmedi. Sentetik TEST-V70 müşteri ve iki eşleşmiş196TRY/adet satır görüntülendi (after-erp-session-ready.jpg); varsayılan adetler1+1. Native READY. Önceki belirsiz UUID için yeni create yapılmadı; yeni980TRY iki ürün readback kabulü yok.
- Sonraki inbox poll'de devamını yükle/bağlantı gecikmesi uyarısı görüldü. Salt okunur loglarda16:49–16:52 full inbox8.751–17.631sn, seçili sohbet93–550ms; completed gateway429/5xx yok. Switch sonrası bir eski-token401 vardı, sonraki geçerli okumalar200. Uyarının kesin nedeni backend metadata tek başına kanıtlamaz; pahalı full senkronla uyumludur. Provider WAAPI_RATE_LIMIT ayrı bütçedir, CRM genel429 değildir. Uzun süreli stabil inbox kabulü açık kalır.
- Eski yanıtın sonradan kesin süreleri: provider16:02:23 → journal16:16:55.465 (**14dk32.465sn**), done16:16:59.899 (kabulden4.434sn), Chatwoot55 incoming16:16:59 (**14dk36sn**). Bunların tamamı eski1d pakettedir. Eski UI/gateway child16:14:38.335'te mevcut supervisor tarafından yeniden başladı; ilk kapanma nedeni bilinmiyor, doğal token süresi dolması diye açıklanmaz.

Yeni paket A–Z teknik turunun kalanları: AI önerisi502/AI_PRICE_PROSE_FORBIDDEN; tam eski geçmiş; gerçek personel/rol; fiziksel Samsung/LAN; kalıcı IP rezervasyonu; işletme AI kuralları; iki ürün980TRY aynı UUID readback; gerçek Windows logon. Önceki gerçek medya/çeviri/katalog/fiyat/392TRY kabulü korunur. Yeni PDF yerel indirme yolu bağımsız yakalanmadı. Finish-tree25/12tamam/12kısmi/1açık,kalan13; ajan ekran kanıtı insanın bütün CRM kabulü yerine geçirilmez.

## Aşağıdaki kayıtlar yeni paket uygulanmadan önceki turdur

Bu kayıt yeni bir kullanıcı kabulü veya LIVE hazırlık yüzdesi değildir. Önceki 5 Ekim denetimi ve kabul edilmiş metin/medya/katalog/tek ürünlü ERP baseline korunur. Yeni tur TEST ADMIN ile görünür tarayıcıda yapıldı; yalnız izinli 7733 konuşmasına bir TEST metni gönderildi. Başka müşteriye gönderim yok.

## Deneme başlangıcı

- TEST: http://127.0.0.1:62400/; mevcut LAN http://192.168.1.46:62400/. Bu tur ikinci cihaz/LAN girişi veya sabit IP rezervasyonu kabulü değildir.
- Kanonik dal: `codex/crm-agents-on-completion-20261003`, mevcut PR3. Başlangıç checkout HEAD `0dfdafa165b5da8e46e210a6a1be02fb03cda991`.
- Başlangıç çalışan source `1d288142aa0b1c465a91826191fc3cac50207498`; paket manifest SHA256 `adc59b3c6af7973125b071239217d61a7d36dbcc1c8d13e8c42ddc26faab9ffe`.
- Başlangıç UI/gateway PID70248, katalog21460, ERP adapter14024. Native ERP62404 kapalı; task Ready/lastResult1. Salt okunur özel runtime kimlik kanıtı repo dışı `logs/acceptance-20261006/az-preflight.json` içindedir. Özel config/credential/ham provider dökümleri bu arşivde yok.

## Gerçek ekran sonuçları — yeni sürüm uygulanmadan önce

| Akış | Görülen sonuç | Kabul sınırı |
| --- | --- | --- |
| İlk liste / müşteri arama | Gerçek ilk25 kart açıldı; kısmi yükleme toplamı bilinmiyor/yükleniyor etiketiyle ayrıldı. Sonra767 gerçek konuşma;7733 araması tek Semih Ş sonucu. | Yeni medyan performans ölçümü yapılmadı; önceki hızlandırma korunur. |
| Giden metin | 16:01 TEST mesajı normal Gönder ile gönderildi; balon ve sunucu kabulü görüldü. Kullanıcı telefonunda gördüğünü ve yanıtladığını açıkça bildirdi. | Telefon kabulü yalnız bu mesaj içindir; bütün roller/CRM ekranları için PASS değildir. |
| Yeni gelen metin | Kullanıcı yanıtı provider'da16:02:23 gelen kayıt olarak var;16:06 journal ve Chatwoot55'te henüz yok. | Başlangıçta görünür alım gecikti; UI refresh tek başına çözmedi. Son uygulama sonucu aşağıya ayrıca eklenecek. |
| Fotoğraf | Gerçek sohbet görseli yüklendi; büyütme penceresi ve indir bağlantısı açıldı. | Yeni fiziksel cihaz indirme kabulü yapılmadı; önceki kabul korunur. |
| PDF / TXT | Geçmişteki gerçek PDF/TXT bağlantıları ve kullanıcı kabul yanıtları görünür. Yeni iki ürünlü PDF önizlemesi,196TRY/adet fotoğraf ve ürün bilgisiyle oluştu. UI 'PDF indirildi' bildirdi. | İki tarayıcı indirme yakalama denemesi20sn'de zaman aşımına uğradı; yeni dosyanın yerel yolu/bağımsız PDF renderı kanıtlanmadı. Uygulama hatası diye tek başına sınıflandırılmadı. |
| Ses | Gelen ses native oynatıcıdan başlatıldı;3.030125sn sonunda ended=true,error=null. | Teknik oynatma; yeni insan duyma kabulü değildir. Önceki ses kabulü korunur. |
| Video | Gelen video native oynatıcıdan başlatıldı;4.02322sn sonunda ended=true,error=null. | Teknik oynatma; önceki telefon kabulü korunur. |
| Geçmiş | Son20 mesaj görünür. | Daha eski sohbet mesajlarını yükleme kontrolü yok; tam geçmiş tamamlanmış sayılmaz. |
| Müşteri / atama | Müşteri kartı, ülke/telefon/sorumlu açıldı. Yalnız7733 semih→Ahmet→semih; her iki normal ekran sonucu görüldü. | Personelin kendi gerçek hesabında görünüm ve üç rol kabulü bu tur yapılmadı. |
| Atanmamışlar | Atanmış7733 filtrede görünmedi. Tam listede660; özet/Müşteriler ekranı43 gösterdi. |43 ilk100 sayfanın fallback'i; toplam gibi gösterilmesi somut sayım hatası. |
| Çeviri | Eski İngilizce incoming'in Türkçe çevirisi görünür. Türkçe yeni taslak İngilizce önizleme ve Türkçe geri çeviriyle hazırlandı; taslağa alındı, otomatik gönderilmedi. | Elle dil override İngilizce→Otomatik algıla geri alındı; bu tur çevrilmiş yeni mesaj gönderilmedi. |
| Taslak korunması | TEST ADMIN oturumu sona erince normal Yeniden dene ile açıldı; gönderilmemiş İngilizce taslak aynı içerikle geri geldi. Deneme taslağı sonra temizlendi. | Gerçek kullanıcı parolası/rolü değiştirilmedi. |
| Katalog / kod / fiyat |1085 fotoğraf referanslı gerçek ERP ürünü; ilk12/12 fotoğraf,41140 kod araması1 sonuç;41140/41142 fotoğrafları ve196TRY/adet kayıtlı fiyat. USD'de olmayan fiyat açıkça yok gösterildi. | Stok/seri bilinmiyor; kur dönüşümü veya doğrulanmamış fiyat üretilmedi. |
| Mobil | Gerçek DOM CSS390×845; sohbet, listeye dönüş, katalog, filtre/kod arama ve sabit alt eylemler açıldı; document scrollWidth390. CSS1440×900 masaüstü de kaydedildi. | Fiziksel Samsung/LAN/personel kabulü değildir. Tarayıcı zoom'u nedeniyle sürücü472 genişlik verdi; DOM390 ölçüldü. |
| AI satış önerisi | Normal7733/41140 denemesi16:09:42'de HTTP502 / AI_PRICE_PROSE_FORBIDDEN; UI öneri hazırlanamadı dedi. | Gerçek fiyat doğrulama koruması kaldırılmadı. Yeni öneri başarılı sayılmaz; otomatik gönderim/ERP yazımı yok. MOQ/ülke/kargo henüz belirlenmemiş. |
| ERP taslak | İki ürün seçimiyle normal ERP giriş formu açıldı. Native62404 kapalıydı. | Yeni taslak oluşturulmadı; önceki belirsiz UUID/kayıt yeni create ile tekrar edilmedi. Tek ürün392TRY kabulü korunur. |
| Restart / autostart | Launcher13:41'de owner sorgusu sırasında native PID kaybolunca CimException ile kapanmıştı. | Native'in ilk kapanma nedeni bilinmiyor. Gerçek Windows logon/reboot yapılmadı. |

## Dar kaynak düzeltmeleri

1. Incoming reader güncel head keşfini tam eski taramadan ayırır; güncel/eskiden bekleyen işler dönüşümlü ilerler. Kuyruk256, reader/provider8 gerçek çağrı/5dk,45sn tick,60sn provider freshness, identity/dedup/journal/medya/24h pencere ve auth korunur. Changed-peer rescan tüm sayfaları tamamladıktan sonra eski cursor'a döner. Reviewer'ın275 mesajlık burst'te bulduğu175 kayıp giderildi; aynı bağımsız senaryoda275/275 yeni+1000/1000 eski kayıt korundu. Sentetik225sn sonucu gerçek provider SLA'sı değildir.
2. Launcher yalnız typed NotFound + taze missing PID durumunda recovery yapar. Başarılı owner sorgusu sonrası creation/path/script/parent tekrar doğrulanır; stale listener döngüye yeniden girer. Yaşayan hata, PID reuse, foreign owner/config/port fail-closed kalır. CRM child stop eklenmedi.
3. Atanmamış metriği yalnız bütün sayısal total kapsamı gerçekten yüklenince gerçek owner DTO'larından hesaplanır. Partial/null toplam ve görünüm korunur; tasarım değişmez.

Bu bölüm kaynak hazırlık kaydıdır. Yeni paket/Git CI/gerçek tekrar denemesi sonuçları `CRM_STATUS.md` ve bu raporun son uygulama bölümüne ayrı eklenir. Yeni ERP `melisa-catalog.v1`, LIVE, main merge, credential, işletme satış kuralları veya ticari veri değiştirilmedi.

### Eski paketle sonraki gözlem

16:29 civarı normal Mesajlar ekranına dönünce kullanıcının `6 ekim yanıtı` mesajı da göründü. Bu sırada hâlâ1d288142 çalışıyordu; sonuç yeni optimizasyona atfedilmez.16:06'da olmayan mesajın bu kontrolde görünmesi gecikmenin üst sınırını gösterir; kesin journal kabul zamanı repo dışı metadata ile ayrıca doğrulanır. CSS1024×800,scrollWidth1024 ekranı `chat-1024.jpg` içinde. İlk paket hazırlığı, bu yeni ekran kanıtı kaydedildiğinde checkout dirty olduğu için servis değiştirmeden reddedildi; kanıt normal belge commit'iyle korunup temiz kaynakla yeniden hazırlanır.
