# Goal4 — ortak katalog, paylaşım ve native TEST taslak kanıtı

6 Ekim 2026. İnsan kabulü bekler. Bu kayıt yalnız değişen ERP–CRM zincirini kapsar; önceki kabul edilmiş mesaj/PDF/terminal akışlarını yeniden kabul saymaz.

## Kaynak ve çalışma sınırı

ERP HTTP sözleşmesi `melisa-catalog.v1`, kaynak0940c49; native SQL UUID düzeltmesi3a1f404. Günlük ERP TEST71/source9ada67c,5194/4144/4146 değişmedi. Ayrı native taslak paketi `CRM-ORDER-DRAFT-TEST-20261006-05`, source0940c49f3c90bc365955d3e2f64fb5b541f0717d, SHA256 `1d38e38b1ec67a8ca5c98883f19db9402632327fbe4645af972fb06647310bc3`,62404/loopback. DB yalnız `Semih\MELISADEV / MELISA_ERP_SIRKET_TEST_20260929_01`.

CRM yalnız bu HTTP sözleşmesini kullanır; HTML scrape, ikinci ticari ürün/fiyat DB veya legacy fiyat fallback yok.16622 kabul edilmiş açılış ürününe ek54held kart toplam16676; bu artış Vega delta değildir. Kaynak30Eylül snapshot'ı; stok yerel TEST, güncel LIVE taahhüdü değil. KOD1/KOD4, baştaki sıfır, NULL/gerçek0 ayrımı korunur.3830 CONFIRMED merkezi medya,67 AMBIGUOUS dışarıda.

## Gerçek paylaşım

Normal7733 konuşmasında `8023 CONCEPT`, ERP36724, gerçek fotoğraf ve yeniden okunan15.78000000USD/ADET paylaşıldı. Yeni provider yanıtı201, accepted; kalıcı journal aynı provider kimliğini Chatwoot12273/source_id ile eşler. Ayrı CRM GET200 aynı caption/image,109462byte/960×1220 ve providerAccepted/chatwootRecorded=true döndürdü. `delivered=false`, `read=false`: telefon insan kabulü otomatik PASS değildir. [Geri okuma](share-readback.json), [gerçek ekran](shared-photo-readback.png).

## Native taslak

Telefon7733 exact müşteri eşlemesi0 sonuç. Otomatik gerçek müşteri kimliği iddia edilmedi. Mevcut USD TEST carisi595, açık operatör gerekçesi/revizyonuyla seçildi. ERP36724 `8023 CONCEPT`1×15.78USD +ERP30226 `3344 CONCEPT`2×8.55USD =32.88USD. ADET/factor1; TEST kur1.00000000, piyasa kuru iddiası yok.

Native sipariş6/7/8, üç açık kontrollü deneme. Normal tarayıcı sipariş8'in UUID'sini refresh sonrası yalnız GET ile geri getirdi; yeni taslak POST0. SameUUID/fullbody replay aynı sipariş; farklıbody409; oturumsuz401; qty0/yanlışdöviz/uydurmaürün/müşterirevizyonu reddedildi.15 SQL negatifi ve mevcut principal doğrudan DML229/izin0. Önceki E01 native4/5 tarihçesi korunur. [Refresh](native-refresh-proof.json), [sipariş kimlikleri](native-orders-final.json), [native negatifler](native-negatives.json), [gerçek taslak](native-draft-ui.png).

Önce/sonra10 ticari tablonun count+SHA256 aynı;43 eski guard aynı. Kanıt ürün/stok, müşteri/tedarikçi hareketi, satış/alış faturaları/satırları ve tahsilat/ödeme isteklerini kapsar. Ayrıca hashlenmemiş bütün DB için değişmedi iddiası yapılmaz. Native taslak prosedürleri yalnız mevcut sales_orders/items ve v2metadata yazar; finans/rezervasyon etkisi yok. [Tablo karşılaştırması](zero-effects-comparison.json).

## Performans ve ekran

Son CRM9f81529 üç örnek medyanı: sohbet179ms,first50498,next50551,kod540,barkod355,kart223,fotoğrafbytes405,draftGET104. Aynı dönemde ERP71 yetkili50ürün medyanı518/469/424/295/183ms. Eski CRM fotoğraf12 sayfası eşdeğer50ürün baseline değildir. Normal UI seçimin forma gelişi820ms, ilk gerçek create734ms, ayrıGET258ms. API replay281ms ilk create sayılmaz. Fotoğraf byte ölçümü decode/paint değildir. [HTTP örnekleri](performance.json), [native UI süreleri](native-ui-timings.json).

1440/1024/390 normal katalog açıldı; gerçek ürünler/selection/işlem düğmeleri kullanılabilir, modal scrollWidth=clientWidth. [Mobil](catalog-390.png), [geometri](responsive.json). Fiziksel mobil/telefon insan kabulü değildir.

## AI ve son kapanış

Normal ekranda gerçek model ERP36724/15.78USD fiyat kartını önerdi; sayısal fiyat/stoğa ilişkin taahhüt üretmedi, composer korundu, autoSend=false/erpWrite=false. Açık İngilizce tercihin gerçek modelde Türkçe kaldığı bulundu; sabit doğrulanmış dil talimatı düzeltmesi107/107 test geçti. Son uygulama paketi ve gerçek İngilizce sonucu kapanışta eklenecek; bu ara kayıt Goal4 tamamlandı iddiası değildir.

Kota düzeltmesi8çağrı/5dk sınırını artırmaz: pasif okuyucu6, status+manuel gönderim için2 slot. Kuyruk/pagination korunur; belirsiz gönderim otomatik denenmez. Yalnız yerel pretransport429 doğru crm-send cooldown alır; katalog okumaları durmaz.34 hedefli test PASS, bağımsızreview CLEAR. Her teslimin exactHEADCI/secret kontrolü PR3/PR23'te izlenir.

CRM-UA02/03/04,A04/A05 ve ERP-UA13–17 insan kabulü bekler. LIVE/Vega/mainmerge/başkaalıcı/finalize/ödeme yok. Goal4 kapanınca Goal5 başlamaz.
