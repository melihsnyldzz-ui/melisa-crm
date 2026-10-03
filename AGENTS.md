# Melisa CRM çalışma talimatları

## Kimlik ve bağlayıcı kaynaklar

- Kanonik repo: `melihsnyldzz-ui/melisa-crm`. Her yeni bilgisayarda veya checkout'ta önce `git remote -v`, branch ve çalışma ağacını oku; fetch ve push hedeflerinin bu repo olduğunu doğrula. HTTPS/SSH aynı kanonik repoya çözülmelidir; hedefler farklıysa yazma. Klasör adı repo kimliği değildir. Semih PC yolu, kullanıcı adı, portu ve servis sahibi varsayılmaz.
- İş sırası ve kabul ölçütleri için `CRM_FINISH_PLAN.md` source of truth; güncel kısa durum için `CRM_STATUS.md`. Sonra `docs/BASELINE.md`, `docs/baseline-verification.json` ve `deploy/README.md` oku. Alt klasörlerde varsa daha dar `AGENTS.md` talimatlarını da oku ve koru.
- Tarihsel baseline, owner, port ve deployment bilgileri kaynak kaydıdır; bugünkü veya Semih PC'deki runtime için doğrulama sayılmaz. Yeni kanıt ve kullanıcı düzeltmesini tarihle ekle; eski kanıtı silme veya PASS'e dönüştürme.
- CRM dışında yalnız kanonik `melihsnyldzz-ui/melisa-erp-v2` ile açık sözleşme sınırında çalışılır. Eski proje klasörleri, çalışmalar ve Projects alanı açık silme talebi olmadan boşaltılmaz.

## Ana ajan döngüsü

1. Plan/status ve ilgili talimatları oku; Git durumunu ve mevcut kanıtın seçilen iş için yeterliliğini kontrol et. Çalışan baseline'ı her seferinde yeniden ispatlama. Kaynak/dependency değişikliği, kanıt eksikliği veya runtime kimliğinin değişmesi varsa yalnız ilgili doğrulamayı yenile.
2. Tek kırmızı madde seç; kimlik, kapsam, bağımlılık, TEST/LIVE sınırı ve gerçek kabul ölçütünü belirt. Kullanıcı yalnız kurulum istemişse feature işine geçme.
3. Bağımsız işleri `.codex/agents` rollerine böl. Her alt ajana sahip olduğu dosyaları ve beklenen kanıtı açıkça ver. Aynı dosyada paralel yazma yapma; paylaşılan plan/status/sözleşme dosyalarını ana ajan veya tek atanmış yazar günceller.
4. Explorer mevcut yapıyı ve riskleri okur; backend/frontend ayrık değişiklikleri yapar; reviewer bağımsız inceleme yapar. Görev devri izin genişletmez. Ana ajan sonuçları birleştirir ve gereken en dar TEST kontrollerini çalıştırır.
5. Gerçek kullanım kabulü gerektiren özellik için build, smoke, mock veya unit test tek başına PASS değildir. PASS ancak seçilen maddenin tüm kabul ölçütleri kanıtla karşılandıysa; aksi halde PARTIAL, FAIL veya FAIL-BLOCKED ve somut eksik kanıtı yaz.
6. Aynı maddenin sonucunu plan/status'a geçir; branch/commit/PR ve test/kabul boşluğunu kısa raporla. Main'e otomatik merge etme.

## İzin ve runtime sınırı

- Kullanıcının 2026-10-03 talebi doğrulanmış TEST tarafında restart/build/test/feature branch/commit/push için ek izin gerektirmez; uygun PR açılabilir. `deploy/README.md` içindeki ilk hazırlık döneminin GitHub/push ve tüm restart yasağı bu yetkiyle bu kapsamda güncellenmiştir. LIVE deployment veya gerçek gönderim için yetki verildiği sonucu çıkarılmaz.
- Bilinmeyen runtime TEST sayılmaz. Restart veya entegrasyon testi öncesi port → süreç/sahip → checkout → API/veritabanı/provider kimliğini doğrula; canlı müşteri servisini TEST diye yeniden başlatma.
- LIVE'da geri dönüşü zor değişiklik, veri kaybı, gerçek müşteri/ticari kayıt veya credential riski varsa açık insan onayı al. Gerçek mesaj/medya gönderimi, müşteriyle iletişim ve ticari kayıt oluşturma ayrıca açık kullanıcı talimatı ister. TEST yetkisi gerçek alıcıya gönderim yetkisi değildir.
- Secret, `.env` içeriği, token ve müşteri verisini çıktıya veya Git'e taşıma. Mevcut provider/send güvenlik kapılarını koru. Host sandbox ve approval kurallarını config ile gevşetme veya hata/denial sonrası aşma.
- REV3 installer owner/path/manifest korumalarını atlama; eski installer'ı bu repo üzerinden çalıştırma. Yeni bilgisayarda önce taşınabilir taslak ve kimlik kanıtı üret; credential/servis/owner/rollback uyarlaması ayrı çalışma kapsamıdır.
- Gateway'deki eski monorepo smoke scriptleri burada eksik/güvensizdir; çalıştırma. Offline gateway/frontend testlerinde `tests/offline-test-guard.mjs` kullan; gerçek provider, SQL ve sabit canlı portlara bağlantı açma. Legacy frontend server modüllerini baseline kontrolü amacıyla başlatma.

## Roller ve model

- Ana ajan ve varsayılan alt ajan: `gpt-6.1-sol`, `medium`.
- `explorer`: salt okunur keşif, kanıt ve dosya sahipliği önerisi.
- `backend`: `apps/gateway`, `packages/contracts` ve ilgili testler; görevde atanmış dosyalarla sınırlı.
- `frontend`: `apps/frontend` ve ilgili testler; görevde atanmış dosyalarla sınırlı.
- `reviewer`: salt okunur inceleme; sıradan işler medium, zor güvenlik/kimlik/sözleşme incelemesinde ana ajan açıkça high seçer.
- Astra yalnız çok zor mimari belirsizlikte, gerekli gerekçeyi belirterek kullanılır; rutin işlerde varsayılan değiştirilmez.

## Semih PC'de kullanım

Yerel yolu seçip kanonik origin'i doğruladıktan sonra feature branch'i getir ve uygun checkout'ta aç. `.codex/config.toml` ve `.codex/agents/*.toml` repo ile taşınır; mutlak makine yolu içermez. Proje güveni sağlanmamışsa Codex proje config'ini yüklemeyebilir; kullanıcı ilgili checkout'ı güvenilir olarak açmalıdır. Yeni bir Codex oturumunda model/effort ve dört rolün yüklendiğini kontrol et. Semih PC'de model erişimi ve gerçek rol çağrısı bu hazırlıkta doğrulanmış değildir; desteklenmeyen model/config için sessiz fallback veya PASS verme. Gerçek servisleri başlatmadan runtime sınırını ayrıca kanıtla.

Kısa komut: **Planındaki sıradaki kırmızı maddeyi bitir. Gereken ajanları kullan, gerçek kabul hazır olunca dön.**
