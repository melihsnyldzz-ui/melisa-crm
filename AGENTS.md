# Melisa CRM — Codex çalışma kuralları

Türkçe çalış ve raporla. Kanonik kaynak `melihsnyldzz-ui/melisa-crm` reposudur; işe başlamadan `git remote -v`, branch ve çalışma ağacını kontrol et. Başka PC'nin mutlak yollarını bu PC için kullanma. Semih PC bağlantısı veya erişimi doğrulanmadıysa yapılmış gibi anlatma; yalnız gereken erişim adımını iste.

## Önce oku, sonra tek maddeyi seç

1. Bu dosyayı, alt klasörde varsa ilgili `AGENTS.md` dosyalarını, `.codex/config.toml` ve kullanılacak rol dosyalarını oku.
2. `CRM_FINISH_PLAN.md`, `CRM_STATUS.md`, `docs/BASELINE.md` ve `deploy/README.md` dosyalarını oku. Bitiş işlerinin kaynağı `CRM_FINISH_PLAN.md` olur; kaynaklardaki çelişki veya eksikliği kanıtla bildir, kabul durumu uydurma.
3. Planın tek kırmızı maddesini seç; hedefi, etkilenen dosyaları, kabul ölçütünü ve ortamı belirt. Kurulum görevi sırasında ilgisiz ürün özelliği değiştirme.
4. Çalışan baseline'ı her görevde tekrar ispatlama. Değişiklikten etkilenen regresyonları ve gerekli kabul kontrollerini çalıştır; eski kanıtı güncel çalıştırma gibi sunma.

## Ana ajan ve iş paylaşımı

Ana ajan planı, dosya sahipliğini, birleştirmeyi ve son raporu yönetir. Bağımsız keşif, uygulama ve review işlerini uygun subagent'lara böl; sırf ajan kullanmak için bağımlı işi paralelleştirme. Her görevlendirmede seçilen maddeyi, izinli dosyaları, ortamı, beklenen kanıtı ve durma sınırını ver. Aynı dosyayı iki yazıcıya paralel verme; ortak sözleşme, plan ve status güncellemelerini ana ajan seri yapar. Sonuçları ana thread'de birleştir; alt ajanın PASS demesi kabul yerine geçmez.

| Rol | Sorumluluk | Yazma |
| --- | --- | --- |
| `explorer` | Kaynak, status, çalışan yollar ve bağımlılıkları kanıtla eşleştirir | Salt okunur |
| `backend` | `apps/gateway`, API, auth, gateway ve CRM tarafı entegrasyon sözleşmeleri | Yalnız verilen dosyalar |
| `frontend` | `apps/frontend`, arayüz ve gerçek kullanıcı akışı | Yalnız verilen dosyalar |
| `reviewer` | Bağımsız doğruluk, güvenlik, regresyon ve kabul incelemesi | Salt okunur |

Explorer/reviewer dosya, status, commit veya servis değiştirmez; build/restart/commit/push çalıştırmaz, inceleme sonucu ana ajana döner. `sandbox_mode` rol varsayılanıdır; parent oturumunun canlı izin tercihleri bunu geçersiz kılabilir. Ana ajan delegasyon öncesi etkili izinleri kontrol eder; salt okunur rol daha geniş izinlerle açılsa bile hiçbir yazma/mutasyon yapmaz. Backend CRM tarafından ERP sözleşmesini inceler; ERP reposunda veya SQL/Vega'da yazma görevi üstlenmez.

## Ortam ve onay sınırı

`CRM_STATUS.md` içindeki LIVE/TEST portları geçmiş belgedir, mevcut PC'nin çalıştığının kanıtı değildir. İşlem öncesi `port → process/runtime → repo → gateway/provider/DB` kimliğini, gerekiyorsa owner ve deployment kimliğini doğrula. İsim, klasör, port veya tarih tek başına ortam kanıtı değildir. Ortam belirsizse değişiklik yapma; erişim veya tek gerekli manuel adım için kullanıcıyı çağır.

Bu kullanıcının güncel görevi, eski `deploy/README.md` içindeki offline görev yasağından daha yeni ve kapsamı belirli yetkidir: doğrulanmış TEST'te gerekli restart/build/test/branch/commit/push ve PR için tekrar izin isteme. Önce mevcut kullanıcı değişikliklerini koru; uygun feature branch kullan; main'e otomatik merge etme. Bu yetki LIVE deployment, installer çalıştırma, gerçek müşteri mesaj/medya gönderimi veya ERP ticari kayıt yazımı için izin değildir. LIVE'da geri dönüşü zor değişiklik, veri kaybı, gerçek müşteri/ticari kayıt veya credential riski varsa somut değişikliği ve geri dönüş planını hazırla, açık onay iste.

REV3 yalnız `candidate/rev3` alanına aittir. Mevcut installer'ı bu repodan çalıştırma; owner/SID/manifest korumasını atlatma. Normal owner, yol uyarlaması, manifest ve geri dönüş incelemesi kanıtlanmadan kurulum/deploy yapma. `.env`, token, credential, müşteri exportu, runtime/log/upload veya eski PC bağımlılığını çıktıya ya da Git'e koyma. Sırları maskele; `.env` içeriğini raporlama.

## Doğrulama ve kapanış

İzole regresyon için `docs/BASELINE.md` içindeki guard'lı komutları kullan. Gateway package `smoke`/`smoke:local` komutları eski monorepo yoluna gider; bu repoda çalıştırma. Provider/SQL erişimi yapan veya `server.js` başlatan komutu sıradan test sanma. Build ve sentetik test sonucu gerçek mesaj/medya/ERP kullanıcı kabulünü kapatmaz.

İlgili gerçek kullanım kabulü doğrulanmadan maddeye PASS/yeşil/tamamlandı yazma. Build/test geçtiyse yalnız o kanıtı yaz; manuel kabul eksikse `TEST BEKLİYOR` veya `Durum doğrulanmadı`, erişim engeli varsa somut `FAIL-BLOCKED` nedeni kullan. Runtime rollback denenmediyse hash kanıtını tatbikat olarak sunma. Kabulü kim/ne/nasıl doğruladı ve doğrulanamayan sınırlar birlikte raporlanır. Plan/status ancak yeni kaynak veya kullanıcı kabulü ile güncellenir; geçmişi ve mevcut içerikleri koru.

Varsayılan model `gpt-6.1-sol`, effort `medium`; zor reviewer incelemesi `high` olur. Astra yalnız çok zor mimari belirsizlik için ve o PC'de desteklendiği doğrulanınca seçilir. Model/effort desteklenmiyorsa sessizce başarı varsayma; sınırlamayı açıkça raporla ve desteklenen seçimi belirt. Ana konuşmanın model seçimini repo ayarları değiştirmiş sayma; yeni oturumun etkili ayarlarını kontrol et.

Son rapor kısa olsun: seçilen madde, değişen dosyalar, yapılan kontroller, gerçek kabul/eksikler, gerçekten oluşan branch/commit/PR. Oluşturulan PR'ı çalışmaya iliştir.
