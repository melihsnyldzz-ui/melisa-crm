# CRM performans ölçüm incelemesi

## Son teslim — 5 Ekim, 19:03: yalnız ilk gerçek konuşma listesinin hızlandırılması

Bu bölüm aşağıdaki 18:00 katalog tesliminden sonraki dar çalışmadır. Önce çalışan source `f166b0f7db499c68e6cc6718bcf090fcaf457927`, sonra `2aef938f3f76d8bf4ca95054a5a0f98c19e21001`. TEST paket geçişi 18:52:00 READY; manifest SHA256 `4b2ea843df3b51024f0018690871c9ca95cef7b7f12bcea2baa92ac054e3dc01`. Kanonik geliştirme dalı ve PR3 kullanıldı; PR9 denetim kanıtları, katalog optimizasyonu ve LIVE korunmuştur. Sonraki belge HEAD'i çalışan paket source'u değildir.

### Eşdeğer native tarayıcı ölçümü

Normal görünür Chrome, aynı TEST ADMIN/kompakt görünüm, geçerli oturumla normal reload; üç başarılı örneğin medyanı. DOM gözlemcisi gerçek satırlar gelmeden kurulur. Hazır ölçütü görünür, etkin gerçek konuşma düğmeleridir; boş çerçeve başarı değildir. Native `performance.now()` kullanıldı; accessibility/tool çağrılarının duvar süresi, networkidle veya iki frame beklemesi eklenmedi. Bir sonraki paint zamanı ayrıca saklandı. İlk önce örneğinde bağımsız provider profili de çalışıyordu; paylaşılan TEST yükü ve snapshot ısınması değişkendir. Bu sayılar tüm cihazlar veya personel girişi için garanti değildir.

| Ölçüt | Önce medyan ms | Sonra medyan ms | Örnekler / sınır |
| --- | ---: | ---: | --- |
| İlk görünür, etkin gerçek konuşma listesi | 9428,1 | 779,2 | Önce 16288,8 / 7730,2 / 9428,1; sonra 1237,1 / 627,3 / 779,2. Önce 100, sonra 25 gerçek satır. |
| Tarayıcı ilk inbox HTTP resource süresi | 9068,4 | 422,7 | Önce 15306,8 / 7280,5 / 9068,4; sonra 440,8 / 422,7 / 412,3. Liste görünme süresinden ayrı. |
| 7733 gerçek geçmişini açma | 82,6 | 633,7 | Her tarafta yalnız bir örnek. Önce zaten yüklenmiş geçmiş; sonra ilk 25 satırdan hemen fresh detail okuması. Eşdeğer cold kıyas değildir. Sonra gerçek ses/video geçmişinde dört medya elemanı görünür; gönderim yapılmadı. |
| Fotoğraflı katalog ilk kullanılabilir grid | 2175,6 | 681,2 | Önce 11568,8 / 1950 / 2175,6; sonra 2328,4 / 681,2 / 671,5. Gerçek ürün adı, görünür etkin seçim ve busy=false gerekir. |
| Katalog bu sayfadaki 12 fotoğrafın tamamı | 2175,7 | 713,1 | Önce 11568,8 / 1950 / 2175,7; sonra 2384,8 / 713,1 / 698,3. IMG.complete ve naturalWidth>0 ayrı ölçüldü. Tüm 1085 ürünün fotoğrafları demek değildir. |

Katalog kaynağı değiştirilmedi. Üç açılışın ilk örnekleri cold/cache etkisi nedeniyle daha yavaştır; bu ölçümlerden yalnız inbox değişikliğinin katalog hızını artırdığı sonucu çıkmaz. Kullanıcının mevcut 16 seçim/English/USD tercihi korunmuştur; kaynakta USD fiyatı olmayan ürünler için fiyatlı çıktı engeli yerindedir. Boş katalog bağlantı modalı kullanılabilir grid kabul edilmedi. Eski aşağıdaki iki-frame ölçümleri bu yeni native serinin yerine kullanılmaz.

### Ayrı gateway/API ve Chatwoot profili

Doğrudan gerçek TEST gateway API, üç başarılı GET gövdesini tam okumaya kadar ölçüldü; özel token yalnız bellekte tutuldu. [Önce API](startup-before-api.json), [sonra API](startup-after-api.json). Eski gateway `view=bootstrap` parametresini normal overview olarak işliyordu. Cache/snapshot ve ağ yükü tarayıcı serisinden farklı; süreler toplanamaz veya birbirinden çıkarılarak render süresi hesaplanamaz.

| Gateway API | Önce ms | Sonra ms | Sonraki sonuç |
| --- | ---: | ---: | --- |
| İlk inbox | 3925,34 | 661,51 | 25 gerçek kayıt; total=null, complete=false, hydratedRows=0. |
| 7733 fresh detail | 136,89 | 237,94 | Gerçek geçmiş; bu küçük örnek serisinde daha yavaş, gizlenmedi. |
| Mevcut katalog ilk sayfa | 74,02 | 71,01 | 12 ürün / 1085 toplam; katalog hattı korunmuş. |

GET-only [Chatwoot önce profilinde](startup-before-provider.json) ilk metadata sayfası medyan 468ms; 751 ham kaydın 31 seri sayfası 11894ms; ilk 100 konuşmanın mesaj hidrasyonu 5548ms; ekip 27ms. Provider profili receipt journal/readiness ek işlerini içermeyen ayrı shadow okumadır; gateway/browser sonucu değildir. Darboğaz frontend'in kalan bütün 648 konuşmayı beklemesi değildi: backend ilk 100 için bütün metadata traversalını ve mesaj hidrasyonunu bekletiyordu; ekip de frontend başlangıç Promise.all içinde ilk listeyi bekletebiliyordu. Yeni patron/müdür bootstrap yalnız fresh activity sayfasını okur, mesaj hidrasyonu/traversal başlangıç renderından çıkar. Kurulu Chatwoot activity sort desteği ayrıca doğrulandı; eşit saniyede ID tie sırası garanti edilmez, normal overview kesin sıralamayı tamamlar.

### Sayılar, arama ve korunan sınırlar

İlk 25 kayıtta toplam bilinmiyor diye açıkça gösterilir; mesaj önizlemesi/history yükleniyor durumu sahte mesaj veya boş geçmiş yapılmaz. Arama yüklenen gerçek kayıtlar üzerindedir; kısmi sonuçsuz aramada diğer kayıtların yüklenmekte olduğu belirtilir. Arka planda mevcut tam overview ve mesaj sayfalaması korunur; örneğin [kısmi ekran](startup-after-7733-partial-list.jpg) 400/748 kaydı, geçici atanmamış sayısını gösterir. Bu ekran ilk 25'in tam o andaki fotoğrafı değildir. Tamamlanan [arama kanıtında](startup-after-complete-search.json) 748 toplam, okunmamış36, atanmamış641 ve 7733 aramasında bir sonuç vardır; load-more kalmamıştır. Global mesaj içerikli arama tam yükleme bitene kadar tamamlanmış sayılmaz. Full yükleme hâlâ pahalıdır; yeni ilk liste başarısı tam senkronun <1s olduğu iddiası değildir.

Personel için fresh full traversal/assignment erişim sınırı değiştirilmedi; personel hızlanması ölçülmedi/iddia edilmez. Agents ayrı oturum-generation kontrollü yüklenir; oturum/logout abort ve stale sonuç koruması, mevcut poll/revoke, fresh detail/send guard, inbox/group filtreleri, kaynak fiyat doğrulaması korunmuştur. Yeni auth/rol/fiyat cache yok; katalog cache/SQL pool/worker/read-only kaynak önceki optimizasyonla aynıdır. Geçersiz view service/fallback öncesinde 400 olur. Full sonuçta bootstrap-only eski üyeler uzlaştırılır; gerçek boş full sonuç eski liste/seçimi temizler, insan taslağı kısmi sonuç yüzünden silinmez. CSS ve görsel tasarım değişmedi; LIVE/new ERP melisa-catalog.v1/SQL DDL/ERP write/AI çağrısı/mesaj gönderimi yok.

### Operasyon gözlemi ve doğrulama

Ara gözlemde TEST oturumu geçersizleşti. Yerel log, test-server child'ın 18:54:37'de mevcut supervisor tarafından tekrar başlatıldığını ve 18:55:11'de eski token için AUTH_TOKEN_INVALID olduğunu gösterir. Child kapanma nedeni mevcut logda bulunamadı; bu dar çalışma bunu çözmüş veya hiç hata olmamış gibi sunmaz. Fresh reload sonrası üçüncü açılış ve fresh geçmiş başarıyla ölçüldü; son ekranda gecikme uyarısı yok. Paket source aynı kaldı. Sonraki [runtime kimlik kanıtı](startup-runtime-after.json) TEST62400/62401 PID71596,62402 PID54156,62403 PID35948'in aynı immutable pakete bağlı olduğunu; nativeERP62404 PID49220 ve LIVE4114/4116/5188 PID/creation değişmediğini doğrular. Geri dönüş önceki f166 paket/config'inde hazır; bu tur rollback tatbikatı yapılmadı. Child kapanma nedeni ayrı operasyon incelemesi olarak açıktır.

API serilerinde 429 görülmedi; mevcut ayrı read/send/login bütçeleri değiştirilmedi. Yerel logdaki önceden mevcut WAAPI_READER_RATE_LIMIT kaydı katalog veya login 429 kabulü sayılmaz. Tam offline 874/874 (frontend331/gateway453/sözleşme-CI90), tracked syntax249 PASS; bağımsız son inceleme actionable P0/P1/P2=0 ve 29 hedefli kontrol PASS. Source2aef CI tüm7job SUCCESS: [PR](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/37335629904), [push](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/37335620312), [AI offline](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/37335629883). Sonraki belge HEAD'i aynı PR checks üzerinden ayrıca kontrol edilir. Kullanıcı kabul edilmiş baseline yeniden açılmadı. İstenen ilk açılış işi burada durur; başka geliştirme kendiliğinden başlamaz.

Yeni kanıtlar aynı performance-2026-10-05 arşivinde: [önce browser](startup-before-browser.json), [sonra browser](startup-after-browser.json), [önce katalog](startup-before-catalog.json), [sonra katalog](startup-after-catalog.json), [önce liste](startup-before-7733-list.jpg), [sonra tam liste](startup-after-complete-7733-list.jpg), [gerçek geçmiş](startup-after-7733-history.jpg), [önce katalog ekranı](startup-before-catalog.jpg), [sonra katalog ekranı](startup-after-catalog.jpg). Ham müşteri verisi, credential/config veya token arşive alınmadı.

## Tarihsel — 5 Ekim 18:00 katalog teslimi

Bu bölüm önceki f166 paket ölçümüdür; ilk listeye ilişkin güncel sonuçlar yukarıdaki 19:03 teslimindedir.

5 Ekim 2026 TEST ölçümleri katalog okumalarında belirgin hızlanma gösteriyor. Normal tarayıcıda katalog açılışı ve PDF indirme de kısalmış. İlk CRM açılışındaki Chatwoot beklemesi sürüyor; bütün ekranların bir saniyenin altında açıldığı veya kullanıcı kabulünün tamamlandığı sonucu çıkmaz.

Önceki çalışan kaynak `f1899b0e0828f23010af75b1731682c749e596cc`, sonraki çalışan kaynak ve uygulama teslim commit'i `f166b0f7db499c68e6cc6718bcf090fcaf457927`. Sonraki startup manifest SHA256 `47c495de9fa0d1da6a1878b7dfc2b2d6742c976d4541f35944315bacd36b6d4f`; dosya hash'i seçili config değeriyle eşleşti. Önceki API ölçümünün belge HEAD'i `8549b42` idi; çalışan kaynakla aynı alan değildir. Yetkili TEST paket geçişi 17:23:58'de READY oldu; sonraki ölçümler bu değişmez pakette yapıldı. Bu raporun yazılması runtime değiştirmedi. Sonraki belge commit'i uygulama paketinin source commit'i değildir.

## Senaryolar ve karşılaştırma

Süreler milisaniye; her hücre üç başarılı örneğin medyanıdır. API süresi yanıt gövdesinin tamamını okumayı içerir. Tarayıcı süresi normal eylemden belirtilen DOM hazır ölçütüne ve iki native animation frame'e kadar gider. API ve tarayıcı örnekleri farklı zamanlarda alınmıştır; birbirlerinden çıkarılarak sunucu veya render süresi hesaplanamaz. Kaynaklar [önce API](before-api.json), [sonra API](after-api.json), [önce tarayıcı](before-browser.json), [sonra tarayıcı](after-browser.json), [sonra ilk açılış](after-initial-browser.json).

| Senaryo | Önce API | Sonra API | Önce tarayıcı | Sonra tarayıcı | Ölçüm sınırı |
| --- | ---: | ---: | ---: | ---: | --- |
| İlk CRM açılışı ve gelen kutusu | 4.902,7 | 4.936,3 | 15.902,7 | 15.141,6 | API 100 konuşmalık inbox okuması; UI ilk açılışın ayrı örnekleri. İlk açılışın frame ölçütleri tam eşdeğer değil. |
| Oturum yetki okuması | 4,2 | 3,0 | Ayrı ölçüm yok | Ayrı ölçüm yok | Auth API; normal rol kullanıcı girişinin süresi değildir. |
| Müşteri araması | Yerel filtre | Yerel filtre | 73,5 | 1.599,0 | Önceden yüklenen liste; frame kontrolü nedeniyle UI regresyonu diye yorumlanamaz. |
| 7733 konuşmasını yeniden açma | 131,6 | 207,4 | 45,1 | 1.973,7 | API ayrı detail okuması; UI zaten seçili konuşmayı yeniden gösterir, cold detail eşdeğeri değildir. |
| Mesaj ekranına dönüş | Ayrı API senaryosu yok | Ayrı API senaryosu yok | 866,1 | 2.109,5 | Görünür chat header ölçütü; yeni tam inbox yükleme süresi değildir. |
| Katalog ilk açılış | 8.400,7 | 111,7 | 14.507,0 | 4.738,5 | API ilk sayfa; UI bütün 12 görünür fotoğrafın yüklenmesini bekler. |
| Katalog ikinci açılış | İlk sayfa API örnekleri yukarıda | İlk sayfa API örnekleri yukarıda | 17.329,4 | 4.829,2 | UI yeniden açılışın üç ayrı örneği; ayrı bir ikinci açılış API serisi yok. |
| Ürün kodu araması | 7.780,9 | 99,9 | 6.970,6 | 296,0 | Bir ürün sonucu; kod araması UI ve API'de ayrı ölçüldü. |
| Tek ürün kartı | Kod arama API'si yukarıda | Kod arama API'si yukarıda | 6.970,6 | 296,0 | Aynı kod arama örneklerinde bir gerçek kartın ve fotoğrafının hazır olması; bağımsız örnek serisi değildir. |
| Ürün adı araması | 6.928,5 | 101,9 | 8.969,3 | 170,5 | 11 ürün sonucu. Önceki başarısız oturum örneği dışlandı; aynı başarılı replacement kaydı iki kez bulunuyor, yalnız bir kez sayıldı. |
| Ürün detayı | 897,5 | 51,5 | Ayrı detay ekranı ölçülmedi | Ayrı detay ekranı ölçülmedi | API detail başarıları var; özel ürün detay UI ekranı denenmiş gibi sunulmaz. |
| Tek ürün fotoğrafı | 784,5 | 67,3 | Ayrı tek fotoğraf UI ölçümü yok | Ayrı tek fotoğraf UI ölçümü yok | Aynı 168.355 bayt fotoğraf; grid resource ölçümleri aşağıda. |
| Katalog sayfa değişimi | 6.944,5 | 85,7 | 13.224,0 | 3.940,4 | API sayfa2; UI fotoğraf yükleme ve frame beklemesini içerir. |
| Katalog önizleme | Yerel işlem | Yerel işlem | 33,1 | 2.005,7 | Sırf bu farktan iki saniyelik uygulama regresyonu çıkarılamaz. |
| PDF indirme | Ayrı PDF API'si yok | Ayrı PDF API'si yok | 13.666,4 | 277,1 | Tarayıcı üretimi; her indirmede iki taze katalog doğrulama okuması kaydedildi. |
| Para birimi değişimi | Yerel işlem | Yerel işlem | 16,8 | 17,4 | Ekran seçimi; döviz dönüşüm hizmeti ölçümü değildir. |

API katalog toplamı her iki tarafta 1.085 fotoğraf referanslı ürün, ilk/ikinci sayfa 12 ürün, kod araması bir ürün, ad araması 11 üründür. Yanıtlar `cached:false` ve doğrulanmış kaynak metadata'sını koruyor. Bu kaynak doğrulaması stok güncelliği veya seri doğrulaması değildir. API örneklerinin tamamında HTTP200, `stoppedOn429:false` kaydedildi; bu örneklerde 429 görülmemesi tek başına bütün uzun kullanım senaryolarının kabulü değildir.

## Fotoğraflar ve tarayıcı ölçütü

İlk ve ikinci katalog açılışlarının toplam altı örneğinde önce de sonra da 72 fotoğraf resource isteği var. Resource süresi medyanı **928,9 → 78,5 ms**, maksimum **2.365,9 → 1.768,4 ms**. Bu 72 resource gözlemi üç UI örneğinin yerine geçmez. Sayfa değişimlerinde önce 24, sonra 12 fotoğraf resource isteği görülüyor; sonraki diğer sayfa örneklerinde fotoğraflar yeniden ağdan alınmamış. Bunları eşit cold fotoğraf yükü diye karşılaştırmak doğru değildir. Resource kayıtlarında ürün kimlikleri genelleştirilmiştir.

Önce ve sonra eylem ölçümleri [observer](browser-observer.js) tarafından DOM hazır koşulu ve iki animation frame ile tamamlanır. Katalog için busy durumunun bitmesi ve görünür grid fotoğraflarının `complete` olması, pozitif doğal genişliği aranır; PDF için indirme durumunun görünmesi aranır. Bu yöntem doğrudan kullanıcı eyleminin native zamanını alır; araç çağrısının gidiş dönüş süresi süreye ayrıca eklenmez. Ancak tarayıcı frame planlaması ve ölçüm sırasında erişilebilirlik ağacının okunması örnekleri etkileyebilir. Sonraki PDF/önizleme örneklerinde erişilebilirlik gözlemi ölçüm tamamlandıktan sonra alınmıştır; önceki ve sonraki UI protokolleri birebir aynı değildir. API ve SQL süreleri bağımsızdır; UI değerlerinden kesin hızlanma oranı veya çıkarma yoluyla düzeltilmiş süre üretilmez.

[Frame kontrolünde](frame-control.json) CRM eylemi yapılmadan yalnız iki native animation frame **1.005,2 / 1.996,9 / 1.999,8 ms** sürmüş; medyan **1.996,9 ms**. Üçünde de focus=true ve görünür sekme kaydedilmiş. Dolayısıyla sonraki önizleme, konuşma dönüşü, müşteri araması ve mesaj ekranı kayıtlarındaki yaklaşık iki saniyeyi uygulama regresyonu diye kabul etmiyoruz. Bu kontrol değerini ölçümlerden çıkararak düzeltilmiş UI süresi de üretmiyoruz.

İlk açılışta önceki kayıt native trace içinde inbox yanıtı sonrası ilk Paint ölçütünü, sonraki kayıt navigation başlangıcından ilk konuşma listesi DOM'u ve iki native frame'i kullanır. Bu fark ve ortak Chatwoot değişkenliği nedeniyle **15,90 → 15,14 saniye** kayıtları kesin ilk açılış hızlanma oranı değildir. Sonraki UI örnekleri 13,52–19,62 saniye, API inbox örnekleri 4,35–19,70 saniye aralığında. Chatwoot açılış darboğazı hâlâ açık.

## PDF ve kabul sınırı

[Gerçek indirilen PDF](two-product-catalog-after.pdf) 133.596 bayt; SHA256 `8b030b261cc3611cf9efe57b5d5b4dae64a9217d3295463c1e39004dfc003741` dosyadan doğrulandı. [PDF doğrulama kaydı](after-pdf-validation.json) bir sayfa, iki görsel, seçilen iki ürün kodu, TRY ve iki adet 196 fiyat kaydı bildiriyor. Ana ajan PDF'yi Poppler ile [PNG olarak çizdirip](two-product-catalog-after.png) görsel olarak inceledi: 41140/41142 görselleri ve 196 TRY/adet fiyatları yerinde; bilinmeyen stok/seri etiketleri korunuyor. [Normal katalog önizlemesi](after-catalog-preview.jpg) ve [7733 konuşma ekranı](after-7733-inbox.jpg) mevcut TEST görünümünü ayrıca kaydeder. PDF yapısal kontrolü, çizdirilmiş sayfa ve uygulama ekranları ayrı kanıtlardır.

[Inbox traversal shadow karşılaştırması](inbox-traversal-shadow-compare.json) seri okumada 14.644,4 ms, üç paralel okumada 15.627,2 ms; aynı 748 ID kümesi ve seçili metadata karşılaştırması eşleşti. Kazanç göstermeyen paralel uygulama değişikliği geri alındı. Bu shadow denemesi çalışan TEST'e dağıtılmış inbox optimizasyonu değildir.

Sonuç: katalog API ve normal katalog/PDF akışında teknik hızlanma kanıtı var. İlk Chatwoot açılışı, bütün ekranlarda bir saniye hedefi, fiziksel telefon ve uzun süreli insan kullanım kabulü tamamlanmış sayılmaz. Çalışma existing-stock sözleşmesi kapsamındadır; ticari veri, SQL şeması veya yeni veri modeli değişikliği kanıtı değildir.
