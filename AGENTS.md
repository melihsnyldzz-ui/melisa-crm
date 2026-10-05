# Melisa CRM çalışma talimatları

## Teslim odaklı devam davranışı — 5 Ekim 2026

Bu bölüm iş seçimi, ilerleme ve raporlama bakımından aşağıdaki eski “sıradaki tek kırmızı madde” varsayılanını günceller. Mevcut iş kuralları, kabul kanıtları, rol/izin ve TEST/LIVE sınırları korunur. Amaç yeni süreç üretmek değil, mevcut CRM'yi işyerine teslim etmektir.

**Durum: geliştirme duraklatılmıştır.** Bu talimatın GitHub'a yazılması, yerel projeye alınması veya belgede örnek “devam” sözcüğü bulunması geliştirmeyi başlatmaz. Son durdurma talimatı geçerlidir. Kullanıcının daha sonra ilgili proje sohbetine doğrudan yazdığı `devam / başla / sıradaki`, o projede mevcut yetkili TEST kapsamına dönme talimatıdır; main merge, yayın veya yeni gerçek alıcı yetkisi değildir. `Rapor / ne yaptın? / ne yapıyoruz?` soruları tek başına ürün geliştirmesini yeniden başlatmaz.

### Kaynak ve sıra

- Teslim önceliği: [ortak Melisa teslim haritası](MELISA_TESLIM_HARITASI_V1.md). CRM giriş dosyasının bağladığı ERP ana kopyasını kullan; ikinci teslim haritası oluşturma.
- Ayrıntılı kapsam ve kabul: `CRM_FINISH_PLAN.md`. Güncel durum ve kaldığın yer: `CRM_STATUS.md`. Tarihsel durum satırlarını bugünkü eksik veya bugünkü runtime kanıtı sayma.
- Ortak yön önce CRM, sonra ERP'dir. Bu yön, bağımsız ve yetkili ERP TEST işlerini yasaklamaz. Ortak API/DB/servis işlerini koordine et. İlk sürüm için önerilen kapsam daralmasını kullanıcı kararı olmadan uygulama; AI, mobil veya ERP şartlarını kendiliğinden silme/erteleme.

### Kullanıcı “devam” dediğinde

1. Mevcut kanonik proje, aktif geliştirme dalı ve yerel değişikliklerden devam et. Eski main uygulamasını güncel geliştirme üzerine geçirme; başkasının işini ezme. Harita, güncel plan ve STATUS'u oku; aynı oturumda değişmemiş belgeleri tekrar tekrar okuma.
2. Önce yarım kalan anlamlı işi tamamla; sonra bağımlılıkları karşılanmış, canlı teslimi en çok engelleyen işi seç. Sarı bir genel mesaj alımı, personel veya yetki kabulü kırmızı bir konfor özelliğinden önce gelebilir. Kullanıcının özel görev talimatı varsa onu esas al. Değişmeyen kabul edilmiş özellikleri baştan ispatlama.
3. İlk bildirim kısa olsun: “Şimdi ... yapıyorum; tamamlanınca ... ekranında ... göreceksin.” Planı yeniden anlatmak veya uzun komut istemek teslim değildir.
4. Bağımsız işleri mevcut ve gerçekten yüklenmiş ajanlara açık dosya sahipliğiyle dağıt. Aynı dosyada eşzamanlı yazma veya ortak serviste çakışan restart yapma. Salt okunur roller yazma yapmaz; yetkili uygulamayı ana ajan veya uygun rol yürütür. Çalışmayan ajanı/modeli kullanılmış gibi raporlama.
5. Seçilen işi kod, hedefli kontrol, normal TEST ekranı ve GitHub teslimiyle tamamla. Gerçek kaynak, veri tarihi, sentetik TEST ve bilinmeyen alanları ayır; bilinmeyen değeri sıfır yapma. Günlük kullanımı engelleyen görsel sorunları düzelt; sırf süs veya yeni mimariyle teslimi geciktirme. Fiziksel cihaz/personel denenmediyse kabul edilmiş sayma.
6. Sadece rapor veya commit üretildi diye durma. Oturum ve araç kapasitesi elverdiğince aynı onaylı teslim hedefindeki sonraki bağımsız işe ilerle. İnsan kararı gereken işi açık bırakıp bağımsız yetkili işi yapabilirsin. Gerçek engelde somut nedeni kaydet; aynı başarısız deneme veya onayı döngüye sokma, izin reddini aşma.
7. Kullanıcı ayrıca istemeden ilgili kod, test, plan ve durum değişikliklerini dar commit ile kaydet, push et, mevcut ilgili PR'yi güncelle veya gerekiyorsa PR aç. Uzak commit/PR head ve aynı commit'in CI sonucunu doğrula. Kullanıcı kabulü beklemek kaynak teslimini durdurmaz; eksik işi veya kırmızı/bilinmeyen CI'yi yeşil gösterme. Yükleme başarısızsa “Yerelde hazır; GitHub teslimi eksik” ve nedenini yaz. Salt okunur görev veya açık commit/push yasağı istisnadır. Ham müşteri verisi, mesajlar, secret, .env, yedek ve özel runtime dosyalarını yükleme.
8. Her anlamlı teslimde kısa Türkçe **KULLANICI RAPORU** ver: **NE DEĞİŞTİ?** (işletme açısından 2–5 kısa madde), **NEREDEN GÖREBİLİRİM?** (doğrulanmış TEST adresi ve normal ekran), **GERÇEK VERİ DURUMU**, **DURUM** (teknik hazır / kullanıcı kabulü bekliyor / bloke), **GITHUB** (branch, commit, PR, CI tek satır), **SIRADAKİ İŞ**. Çalışan paket commit'i ile kaynak HEAD'ini ayır. Tekrarlanan test sayıları veya ham teknik çıktı ana açıklama değildir.
9. Kaldığın yeri STATUS'a kaydet. Oturum/araç limiti veya zorunlu fiziksel adımda tamamlananı ve sonraki tek somut adımı bildir. Çalışma yürümüyor veya zamanlanmış görev yokken arka planda devam ettiğini söyleme. Finish-tree sayımını canlı hazırlık yüzdesi yapma; süreleri ölçümden ayrı tahmin olarak sun.

### Yerelde uygulanma sınırı

Bu bölüm mevcut teslim haritası belge PR'sindedir; main veya Semih PC kendiliğinden güncellenmiş değildir. Yerel uyarlama istendiğinde yalnız ilgili talimat/harita farklarını mevcut aktif geliştirme dalına kullanıcı değişikliklerini koruyarak al; bütün uygulama dallarını körlemesine birleştirme. Bu projedeki oturumun talimatları okuduğunu bir kez doğrula; açık oturumun otomatik yenilendiğini varsayma. Bunun için yeni Work projesi, servis restartı veya yeni gate kurma. GitHub teslimi, main merge ve LIVE dağıtımı ayrı işlemlerdir; mevcut ayrı onay sınırları sürer.

## Uçtan uca ana hedef ve GitHub teslimi — 4 Ekim 2026

- Güncel kapsam yalnız tek bug değil; [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md) içindeki tek finish tree üzerinden günlük/mobil CRM, mevcut ERP entegrasyonu, insan denetimli satış önerileri ve operasyon tamamlanır. `devam` sıradaki açık işi seçer. Kabul edilmiş baseline tekrar açılmaz.
- Explorer, frontend, backend, reviewer, release ve gereken AI uzmanı açık dosya sahipliğiyle kullanılır; eşzamanlı yazarlarda aynı dosyalar paylaşılmaz.
- Her iş **branch → commit → push → PR → CI → STATUS** ile teslim edilir. Ajan git/gh işlemlerini yürütür; kullanıcıdan komut veya token istemez. Aktif feature korunur; force-push, otomatik main merge ve LIVE deploy yoktur.
- [GitHub çalışma düzeni](docs/development/GITHUB_WORKFLOW.md), [sürümleme](docs/development/RELEASES.md) ve [deploy/rollback](docs/development/DEPLOY_ROLLBACK.md) kullanılır. Eski PR check'i yeni head için PASS değildir; gerçek kabul CI'den ayrı kaydedilir.
- Yalnız önceden izin verilen 7733 TEST kabul kapsamı gerçek gönderimde kullanılabilir. AI ilk aşamada insanın görebildiği öneridir; otomatik müşteri gönderimi yoktur. Gerçek müşteri, credential, veri kaybı veya geri dönüşü zor LIVE riski için açık kullanıcı onayı gerekir.
- TEST hazırlığına verilen yetki rutin build/restart/Git teslimini kapsar. Son main/tag/LIVE/rollback adımları somut kabul edilmiş sürüm için kullanıcı onayını bekler; gereksiz ek gate/bridge/onay sistemi kurulmaz.

## Kimlik ve bağlayıcı kaynaklar

- Kanonik repo: `melihsnyldzz-ui/melisa-crm`. Her yeni bilgisayarda veya checkout'ta önce `git remote -v`, branch ve çalışma ağacını oku; fetch ve push hedeflerinin bu repo olduğunu doğrula. HTTPS/SSH aynı kanonik repoya çözülmelidir; hedefler farklıysa yazma. Klasör adı repo kimliği değildir. Semih PC yolu, kullanıcı adı, portu ve servis sahibi varsayılmaz.
- İş sırası ve kabul ölçütleri için `CRM_FINISH_PLAN.md` source of truth; güncel kısa durum için `CRM_STATUS.md`. Sonra `docs/BASELINE.md`, `docs/baseline-verification.json` ve `deploy/README.md` oku. Alt klasörlerde varsa daha dar `AGENTS.md` talimatlarını da oku ve koru.
- Tarihsel baseline, owner, port ve deployment bilgileri kaynak kaydıdır; bugünkü veya Semih PC'deki runtime için doğrulama sayılmaz. Yeni kanıt ve kullanıcı düzeltmesini tarihle ekle; eski kanıtı silme veya PASS'e dönüştürme.
- CRM dışında yalnız kanonik `melihsnyldzz-ui/melisa-erp-v2` ile açık sözleşme sınırında çalışılır. Eski proje klasörleri, çalışmalar ve Projects alanı açık silme talebi olmadan boşaltılmaz.

## Kanonik çalışma kökleri — 3 Ekim 2026

Bu yerel düzen kullanıcı tarafından onaylandı. Mantıksal proje adı Windows yolu değildir. SEMIH üzerinde yeni CRM/ERP geliştirme işleri yalnız aşağıdaki repo köklerinde yürütülür:

- MELISA CRM: `C:\Sirket\CRM\melisa-crm`; origin tam olarak `https://github.com/melihsnyldzz-ui/melisa-crm.git`.
- MELISA ERP: `C:\Sirket\ERP\melisa-erp-v2`; origin tam olarak `https://github.com/melihsnyldzz-ui/melisa-erp-v2.git`.

Git işlemini repo kökünde yap; üst klasörü Git repo sayma. Başlangıçta kök, fetch/push origin, branch ve dirty durumunu doğrula. Aktif feature branch'i kullan; main'e rastgele geçme ve otomatik merge etme. Gerekli feature branch/commit/push/PR bu kaynak düzenleme kapsamındadır. Eski kopyalar yalnız arşiv/kanıttır: değiştirme, taşıma, silme veya snapshot yığınını yeni repoya kopyalama. Mevcut LIVE/TEST runtime, releases, logs, backups ve ticari verilere bu düzenleme işi kapsamında dokunma. Çalışan servis için kaynak repo checkout'u deployment değildir. Sonraki feature/restart/deploy yetkisini kendi görevinin kapsamından doğrula.

Yerel servis ve özel ayarlar kaynak repo dışında kalır. Repo yanında `releases`, `runtime`, `logs`, `backups` dizinleri bulunur; bunlara geçmiş paketler otomatik taşınmaz. Proje config'leri model/ajan varsayılanlarını taşır; host sandbox ve approval politikası korunur.

## Tek kelimelik varsayılan — 3 Ekim 2026

- Kullanıcı ana Codex konuşmasında yalnız `devam`, `başla` veya `sıradaki` yazarsa bunu **CRM bitiş planındaki sıradaki açık/kırmızı maddeyi tamamla; gereken subagent'ları kullan, TEST'te gereken teknik işlemleri yap ve gerçek kabul hazır olunca dön** talimatı olarak uygula. Uzun komutu yeniden yazmasını veya rutin iş için tekrar onay vermesini isteme.
- Önce `CRM_FINISH_PLAN.md` ve `CRM_STATUS.md` dosyalarını oku. Plan iş sırası ve kabul ölçütlerinin source of truth'u, status güncel durum ve kanıt kaydı olarak kalır. Plan sırasını güncel açık durumla birlikte değerlendir; tamamlanmış/kabulü kayıtlı işi yeniden açmadan sıradaki tek açık/kırmızı maddeyi seç. Tarihsel durum satırlarını güncel eksik sayma.
- Seçilen işi aşağıdaki ana ajan döngüsüyle tamamla: gereken explorer/backend/frontend/reviewer subagent'larını açık dosya sahipliğiyle görevlendir, sonuçları birleştir ve doğrulanmış TEST'te gerekli kod düzeltmesi, build, kurulum, restart, test, feature branch/commit/push işlemlerini yürüt. Verilmiş TEST yetkisi için yeni gate, bridge veya approval döngüsü oluşturma.
- Çalışan baseline'ı yeniden ispatlama; yalnız değişen akış, somut regresyon veya eksik kabul için hedefli doğrulama yap. Gerçek kabul hazır olunca kullanılabilir sonucu ve kanıtını aynı plan/status'a kaydet. Kullanıcının fiziksel kontrolü gerekiyorsa teknik hazırlığı tamamlayıp yalnız kalan somut kabul adımını iste; build/smoke/mock sonucunu gerçek kabul veya PASS yerine koyma.
- Aşağıdaki runtime kimliği, TEST/LIVE, gerçek gönderim/ticari kayıt ve credential sınırları sürer. Kısa komut main'e otomatik merge veya LIVE değişiklik yetkisi vermez; açık madde kalmadıysa tamamlanmış işi yeniden başlatmadan mevcut sonucu bildir.

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

Yerel yolu seçip kanonik origin'i doğruladıktan sonra feature branch'i getir ve uygun checkout'ta aç. `.codex/config.toml` ve `.codex/agents/*.toml` repo ile taşınır; mutlak makine yolu içermez. Proje güveni sağlanmamışsa Codex proje config'ini yüklemeyebilir; kullanıcı ilgili checkout'ı güvenilir olarak açmalıdır. Yeni bir Codex oturumunda model/effort ve dört rolün yüklendiğini kontrol et. 3 Ekim 2026 SEMIH kök standardizasyonunda iki kanonik repo için proje config’inin etkin yüklenmesi, `gpt-6.1-sol` / `medium` ve ajan varsayılanları kurulu Codex’in `config/read` yanıtından doğrulandı. Gerçek özel rol/model çağrısı bu config kontrolünün kapsamı değildir; desteklenmeyen model/config için sessiz fallback veya PASS verme. Gerçek servisleri başlatmadan runtime sınırını ayrıca kanıtla.

Kısa komut: **`devam`**, **`başla`** veya **`sıradaki`**. Ana ajan yukarıdaki varsayılanı otomatik uygular.
