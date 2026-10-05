# Melisa CRM çalışma talimatları

## Karar merkezi ve `devam` — 5 Ekim 2026

Kullanıcı ve ChatGPT iş/ürün kararlarını sohbetten planlar; onaylanan kararlar GitHub'da [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) içinde kalıcılaşır. Codex bu kararları uygular. Bu bölüm eski harita/finish-plan/tek-kırmızı yönlendirmelerinin **günlük sıra ve okuma düzenini** günceller; mevcut kapsam, kabul kanıtları ve işlem sınırları korunur.

Bu görev yalnız proje yönetimi belgeleridir; uygulama geliştirmesini veya duraklatılmış çalışmayı başlatmaz. Kullanıcının ilgili projeye daha sonra doğrudan yazdığı `devam / başla / sıradaki`, mevcut yetkili kapsamda aşağıdaki döngüyü başlatır. Belgedeki örnek komut veya rapor sorusu başlatma talimatı değildir.

1. Kanonik kök, fetch/push origin, aktif feature branch ve dirty durumu doğrula; kullanıcı işini koru. GitHub'daki ilgili doküman PR/commit'i ile okuduğun yerel sürümü eşleştir; eski checkout'u güncel plan sayma, dirty ağacı otomatik pull/merge etme.
2. Sırayla [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) → [DELIVERY_BOARD.md](DELIVERY_BOARD.md) → [CRM_STATUS.md](CRM_STATUS.md) → [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md) oku. Ardından seçilen işin ilgili yerel/merkezi kuralları ve [USER_ACCEPTANCE.md](USER_ACCEPTANCE.md) kaydını oku. Aynı oturumda değişmeyen belgeleri tekrar okuma.
3. Panonun `ŞİMDİ` bölümündeki sırayı öncelik say; bağımlılığı karşılanmış en üstteki **onaylı ve tamamlanmamış** işi seç. Bekleyen insan kabulünü kapanmış sayma. ŞİMDİ içinde tamamlanmamış fakat bağımlılığı hazır olmayan işler varsa somut bağımlılığı kaydet; SONRA ile sıralarını atlama. ŞİMDİ tamamen tamamlandığında zaten onaylı SONRA sırasının ilk işi bağımlılığı hazırsa ŞİMDİ’ye taşı; bu yeni kapsam/öncelik kararı değildir. CANLIDAN SONRA veya sıra değişimi ayrı kullanıcı kararı ister. Panoda az sayıda iş bulunsun; yeni iş/öncelik kullanıcı kararıyla eklenir.
4. Kabul edilmiş işi yeniden yapma. Mevcut kapsam/commit kabulünü kullan; yalnız değişen akış, regresyon veya eksik kabul için hedefli kontrol yap. Kısa bildirimde seçilen iş ID'sini ve kullanıcıya görünen sonucu belirt. Bağımsız işleri açık dosya sahipliğiyle uygun ajanlara dağıt; aynı dosya veya serviste eşzamanlı değişiklik yapma.
5. Seçilen işi gereken kod, hedefli test ve teknik kanıtla tamamla. Teknik sonuç/kanıt ve runtime-kaynak ayrımı yalnız `CRM_STATUS.md` içindedir; finish tree'nin ilgili yaprağını güncelle, günlük sıra üretme. Kullanıcının gözle denemesi gerekiyorsa `USER_ACCEPTANCE.md` içine iş ID'si, kısa deneme, ortam/sürüm, kişi/tarih ve `bekliyor / PASS / FAIL` sonucu ekle. Teknik test PASS, kullanıcı PASS değildir.
6. İlgili değişiklikleri dar **branch → commit → push → PR** ile GitHub'a teslim et; uzak PR head ve aynı commit'in mevcut CI sonucunu doğrula. Kullanıcı kabulü beklemek kaynak teslimini durdurmaz. Pano durumunu teknik hazır/kullanıcı kabulü bekliyor/tamam olarak kanıta bağla; status'a karar veya roadmap kopyalama. Somut engelde kalan adımı yaz; onaylı hedef dışında kapsam ekleme.
7. `PROJECT_DECISIONS.md` kararını Codex tek başına değiştiremez. Yeni açık kullanıcı kararı geldiğinde yeni ID ile önceki kararı **supersede** et, gerekçe/tarih/kaynak bağını koru; eski kararın metnini veya geçmişini silme. Çelişkiyi tahminle çözme.

Panodaki iş bir gelecek çalışma talimatıdır; kendi başına runtime/SQL/Vega/gerçek müşteri gönderimi yetkisi değildir. İlgili görev kapsamı ve mevcut TEST/LIVE, gerçek alıcı, credential sınırları sürer. `devam` main merge/tag/release/LIVE deploy yetkisi vermez. GitHub kaynak teslimi deployment değildir.

Dosyaların rolü ve karar kayıt yöntemi [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) içindedir. [Ortak teslim haritası](MELISA_TESLIM_HARITASI_V1.md) tam teslim bağlamıdır; günlük sırayı pano belirler. Bu belge PR'si main veya diğer açık oturumları kendiliğinden güncellemez.

## Uçtan uca ana hedef ve GitHub teslimi — 4 Ekim 2026

- Güncel kapsam yalnız tek bug değil; [DELIVERY_BOARD.md](DELIVERY_BOARD.md) günlük sırası ve [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md) içindeki tek finish tree üzerinden günlük/mobil CRM, mevcut ERP entegrasyonu, insan denetimli satış önerileri ve operasyon tamamlanır. `devam` sıradaki açık işi seçer. Kabul edilmiş baseline tekrar açılmaz.
- Explorer, frontend, backend, reviewer, release ve gereken AI uzmanı açık dosya sahipliğiyle kullanılır; eşzamanlı yazarlarda aynı dosyalar paylaşılmaz.
- Her iş **branch → commit → push → PR → CI → STATUS** ile teslim edilir. Ajan git/gh işlemlerini yürütür; kullanıcıdan komut veya token istemez. Aktif feature korunur; force-push, otomatik main merge ve LIVE deploy yoktur.
- [GitHub çalışma düzeni](docs/development/GITHUB_WORKFLOW.md), [sürümleme](docs/development/RELEASES.md) ve [deploy/rollback](docs/development/DEPLOY_ROLLBACK.md) kullanılır. Eski PR check'i yeni head için PASS değildir; gerçek kabul CI'den ayrı kaydedilir.
- Yalnız önceden izin verilen 7733 TEST kabul kapsamı gerçek gönderimde kullanılabilir. AI ilk aşamada insanın görebildiği öneridir; otomatik müşteri gönderimi yoktur. Gerçek müşteri, credential, veri kaybı veya geri dönüşü zor LIVE riski için açık kullanıcı onayı gerekir.
- TEST hazırlığına verilen yetki rutin build/restart/Git teslimini kapsar. Son main/tag/LIVE/rollback adımları somut kabul edilmiş sürüm için kullanıcı onayını bekler; gereksiz ek gate/bridge/onay sistemi kurulmaz.

## Kimlik ve bağlayıcı kaynaklar

- Kanonik repo: `melihsnyldzz-ui/melisa-crm`. Her yeni bilgisayarda veya checkout'ta önce `git remote -v`, branch ve çalışma ağacını oku; fetch ve push hedeflerinin bu repo olduğunu doğrula. HTTPS/SSH aynı kanonik repoya çözülmelidir; hedefler farklıysa yazma. Klasör adı repo kimliği değildir. Semih PC yolu, kullanıcı adı, portu ve servis sahibi varsayılmaz.
- Günlük iş sırası `DELIVERY_BOARD.md`, tam kapsam/kabul ölçütleri `CRM_FINISH_PLAN.md`, teknik durum/kanıt `CRM_STATUS.md`; önce karar merkezi okuma sırasını izle. Sonra `docs/BASELINE.md`, `docs/baseline-verification.json` ve `deploy/README.md` oku. Alt klasörlerde varsa daha dar `AGENTS.md` talimatlarını da oku ve koru.
- Tarihsel baseline, owner, port ve deployment bilgileri kaynak kaydıdır; bugünkü veya Semih PC'deki runtime için doğrulama sayılmaz. Yeni kanıt ve kullanıcı düzeltmesini tarihle ekle; eski kanıtı silme veya PASS'e dönüştürme.
- CRM dışında yalnız kanonik `melihsnyldzz-ui/melisa-erp-v2` ile açık sözleşme sınırında çalışılır. Eski proje klasörleri, çalışmalar ve Projects alanı açık silme talebi olmadan boşaltılmaz.

## Kanonik çalışma kökleri — 3 Ekim 2026

Bu yerel düzen kullanıcı tarafından onaylandı. Mantıksal proje adı Windows yolu değildir. SEMIH üzerinde yeni CRM/ERP geliştirme işleri yalnız aşağıdaki repo köklerinde yürütülür:

- MELISA CRM: `C:\Sirket\CRM\melisa-crm`; origin tam olarak `https://github.com/melihsnyldzz-ui/melisa-crm.git`.
- MELISA ERP: `C:\Sirket\ERP\melisa-erp-v2`; origin tam olarak `https://github.com/melihsnyldzz-ui/melisa-erp-v2.git`.

Git işlemini repo kökünde yap; üst klasörü Git repo sayma. Başlangıçta kök, fetch/push origin, branch ve dirty durumunu doğrula. Aktif feature branch'i kullan; main'e rastgele geçme ve otomatik merge etme. Gerekli feature branch/commit/push/PR bu kaynak düzenleme kapsamındadır. Eski kopyalar yalnız arşiv/kanıttır: değiştirme, taşıma, silme veya snapshot yığınını yeni repoya kopyalama. Mevcut LIVE/TEST runtime, releases, logs, backups ve ticari verilere bu düzenleme işi kapsamında dokunma. Çalışan servis için kaynak repo checkout'u deployment değildir. Sonraki feature/restart/deploy yetkisini kendi görevinin kapsamından doğrula.

Yerel servis ve özel ayarlar kaynak repo dışında kalır. Repo yanında `releases`, `runtime`, `logs`, `backups` dizinleri bulunur; bunlara geçmiş paketler otomatik taşınmaz. Proje config'leri model/ajan varsayılanlarını taşır; host sandbox ve approval politikası korunur.

## Tek kelimelik varsayılan — 3 Ekim 2026

- Kullanıcı ana Codex konuşmasında yalnız `devam`, `başla` veya `sıradaki` yazarsa bunu **CRM DELIVERY_BOARD ŞİMDİ listesindeki bağımlılığı hazır en öncelikli onaylı işi tamamla; gereken subagent'ları kullan, TEST'te gereken teknik işlemleri yap ve gerçek kabul hazır olunca dön** talimatı olarak uygula. Uzun komutu yeniden yazmasını veya rutin iş için tekrar onay vermesini isteme.
- Karar merkezi okuma sırasını ve pano seçimini uygula; finish plan tam kapsam, `CRM_STATUS.md` teknik kanıttır.
- Seçilen işi aşağıdaki ana ajan döngüsüyle tamamla: gereken explorer/backend/frontend/reviewer subagent'larını açık dosya sahipliğiyle görevlendir, sonuçları birleştir ve doğrulanmış TEST'te gerekli kod düzeltmesi, build, kurulum, restart, test, feature branch/commit/push işlemlerini yürüt. Verilmiş TEST yetkisi için yeni gate, bridge veya approval döngüsü oluşturma.
- Çalışan baseline'ı yeniden ispatlama; yalnız değişen akış, somut regresyon veya eksik kabul için hedefli doğrulama yap. Kullanıcı kabulünü `USER_ACCEPTANCE.md` içine, teknik kanıtını status ve ilgili finish yaprağına bağla. Kullanıcının fiziksel kontrolü gerekiyorsa teknik hazırlığı tamamlayıp yalnız kalan somut kabul adımını iste; build/smoke/mock sonucunu gerçek kabul veya PASS yerine koyma.
- Aşağıdaki runtime kimliği, TEST/LIVE, gerçek gönderim/ticari kayıt ve credential sınırları sürer. Kısa komut main'e otomatik merge veya LIVE değişiklik yetkisi vermez; açık madde kalmadıysa tamamlanmış işi yeniden başlatmadan mevcut sonucu bildir.

## Ana ajan döngüsü

1. Karar merkezi okuma sırası ve ilgili talimatları izle; Git durumunu ve mevcut kanıtın seçilen iş için yeterliliğini kontrol et. Çalışan baseline'ı her seferinde yeniden ispatlama. Kaynak/dependency değişikliği, kanıt eksikliği veya runtime kimliğinin değişmesi varsa yalnız ilgili doğrulamayı yenile.
2. Panonun ŞİMDİ listesinden bağımlılığı hazır en öncelikli onaylı işi seç; kimlik, kapsam, bağımlılık, TEST/LIVE sınırı ve gerçek kabul ölçütünü belirt. Kullanıcı yalnız kurulum istemişse feature işine geçme.
3. Bağımsız işleri `.codex/agents` rollerine böl. Her alt ajana sahip olduğu dosyaları ve beklenen kanıtı açıkça ver. Aynı dosyada paralel yazma yapma; paylaşılan plan/status/sözleşme dosyalarını ana ajan veya tek atanmış yazar günceller.
4. Explorer mevcut yapıyı ve riskleri okur; backend/frontend ayrık değişiklikleri yapar; reviewer bağımsız inceleme yapar. Görev devri izin genişletmez. Ana ajan sonuçları birleştirir ve gereken en dar TEST kontrollerini çalıştırır.
5. Gerçek kullanım kabulü gerektiren özellik için build, smoke, mock veya unit test tek başına PASS değildir. PASS ancak seçilen maddenin tüm kabul ölçütleri kanıtla karşılandıysa; aksi halde PARTIAL, FAIL veya FAIL-BLOCKED ve somut eksik kanıtı yaz.
6. Teknik sonucu status ve ilgili finish yaprağına, insan sonucunu USER_ACCEPTANCE kaydına bağla; branch/commit/PR ve test/kabul boşluğunu kısa raporla. Main'e otomatik merge etme.

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

Yerel yolu seçip kanonik origin'i doğruladıktan sonra feature branch'i getir ve uygun checkout'ta aç. `.codex/config.toml` ve `.codex/agents/*.toml` repo ile taşınır; mutlak makine yolu içermez. Proje güveni sağlanmamışsa Codex proje config'ini yüklemeyebilir; kullanıcı ilgili checkout'ı güvenilir olarak açmalıdır. Yeni bir Codex oturumunda model/effort ve dört rolün yüklendiğini kontrol et. 3 Ekim 2026 SEMIH kök standardizasyonunda iki kanonik repo için proje config’inin etkin yüklenmesi, `gpt-6.1-sol` / `medium` ve ajan varsayılanları kurulu Codex’in `config/read` yanıtından doğrulandı. Gerçek özel rol/model çağrısı bu config kontrolünün kapsamı değildir; desteklenmeyen model/config için sessiz fallback veya PASS verme. Gerçek servisleri başlatmadan runtime sınırını ayrıca kanıtla.

Kısa komut: **`devam`**, **`başla`** veya **`sıradaki`**. Ana ajan yukarıdaki varsayılanı otomatik uygular.
