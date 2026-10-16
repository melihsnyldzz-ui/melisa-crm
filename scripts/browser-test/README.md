# Sentetik gerçek tarayıcı akışı

`crm-flow.mjs`, gerçek React CRM ekranlarını Chromium üzerinden kullanır. Normal CRM ve ERP giriş formlarına yalnız sentetik fixture hesapları girer; auth token/cookie injection yapmaz. Seçilen sentetik origin dışındaki HTTP(S) isteklerini ve tüm WebSocket bağlantılarını engeller; giriş yapmadan önce sunucunun `x-melisa-synthetic: 1` işaretini arar.

Önkoşullar: Node ve `/usr/bin/chromium`. Ürün bağımlılıklarını değiştirmeden ayrı araç klasörüne tarayıcı sürücüsünü yükleyin:

```sh
npm install --prefix work/browser --cache work/npm-cache --no-save --ignore-scripts --no-audit --no-fund playwright-core@1.64.1
```

`scripts/cloud-test/server.mjs --synthetic --port 0` fixture'ı gerçek frontend'i de sunar. Fixture'ın yazdırdığı loopback origin ile repo kökünden:

```sh
node scripts/browser-test/crm-flow.mjs --origin http://127.0.0.1:PORT --output work/browser-evidence
```

Tam senaryoyu yeni başlatılmış sentetik sunucuya karşı çalıştırın. Art arda denemelerde gerçek adaptörün geçici giriş sınırı korunur; sınır görülürse normal bekleme süresi veya yalnız bu sentetik sürecin yeniden başlatılması gerekir.

Araç farklı konumdaysa `--playwright /tam/yol/playwright-core/index.mjs`; Chromium için `--chromium /tam/yol/chromium` kullanılabilir. Varsayılan Playwright konumu `work/browser/node_modules/playwright-core/index.mjs`.

Kapsam: normal müşteri seçimi, fotoğraflı katalogdan iki ürün seçme, çıkarıp yeniden ekleme, sıfır/kesir adet engeli, 3 + 2 adet, ERP müşterisi, kalıcı sipariş taslağı ve bağımsız API okuması, müşteri B seçildikten sonra müşteri A'nın taslağını yeniden açma, tarayıcı yenilemesinden sonra aynı UUID ve tek POST. 390px görünümünde taslak ve Kapat düğmesinin ekran sınırlarında kaldığı doğrulanır. CRM06 bağlantı hazırlama/normal müşteri kataloğu, kalıcı adet taslağı, tek ürün talebi ve yenileme de çalışır. Müdür ve atanmış personel, aynı talep UUID'sine sahip ekran kaydını görmelidir; diğer personel müşteri veya talebi görememelidir. Yetkisiz ERP okuması 401 olmalıdır.

`result.json` sentetik kayıt UUID'lerini, senaryoları, ekran dosyalarını, tarayıcı hatalarını ve ağ sorunlarını içerir. Yetki başlıkları, parolalar ve auth yanıtları kayda alınmaz. Viewport kanıtı fiziksel telefon veya gerçek personel kabulü sayılmaz.
