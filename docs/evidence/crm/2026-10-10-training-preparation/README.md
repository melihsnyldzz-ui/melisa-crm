# CRM ekran sadeleştirme ve kısa eğitim hazırlığı — 10 Ekim 2026

ERP-CRM-LEARN01 / CRM-DEC-010 / CRM-UA09 bekliyor

Normal yeşil CRM tasarımı korunarak katalog dili ve işlem açıklamaları sadeleştirildi. Bu kayıt teknik hazırlıktır; insan veya LIVE kabulü değildir. Önceki CRM-UA08 dahil bütün insan sonuçları korunur.

## Gerçek ekran sonucu

Koordinatör, çalışan source `94453500fc053828003786ed69db108d53f564eb` ile normal CRM kataloğunu açtı:3.830 fotoğraflı ürün kapsamı, ilk sayfada50 ürün. ‘ERP ürünleri’, ‘Listeyi yenile’, ‘Ürünleri mesaj taslağına ekle’ ve ‘Fiyatları mesaj taslağına ekle’ metinleri görünür. Bu düğmeler mevcut mesaj taslağına ekler; otomatik gönderim yapmaz. Boş seri bilgisi tek açıklama gösterir; bilinen seri içeriği korunur. Tam stok kodu, baştaki sıfırlar, kayıtlı satış fiyatının dövizi/birimi ve bilinmeyen/negatif stok veya karantina sınırları değişmedi.

ERP sipariş penceresindeki üç adım ürün seçimi → müşteri/döviz kontrolü → ERP taslağı kaydıdır. Taslak oluşturmanın satış, ödeme, stok veya cari bakiye etkisi yaratmadığı açıklaması korunur. Bu tur yeni taslak veya ticari kayıt oluşturulmadı; işlem mantığı/auth/API/payload/hesaplama değiştirilmedi.

Private önce/sonra ekranları `C:/Sirket/ERP/evidence/ERP-LEARN01-20261010/private/gui/` alanındadır; `after/08-crm.png` gerçek CRM teknik kanıtıdır. Müşteri, mesaj, ticari satır veya ekran görüntüsü bu public kayda yüklenmez.

## Hedefli kontroller ve çalışan paket

- Source944535 arayüz/metin hazırlığı için 53 benzersiz hedefli offline kontrol PASS:43 mevcut katalog/aktör/scope/döviz/tekrar/terminal kontrolü ve10 güncel katalog/SSR kontrolü. Test derlemesi sync→async uyarlanarak mevcut offline ağ koruması altında çalıştırıldı; koruma kaldırılmadı.
- Yeni gerçek SSR kontrolleri bilinmeyen/negatif stok, karantina seçilemez durumu, baştaki sıfırlı tam kod, fiyat/döviz/birim ve iki ondalık gösterimini korur. Bilinen seri içeriği korunur, bilinmeyen seri uydurulmaz. Sipariş yardım/receipt açıklaması giriş veya HTTP çağrısı olmadan render edildi.
- Source944535 frontend production build ve güncel doküman `git diff --check` PASS. Bu test/build makbuzu sonradan eklenen222a95f fotoğraf değişikliğini ayrıca doğrulamış sayılmaz; o teslimin ek kontrol makbuzu koordinatörde ayrıdır. Bunlar gerçek insan veya fiziksel cihaz sonucu değildir.
- Exact mevcut ERP image=available cevabının metadata +50 ürün satırı canonical okuyucuda offline doğrulandı; kaynak sözleşmesi ve rol/yetki genişletmesi yapılmadı.
- Önceki944535 servis oturumu yeni222a95f runtime aktivasyonuyla sona erdi; mevcut TEST oturumu yenilendi. Daha yeni paket geri alınmadı. Bu durum auth/rol veya katalog sözleşmesi gevşetilerek giderilmiş sayılmaz; Windows otomatik açılma/reboot kabulü de değildir.

Güncel immutable CRM paketi `crm-shared-test-222a95f9a63763c39cb18630373a1f27a55c6f65`, uygulama kaynağı `222a95f9a63763c39cb18630373a1f27a55c6f65`; manifest SHA256 `53f5260aef322024da42f29dce4d6766a58ed191c9a1ad8494bbcd947f2daa0e` koordinatörde doğrulandı. Önceki source944535 ekran/metin hazırlığı ve manifest `724eda99eb0cd1971fbd86310c315f33c0d359d0a2f381b2b5d0c3cd061a455e` tarihli kanıt olarak korunur; güncel runtime kimliği yerine kullanılamaz. Yeni222a95f teslimi doğrulanmış özgün fotoğrafları görünür ürün kartlarına getirir; arayüz hazırlığıyla kaynak/test sonuçları birleştirilmez. CRM UI/gateway/katalog/adapter62700–62703 ve mevcut native62704 ortak DB02'dedir. ERP API/native uygulama kaynağı `a51b1170ade29494b3b446a44a8a62974eef687b` korunur; ERP web/eğitim yüzü5234 ayrı sourceb5a8ce1 ile build/manifest doğrulanmış pakettir; API/native sourcea51b1170 ve izleyen belge HEAD'i ayrı kimliklerdir.

## Kullanım rehberi ve kalan insan sonucu

[Normal CRM](http://127.0.0.1:62700/) ve [8 derslik ortak rehber / CRM siparişi](http://127.0.0.1:5234/kullanim-egitimi.html#crm-order) kullanılır. CRM terminal62700 aynı host ERP5234 ile zaten güvenli eşleşir; farklı host/eski portlar ve farklı kimlikler kabul edilmez. Rehber işlem oluşturmaz. Koordinatör sourceb5a8ce1 rehberinde 8 dersin gerçek ERP/CRM ekran kesitlerini tarayıcıda doğruladı;1422 genişlikte görüntüler yüklendi, yatay taşma yok. Fiziksel Zebra TC21 şirket Wi-Fi üzerinden `http://192.168.1.46:5234/kullanim-egitimi.html` adresindeki rehberi ve mal kabul ekranındaki yeni metinleri açtı. Cihazda açılma/görsel kanıtı personelin kendi günlük iş, gerçek barkod veya insan kabulü değildir.

Private alanda 8 görsel ders ve40 saniyelik fiziksel rehber videosu hazırdır. SQL before/after kontrolünde169 işletme tablosunun satır sayısı/checksum farkı0; auth/audit tabloları bu kontrol dışındadır. Bu dar incelemede yeni ticari kayıt oluşturulmadı. Müşteri/mesaj içeren kesitler ve video public kayda taşınmaz.

CRM-UA09 **bekliyor**; insan kişi/tarih/kullanım sonucu bildirilmedi. Finish25toplam/12tamam/13kısmi/0açık ve CRM-UA08 değişmez. Eğitim PR27, TEST125/DB02 ve önceki aktarımlar korunur. Yeni ticari işlem, finansal açılış, auth/rol değişikliği, ücretli AI, gerçek WhatsApp, Vega/LIVE/main veya final T1 yoktur. Saf eğitim içeriği ortak rehberde kullanılır; eski Eğitim PR27/worktree/veritabanı değiştirilmez.

[CRM PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) / `codex/crm-agents-on-completion-20261003`: bu yeni belge teslimi ve exact son head CI makbuzu koordinatörde tamamlanacaktır. CI'nin önceki hesap/harcama engeli yerel testle yeşil sayılmaz. Bu dar hazırlık tesliminden sonra durulur; geniş işletme testi veya LIVE geçişi başlamaz.

Son gerçek ekran kontrolü: güncel CRM222a95f kataloğu da 50 / 3.830 kapsamı ve sade düğmeleri gösterdi. Sipariş penceresinde üç adım ve taslak/ticari etki ayrımı görüldü; bu tarayıcı sekmesinde mevcut ERP hesabıyla giriş gerekiyor. Kimlik/parola tahmin edilmedi, yeni taslak kaydedilmedi. Bu ekranın giriş sonrası personel kullanım kabulü bekler. İnceleme için yapılan yerel ürün seçimi temizlendi. TC21'de rehberin Sonraki düğmesi adım1→2 olarak çalıştı; donanım barkod veya insan PASS değildir.
