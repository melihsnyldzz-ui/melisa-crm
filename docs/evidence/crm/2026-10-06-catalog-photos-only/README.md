# CRM katalog — yalnız fotoğraflı ürünler

6 Ekim 2026 kullanıcı isteği: “katalog sadece fotoğrafı olan ürünler gözüksün”. Kanıt normal TEST ADMIN ekranından, mevcut7733 konuşmasının kataloğundan alındı; mesaj gönderilmedi, ERP kaydı yazılmadı. Kullanıcı adına insan kabulü verilmedi.

## Çalışan sürüm

- TEST: http://127.0.0.1:62400/ ve mevcut LAN http://192.168.1.46:62400/.
- Önceki uygulama source: `9ea4dda207d4012776791df9089887c8c3e6015e`.
- Yeni uygulama source: `ad01203b65025408a30854cfed689653c56ef8fc`.
- Değişmez paket: `C:\Sirket\CRM\releases\crm-test-ad01203b65025408a30854cfed689653c56ef8fc`.
- Manifest SHA256: `119e7cb974c4d6a022ba50e5945cd9f0655f0206f10acf430bd52338cfd62aaf`.
- Kanonik TEST switch20:18:13 Türkiye saati READY. Native62404 PID44548 ve başlangıç zamanı, normal ERP TEST71 ve LIVE süreçleri değişmedi; eski paket geri dönüş için korunuyor.

## Normal ekran sonucu

| Kontrol | Önce | Sonra | Ekran |
| --- | --- | --- | --- |
| İlk katalog |16.676 sonuç/334 sayfa; fotoğrafsız kartlar|3.830 sonuç/77 sayfa; ilk sayfada50 fotoğraflı kayıt|[Önce](before-catalog.jpg), [sonra](after-catalog-page1.jpg)|
| Sayfa değiştirme | Yeni katalog için karşılaştırma yapılmadı | İkinci sayfada50 ürün, toplam3.830/77 korunur | [İkinci sayfa](after-catalog-page2.jpg) |
| Fotoğrafsız3344CONCEPT araması |1 sonuç, “Fotoğraf doğrulanamadı”|0 sonuç, “Bu sorguda ürün yok”|[Önce](before-no-photo-search.jpg), [sonra](after-no-photo-search.jpg)|
| Fotoğraflı8023CONCEPT araması |Önceki Goal4 kanıtı korunur|1 ürün; gerçek128px fotoğraf,15.78USD/ADET|[Gerçek ürün](after-photo-product-search.jpg)|
| Sıfırla |Fotoğrafsızları yeniden getiriyordu|Arama boş, ilk sayfa50,3.830 sonuç/77 sayfa|[Sıfırlama sonrası](after-reset.jpg)|

İlk ve ikinci sayfada o anda görünen iki gerçek thumbnail `complete=true`, `naturalWidth>0`, yükseklik128px olarak açıldı; sayfaların50 kartında fotoğrafsız/hata etiketi yoktu.8023 ürünü fotoğrafı103×128px olarak açıldı. Bütün3.830 fotoğraf tek tek indirilip doğrulandı iddiası yok; filtre ERP'nin merkezi CONFIRMED ürün/fotoğraf eşlemesine dayanır.

Başlangıçta uzun süredir açık sekmenin eski JavaScript'i yeni katalog sözleşmesini okuyamadı; normal yenilemeyle güncel sürüm açıldı. Yenileme sonrası ilk okuma hatası yeniden okuma ile düzeldi; katalog API'sinde filtreli ve filtresiz50 satır200 ve geçerli ürün sözleşmesi ayrıca görüldü. Bu görevde backend hata/lease mantığı değiştirilmedi. Yeni paket ilk açılış/ikinci sayfa/arama/sıfırlama ekran turunda bu hata görülmedi.

## Değişiklik ve korunmuş sınırlar

Normal katalog sorgusu `hasImage=true` ister; mevcut CRM→ERP HTTP eşlemesi `image=available` kullanır. Filtre SQL sayfalaması öncesindedir; toplam ve sayfa sayıları ERP cevabından gelir. İstemcide filtreleyip yanlış toplam gösterilmez, bütün katalog veya fotoğraflar önden yüklenmez. Arama/barkod/marka/kategori ve reset kapsamı aynı kalır; fotoğrafsız liste satırı sözleşme hatası olarak reddedilir.

Eski kayıtlı ama listede bulunmayan seçim ID'si korunur; normal seçim panelinde “Önceki seçim / Bu katalogda görünmüyor” ve tekil çıkarma düğmesi vardır. Fotoğrafsız kart/fiyat uydurulmaz, güvenli çıktı kilidi korunur. Bu kurtarma SSR/sentetik depolama testidir; kullanıcının gerçek taslağı silinmedi veya değiştirilmedi.

Tekil ürün detayı, AI ve native sipariş dönüşümleri/fiyat tuple'ları değişmedi. Yetki/oturum iptali, ürün kimliği/revizyonu, fotoğraf byte doğrulaması, `no-store`, exact fiyat/birim/para birimi, rate limit ve mevcut taslaklar korundu. ERP kaynağı30Eylül açılışı ve yerel TEST'tir; güncel Vega veya satışa hazır stok taahhüdü değildir. LIVE/main/tag, yeni ERP sözleşmesi, başka müşteriye işlem veya otomatik gönderim yok.

## GitHub ve kontrol

Aktif dal `codex/crm-agents-on-completion-20261003`, [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) açık. Source ad01203 [push CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/37502109350), [PR CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/37502118360) ve [AI offline](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/37502118381) SUCCESS: quality-build-test/windows-startup-test/secret-scan/AI offline. Hedefli offline18/18 ve son seçim satırı SSR1/1 PASS; bağımsız reviewer engelleyici bulgu bulmadı. CI bu ekran kanıtı veya insan kabulü yerine kullanılmaz. Bu belge/evidence tesliminin sonraki HEAD'i PR Checks'te ayrıca doğrulanır.

JPG dosyaları bu turda yeni adlarla kaydedildi; önceki denetim/Goal4 dosyaları değiştirilmedi. `manifest.json` kaynak/ekran dosyası hash'lerini içerir. Finish tree25/12tamam/13kısmi/0kırmızı değişmedi; başka geliştirme başlatılmadı.
