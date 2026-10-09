# Müşteriye özel mobil katalog — TEST işletim notu

Mevcut CRM'nin normal mesaj alanındaki “Mobil katalog”, onaylı TEST konuşmasına `/katalog#<capability>` bağlantısı üretir. Müşteri parçası ilk açılışta adres çubuğundan silinir ve aynı sekmenin oturum alanında tutulur. API kimliği Authorization başlığındadır; query/path/log içinde token taşınmaz. Sunucu yalnız SHA256 özetini, kapsamı, sepeti ve yeniden deneme kimliğini runtime altında saklar. Link en çok bir gün geçerlidir, iptal edilebilir ve başka müşteri/konuşma/ürüne genişletilemez.

## Ticari hesap ve taslak

- Fiyat, para birimi, fiyat satırı ve ana birim mevcut ERP katalog sözleşmesinden doğrulanır. Native dört ondalık adet fiyatı esas alınır; seri toplamı adet fiyatı × açık seri parça sayısıdır.
- Seçim tam seri adedidir. Doğrulanmış seri dağılımı ve tam seri mevcudu olmadan ticari seri uydurulmaz. Kullanıcı onaylı TEST overlay yalnız `testSeriesOverlay:true` ve `isTestExample:true` ile geçer; UI her aşamada TEST örneğini gösterir. Kaynak parça mevcudu ayrıca üst sınırdır.
- Onayda fiyat/stok/müşteri/kaynak tekrar doğrulanır. Değişen fiyat yeni revizyon ve yeni onay gerektirir. Belirsiz sipariş sonucunda aynı UUID/içerik korunur; otomatik yeni sipariş üretilmez.
- POST kabulü başarı sayılmaz. Ayrı native GET aynı müşteri, konuşma, ürün/parça/fiyat/toplamı ve etkisiz TEST kaydını doğrular. Stok/cari/tahsilat/rezervasyon false olmalıdır.
- UI “TEST taslağı” gösterir. Sentetik fixture ayrı etiketlenir; fixture readback'i ERP kalıcılığı kanıtı değildir.

## Kapalı varsayılan ve özel profil

`CRM_CUSTOMER_CATALOG_PROFILE_PATH` yoksa API kapalıdır. Profil repo/paket dışında, runtime dizininin doğrudan içindeki normal dosya olabilir; Git'e, release paketine veya kanıta alınmaz. `version:1`, `enabled:true`, `approved:true`, `ISOLATED_TEST_COPY`, yalnız `MELISA_ERP_CRM_SHARED_TEST_20261009_01` ve konuşma55 gerekir.

Profil mevcut sözleşmelere göre CRM aktörü, ERP `sales.create` aktörü, owner peer, müşteri kimliği/eşleme revizyonu/gerekçesi, exact native source/package, sealed source metadata, izinli ürün/fiyat/ana birim/source key/TRY, seri dağılımı ve sınırları bağlar. Kesin telefon eşlemesi yoksa gerekçeli TEST müşteri seçimi gerçek eşleme diye sunulmaz. Tam token/parola/telefon ve özel JSON burada yayınlanmaz.

Mevcut patron/müdür oturumu ve `crm.manage` + `crm.send` gerekir. ERP token'ı mevcut catalog-access akışıyla RAM'de alınır; görevli JWT'si de yalnız RAM'dedir. Katalog okuması mevcut ilker profilinde kalır. Native taslak izole seller profilini ve güncel `sales.create` yetkisini ayrıca doğrular; iki token önbelleği ayrıdır, seller seçimi normal624 ortamında reddedilir. Semih doğrulamasında ilker16 salt okuma, seller15 taslak yetkisi verdi; rol değiştirilmedi. Yeniden başlatmada görevli tekrar doğrular. Başka aktöre otomatik yetki devri veya kalıcı rol/kimlik değişimi yoktur.

## Semih kurulum sırası

1. Exact commit için kilitli bağımlılık, offline test/build/syntax ve redacted secret scan sonuçlarını kaydet. Ayrı draft PR ve exact HEAD CI durumunu göster.
2. Mevcut626xx supervisor/paket/runtime/log/config yollarını ve native62604 source/package/DB/etkisizlik kimliğini salt okunur karşılaştır. Diğer işin runtime'ına ve624xx'e dokunma. `switch-test-package.ps1` 624xx varsayımıyla shared ortamda kullanılmaz.
3. Immutable shared TEST paketi mühürle. Tercih edilen dar kurulum `customer-catalog-test-edge.mjs`: yalnız Semih `100.87.188.3:62600` arayüzünde yeni frontend/API dinler; mevcut LAN/loopback626xx,624xx ve native süreçleri durdurmaz. Paket source/manifest/isolated pinleri, private profil ve kapalı mevcut gateway kimliği başlangıçtan önce doğrulanır. Eski gateway yetkisi HTTP üzerinden yeniden okunur; yeni signer veya baseline credential yükleyicisi yoktur. Reset/SQL/backup çalıştırma.
4. Özel profili güncel yetkili katalog/customer/native okumalarından üret. Seri overlay etiketini gerçek TEST ürün/fiyat/kimlikten ayrı tut. Sentetik fiyat izni gerçek source fiyatını değiştirmez.
5. `CRM_TEST_TAILSCALE_ADDRESS` ve virgülle ayrılmış `CRM_TEST_TAILSCALE_PEERS` yalnız explicit shared TEST başlangıcında tanımlanabilir. Exact mevcut arayüz ve owner cihazlarının tekil IP'leri gerekir. Edge aynı hostun doğrulanmış Tailscale arayüzünden yetkili operatör okumasına izin verir; remote admin/personnel bootstrap kendi IP'sinden de kapalıdır. Link üretimi yalnız explicit `issueOwnerLink()` çağrısıdır; link RAM'de döner, stdout/dosyaya yazılmaz. Baseline dotenv kapı açamaz. Wildcard/CIDR/forwarded-header güveni yoktur. Kod firewall/Tailscale ACL değiştirmez; gerçek cihazdan erişim ayrıca sınanır.
6. Normal CRM'de link üret;390×844 katalog/filtre/sepet/yenileme/özet akışını render ederek doğrula. Telefona erişilebilen doğru link hazır olduğunda kullanıcı tarafından açıkça yetkilendirilmiş owner7733 gönderimini mevcut CRM sözleşmesinden yap. Provider kabulü, ayrı CRM GET, telefon açma ve AI yanıtı ayrı kanıtlardır.

Ortak hazırlık runtime'ında gönderim/gelen okuma/ücretli AI/satış AI kapalı kalır. Bu değişiklik onları açmaz veya yeni provider/model hattı kurmaz. Gerçek WhatsApp/AI pilotu mevcut onaylı yol ve owner kapsamıyla çalıştırılmadan tamamlandı denmez.

## Kanıt ve açık kabul

Repo dışındaki sentetik fixture dış HTTP/provider/SQL erişimi yapmaz. A6 ve B4 testinde2A+1B=16parça/1.680TL beklenir. Capability kapsamı/iptali, fiyat değişimi, idempotency ve ayrı readback ayrıca sınanır.

Semih native62604 TEST etkisiz kimliği, geçici loopback TEST aktörü ve konuşma55'in owner7733 bağı doğrulandı; özel token/parola çıktılanmadı. Son geniş offline koşu1.063/1.063 geçti; son bilinen-ret kilit düzeltmesi core+adapter28/28, hesap ayrımı/shared/runtime11/11 hedefli kontrolle ayrıca geçti. Build/syntax ve redacted staged/history secret scan geçti. Bunlar gerçek kurulum/telefon kabulü değildir.

Yeni kurulum, gerçek taslak, telefona mesaj ve AI sohbeti henüz kanıtlı değildir. Fixture browser render'i client engeli nedeniyle blocked; [design-qa.md](../design-qa.md) gerçek kabul yerine geçmez. Kullanıcı telefon denemesini kendisi yapıp sonucu bildirecektir; telefonun Tailscale online durumu gönderim önkoşulu yapılmaz, linkin Tailscale gereksinimi mesajda yazılır. Önceki insan kabulleri ve finish tree sayımı değişmedi.
