# Konuşma geçmişi — 13 Ekim 2026

Ortak sıra 6 / CRM01, mevcut finish tree I01 alt kapsamı. Önceki gerçek 7733 metin/medya ve ilk açılış kabulleri korunur. Bu kayıt yalnız değişen geçmiş davranışının kaynak ve hedefli teknik kanıtıdır; normal TEST ekranı veya insan kabulü yerine geçmez.

## Bulunan gerçek kaynak hatası

Gateway ayrıntı okuması son 20 mesajı döndürürken App ayrıntı yenilemesi yüklenmiş mesajları bununla değiştiriyordu. Üstteki fotoğraf/PDF ve eski metin, yeni mesajdan sonra kaybolabiliyordu. Gerçek App kodunu çalıştıran offline fixture bu kaybı üretti; düzeltme ID ile birleştirir, güncellenen metin/teslim alanlarını alır, tekrarları kaldırır ve mesajları sırada tutar.

Atama değişirken bekleyen eski ayrıntı isteğinin 403/404 cevabı yeni konuşmayı ve taslağını silebiliyordu. Ayrı red fixture iki hatayı da üretti. Başarı ve bu iki konuşma hatası yakalanan atama kapsamıyla sınırlanır. Aynı güncel anahtarın 401 oturum yenilemesi korunur: assignment reddi 403, bulunmayan konuşma 404, normal token/süre/iptal hatası 401'dir. Provider 401/403 gateway'de 503 olur. Bağımsız high inceleme ilk yarış bulgusunun kapandığını doğruladı.

## Eski sayfa sözleşmesi

Mevcut `GET /crm/conversations/:id` yolunda tek `before` cursor kullanılır. İlk konuşma açılışında bütün geçmiş beklenmez; eski kayıtlar açık bir düğmeyle bir sayfa yüklenir. Yanıtta `history: { nextBefore, hasMore }` bulunur; toplam mesaj sayısı üretilmez.

Cursor ham sayfadaki kayıtları kapsar. Private/activity-only sayfa boş görünse de cursor ilerler; yalnız ham boş sayfa bitiş kanıtıdır. Geçersiz veya ilerlemeyen sayfa bitişe çevrilmez. Eski sayfa güncel müşteri, atama, yetki, önizleme veya workflow bilgisini ezmez. Yetki ve atama yeniden kontrol edilir; başka konuşma veya oturuma geç kalan veri taşınmaz.

Bu API seçimi [Chatwoot'un resmi mesaj belgesine](https://developers.chatwoot.com/api-reference/messages/get-messages) dayanır. Belge yerel Chatwoot sürümünün doğrulandığı anlamına gelmez; gerçek mevcut TEST okuması ayrıca bekler. Credential header, provider worker, send yolu veya ERP katalog sözleşmesi değiştirilmez.

## Gerçek kabul sınırı

Yeni kaynak ortak TEST'e bu çalışma sırasında kurulmaz; ortak startup/config/restart ERP sahibindedir. CRM06 için daha önce hazırlanan source `1be7277` / belge `c262897` paketi owner tarafından alınmıştır ve henüz aktive edilmemiştir. Eski bağımsız ürün-talep provası tekrar yapılmaz. Son gözlenen ortak CRM source `09ca1dac` ile yeni kaynak teslimi ayrı kimliklerdir.

Aktivasyon sonrası normal atanmış konuşmada eski fotoğraf/PDF → eski sayfa yükle → yeni ayrıntı yenilemesi → aynı taslak ve scroll konumu; sonra normal personel kapsamı ve mobil kontrol gerekir. Genel gelen müşteri/mesaj kabulü ve I01 kapanışı hâlâ açıktır. 25 sabit CRM maddesi / 12 tamam / 13 kısmi / 0 kırmızı ile 55 ana teslim başlığı bu teknik parçayla yeniden sayılmaz.

## Son teknik kaynak kontrolü

- Backend ilk ilgili suite 60/60, sonra yalnız controller tekrar-okuma daraltması 3/3 geçti; aynı service hash'leri tekrar test edilmedi. Bu sayılar birbirine eklenmez.
- Frontend ana 23/23 kontrol, son raw DTO düzeltmesi için 7/7 dar kontrol geçti; son yedi önceki kontrollerle örtüşür ve toplam diye eklenmez. Eksik/null/object veya 20'den uzun ham `messages`, normalizasyondan önce reddedilir. API ve gerçek App fixture'ında cursor atlama red→green gösterildi; geçerli private-only `[]` korunur.
- Root altı bootstrap kontrolünü ve son donmuş frontend API + actual controller bağlı kontrolünü doğruladı. Bağlı kontrolde JPEG → private-only sayfa → PDF → ham boş bitiş, aynı üretim adaptörleriyle çalıştı. Tüm transport sentetiktir; gerçek provider veya normal runtime çağrısı yoktur.
- Son temiz ortam/offline üretim frontend build geçti. Büyük bundle ve mevcut statik/dinamik import uyarıları korunur; derleme süresi açılış hızı diye raporlanmaz.
- Bağımsız high reviewer son kaynakta açık P1/P2 bulmadı. Teknik hazır; gerçek normal Chatwoot, mobil ve insan kabulü bekliyor.

Komutlar, aşamaların örtüşme sınırı ve Windows worktree / LF-normalized kaynak SHA256 değerleri [verification.json](verification.json) içindedir. Source **30f78ded3dac98f74b663dc08cdb6a9a4baa2259** commit/push edildi ve remote/PR3 head eşleşti. Yeni exact source CI **FAILURE / 7 job / 0 step**; her işte taze ödeme/harcama engeli doğrulandı, testler başlamadı. [PR CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38396143970), [AI offline](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38396143957), [push CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38396137067). Ek runner image bilgisi source/test hatası değildir. İzleyen yalnız-belge HEAD'i ayrıdır; son CI PR3'te ayrıca okunur. Offline sonuç, CI ve insan kabulü ayrı tutulur. Yeni runtime/paket kurulmadı; LIVE/main, paylaşılan DB/config/rol yazısı, gerçek mesaj veya ücretli servis çağrısı yapılmadı.
