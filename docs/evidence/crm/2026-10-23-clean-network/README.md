# CRM06 / M01 — temiz TEST LAN/Tailscale kaynak ve kurulum eşlemesi

23 Ekim 2026, Europe/Istanbul. ERP sahibinin kurduğu CRM **bc8c307** / ERP **035fcc08** sürümlerinin kaynak, sunulan dosya, sağlık ve süreç metadata eşlemesi salt okunur tamamlandı. Normal LAN/Tailscale ekranları ERP sahibinin teknik tarayıcı kanıtıdır; ayrı fiziksel cihaz ve insan kabulü **BEKLİYOR**. Kurulum, özel config, SQL, servis, restart ve firewall tek sahibi ERP'dir. CRM bu eşlemede uygulama veya runtime değiştirmedi.

## Kurulu sonuç ve kanıt sınırı

- [Sanitize edilmiş eşleme](network-ro-mapping.json): `network-install-20261022T230726Z/result.json` SHA256 **522d3ff4d22d70864e2729f4963f9b7c63ee974f24a4189d38bad8cc8c015220**, faz `INSTALLED_READBACK_OK`; son `network-gui-proof.json` SHA256 **6b32f09bacea99ae0489a45cb504d4101f464559172efdd0bccb34cfa4c9e941**. İlk makbuzun `gui:PENDING` alanı son GUI makbuzundan önceki andır. Özel ham JSON, launcher veya credential yayımlanmadı.
- Kurulu clean clone HEAD'leri CRM **bc8c307ee29f115b2bb7fd4e61f87e9bf482ba54**, ERP **035fcc08d8f56cdd0cbc437a290285328fce1ec9**; tracked diff0. CRM için ayrı packageId/immutable manifest bu makbuzda **yok**. ERP paket kimliği **CLEAN-ERP-20261022-035fcc08d8f5**. CRM'nin source/kurulu server ve sunulan frontend özeti ayrı kanıttır; ERP paket adı CRM paketi yerine geçirilmez.
- Kurulu CRM server fiziksel SHA256 **12ea8954d92356e7d3065dde32f961e9c6d9a16eae8f932bd291123a826c44e8**; CRLF→LF normalizasyonuyla exact bc8 Git blob SHA256 **d1a741ab2bf224bc76c6637cfc44dd020db82a5374720f3e0eb20b93c33acc49** byte eşliği doğrulandı. Aşağıdaki workspace review hash'i ayrı satır sonu temsilidir.
- UI `127.0.0.1`, LAN `192.168.1.46` ve Tailscale `100.87.188.3` üzerindeki62800 için index/JS/CSS, kurulu disk dosyalarıyla **3 dosya × 3 origin SHA256 eş**. Üç origin'de credentialsiz `/api/live/auth/me` **401 / WHATSAPP_CRM_AUTH_TOKEN_REQUIRED**. Bunlar sunucu üzerindeki salt okunur HTTP kontrolleridir; fiziksel uzak cihaz kabulü değildir.
- Fresh4194/4196 `/test-health`: source035, paket, aynı `MELISA_ERP_CLEAN_TEST_20261022` / ortam `e662fd94-d797-4b3b-938a-d143ad758b67`, synthetictrue/actualT1false, original/live DB erişimi0.4194 yalnız clean inbound+sales yetkili yazı/stok/cari etkisi taşır;4196 yalnız taslak, stock/ledger effectfalse. **Tüm yazılar kapalı denmedi**; gerçek ticari/LIVE erişim kapalıdır.
- Bağımsız OS metadata incelemesi: clean **7 port /11 listener /6 PID**, iç portlar loopback. Korunan **21 listener** adres/port/PID/executable ve ortak CIM mikrosaniye hassasiyetindeki doğum zamanı aynı; azami0,8µs temsil farkı restart sayılmadı. Relative CLI tam kaynak kökü/hash'i tek başına kanıtlamaz; süreç→kaynak atfında owner launch makbuzu, disk ve sunulan dosya hash'leri birlikte kullanıldı.
- Owner before/after veri envanterleri **5295 bayt**, iki SHA256 **39a1fe1c15739637afb55943a94609e95b2c64cfeb0e1b9d7b6e7ce41a576fa8** ile aynı. Son GUI makbuzu53/53 kapsamın korunduğunu, restore0/yeni ticari yazı0 ve mevcut firewall kurallarının değişmediğini bildirir. CRM yeni SQL veya bağımsız firewall karşılaştırması yapmadı; bunlar owner kanıtıdır.
- ERP source035 exact [PR CI39868737448](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39868737448) ve [push CI39868730251](https://github.com/melihsnyldzz-ui/melisa-erp-v2/actions/runs/39868730251) bağımsız GitHub okumasında **6/6 completed/success**. CRM sourcebc8 CI7/7 aşağıdadır. İzleyen yalnız-belge HEAD'i yeni kurulu source/CI değildir; uygulama testleri veya CI tekrar çalıştırılmadı.
- Makbuzdaki oldSource **759bbc62** son önceki kurulu kaynak/health ve clone HEAD'idir; eski791 kaydı daha önceki tarihsel2.5 teslimiydi. Bu geçiş ERP sahibinin açıklaması ve mevcut Git metadata'sıyla ayrıldı; eski kayıt silinmedi.

## Normal ekran kanıtı

ERP sahibi her iki LAN/TS origin'de normal `ornek-personel` ile atanmış **Örnek Mağaza → katalog/0007 fotoğraf/125,50 TRY** ve oturumun yenileme sonrası korunmasını bildirdi. Mevcut taslak/satış yalnız okundu; yeni prova siparişi veya mesaj gönderilmedi. [CRM katalog](network-crm-lan.jpg), [ERP ürün/stok](network-erp-lan.jpg), [mevcut CRM siparişi](network-erp-order-lan.jpg).

Görülen CRM katalog pikselinde müşteri ve ürün fotoğrafı vardır, fiyat ekranın altındadır; **125,50 TRY CRM için owner GUI makbuzudur**, bu ekranın tek başına fiyat kanıtı değildir. ERP ürün ekranında23ADET/125,50TRY; sipariş ekranında aynı üç taslak ve3×125,50=376,50TRY görülür. Taslak listesi bağlı satışın FINALIZED durumunun ekran kanıtı diye sunulmadı; o sonuç owner readback kaydındadır.

[CRM Tailscale](network-crm-tailscale.jpg) ve [ERP Tailscale](network-erp-tailscale.jpg) görüntüleri LAN karşılıklarıyla **byte olarak aynı**. Screenshot adres çubuğu içermez; origin atfı owner GUI kaydı ve ayrı HTTP eşlemesine dayanır. Bu dosyalar iki bağımsız fiziksel cihaz/ayrı görsel sonuç sayılmaz. Üç farklı piksel içeriği CRM tarafından incelendi; asıllar değiştirilmeden kopyalandı. Fiziksel telefon/TC21, gerçek çalışan kabulü ve Windows reboot/logon **BEKLİYOR**.

## Kaynak kapsamı

Önceki kurulu CRM uygulama kaynağı `c8d0e28f0ea6cf16133c87dd548a4281381abfb7` ile karşılaştırıldığında `apps/`, `packages/`, `deploy/` kapsamındaki tek fark `deploy/test-server.mjs` olur. Frontend ve paket kaynakları değişmedi; owner mevcut c8 frontend build'ini korudu ve sunulan dosya eşliği yukarıda doğrulandı. Exact-commit/manifest/bütünlük kuralları korunur; dirty checkout dağıtım kaynağı değildir.

Mevcut UI sunucusu üç ayrı, açık IPv4 adrese bağlanır: `127.0.0.1:62800`, `192.168.1.46:62800`, `100.87.188.3:62800`. Wildcard bind yoktur. LAN arayüzü tam adres ve `255.255.255.0`, Tailscale arayüzü tam adres ve `255.255.255.255` ile işletim sistemi arayüz listesinde bulunmalıdır. Yapılandırılmayan uzak dinleyici açılmaz; eski loopback-only clean kullanım geçerlidir.

LAN istemcileri yalnız aynı `/24` içindedir; ağ/yayın adresleri reddedilir. Tailscale istemcileri yalnız sahibi tarafından verilen exact IPv4 listesinde olabilir. `100.64.0.0/10` aralığının tamamı izinli değildir. Local socket, remote socket, Host ve Origin birlikte doğrulanır; farklı port, arayüzler arası Host/Origin, forwarded kimliği ve yabancı site reddedilir. Uzak yazma isteklerinde exact Origin zorunludur.

Gateway `127.0.0.1:62801`, katalog `127.0.0.1:62802`, orders `127.0.0.1:62803`, ERP API `127.0.0.1:4194` ve native `127.0.0.1:4196` sunucu içi kalır. Tarayıcının normal giriş, katalog/fotoğraf ve sipariş istekleri mevcut göreli `/api/live` yolunu kullanır. UI proxy'si Bearer, Origin ve ERP kimlik başlıklarını korur; giriş/yetki/revoke denetimi iç servislerde sürer. Clean TEST ADMIN ve personel bootstrap kapalıdır; normal hesapla her origin'de giriş gerekir. Provider, gerçek müşteri mesajı ve ücretli AI kapalı kalır.

## ERP sahibine kurulum sözleşmesi

Aşağıdaki değerler özel owner ortamına başlangıçta verilmelidir; baseline dotenv bunları devralamaz veya genişletemez. Bu belge herhangi bir özel config dosyasını değiştirmez.

```dotenv
CRM_TEST_PROFILE=clean-synthetic-20261022
CRM_ISOLATED_PREPARATION=true
CRM_TEST_PORT_BASE=62800
CRM_TEST_ERP_ORIGIN=http://127.0.0.1:4194
CRM_TEST_EXPECTED_DATABASE=MELISA_ERP_CLEAN_TEST_20261022
CRM_TEST_LAN_ADDRESS=192.168.1.46
CRM_TEST_TAILSCALE_ADDRESS=100.87.188.3
```

`CRM_TEST_TAILSCALE_PEERS`: ERP sahibinin güncel olarak doğruladığı altı cihaz ve sunucu-self IPv4 adresinin virgülle ayrılmış exact listesi. Liste özel koordinasyon kanalında iletildi; burada gerçek cihaz envanteri yayımlanmaz. Her adres canonical noktalı IPv4 ve `100.64.0.0/10` içinde olmalıdır; CIDR, wildcard, boş öğe, yinelenen adres ve 64'ten fazla öğe reddedilir. Kenar boşlukları temizlenir. Adres etkinse boş peer listesi başlangıcı durdurur.

Mevcut `CRM_BASELINE_ENV`, owner runtime/log konumları ve normal auth/korumalı credential düzeni korunur. `CRM_TEST_NATIVE_SOURCE_COMMIT` ve `CRM_TEST_NATIVE_PACKAGE_ID`, ERP sahibinin gerçekten kurduğu native4196 health kimliğine eşlenir; bu CRM kaynak değişikliğinden ERP source/paket kimliği türetilmez.

Kurulu hedef adresler: [LAN CRM](http://192.168.1.46:62800/), [Tailscale CRM](http://100.87.188.3:62800/), [yerel CRM](http://127.0.0.1:62800/). Sunucu arayüzleri ve owner normal GUI kanıtı yukarıdadır. Gerçek uzak cihazda normal giriş → katalog/fotoğraf → aynı kaydı orders üzerinden yeniden okuma ve çıkış/revoke kabulü ayrı **BEKLİYOR**; teknik sonuç insan kabulü yerine geçmez.

## Teknik doğrulama

- Yeni beş ağ/proxy regresyonu önce `5 FAIL` üretti: clean LAN yasağı ve eksik çoklu arayüz çözümü doğrulandı. Düzeltme sonrası aynı `5 PASS`.
- Etkilenen ağ, clean profil, eski shared endpoint, bootstrap, normal auth ve katalog origin testleri birlikte **41 PASS / 0 FAIL**. Son boş-forwarded başlık düzeltmesinden sonra yeni beş test ayrıca yeniden PASS; bu tekrar yeni test sayısına eklenmedi.
- Testler yalnız `offline-test-guard.mjs`, sentetik istek/soket metadatası ve rastgele loopback portları kullandı. Sabit TEST portuna, gerçek peer'a, SQL'e veya provider'a bağlanılmadı. Proxy fixture'ındaki 200/401/403 gerçek oturum veya cihaz kabulü değildir.
- Mevcut source explorer, auth tester, release inspector ve bağımsız reviewer kullanıldı; yeni ajan/altyapı kurulmadı. Son dar bağımsız incelemede açık **P1/P2=0**.
- `node --check` ve `git diff --check` başarılı. Source/CI, kurulu runtime, normal ekran, fiziksel cihaz ve insan kabulü ayrı kalır.
- Push öncesi tam geçmiş taraması eski `28fcad9` kanıtındaki tek `fileSha256` değerini yanlış pozitif olarak işaretledi. İlgili dosyanın gerçek SHA256 özeti içerik açılmadan birebir eşlendi, bağımsız reviewer doğruladı. Yalnız o tarihsel commit/dosya/kural/satır fingerprint'i `.gitleaksignore` içine alındı; genel kural veya path istisnası eklenmedi. Eski kanıt dosyası değiştirilmedi.

Review sırasında çalışma dosyası SHA256: server `3cbc12f715ca4c8d43160a6a84418e5a57f8e481d72c370ec985634c6f7262c6`; test `5d65b137de7fd3ece081da40c1e7d46cc86b84bda23631088c49ec0266573d63`. **Paket/Git blob server SHA256: `d1a741ab2bf224bc76c6637cfc44dd020db82a5374720f3e0eb20b93c33acc49`.** Çalışma dosyasının CRLF/LF satır sonları normalize edilince Git blob ile byte eşliği doğrulandı; paket doğrulamasında gerçek Git blob/payload hash'i kullanılır. Kod farkı yoktur.

## GitHub teslim makbuzu

- Kurulum kaynak pini: **[bc8c307ee29f115b2bb7fd4e61f87e9bf482ba54](https://github.com/melihsnyldzz-ui/melisa-crm/commit/bc8c307ee29f115b2bb7fd4e61f87e9bf482ba54)**, `codex/crm-agents-on-completion-20261003`, [PR #3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) OPEN. Uygulama değişikliği `9e9b1ef`, izleyen bc8 yalnız bağımsız doğrulanmış tarihsel scan kaydı; bc8 uygulama kaynağını ve istisnayı birlikte taşır.
- Exact bc8 source CI: [PR39868432842](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39868432842), [push39868425461](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39868425461), [AI39868432917](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39868432917): üç workflow da **completed/success**, toplam **7/7 check completed/success**. Build/offline, Windows startup sözleşmeleri ve secret taraması teknik kanıttır; Windows logon veya uzak cihaz kabulü değildir.
- Gitleaks 8.30.1 staged ve tam reachable HEAD taraması başarılı. Genel rule/path istisnası yoktur.
- ERP sahibine exact bc8 kaynak pini, server Git blob SHA, frontend diff0 ve owner env sözleşmesi iletildi. Yeni runtime, private config, SQL, restart veya firewall bu CRM çalışmasında uygulanmadı. Sonraki belge makbuzu source/paket pinini değiştirmez ve yeni uygulama CI sonucu değildir.

Eski 25 CRM yaprağı /12 tamam /13 kısmi /0 açık ve17başlık/74yaprak değişmedi. Kurulum makbuzu ve kaynak/paket/runtime RO eşlemesi **tamamlandı**; gerçek personel/fiziksel telefon, CRM-UA04/UA11 ve reboot/logon kabulü **BEKLİYOR**. Hazır bağımsız teknik devirler aynı bitiş ağacında ilerler; bu belge yeni iş/ajan/Goal/tree veya ortak ortama ikinci yazar açmaz.

Son belge/kanıt eşlemesi mevcut bağımsız reviewer tarafından ayrıca salt okunur incelendi: iki makbuz SHA'sı, beş JPG ve üç benzersiz piksel içeriği, source/paket/süreç sınırı ve kabul sayaçları tutarlı; açık **P1/P2=0**. Reviewer test/HTTP/SQL/GUI/runtime işlemi yapmadı. Yalnız belge ve kopya kanıt tesliminde staged secret taraması ve diff kontrolü başarılı; kabul edilmiş uygulama testleri/CI tekrar edilmedi.
