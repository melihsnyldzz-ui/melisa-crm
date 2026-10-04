# MELISA CRM — Ana Bitiş Planı

Bu dosya, `melihsnyldzz-ui/melisa-crm` reposunda CRM’in kapsamı, çalışma sırası ve “BİTTİ” kararı için **source of truth (tek ana referans)** kaynağıdır. README buraya yönlendirir; CRM_STATUS.md durum ve kanıt kaydıdır. Bu planın varlığı özelliklerin tamamlandığı anlamına gelmez.

## Kanonik geliştirme girişi — 3 Ekim 2026

SEMIH repo kökü `C:\Sirket\CRM\melisa-crm`. Uygulama tabanı `feature/crm-completion` / `fd297df9922c4157aa5e8944bf0c091d618906c3`; ajan ve yerel düzen çalışma dalı `codex/crm-agents-on-completion-20261003`, PR #3. Main otomatik merge edilmez. Eski kaynak ve çalışan runtime’lar korunur.

## Çalışma kuralı

Mevcut çalışan CRM baseline kabul edilir. Çalışan özellikler yeniden ispatlanmaz; yalnızca gerçekten eksik özellikler aşağıdaki sırayla tamamlanır. Mevcut çalışan akış korunur; yeni mimari veya ek onay zinciri üretmek bitiş işi değildir.

**4 Ekim 2026 kullanıcı düzeltmesi:** 7733 dışındaki bir kişinin WhatsApp yazışması CRM'de görünmüyor. Tek test peer'ine bağlı incoming normalizer salt okunur kaynak incelemesinde doğrulandı. Önce bu günlük kullanım eksiği ve ilgili konuşma karşılaştırması ele alınır; 7733 metin/medya ve ERP taslak kabulleri yeniden açılmaz. Genel müşteri alımı kodu hazır olmadan tüm metin akışı PASS denmez. LIVE deployment ve başka müşteriye gönderim yetkisi verilmiş değildir.

Her adım: **eksiği bul → düzelt → TEST’e kur → gerekli otomatik kontrolü yap → gerçek kullanım kabulüyle PASS yap → sıradakine geç.** Değişiklikten etkilenen akış veya somut bir regresyon şüphesi için hedefli kontrol yapılabilir; bu, tüm baseline’ı yeniden kanıtlama döngüsüne dönüşmez.

**4 Ekim 2026 kaynak düzeltmesi:** Genel gelen kimlik/kişi/konuşma eşlemesi tamamlandı; belirsiz LID, eksik kişi araması, farklı kişiyle karışma, kapalı görüşme ve tekrar aktarım durumları korundu. 0817 sağlayıcı kaydı yeni kodla doğru telefona salt okunur çözüldü; başka müşteri aktarımı yapılmadı. Yeni 7733 gerçek yanıtı “Kimlik testi 0320” normal CRM'de doğru konuşmaya bir kez geldi ve TEST restart sonrası korundu. Gelen TEST kapsamı da yalnız 7733; LIVE webhook/deployment aynı kaldı. Genel müşterinin gerçek CRM alımı bu yüzden kullanıcı kabulü bekler, tüm metin maddesi yeşil değildir. Eski 500 ham kayıt sınırı ve hareketli sayfa sırasının konuşma gizlemesi aynı inbox düzeltmesinde ele alındı; gerçek ekranın güncel sonucu ve kalan tek liste `CRM_STATUS.md` içindedir. Bu kod kabul hazırlığı tamamlandığında sonraki tek geliştirme işi giden ses/video yoludur; personel/rol/mobil kabulleri ayrı açık adımlardır.

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
