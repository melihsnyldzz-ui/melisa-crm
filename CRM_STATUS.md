# MELISA CRM — Güncel Durum

Güncelleme: **4 Ekim 2026 — gerçek kullanıcı kabulü**. İş sırası: [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md).

Çalışan CRM baseline korunmuştur. Bu tur yalnız 7733 test hattıyla gerçek yazışma yapıldı; explorer, frontend/backend ve bağımsız reviewer kullanıldı. HTTP 200, build ve unit test tek başına yeşil gerekçe değildir. LIVE deployment yapılmadı, başka müşteriye mesaj gönderilmedi.

## Kaynak ve TEST kimliği

- Kanonik repo C:\Sirket\CRM\melisa-crm; fetch/push origin https://github.com/melihsnyldzz-ui/melisa-crm.git; aktif branch codex/crm-agents-on-completion-20261003. Başlangıç HEAD 164cb53; önceki status inceleme değişikliği güncellendi. Uygulama baseline commit'i fd297df9922c4157aa5e8944bf0c091d618906c3.
- Normal çalışan CRM yönetim merkezi Sites uygulamasından bulundu. MelisaWhatsAppCrmGateway / 4200 / Auto / LocalSystem runtime'ı korundu; kaynak checkout deployment sayılmadı.
- Kanonik TEST normal UI: **http://127.0.0.1:62400/**; gateway 62401, katalog 62402, eski ERP taslak adapteri 62403. Loopback sınırı ve yalnız 7733 gönderimi açık. WAAPI instance 105185, Chatwoot account 2 / inbox 1 / test conversation 55. Otomatik yanıt kapalı; gelen okuyucu yalnız bu hattı yaklaşık 45 saniyede bir okur. LIVE webhook değiştirilmedi.
- Supervisor kanonik checkout'tan çalışıyor. Kimlik C:\Sirket\CRM\runtime\test-completion\processes.json; loglar C:\Sirket\CRM\logs\test-completion; journal ayrık TEST runtime altında. Özel ayarlar process belleğinde okundu, secret repo/rapora kopyalanmadı.
- Katalog gerçek Vega ürünleri ve MELISA_ERP_V2 aktif-primary fotoğraf metadata'sını salt okunur kullanır. Mevcut fotoğraf dosyaları değiştirilmedi. Güncel kanonik ERP release kaynakları kullanıldı.

## Bu tur gerçek sonuçlar ve düzeltmeler

**Metin:** Kullanıcı yanıtının gelmediğini bildirdi. Kapalı kanonik TEST alıcısı çalıştırıldı; Merhaba test, Kkk, Haloo normal ekranda göründü. Haloo otomatik Merhaba çevrildi. Bu TEST okuyucu davranışı tüm LIVE alıcılara genellenmez.

**Fotoğraf, 00:45–00:46:** Normal ek menüsünden PNG gönderildi; kullanıcı “Fotoğraf açıldı” dedi ve fotoğrafı geri gönderdi. Gelen fotoğraf normal CRM görüntüleyicisinde açıldı; 1280×720 gerçek decode görüldü.

**PDF/TXT, 00:50–00:58:** Normal menüden dosyalar gönderildi. Kullanıcı “Pdf açıldı” / “Txt açıldı” dedi, iki dosyayı geri gönderdi. CRM dosya bağlantılarından indirilen PDF render edildi; TXT okundu. İkisinin SHA256'sı gönderilen dosyayla eşleşti.

**Katalog/ürün/fiyat, 00:58–01:02:** 1085 fotoğraf referanslı gerçek ürün, ilk sayfada 12/12 açılan fotoğraf. Seçilen 41140 SÜPERMİNİ / BÜYÜK ÇİÇEKLER 2 Lİ TAKIM: **TRY 196/adet**. Fiyat normal sohbet taslağından gönderildi; kullanıcı “Fiyat geldi” dedi. Bir ürünlü fiyatlı PDF indirildi ve bağımsız render edildi: doğru fotoğraf, kod/ad ve ₺196,00/adet okunuyor. Aynı PDF sohbet eki olarak gönderildi; kullanıcı “Katolog açıldı” dedi. Kayıtlı satış fiyatıdır; stok/teslim taahhüdü değildir.

**Atama:** Yalnız test konuşması Ahmet'e atandı; listede Ahmet görüldü. Semih'e geri alındı; listede Semih görüldü. Atanmamış filtresinde atanan 7733 görünmüyor. Personelin kendi hesabında görme kabulü henüz yok.

**Düzeltilen gerçek TEST sorunları:** Inbox'ın 20 saniyede kesilen devam sayfaları için yalnız inbox okuma bütçesi 45 saniyeye çıkarıldı; iptal ve diğer isteklerin 20 saniye sınırı korundu. Yeniden denemede 498 konuşma ve 391 atanmamış sayımı oluştu. Katalog auth origin'i açık TEST 62401'e bağlandı. Kapalı eski fotoğraf servisi yerine mevcut dosyalar korumalı/salt okunur okundu. Açık 62402 TEST fotoğraf isteğinde doğrulanmış CRM oturumu iletiliyor; auth DTO'sunda bulunmayan active alanını bekleyen 403 giderildi. Yol, DB kimliği, rol/yetki, son oturum ve gerçek format kontrolü korunuyor. TEST journal/log/state checkout dışına alındı; baseline'ın LIVE journal yolunu devralması engellendi.

**Restart:** TEST UI/gateway ve katalog child'ları ayrı ayrı durduruldu; supervisor yeni PID'lerle kendiliğinden açtı. Aynı konuşma, atama, dosyalar, katalog ve kullanıcı yanıtı geri görüldü. Windows reboot/logoff autostart kabulü değildir.

**ERP:** Güncel native ERP eski adapterin MELISA_ERP_FULL_TEST_20260916 write havuzunu **SQL_WRITE_TARGET_INVALID** ile reddetti. Güncel SIRKET TEST kapsamı izinli CRM satış siparişi taslağı endpoint'i sunmuyor. Guard gevşetilmedi; eski kaynak veya fatura finalize endpoint'iyle aşılmadı. Adapter anlaşılır hata verir. Bu tur yeni ERP taslağı oluşturulmadı.

**Teknik kontroller:** TEST frontend build başarılı. Değişen inbox/oturum, runtime izolasyonu, fotoğraf yetkisi/yol ve forwarding kontrolleri 27/27 geçti; son gerçek auth DTO düzeltmesinin 6 fotoğraf kontrolü ayrıca geçti. Bağımsız review journal bulgusu düzeltildi; açık P1/P2 regresyon kalmadı. Bunlar telefon kabulü yerine sayılmadı.

Yerel görsel kanıtlar C:\Sirket\CRM\logs\acceptance-20261004 altında: gelen metin/fotoğraf/PDF, mobil görünüm, katalog önizleme, indirilen PDF render ve telefon kabul ekranı. Dosyalar/müşteri verisi Git'e eklenmez. [İndirilen gerçek fiyatlı PDF](C:/Users/Xaser/Downloads/melisa-katalog-tr-TRY.pdf).

## CRM BİTİRME LİSTESİ

Tek güncel liste. Kritik sayım 13 başlıktaki açık sarı/kırmızı satırların toplamıdır; aynı kabul/restart ikinci kez sayılmaz.

| Madde | Sınıflandırma | Gerçek sonuç ve kalan somut iş |
| --- | --- | --- |
| Gelen/giden metin | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Gerçek gönderim ve kullanıcı yanıtları ekranda. Kapalı TEST alıcısı açıldı; devam sayfası hatası giderildi. |
| Fotoğraf | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Telefon açma yanıtı ve gelen fotoğrafı CRM'de büyütüp açma kabulü tamamlandı. |
| PDF/dosya | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | PDF/TXT iki yönde açıldı/indirildi; içerikler eşleşiyor. Fiyatlı PDF de render edildi ve telefonda açıldı. Mevcut kapsam PDF/TXT. |
| Ses/video | 🔴 EKSİK / BOZUK — gerçekten geliştirme gerekiyor | Giden ses/video seçme/validasyon/provider yolu MIME kapsamında yok. Gelen oynatıcı hazır; gerçek oynatma kabulü yok. |
| Atanmamışlar ve konuşma atama | 🟡 KULLANICI KABULÜ BEKLİYOR — kod hazır ama benim gözümle doğrulamam gerekiyor | Filtre, gerçek atama ve geri alma görüldü. Kalan: atanmamış test konuşmasını personele atayıp aynı personelin hesabında görmek. |
| Patron/müdür/personel yetkileri | 🟡 KULLANICI KABULÜ BEKLİYOR — kod hazır ama benim gözümle doğrulamam gerekiyor | Patron oturumu kullanıldı; rol/konuşma sınırları hazır. Üç mevcut hesapla görünürlük/gönderim/atama kabulü yapılmadı. |
| Otomatik çeviri | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Haloo → Merhaba gerçek gelen mesajda otomatik göründü; önceki giden çeviri kabulü korunur. Tüm dillerin kalite kabulü iddia edilmez. |
| Katalog | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Normal UI'de gerçek ürünler ve 12/12 fotoğraf; seçme, fiyatlı PDF indirme/render ve telefon açma tamamlandı. |
| Ürün gönderme | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Doğru ürün görseli/bilgisi PDF ile gönderildi; kullanıcı katalog açma yanıtı verdi. |
| Fiyat gönderme | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | TRY 196/adet mesajı ve fiyatlı PDF ulaştı; fiyat geldi ve katalog açma yanıtları var. |
| ERP taslak sipariş | 🔴 EKSİK / BOZUK — gerçekten geliştirme gerekiyor | Eski kabul korunur; güncel kanonik ERP hedef/scope uyumsuz. İzinli yalnız-draft create/read sözleşmesi ve CRM adapter uyarlaması gerekiyor. |
| Mobil kullanım | 🟡 KULLANICI KABULÜ BEKLİYOR — kod hazır ama benim gözümle doğrulamam gerekiyor | 390×844 görünümde konuşma, medya ve giriş alanı kullanıldı; boyut geri alındı. Fiziksel telefonda tüm CRM akışları kabul edilmedi. WhatsApp dosya açma mobil CRM kabulü değildir. |
| Servis/restart sonrası otomatik çalışma | 🔴 EKSİK / BOZUK — gerçekten geliştirme gerekiyor | Child otomatik yeniden açılması gerçek görüldü. Windows açılışında supervisor/UI/gateway/adapter zinciri kurulumu ve reboot/logoff kabulü eksik. |
| Görüntülü görüşme pilotu, geniş ofis dosyaları, main/tag/release, LIVE deploy/rollback | ⚫ SONRA — günlük CRM kullanımı için şart değil | Baseline günlük kullanımını bozuk yapmaz. Planın nihai yayın/BİTTİ ölçütleri ayrıca geçerlidir. |

## Korunan tarihsel kanıt

3 Ekim 2026 “Melisa CRM’i devral ve tamamla” chat'i (01a10295-0ba4-7582-9fec-e611bdf31796), [deploy/README.completion-test.md](deploy/README.completion-test.md) ve fd297df: gerçek PNG/PDF/TXT kabul+kayıt, atama değiştirme/geri alma, çeviri ve ayar korunması, korumalı fotoğraf decode, 1085 ürün, native FULL_TEST ERP'de dört satır/dört adet **TRY 510,25** taslak ve geri okuma, child restart ve kayıt korunması. 444 otomatik kontrol teknik kanıttır; telefon/reboot kabulü değildir.

3 Ekim ilk incelemesinde TEST 62094/4212/62400–62403 kapalıydı; o anda açık diye sunulmadı. Sonraki açık kullanıcı yetkisiyle 4 Ekim bu kaynak TEST'i açıldı ve yukarıdaki gerçek kabul kaydedildi. Eski eksik PDF indirme/telefon kabulü kapandı; fiziksel mobil CRM, Windows açılışı ve güncel ERP sözleşmesi açıktır. [docs/BASELINE.md](docs/BASELINE.md) ve [docs/REV3_VALIDATION.md](docs/REV3_VALIDATION.md) eski kapsam kanıtı olarak korunur.

KALAN KRİTİK MADDE SAYISI: **6 — 3 geliştirme eksiği, 3 kullanıcı kabulü.**

KULLANICININ ŞİMDİ GÖZÜYLE DENEYECEĞİ İLK ŞEY: **Personel hesabıyla kendi atanmış konuşmasını açmak; patron ekranındaki atamanın doğru personele göründüğünü kontrol etmek.**

SONRAKİ TEK GELİŞTİRME İŞİ: **Güncel kanonik ERP'de izinli, yalnız taslak oluşturan/geri okuyan sipariş sözleşmesini tamamlayıp CRM adapterini bağlamak; DB korumasını gevşetmeden gerçek TEST kabulü yapmak.**
