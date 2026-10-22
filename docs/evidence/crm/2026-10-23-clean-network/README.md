# CRM06 / M01 — temiz TEST için LAN ve Tailscale kaynak teslimi

23 Ekim 2026, Europe/Istanbul. Mevcut ERP sahibinin koordinasyonuyla yalnız CRM kaynakları değişti. Kurulum, özel config, SQL, servis, restart ve firewall ERP sahibindedir. Gerçek uzak cihaz ve insan kabulü **BEKLİYOR**; bu kayıt çalışan ağ kurulumu veya GUI PASS değildir.

## Kaynak kapsamı

Kurulu CRM uygulama kaynağı `c8d0e28f0ea6cf16133c87dd548a4281381abfb7` ile karşılaştırıldığında `apps/`, `packages/`, `deploy/` kapsamındaki tek fark `deploy/test-server.mjs` olur. Frontend ve paket kaynakları değişmedi; mevcut c8 frontend build'inin davranış için yeniden derlenmesi gerekmez. Paket hazırlanırken mevcut exact-commit/manifest/bütünlük kuralları korunmalıdır; dirty checkout dağıtım kaynağı değildir.

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

Kurulumdan sonra hedef adresler: [LAN CRM](http://192.168.1.46:62800/), [Tailscale CRM](http://100.87.188.3:62800/), [yerel CRM](http://127.0.0.1:62800/). Bu bağlantıların yazılması erişim kanıtı değildir. Gerçek uzak cihazda normal giriş → katalog/fotoğraf → aynı kaydı orders üzerinden yeniden okuma ve çıkış/revoke kontrolü ERP sahibinin kurulumundan sonra ayrı doğrulanmalıdır; teknik sonuç insan kabulü yerine geçmez.

## Teknik doğrulama

- Yeni beş ağ/proxy regresyonu önce `5 FAIL` üretti: clean LAN yasağı ve eksik çoklu arayüz çözümü doğrulandı. Düzeltme sonrası aynı `5 PASS`.
- Etkilenen ağ, clean profil, eski shared endpoint, bootstrap, normal auth ve katalog origin testleri birlikte **41 PASS / 0 FAIL**. Son boş-forwarded başlık düzeltmesinden sonra yeni beş test ayrıca yeniden PASS; bu tekrar yeni test sayısına eklenmedi.
- Testler yalnız `offline-test-guard.mjs`, sentetik istek/soket metadatası ve rastgele loopback portları kullandı. Sabit TEST portuna, gerçek peer'a, SQL'e veya provider'a bağlanılmadı. Proxy fixture'ındaki 200/401/403 gerçek oturum veya cihaz kabulü değildir.
- Mevcut source explorer, auth tester, release inspector ve bağımsız reviewer kullanıldı; yeni ajan/altyapı kurulmadı. Son dar bağımsız incelemede açık **P1/P2=0**.
- `node --check` ve `git diff --check` başarılı. Source/CI, kurulu runtime, normal ekran, fiziksel cihaz ve insan kabulü ayrı kalır.

Kaynak snapshot SHA256: server `3cbc12f715ca4c8d43160a6a84418e5a57f8e481d72c370ec985634c6f7262c6`; test `5d65b137de7fd3ece081da40c1e7d46cc86b84bda23631088c49ec0266573d63`. Exact source commit ve hosted CI teslim sonrası aynı kayda eklenir. Eski 25 CRM yaprağı / 12 tamam / 13 kısmi / 0 açık ve toplam 74 kapsamı değişmedi.
