# MELISA CRM — Güncel Durum

Güncelleme: **4 Ekim 2026 — ERP taslak kabulü korunur; başka kişiden gelen yazışma eksikliği bildirildi**. İş sırası: [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md).

Çalışan CRM baseline korunmuştur. Bu tur yalnız 7733 test hattıyla gerçek yazışma yapıldı; explorer, frontend/backend ve bağımsız reviewer kullanıldı. HTTP 200, build ve unit test tek başına yeşil gerekçe değildir. LIVE deployment yapılmadı, başka müşteriye mesaj gönderilmedi.

## Kaynak ve TEST kimliği

- Kanonik repo C:\Sirket\CRM\melisa-crm; fetch/push origin https://github.com/melihsnyldzz-ui/melisa-crm.git; aktif branch codex/crm-agents-on-completion-20261003. Başlangıç HEAD 164cb53; önceki status inceleme değişikliği güncellendi. Uygulama baseline commit'i fd297df9922c4157aa5e8944bf0c091d618906c3.
- Normal çalışan CRM yönetim merkezi Sites uygulamasından bulundu. MelisaWhatsAppCrmGateway / 4200 / Auto / LocalSystem runtime'ı korundu; kaynak checkout deployment sayılmadı.
- Kanonik TEST normal UI: **http://127.0.0.1:62400/**; gateway 62401, katalog 62402, güncel ERP taslak adapteri 62403. Ayrı native taslak API'si 62404; DB **MELISA_ERP_SIRKET_TEST_20260929_01**. Loopback sınırı ve yalnız 7733 gönderimi açık. WAAPI instance 105185, Chatwoot account 2 / inbox 1 / test conversation 55. Otomatik yanıt kapalı; gelen okuyucu yalnız bu hattı yaklaşık 45 saniyede bir okur. LIVE webhook değiştirilmedi.
- Supervisor kanonik checkout'tan çalışıyor. Kimlik C:\Sirket\CRM\runtime\test-completion\processes.json; loglar C:\Sirket\CRM\logs\test-completion; journal ayrık TEST runtime altında. Özel ayarlar process belleğinde okundu, secret repo/rapora kopyalanmadı.
- Katalog gerçek Vega ürünleri ve MELISA_ERP_V2 aktif-primary fotoğraf metadata'sını salt okunur kullanır. Mevcut fotoğraf dosyaları değiştirilmedi. Güncel kanonik ERP release kaynakları kullanıldı.

## Bu tur gerçek sonuçlar ve düzeltmeler

**Yeni günlük kullanım eksiği — başka kişiden gelen mesaj:** Kullanıcı WhatsApp uygulamasında yazan başka kişinin burada görünmediğini bildirdi; bu kişi 7733 test hattı değildir. Açık ekran 62400 TEST ve aramada 7733 vardı. TEST okuyucusu yalnız bu telefonun mesajlarını konuşma55'e aktarır. Daha önemlisi, kanonik `normalizeWaapiEvent` başka peer'leri `isWaapiTrialPeer` ile ignored yapar ve phone'u tek test alıcısına bağlar. Çalışan MelisaWhatsAppCrmGateway servisinin kayıtlı AppDirectory'sindeki mevcut kaynak da aynı filtreyi ve sabit 7733 alıcısını taşır (salt okunur inceleme). Bu nedenle 7733 kabulü genel müşteri gelen mesajları için yeşil sayılmaz. LIVE sağlık providerConnected/bridgeReady/sendReady=true olsa da genel mesaj alımını kanıtlamaz. Bu tur LIVE/source arşivi/provider ayarı değiştirilmedi; başka müşteriye mesaj gönderilmedi veya yeni konuşma aktarılmadı. Samsung Tailscale bağlantısı bulundu; WhatsApp'taki ilgili yazışmayı karşılaştırma henüz sürüyor. Genel inbound/exact-peer/konuşma eşleme eksikliği kapanmadan günlük mesaj akışı PASS değildir.

**Metin:** Kullanıcı yanıtının gelmediğini bildirdi. Kapalı kanonik TEST alıcısı çalıştırıldı; Merhaba test, Kkk, Haloo normal ekranda göründü. Haloo otomatik Merhaba çevrildi. Bu TEST okuyucu davranışı tüm LIVE alıcılara genellenmez.

**Fotoğraf, 00:45–00:46:** Normal ek menüsünden PNG gönderildi; kullanıcı “Fotoğraf açıldı” dedi ve fotoğrafı geri gönderdi. Gelen fotoğraf normal CRM görüntüleyicisinde açıldı; 1280×720 gerçek decode görüldü.

**PDF/TXT, 00:50–00:58:** Normal menüden dosyalar gönderildi. Kullanıcı “Pdf açıldı” / “Txt açıldı” dedi, iki dosyayı geri gönderdi. CRM dosya bağlantılarından indirilen PDF render edildi; TXT okundu. İkisinin SHA256'sı gönderilen dosyayla eşleşti.

**Katalog/ürün/fiyat, 00:58–01:02:** 1085 fotoğraf referanslı gerçek ürün, ilk sayfada 12/12 açılan fotoğraf. Seçilen 41140 SÜPERMİNİ / BÜYÜK ÇİÇEKLER 2 Lİ TAKIM: **TRY 196/adet**. Fiyat normal sohbet taslağından gönderildi; kullanıcı “Fiyat geldi” dedi. Bir ürünlü fiyatlı PDF indirildi ve bağımsız render edildi: doğru fotoğraf, kod/ad ve ₺196,00/adet okunuyor. Aynı PDF sohbet eki olarak gönderildi; kullanıcı “Katolog açıldı” dedi. Kayıtlı satış fiyatıdır; stok/teslim taahhüdü değildir.

**Atama:** Yalnız test konuşması Ahmet'e atandı; listede Ahmet görüldü. Semih'e geri alındı; listede Semih görüldü. Atanmamış filtresinde atanan 7733 görünmüyor. Personelin kendi hesabında görme kabulü henüz yok.

**Düzeltilen gerçek TEST sorunları:** Inbox'ın 20 saniyede kesilen devam sayfaları için yalnız inbox okuma bütçesi 45 saniyeye çıkarıldı; iptal ve diğer isteklerin 20 saniye sınırı korundu. Yeniden denemede 498 konuşma ve 391 atanmamış sayımı oluştu. Katalog auth origin'i açık TEST 62401'e bağlandı. Kapalı eski fotoğraf servisi yerine mevcut dosyalar korumalı/salt okunur okundu. Açık 62402 TEST fotoğraf isteğinde doğrulanmış CRM oturumu iletiliyor; auth DTO'sunda bulunmayan active alanını bekleyen 403 giderildi. Yol, DB kimliği, rol/yetki, son oturum ve gerçek format kontrolü korunuyor. TEST journal/log/state checkout dışına alındı; baseline'ın LIVE journal yolunu devralması engellendi.

**Restart:** TEST UI/gateway ve katalog child'ları ayrı ayrı durduruldu; supervisor yeni PID'lerle kendiliğinden açtı. Aynı konuşma, atama, dosyalar, katalog ve kullanıcı yanıtı geri görüldü. Windows reboot/logoff autostart kabulü değildir.

**ERP — ilk inceleme:** Güncel native ERP eski adapterin MELISA_ERP_FULL_TEST_20260916 write havuzunu **SQL_WRITE_TARGET_INVALID** ile reddetti. Bu gerçek eksik, aşağıdaki ayrı TEST sözleşmesiyle ele alındı; eski hedefin koruması gevşetilmedi.

**ERP — 02:14 hazırlığı:** CRM kaynak değişikliği `8af2134`, ERP `4fb9eab`; [CRM PR #3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) ve [ERP PR #21](https://github.com/melihsnyldzz-ui/melisa-erp-v2/pull/21). Ayrı `CRM-ORDER-DRAFT-TEST-20261004-02` paketi 62404'te doğrulandı; günlük ERP 4144/4146/5194 süreçleri değiştirilmedi. Yalnız mevcut TEST müşteri **593 / TEST-V70-20260929-C** ve doğrulanmış ürün **vega-161466 → native 301982 / 41140 SÜPERMİNİ / TRY 196** kapsamı kuruldu. Başlangıç: bu müşteri için 0 sipariş, ürün stok 96, müşteri bakiye 0. Ticari kart değiştirilmedi; yalnız yeni sözleşme tabloları/prosedürleri ve bu tek ürünün kapsam kaydı kuruldu. Diğer katalog ürünleri henüz sipariş kapsamında değildir; yeni eşleme isim benzerliğiyle yapılmaz.

**ERP — gerçek kabul, 02:20–02:24:** Kullanıcı mevcut ERP hesabıyla normal formdan giriş yaptı. İlk create hatasında transaction geri alındı, sipariş oluşmadı: mevcut TEST audit guard yeni sales_order audit türünü kapsamıyordu. ERP `a3fa8fc` / `test-crm-order-audit-20261004.sql`, diğer kuralları ve trigger gövdesini koruyarak yalnız doğru TEST DB + mevcut draft/request/UUID/hash/aktör/müşteri/konuşma ve gerçek JSON false etkileriyle eşleşen INSERT'i ekledi. Trigger kapatılmadı; yanlış hash ve karma audit INSERT gerçek rollback denemelerinde engellendi. Bağımsız kaynak incelemesinde açık P1/P2 kalmadı.

Aynı korunan UUID `9b4bff31-0fd2-4137-866d-5854aff0a407` normal CRM'den yeniden denendi: native **id4 / CRM-9B4BFF310FD24137866D5854AF**, müşteri593, ürün301982, **2 × 196 = 392 TRY**, durum draft. POST sonrası ayrı GET sonucu ekranda gösterdi. Kullanıcı **“Evet, doğru görünüyor; kabul ediyorum”** dedi. Gerçek scoped SQL writer ile aynı UUID create/read tekrarında yeni sipariş/audit oluşmadı. Stok **96**, bakiye **0** kaldı; test başlangıcından sonra bu ürün/müşteriye ait stok/cari hareket **0/0**. Daha sonra farklı UUID ile 1 adet / 196 TRY ikinci TEST taslağı da gözlendi (native id5); ilk UUID tekrarı bu ikinci bağımsız kayıtla karıştırılmadı. Hiçbiri satışa dönüştürülmedi. Kanıt: logs/acceptance-20261004/erp-draft-392-real-receipt.png ve ERP logs/crm-order-draft-20261004/real-draft-verification.txt; özel kanıtlar Git'e eklenmedi.

Yeni akış ayrı CRM ve ERP yetkilerini doğrular; SQL yazımı yalnız draft prosedüründedir. Kapanma/yenileme veya yanıt kaybında aynı kimlik önce geri okunur; belirsiz sonuç yeni sipariş başlatmaz. Parola/token kalıcı tarayıcı kaydına yazılmaz. İncelemede ağ erişimi, TRY kuru, form yeniden açma ve DB kimlik DTO bulguları giderildi; son reviewer açık P1/P2 bulmadı. ERP 13/13, CRM 13/13 hedefli offline kontrol ve TEST build geçti. ERP kod HEAD'i için quality-build-test/secret-scan GitHub kontrolleri başarılı; belge HEAD'inin güncel sonucu PR Checks'te izlenir. Bu teknik sonuçlar gerçek kullanıcı kabulü değildir.

**Teknik kontroller:** TEST frontend build başarılı. Değişen inbox/oturum, runtime izolasyonu, fotoğraf yetkisi/yol ve forwarding kontrolleri 27/27 geçti; son gerçek auth DTO düzeltmesinin 6 fotoğraf kontrolü ayrıca geçti. Bağımsız review journal bulgusu düzeltildi; açık P1/P2 regresyon kalmadı. Bunlar telefon kabulü yerine sayılmadı.

Yerel görsel kanıtlar C:\Sirket\CRM\logs\acceptance-20261004 altında: gelen metin/fotoğraf/PDF, mobil görünüm, katalog önizleme, indirilen PDF render ve telefon kabul ekranı. Dosyalar/müşteri verisi Git'e eklenmez. [İndirilen gerçek fiyatlı PDF](C:/Users/Xaser/Downloads/melisa-katalog-tr-TRY.pdf).

## CRM BİTİRME LİSTESİ

Tek güncel liste. Kritik sayım 13 başlıktaki açık sarı/kırmızı satırların toplamıdır; aynı kabul/restart ikinci kez sayılmaz.

| Madde | Sınıflandırma | Gerçek sonuç ve kalan somut iş |
| --- | --- | --- |
| Gelen/giden metin | 🔴 EKSİK / BOZUK — gerçekten geliştirme gerekiyor | 7733 gerçek gönderim/yanıt kabulü korunur. Başka kişiden yeni WhatsApp yazışması bildirilmiş; mevcut incoming normalizer yalnız test peer'ini kabul ediyor. Genel müşteri gelen mesajı ve doğru konuşmaya eşleme yolu eksik; ilgili Samsung yazışmasının karşılaştırması sürüyor. |
| Fotoğraf | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Telefon açma yanıtı ve gelen fotoğrafı CRM'de büyütüp açma kabulü tamamlandı. |
| PDF/dosya | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | PDF/TXT iki yönde açıldı/indirildi; içerikler eşleşiyor. Fiyatlı PDF de render edildi ve telefonda açıldı. Mevcut kapsam PDF/TXT. |
| Ses/video | 🔴 EKSİK / BOZUK — gerçekten geliştirme gerekiyor | Giden ses/video seçme/validasyon/provider yolu MIME kapsamında yok. Gelen oynatıcı hazır; gerçek oynatma kabulü yok. |
| Atanmamışlar ve konuşma atama | 🟡 KULLANICI KABULÜ BEKLİYOR — kod hazır ama benim gözümle doğrulamam gerekiyor | Filtre, gerçek atama ve geri alma görüldü. Kalan: atanmamış test konuşmasını personele atayıp aynı personelin hesabında görmek. |
| Patron/müdür/personel yetkileri | 🟡 KULLANICI KABULÜ BEKLİYOR — kod hazır ama benim gözümle doğrulamam gerekiyor | Patron oturumu kullanıldı; rol/konuşma sınırları hazır. Üç mevcut hesapla görünürlük/gönderim/atama kabulü yapılmadı. |
| Otomatik çeviri | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Haloo → Merhaba gerçek gelen mesajda otomatik göründü; önceki giden çeviri kabulü korunur. Tüm dillerin kalite kabulü iddia edilmez. |
| Katalog | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Normal UI'de gerçek ürünler ve 12/12 fotoğraf; seçme, fiyatlı PDF indirme/render ve telefon açma tamamlandı. |
| Ürün gönderme | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Doğru ürün görseli/bilgisi PDF ile gönderildi; kullanıcı katalog açma yanıtı verdi. |
| Fiyat gönderme | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | TRY 196/adet mesajı ve fiyatlı PDF ulaştı; fiyat geldi ve katalog açma yanıtları var. |
| ERP taslak sipariş | 🟢 ÇALIŞIYOR — gerçek kullanım kanıtı var | Normal CRM → mevcut ERP hesabı → müşteri593 / 41140 SÜPERMİNİ → 2 adet / 392 TRY draft → ayrı geri okuma ve kullanıcı kabulü. Aynı UUID tek kayıt/audit; stok96/bakiye0, yeni stok/cari hareket0. Kapsam yalnız bu doğrulanmış TEST müşteri/üründür; diğer ürünler henüz sipariş kapsamına alınmadı. |
| Mobil kullanım | 🟡 KULLANICI KABULÜ BEKLİYOR — kod hazır ama benim gözümle doğrulamam gerekiyor | 390×844 görünümde konuşma, medya ve giriş alanı kullanıldı; boyut geri alındı. Fiziksel telefonda tüm CRM akışları kabul edilmedi. WhatsApp dosya açma mobil CRM kabulü değildir. |
| Servis/restart sonrası otomatik çalışma | 🔴 EKSİK / BOZUK — gerçekten geliştirme gerekiyor | Child otomatik yeniden açılması gerçek görüldü. Windows açılışında supervisor/UI/gateway/adapter zinciri kurulumu ve reboot/logoff kabulü eksik. |
| Görüntülü görüşme pilotu, geniş ofis dosyaları, main/tag/release, LIVE deploy/rollback | ⚫ SONRA — günlük CRM kullanımı için şart değil | Baseline günlük kullanımını bozuk yapmaz. Planın nihai yayın/BİTTİ ölçütleri ayrıca geçerlidir. |

## Korunan tarihsel kanıt

3 Ekim 2026 “Melisa CRM’i devral ve tamamla” chat'i (01a10295-0ba4-7582-9fec-e611bdf31796), [deploy/README.completion-test.md](deploy/README.completion-test.md) ve fd297df: gerçek PNG/PDF/TXT kabul+kayıt, atama değiştirme/geri alma, çeviri ve ayar korunması, korumalı fotoğraf decode, 1085 ürün, native FULL_TEST ERP'de dört satır/dört adet **TRY 510,25** taslak ve geri okuma, child restart ve kayıt korunması. 444 otomatik kontrol teknik kanıttır; telefon/reboot kabulü değildir.

3 Ekim ilk incelemesinde TEST 62094/4212/62400–62403 kapalıydı; o anda açık diye sunulmadı. Sonraki açık kullanıcı yetkisiyle 4 Ekim bu kaynak TEST'i açıldı ve yukarıdaki gerçek kabul kaydedildi. Eski eksik PDF indirme/telefon kabulü kapandı; güncel ERP sözleşmesi de yukarıdaki dar TEST kapsamıyla kabul edildi. Fiziksel mobil CRM ve Windows açılışı hâlâ açıktır. [docs/BASELINE.md](docs/BASELINE.md) ve [docs/REV3_VALIDATION.md](docs/REV3_VALIDATION.md) eski kapsam kanıtı olarak korunur.

KALAN KRİTİK MADDE SAYISI: **6 — 3 geliştirme eksiği, 3 kullanıcı kabulü.**

KULLANICININ ŞİMDİ GÖZÜYLE DENEYECEĞİ İLK ŞEY: **Samsung WhatsApp'taki görünmeyen konuşmayı açıp CRM ile karşılaştırmak; kablosuz ADB eşleştirmesi hazırlanıyor.**

SONRAKİ TEK GELİŞTİRME İŞİ: **Genel gelen WhatsApp mesajlarını gerçek gönderen kimliğiyle doğru CRM konuşmasına alan yolu tamamlamak; 7733 gönderim sınırı ve LIVE deployment yasağı korunur.**
