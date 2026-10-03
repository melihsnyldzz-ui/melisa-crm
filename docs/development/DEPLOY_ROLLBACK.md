# CRM: TEST → LIVE ve geri dönüş standardı

Bu bir **gelecekte uygulanacak runbook**. Bu hazırlık işi servis kurmaz, başlatmaz, durdurmaz, restart/deploy yapmaz, gerçek DB veya ticari veriyle temas etmez. Kaynak checkout'u deployment değildir.

## Paket ve ortam kaydı

| Alan | Her deploy öncesinde doldur |
| --- | --- |
| Ortam | TEST / LIVE; isim tek başına kanıt değil |
| Kaynak | Repo, tam commit, PR, varsa kabul edilmiş tag |
| Paket | Repo dışındaki releases konumu ve paket SHA-256 |
| Runtime | Repo dışındaki runtime/config konumu; port → PID/servis → owner → checkout/paket |
| Veri/provider | API → DB/runtime/provider kimliği; secret değerlerini kaydetme |
| Önceki sürüm | Tam commit, paket/hash, config referansı, geri dönüş sorumlusu |
| Kabul/onay | Kişi, tarih, kapsam, tam commit; LIVE için açık deployment talimatı |
| Sonuç | Teknik PASS ve gerçek kabul ayrı; log/kanıt referansı |

`releases`, `runtime`, `logs`, `backups` repo dışında kalır. Dosya/credential içeriği Git'e veya CI artifact'lerine taşınmaz. Mevcut paketler otomatik taşınmaz.

## TEST sırası

1. Başlangıçta repo, origin, branch, dirty durumunu doğrula. Kabul edilmiş çalışan tabanın üzerine yalnız bu değişikliği koy.
2. CI'deki build/test/secret kontrolleri başarılı olsun. Sentetik test sonucunu SQL/telefon kabulü diye sunma.
3. Port → süreç/sahip → paket/checkout → API → DB/provider kimliğini doğrula. Ayrı sentetik TEST ve gerçek dış etkilerin kapalı olduğu kanıtlanmadan test yazımı veya restart yapma.
4. Görevin açık TEST kapsamı içinde repo dışında değişmez, commit/hash kayıtlı paket hazırla. Aynı paketi test et; testten sonra kaynak değişirse yeniden paketle ve etkilenen kontrolü yenile.
5. Normal arayüzde ilgili akışı, yetki/olumsuz senaryoyu ve gereken cihaz/restart kabulünü kaydet. Gerçek kişiye gönderim veya ticari kayıt ayrıca o işin açık yetkisine tabidir.
6. STATUS'a teknik sonucu ve kullanıcı kabulünü ayrı yaz. Eksikler PARTIAL / BEKLİYOR kalır.

## Kabul → main → LIVE sırası

1. Kullanıcı PR'nin tam commit/kapsamını kabul eder. Ajan açık merge talimatıyla PR'yi main'e alır; otomatik merge yoktur.
2. Main'deki yeni tam commit için CI yeşil olmalı. Kabul edilen kod ile birleşen kaynak farkı incelenir; kod farkı varsa etkilenen TEST/kabul yenilenir.
3. Kullanıcının açık release talimatı varsa [sürümleme](RELEASES.md) uygulanır.
4. LIVE hedef kimliği, önceki çalışan paket, config uyumluluğu, sorumlu ve bakım penceresi kayıtlı olmalı. Deployment, migration, backup/restore ve dış etkilerin her biri yetkili kapsamına göre değerlendirilir.
5. Açık LIVE onayı sonrası sadece belirtilen servis/paket değiştirilir. TEST'teki kabul edilen paket korunur; merge sonrası yalnız doküman değiştiyse kaynak eşdeğerliği kayıtlanır. Aynı kodu yeniden üretmek gerekirse yeni paket hash'iyle TEST kontrolü yapılır.
6. Yetkili kapsamda health, auth, değişen normal akış ve otomatik açılış gözlemi alınır. Logon/uyku/güç/reboot sınırları yazılır. STATUS'ta gerçek LIVE commit/paket kaydı tutulur.

## Geri dönüş

- Tetik: açılmama, yetki/veri izolasyonu hatası, kritik akış regresyonu veya deployment kabulünün karşılanmaması. Operatör yeni işlemleri sınırlar ve durumu kayıtlar.
- Önceki çalışan **paket + config referansı** doğrulanır. Belirtilen servis bakım penceresinde önceki pakete alınır; eski kaynak ağacı reset edilmez.
- DB şeması geriye uyumlu değilse kod rollback'i otomatik güvenli değildir: dur, veri korunarak ayrı migration/geri dönüş planı ve onay al. Ticari kayıt silme, reset veya otomatik DB restore yoktur.
- Geri dönen sürümün açılması, yetkileri ve ilgili normal akışı kontrol edilir. Bekleyen kuyruk/dış gönderim çift işlenmeyecek şekilde değerlendirilir.
- Tarih, hedef, önceki/sonraki tam commit ve hash, uygulayan/onaylayan, sonuç ve veri etkisi STATUS'a yazılır. Paket/hash dosyası tek başına **rollback denendi** kanıtı değildir.
- Gerçek rollback tatbikatı yalnız yetkili bakım kapsamındadır. Bu görevde rollback denenmedi; mevcut runtime/DB sağlığı **Durum doğrulanmadı**.

## CRM özel sınırları

Gateway, frontend ve ayrı ERP adapterlerinin commit/sözleşme kimliğini birlikte doğrula. CRM provider gönderim kapıları korunur. REV3 installer owner/path/SID/manifest korumaları atlanmaz; eski installer bu checkout'tan çalıştırılmaz. Telefon/PDF/mobil/otomatik açılış kabulündeki açık maddeler STATUS'tan okunur.

Geçmiş kanıtlar ve projeye özel korumalar: [Ana bitiş planı](../../CRM_FINISH_PLAN.md), [baseline](../BASELINE.md), [mevcut deploy sınırı](../../deploy/README.md) ve [completion TEST kaydı](https://github.com/melihsnyldzz-ui/melisa-crm/blob/0930f586f3f31d2ecd1f8ff6e4cbfdd5f7d8e21e/deploy/README.completion-test.md). Güncel hedef kimliği işlem öncesinde ayrıca doğrulanır.
