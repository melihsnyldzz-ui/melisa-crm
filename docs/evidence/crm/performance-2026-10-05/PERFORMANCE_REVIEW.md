# CRM performans ölçüm incelemesi

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
