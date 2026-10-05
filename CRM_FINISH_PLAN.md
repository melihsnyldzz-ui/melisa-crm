# MELISA CRM — Ana Bitiş Planı

Bu dosya **tam kapsam / finish tree** olarak kalır. Kalıcı kararlar [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md), günlük öncelik [DELIVERY_BOARD.md](DELIVERY_BOARD.md), gözle deneme ve insan sonucu [USER_ACCEPTANCE.md](USER_ACCEPTANCE.md) içindedir. Aşağıdaki eski dilim/sıra cümleleri günlük öncelik oluşturmaz; mevcut kapsam ve kanıtlar korunur.

Güncel ana hedef: **5 Ekim 2026 — günlük CRM + mobil + ERP + insan denetimli AI satış + kontrollü yayın**. Bu dosyadaki aşağıdaki ağaç tek güncel finish tree'dir. Eski kayıtlar en altta tarihsel kanıttır; ikinci güncel iş listesi değildir.

**Tamamlanan: 12 / Kısmi: 12 / Açık: 1 / Toplam: 25. Genel ilerleme: 12/25 tamam; bu sayım LIVE hazırlık yüzdesi değildir.** Kısmi maddeler yüzdeye tamam sayılmaz. **Kalan açık madde sayısı: 13** = 1 geliştirme eksiği + 12 kısmi/kabul/onay adımı. U01 taslak kaybı düzeltildi: normal TEST'te üç yenilemede175/220/175 karakter metin birebir geri geldi. Bütün ekranların kullanıcı kabulü beklediğinden U01 sarıdır. R02 gerçek A→B→A→B turu korunur; E02 geniş ERP eşlemesi kırmızı kalır. A02 işletme değerleri ve A03/A04 kullanıcı kabulleri bekler.

🟢 tamam: gereken gerçek kullanım veya ilgili teslim kanıtı var. 🟡 kısmi / kullanıcı kabulü bekliyor. 🔴 açık / bozuk: somut geliştirme/kurulum gerekiyor. HTTP 200, build ve unit test tek başına bir kullanım akışını yeşil yapmaz.

## Tek finish tree

| Kimlik | Modül / iş | Durum | Doğrulanmış sonuç ve kalan bitiş ölçütü |
| --- | --- | --- | --- |
| I01 | Inbox, gelen/giden metin, geçmiş ve yeni mesaj | 🟡 kısmi / kullanıcı kabulü bekliyor | 7733 gerçek kabulü korunur. Genel pasif discovery/LID/mesaj sayfalama→kalıcı journal/worker kaynakta hazır; unread0, doğru ayrı kişiler, repeat, restart/geç medya kontrolleri eklendi. Gerçek provider shape/selectedLID6mesaj salt okunur doğrulandı; bu normal CRM alımı değildir. Yeni D/source0c60c55 TEST paketi10:49READY;2farklı kişide9geçmiş incoming ayrı ChatwootGETreadback ile doğrulandı. Normal ekranda doğru başka konuşmada görünüm ve yeni mesaj/geçmiş ayrımı kabulü bekler. Outbound/AI7733, LIVE eski filtre korunur; yoğun kuyrukta kota gecikmesi olabilir. |
| I02 | Fotoğraf ve açma | 🟢 tamam | İki yönlü fotoğraf gerçek decode ve kullanıcı kabulü, 4 Ekim. |
| I03 | PDF/dosya, açma/indirme | 🟢 tamam | İki yönlü PDF/TXT indirme, render/okuma, hash ve kullanıcı kabulü. Her Office formatı için kapsam iddiası yok. |
| I04 | Ses/video ve oynatma | 🟢 tamam | 19:34–19:41 MP3/MP4 gönder/al; kullanıcı telefonda açtı, gelenler CRM'de sonuna kadar hatasız oynadı. |
| C01 | Atanmamışlar, müşteri bilgisi, atama ve doğru personel ekranı | 🟡 kısmi / kullanıcı kabulü bekliyor | Test konuşması Ahmet'e atanıp Semih'e geri alındı; atanmamış filtresi doğru. Personelin kendi hesabında konuşma/müşteri/geçmiş görmesi kabul edilmedi. |
| C02 | Patron/müdür/personel yetkileri | 🟡 kısmi / kullanıcı kabulü bekliyor | Kod/korumalı testler hazır, patron kullanımı var; üç gerçek rol hesabında görünüm/gönderim/atama kabulü gerekir. |
| T01 | Otomatik çeviri, dil ve manuel kontrol | 🟢 tamam | Gelen Haloo→Merhaba ve önceki gerçek giden çeviri kabulü korunur; bütün dil kalitesi garantisi yok. AI müşteri dili ayrı A05'tedir. |
| K01 | Gerçek katalog, arama/filtre, görsel/bilgi | 🟢 tamam | 1085 ERP read ürün referansı, ilk sayfa12/12 fotoğraf; normal UI ürün seçimi ve gerçek PDF/telefon kabulü. |
| K02 | Ürün gönderme | 🟢 tamam | 41140 doğru görsel/bilgi ile fiyatlı ürün PDF'si telefonda kabul edildi. |
| K03 | Fiyat ve doğru para birimi | 🟢 tamam | Kayıtlı196 TRY/adet normal mesaj ve PDF'de kullanıcı kabulü. Stok/teslim taahhüdü değildir. |
| E01 | CRM→ERP taslak: mevcut doğrulanmış müşteri/ürün kapsamı | 🟢 tamam | Müşteri593, ürün41140/native301982, 2×196=392 TRY; draft id4 ayrı GET readback ile kullanıcı kabulü. Aynı UUID tek sipariş/audit; stok/cari etkisi0. |
| E02 | Günlük ERP müşteri/ürün eşleme kapsamı | 🔴 açık / bozuk | İki kesin typed ürün41140→301982 /41142→301981 provision edilmiş; native sürücü paket hatası b708f8e ile giderildi. 5 Ekim10:05 yeni -04 paketi gerçek TEST SQL ile açıldı. CRM oturumu/girişi beklediğinden iki satırlı normal UI taslak/readback kabulü henüz yok. Müşteri593 sentetik ve tek izinli kapsam; genel müşteri/ürün eşleme ayrıca açık. ERP C06 kaynakta kayıtlı, C09 yerel çalışması korunur. |
| A01 | Açık AI V1 çekirdeğini mevcut CRM ile uzlaştırma | 🟢 tamam | PR6 çekirdeği cca48e1 ile mevcut feature'a alındı; gerçek DTO ataması, güncel yetki ve telefon kapsamı bağlandı. Bağımsız reviewer açık bulgu0; normal CRM'de gerçek OpenAI önerisi üretildi, otomatik gönderim/ERP yazımı yok. İşletme/katalog/dil kabulleri ayrı A02–A05'tir. |
| A02 | Gerçek satış kuralları: ülke/MOQ/kargo/indirim | 🟡 kısmi / kullanıcı kabulü bekliyor | 9786f3a patron Ayarlar yönetimini, tüm rollerin okumasını ve AI kartını bağlar. Normal TEST UI boş politika kaydı/geri okuması ve 7733 gerçek model→güncel kural kontrolü→insan taslağı aktarımı çalıştı. Bilinmeyen minimum ile minimum yok ayrıdır; ülke otomatik seçilmez. Gerçek MOQ/ülke/kargo işletme değerleri ve kullanıcı kabulü bekler; tarihsel1000USD/EUR örnekleri etkinleştirilmedi. İndirim/seri bölme/otomatik gönderim/ERP yazımı kapalı. |
| A03 | Normal sohbette cevap önerisi→incele→taslağa aktar | 🟡 kısmi / kullanıcı kabulü bekliyor | 7733 normal CRM'de Satış önerisi→Türkçe özet/yanıt→Mesaj taslağına al gerçekten çalıştı; metin düzenlenebilir kutuda, gönderilmedi. Konuşma/atama/yetki/taslak değişiminde eski öneri iptal olur. Kullanıcı ekran kabulü bekliyor. |
| A04 | Güvenilir gerçek ürün/katalog/fiyat önerisi | 🟡 kısmi / kullanıcı kabulü bekliyor | 7e966c5 +4f17b98 mevcut ERP read yolundan gerçek ürün seçimi/kart/fotoğraf/kayıtlı adet fiyatını bağlar. Normal7733 ekranında 41140 SÜPERMİNİ /196TRY ve976×1600 fotoğraf açıldı; ürün/fiyat düğmeleri kaydı yeniden okuyup yalnız taslağa aktardı. İlk gerçek modelin reply+boşIDs/fiyat metni ve kaynaksız kalite ifadesi düzeltildi; son yanıt yalnız kaynak adı/kodu kullandı. Güncel stok/seri/teslim doğrulanmış değil, otomatik gönderim/ERP yazımı yok. Kullanıcı kabulü bekler; dil/metin kalitesi A05 kapsamındadır. |
| A05 | AI müşteri dili, mevcut taslak bağlamı ve gerçek kabul | 🟡 kısmi / kullanıcı kabulü bekliyor | Mevcut anahtarın yalnız7733 TEST kullanımı kullanıcı tarafından onaylandı; gerçek model Türkçe cevap üretti. Yabancı müşteri dil tercihi ve mevcut ERP formuna insan kontrollü bağlam aktarımı henüz tamam/kabul edilmiş değil. erpWrite=false korunur. |
| U01 | Sade/premium masaüstü ve 1440/1024/390 UX | 🟡 kısmi / kullanıcı kabulü bekliyor | 0c9e301+aa85448 aynı sekmede doğrulanmış hesap/rol/personel ve konuşma kapsamlı metin taslağı ekler. Normal7733 TEST'te üç yenilemede175/220/175 karakter ve Ayarlar dönüşünde175 karakter birebir korundu; yenilemelerden sonra elle doldurulmadı.401 geçici koruma, açık çıkış/yetki kaybı temizliği, başarılı gönderimde yalnız ilgili metni temizleme ve diğer salt okunur sohbeti koruma hedefli testlerle doğrulandı. Depolama hata/sınırında metin bellekte ve görünür uyarı var. Önceki1440/1024/390 kanıtı korunur; bütün katalog/atama/ERP ekranlarının kullanıcı kabulü gerekir. Sekme kapanışı veya başka cihaz kalıcılığı kapsamda değildir. |
| M01 | Fiziksel telefonda bütün CRM akışları | 🟡 kısmi / kullanıcı kabulü bekliyor | Fiziksel WhatsApp medya kabulü mobil CRM kabulü değildir. TEST UI loopback; mevcut güvenli erişimle telefon CRM müşteri/sohbet/medya/ürün/fiyat/çeviri/atama/ERP akışlarının kabulü gerekir. |
| O01 | Child restart sonrası normal kullanım | 🟢 tamam | TEST UI/gateway/katalog child'ları supervisor tarafından yeniden açıldı, mevcut konuşma/atama/dosyalar/katalog/yanıt gerçek ekranda korundu. |
| O02 | Windows otomatik açılış ve bağımlılık zinciri | 🟡 kısmi / kullanıcı kabulü bekliyor | Melisa-CRM-TEST-Completion mevcut kullanıcı LOGON görevi kuruldu; tek launcher mevcut owner/config süreçlerini devralır. Native62404 ve supervisor ayrı durdurulunca otomatik yeniden açıldı; normal CRM oturumu/AI erişimi geri geldi. İmzalı resmi Docker Desktop için HKCU Run oturum başlangıcı eklendi; çalışan container/service restart edilmedi. Gerçek logon/reboot sonrası Chatwoot ve CRM kabulü bekliyor. |
| R01 | GitHub CI altyapısı ve her teslim HEAD'inin kontrolü | 🟢 tamam | Çalışan D paket kaynağı0c60c55 ve96f047a belge HEAD'i: CRM PR/push üç job ve AI offline SUCCESS. ERP E02/C09 CI çakışması5be1360 ile giderildi; merge-tree temiz, exact PR/push quality-build-test+secret-scan SUCCESS. İzleyen belge HEAD'leri PR3/PR24 Checks'te ayrıca izlenir. CI gerçek kullanım kabulü sayılmaz; yerel ERP geniş CRLF/LF koşumu PASS değil. |
| R02 | Değişmez TEST paketi ve uygulanabilir rollback hazırlığı | 🟢 tamam | A=d9985a6, B=e019baf ayrı releases paketi ve dış manifest SHA256 ile gerçek A→B→A→B turu tamamlandı; sonB'de doğrulanmış child otomatik geri açıldı. Normal oturum/7733 geçmişi ve B gerçek ERP kataloğu görüldü; UI dosya hash'leri pakete eşit.40/40 günlük, AI kuralları ve ayrı ERP paket/config hash'leri aynı, native57636 PID/creation korundu. İlk launcher kapanış yarışı önceki kaynağı otomatik geri açtı,5b5f80f düzeltti. Logon/LIVE kabulü ayrı O02/R04'tür. |
| R03 | Kabul edilmiş sürümü main/tag/release'e almak | 🟡 kısmi / kullanıcı kabulü bekliyor | Uygulama PR3 feature/crm-completion tabanında; main otomatik merge edilmez. Açık kritik işler/kabul ve exact CI bittikten sonra somut PR/commit için kullanıcı onayı gerekir. |
| R04 | Kontrollü LIVE geçiş ve gerçek rollback kabulü | 🟡 kısmi / kullanıcı kabulü bekliyor | LIVE değişmedi. Kabul edilmiş paket, önceki paket/config/kimlik ve bakım kapsamı hazırlanıp kullanıcı onayı sonrası uygulanır; yapılmadan BİTTİ denmez. |

## Güncel dallar ve teslim sırası

Kanonik kök `C:\Sirket\CRM\melisa-crm`, fetch/push origin `https://github.com/melihsnyldzz-ui/melisa-crm.git`; aktif dal `codex/crm-agents-on-completion-20261003`, [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3). TEST güncel D paketi0c60c55/manifestbaf4bc59'dan çalışır; önceki C=aa85448/manifest91954b4a korunur; önceki B=e019baf/manifest e099238f ve R02 geri dönüş kanıtı korunur. Kanonik geçiş aracı5b5f80f paket dışındadır. Baseline gerçek kabul kaynak HEAD446ac3a korunur. Main8e861aa/PR5 yalnız hazır geliştirme altyapısını taşır; uygulama main'e alınmadı. [PR4](https://github.com/melihsnyldzz-ui/melisa-crm/pull/4) açık tarihsel altyapı işi; [PR6](https://github.com/melihsnyldzz-ui/melisa-crm/pull/6) çekirdeği cherry-pick ile bu dala alındı, PR kendiliğinden kapatılmadı. PR1/2 eski ajan overlay'leri; ürün eksiği veya otomatik merge hedefi değildir.

U01 taslak kaybı düzeltildi; R02 gerçek TEST geri dönüşü korunur. E02 yeni native -04 TEST paketi açıldı; açık yarım kalan kapsam aynı7733/müşteri593 içinde iki ürünlü2+3adet/980TRY taslak ve ayrı readback kabulüdür. Genel eşleme kırmızı kalır. Günlük çalışma seçimi [DELIVERY_BOARD.md](DELIVERY_BOARD.md) ile yapılır; başka müşteriye gönderim/AI/ERP yazımı açılmaz. Personel, fiziksel mobil, Windows logon ve işletme kuralları kabulleri ayrı bekler. Her iş ilgili mevcut dal/PR üzerinden dar commit→push→aynı HEAD CI→STATUS ile teslim edilir.

## Gerçek TEST kabulü

Normal masaüstü TEST: **http://127.0.0.1:62400/**. Gateway62401, katalog62402, taslak adapter62403, ayrı native TEST API62404. Yalnız izinli7733 kabul kapsamı; başka müşteriye gönderim veya LIVE deploy yok. Telefonda `127.0.0.1` Windows sunucusunu açmaz; fiziksel erişim doğrulanana kadar telefon URL'si uydurulmaz.

Sıradaki kullanıcı kontrolleri: (1) atanmış7733 kendi personel hesabında görünür ve müşteri/geçmiş açılır; (2) patron/müdür/personel doğru yetkiyi görür; (3) fiziksel CRM'de sohbet/medya ve ürün/fiyat kullanılabilir; (4) hazırlanmış AI önerisi incelenip yalnız taslağa alınır; (5) planlı otomatik açılış sonrası normal CRM ve ERP read/draft erişimi görülür. Hazır olmayan AI/autostart adımı kabul edilmiş gibi sunulmaz. Ana hedef ancak tüm kritik yapraklar ve son onaylı yayın/rollback kanıtı tamamlanınca BİTTİ olur.

## Tarihsel plan ve kabul kayıtları — güncel iş sayacı değildir

Aşağıdaki eski tarihler/URL hedefleri/PID'ler/kalan sayımlar kendi zamanı içindir. Tam kapsam üstteki ağaçtır; günlük sıra DELIVERY_BOARD, teknik kanıt CRM_STATUS güncel bölümüdür.

# MELISA CRM — Ana Bitiş Planı

Bu dosya, `melihsnyldzz-ui/melisa-crm` reposunda CRM’in kapsamı, çalışma sırası ve “BİTTİ” kararı için **source of truth (tek ana referans)** kaynağıdır. README buraya yönlendirir; CRM_STATUS.md durum ve kanıt kaydıdır. Bu planın varlığı özelliklerin tamamlandığı anlamına gelmez.

## Kanonik geliştirme girişi — 3 Ekim 2026

SEMIH repo kökü `C:\Sirket\CRM\melisa-crm`. Uygulama tabanı `feature/crm-completion` / `fd297df9922c4157aa5e8944bf0c091d618906c3`; ajan ve yerel düzen çalışma dalı `codex/crm-agents-on-completion-20261003`, PR #3. Main otomatik merge edilmez. Eski kaynak ve çalışan runtime’lar korunur.

## Çalışma kuralı

Mevcut çalışan CRM baseline kabul edilir. Çalışan özellikler yeniden ispatlanmaz; yalnızca gerçekten eksik özellikler aşağıdaki sırayla tamamlanır. Mevcut çalışan akış korunur; yeni mimari veya ek onay zinciri üretmek bitiş işi değildir.

**4 Ekim 2026 kullanıcı düzeltmesi:** 7733 dışındaki bir kişinin WhatsApp yazışması CRM'de görünmüyor. Tek test peer'ine bağlı incoming normalizer salt okunur kaynak incelemesinde doğrulandı. Önce bu günlük kullanım eksiği ve ilgili konuşma karşılaştırması ele alınır; 7733 metin/medya ve ERP taslak kabulleri yeniden açılmaz. Genel müşteri alımı kodu hazır olmadan tüm metin akışı PASS denmez. LIVE deployment ve başka müşteriye gönderim yetkisi verilmiş değildir.

Her adım: **eksiği bul → düzelt → TEST’e kur → gerekli otomatik kontrolü yap → gerçek kullanım kabulüyle PASS yap → sıradakine geç.** Değişiklikten etkilenen akış veya somut bir regresyon şüphesi için hedefli kontrol yapılabilir; bu, tüm baseline’ı yeniden kanıtlama döngüsüne dönüşmez.

**4 Ekim 2026 kaynak düzeltmesi:** Genel gelen kimlik/kişi/konuşma eşlemesi tamamlandı; belirsiz LID, eksik kişi araması, farklı kişiyle karışma, kapalı görüşme ve tekrar aktarım durumları korundu. 0817 sağlayıcı kaydı yeni kodla doğru telefona salt okunur çözüldü; başka müşteri aktarımı yapılmadı. Yeni 7733 gerçek yanıtı “Kimlik testi 0320” normal CRM'de doğru konuşmaya bir kez geldi ve TEST restart sonrası korundu. Gelen TEST kapsamı da yalnız 7733; LIVE webhook/deployment aynı kaldı. Genel müşterinin gerçek CRM alımı bu yüzden kullanıcı kabulü bekler, tüm metin maddesi yeşil değildir. Eski 500 ham kayıt sınırı ve hareketli sayfa sırasının konuşma gizlemesi aynı inbox düzeltmesinde ele alındı; gerçek ekranın güncel sonucu ve kalan tek liste `CRM_STATUS.md` içindedir. Bu kod kabul hazırlığı tamamlandığında sonraki tek geliştirme işi giden ses/video yoludur; personel/rol/mobil kabulleri ayrı açık adımlardır.

**4 Ekim 2026 ses/video hazırlığı:** Giden ses/video seçimi, yerel oynatıcı, MIME/uzantı/içerik doğrulaması ve native provider gönderim desteği tamamlanıp kanonik TEST’e kuruldu. Yeni sekmede CRM girişi ve Samsung kilidi kullanıcı adımı beklediğinden gerçek gönderim/iki yönlü oynatma yapılmadı; sarı kullanıcı kabulü, PASS değildir. Sonraki tek geliştirme eksiği Windows TEST supervisor/UI/gateway/adapter autostart zinciridir. Ses/video gerçek kabulü yalnız 7733 konuşmasından sürdürülür; mevcut yeşiller yeniden açılmaz.

**4 Ekim 2026, 19:34–19:41 ses/video gerçek kabulü:** Normal CRM’den yalnız 7733’e MP3 ve MP4 gönderildi; kullanıcı ikisini telefonda açtığını doğrulayıp geri gönderdi. Gelen dosyalar doğru konuşmada sonuna kadar hatasız oynatıldı; ses/video gerçek MP3/MP4 kapsamında PASS. Önceki giriş/kilit bekleyen hazırlık kaydı tarihsel olarak korunur. Tek güncel liste `CRM_STATUS.md`: kalan5 kritik, Windows autostart geliştirmesi ve dört kullanıcı kabulü. Sonraki tek geliştirme işi Windows TEST supervisor/UI/gateway/adapter otomatik açılışıdır.

## Öncelik sırası ve gerçek kullanım kabulü

Baseline’da zaten çalışan madde korunur; eksik olanlar sırayla ele alınır. Aşağıdaki tablo bir tamamlandı listesi değildir.

| Sıra | Özellik | Bitiş kriteri |
| --- | --- | --- |
| 1 | Fotoğraf gönder/al | CRM’den 7733 test telefonuna gönderilen fotoğraf telefonda açılır; telefondan gönderilen fotoğraf CRM’de görünür ve açılır. |
| 2 | PDF/dosya gönder/al | Her iki yönde gönderilen PDF ve dosya karşı tarafta görünür, indirilir ve açılır. |
| 3 | Atanmamışlar/konuşma atama | Atanmamış konuşma listede bulunur, personele atanır ve doğru kişinin normal çalışma ekranında görünür. |
| 4 | Otomatik çeviri | Gerçek test konuşmasında gelen ve giden mesaj için beklenen dilde anlaşılır çeviri kullanılır. |
| 5 | Katalog | Kullanıcı normal CRM arayüzünde kataloğu açar, doğru ürünü bulur ve içeriğini görür. |
| 6 | Ürün gönder | Seçilen ürünün doğru görsel ve bilgileri test telefonuna ulaşır ve açılır. |
| 7 | Fiyat gönder | Seçilen ürünün doğru fiyatı ve para birimi test konuşmasına ulaşır. |
| 8 | ERP taslak sipariş | Test akışındaki müşteri ve ürünler doğru miktar/fiyatla ERP’de taslak sipariş olarak görünür; gerçek satışa dönüştürülmez. |
| 9 | Mobil kullanım | Telefon ekranında müşteri bulma, yazışma, medya, ürün/fiyat, çeviri, atama ve taslak sipariş akışı kullanılabilir. |
| 10 | Restart sonrası otomatik ayağa kalkma | Planlı restart sonrasında gereken servisler elle başlatılmadan açılır ve CRM’in normal kullanım akışı çalışır; logon veya başka bir koşul varsa açıkça kaydedilir. |

Her özelliğin bitiş kriteri **gerçek kullanım kabulüdür**. Unit test, build veya HTTP 200 tek başına yeterli değildir. PASS kaydında denenen akış, tarih ve gerçek sonuç bulunur. Gerçek kullanım sonucu görülmediyse durum “TEST BEKLİYOR” kalır; kod testleriyle yeşile çevrilmez.

## Kullanıcının kontrol edeceği üç yer

1. **TEST CRM’in normal arayüzü:** hedef adres `http://127.0.0.1:62094`. Kullanıcı CRM’i personel gibi kullanır; ayrı acceptance/gate ekranı zorunlu tutulmaz.
2. **7733 test telefonu:** mesaj, fotoğraf, PDF/dosya ve ürün/fiyatın gerçekten ulaştığı ve açıldığı; telefondan gönderilenin CRM’de göründüğü burada kontrol edilir.
3. **Sade status panosu:** hedef adres `http://127.0.0.1:62094/status`. Metin mesajı ve yukarıdaki on maddenin her biri için anlaşılır durum, kalan somut eksik ve gerçek kabul sonucu gösterilir: 🟢 PASS, 🟡 TEST BEKLİYOR, 🔴 EKSİK/FAIL.

Bu adresler planın kontrol hedefleridir; şu anda kurulu veya erişilebilir olduklarına dair doğrulama sayılmaz. Durum panosu normal CRM ve telefon kabulünün sonucunu yansıtır.

**4 Ekim 2026 gerçek TEST kaydı:** kanonik kaynakla normal CRM arayüzü `http://127.0.0.1:62400/`, gateway `62401`, katalog `62402`, ERP taslak adapteri `62403` üzerinde açıldı. `62094/status` hedefi bu runtime'da kurulmuş değildir; yeni kabul/gate ekranı eklenmedi. Güncel tek bitirme listesi ve 7733 telefon kabulü `CRM_STATUS.md` içindedir. Eski FULL_TEST yazım hedefinin reddi üzerine güncel SIRKET TEST için ayrı native create/read API'si `62404`'e kuruldu (ERP `4fb9eab`, CRM `8af2134`). Audit guard uyarlaması ERP a3fa8fc ile kuruldu; mevcut ERP hesabından 2 adet / 392 TRY taslak oluşturuldu ve ayrı geri okundu. Kullanıcı doğru sonucu görüp kabul etti; 8. madde aşağıdaki dar TEST kapsamında PASS. Kapsam mevcut TEST müşteri 593 ve doğrulanmış `vega-161466 / 41140 SÜPERMİNİ` ürünüdür. 3 Ekim tarihli eski runtime taslak kabulü korunur.

## TEST’ten LIVE’a bitiş sırası

1. TEST’te bu planın gerekli maddeleri gerçek kullanımda PASS olur; eksik veya doğrulanmamış madde tamamlandı sayılmaz.
2. Kabul edilen candidate (`candidate/rev3` veya onun devamı) `main`’e merge edilir.
3. Kabul edilen commit sürüm etiketiyle taglenir; sürümün commit’i kaydedilir.
4. Önceki çalışan sürüm ve geri dönüş adımları hazır tutularak kontrollü LIVE deploy yapılır.
5. LIVE’da gerçek akış ve rollback doğrulanır. Sadece rollback dosyası veya hash kanıtı yeterli değildir; kontrollü geri dönüş uygulanıp önceki çalışan sürümün açıldığı doğrulanır, ardından kabul edilen sürüme dönülür. Sonuç status kaydına yazılır.

Bu bölüm yayın sırasını tanımlar; planı dokümante etmek merge, tag veya LIVE deploy yapılmış olduğu anlamına gelmez.

## CRM ne zaman “BİTTİ”?

Kullanıcı gerçek akışta müşteriyi görür, yazışır, fotoğraf/PDF gönderir ve alır, ürün/fiyat paylaşır, çeviri kullanır, konuşmayı atar ve siparişi ERP’ye **taslak** aktarır. Katalog ve mobil kullanım çalışır; restart sonrası sistem otomatik ayağa kalkar. Gerekli gerçek kullanım kabulleri PASS, sürüm main’de ve tagli, kontrollü LIVE deploy ile rollback doğrulaması tamamlanmış olmalıdır. Bunlar tamamlanmadan CRM’e “BİTTİ” denmez.

## Dot / Codex / Work operasyon kuralı

- İşe bu planı okuyarak başla; mevcut çalışan CRM’i baseline kabul et.
- Gereksiz gate, bridge, prompt taşıma, yeniden onay veya çalışan özelliği tekrar test etme döngüsü yok.
- **Tek kırmızı maddeyi düzelt, gerçek testle yeşile çevir, sonra sıradakine geç.** Kullanıcıya kullanılabilir sonucu ve somut kalan eksiği göster.
- Yalnız gerçekten zorunlu manuel adımda kullanıcıdan yardım iste; verilmiş yetkiyi tekrar isteme.
- LIVE’da geri dönüşü zor değişiklik, veri kaybı, gerçek müşteriye istenmeyen işlem veya credential riski varsa ilgili işlemden **önce açık onay iste**. Gerçek kullanım kabulünü kontrollü test müşterisi/7733 üzerinden yürüt; test kabulü gerçek müşteriye işlem yetkisi değildir.
- Credential’ları dokümana, loga veya commit’e koyma. Durum kayıtlarında doğrulanmış sonuç ile bekleyen işi ayır.
