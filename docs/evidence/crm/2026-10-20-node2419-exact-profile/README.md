# CRM06/E02 — 7ba uygulama kaynağı için ayrı Node24.19 profili

20 Ekim 2026 · `DOT-CRM-NODE2419-EXACT-PROFILE-20261020-1759`

Mevcut7ba pasif CRM paketi Node24.15 ile üretilmişti. Ortak toolchain eşliği Node24.19 istediğinde bu artefaktın metadata'sını değiştirmek uygun değildir. Kaynak builder'a, **aynı7ba uygulama commit/tree'sine bağlı ayrı ve kapalı `crm20261020-node-v24.19.0` profili** eklendi. Eski `crm18-node-v24.19.0`/439 profili ve retleri korunur. **Bu teslim yalnız source/offline profil hazırlığıdır; gerçek Node24.19 paket üretimi, TEST kurulumu veya insan kabulü değildir.**

## Exact hedef ve ön kontrol

Kanonik repo/origin/feature ve temiz başlangıç7ba doğrulandı; mevcut8worktree korundu, diğer7clean. Başka görünür profil yazarı yoktu, görünmeyen kuyruk UNKNOWN. Root iki uygulama/test dosyasının ve bu dar STATUS/kanıtın tek yazarıdır. Mevcut reviewer salt okunur bağımsız inceleme yaptı; yeni ajan yok, turda en çok2aktif ajan. Native Goal araç kaydında PAUSED. Cache yazan delivery preflight bu tur çalıştırılmadı.

| Alan | Yeni profilin kabul ettiği tek değer |
| --- | --- |
| Module API preparationProfile | `crm20261020-node-v24.19.0` |
| Uygulama commit | `7ba6e4ebc8b70019136d603e6307741189ba03c1` |
| Uygulama tree | `db824c8a10b030faee6ea84a69cbb3cf86d7293a` |
| Repo | `C:\Sirket\CRM\melisa-crm` |
| Releases | `C:\Sirket\CRM\releases\node-v24.19.0` |
| Node | `C:\Sirket\ERP\tools\node-v24.19.0\node.exe` |
| Sürüm / platform / mimari | `v24.19.0` / `win32` / `x64` |
| Binary SHA256 | `3602f2bb1a10f2cbab4c36886218a33c1ab3db87290e73b033c46c77147d0237` |
| Gateway lock SHA256 | `c487dc65e3a107f5235408fad3523c8242a4c01b62c7475154ad4ae41a627b96` |
| Frontend lock SHA256 | `9064a36a0c86464db93cc261ffedbc92a87ea2092315e207301ca8a8aa6d4d24` |
| isolatedPreparation | `true` |

Commit/tree ve iki lock hash'i gerçek Git nesnelerinden okundu. Lock hash'leri, önceki pasif24.15 paketin mevcut manifestindeki ham LF bayt kimlikleriyle eşleşti. Windows checkout CRLF dosya hash'leri pin olarak kullanılmadı. Onaylı24.19 executable dosyası yalnız okundu ve SHA256 eşleştirildi; Node24.19 süreci veya gerçek builder başlatılmadı.

Builder teslim commit'i ilerlese de hedef uygulama commit/tree'si yukarıdaki7ba/db824 olarak kalır. Kaynak kodun teslim SHA'sı, bir paket üretildiği veya paketin uygulama kaynağının yeni HEAD olduğu anlamına gelmez. Önceki24.15 artefaktı, başarısız staging ve eski24.19 paketleri değiştirilmedi.

## Minimum kod farkı ve korunanlar

`deploy/test-package.mjs` içine ayrı frozen literal tuple eklendi. `createTestPackage` ve mevcut en dar `node2419ReleaseRoot` seçicisi, iki açık profile case'i tanır. Seçilen profil kendi commit/tree'sini doğrular; old/new tuple karışımı reddedilir. Genel root/commit/hash listesi, caller-supplied pin, suffix türetme, otomatik fallback veya yeni API/CLI yok.

LF normalize kaynak karşılaştırmasında şu7bölüm başlangıç7ba ile aynı: eski439 profil literal'i; source/payload/private-content/path/link/reparse ve verifier; temiz offline environment ve bounded npm resolver/install; Node24.19 pin kontrollerinin tamamı; varsayılan kanonik releases dalı; immutable build/seal gövdesi; CLI'nin tamamı. [Bölüm hash'leri ve sonuçlar](verification.json).

Manifest'in gerçek process Node-version/platform/arch eşliği, payload inventory, source Git blob'ları, secret taraması, hardlink/reparse/ancestor/binary/lock kontrolleri ve overwrite retleri korunur. Builder npm-ci hâlâ offline/ignore-scripts kullanır. CLI yeni preparationProfile argümanı kabul etmez; yeni profil yalnız mevcut module API'si içindir.

## Gerçek önce/sonra kaynak testi

Mevcut `tests/test-package-node2419.test.mjs` fixture'ı genişletildi. Gerçek builder kodu VM içinde sentetik process/Git/filesystem/digest gözlemleriyle çalışır ve **ilk mock staging mkdir sınırında** durur. Bu gözlemler üretim API'sine eklenmedi; gerçek Node dağıtımı, releases klasörü veya build oluşturulmaz. Mevcut verifier uyumluluk fixture'ları yalnız geçici sentetik dosyalar kullanır.

| Koşum | Sonuç | Kapsam |
| --- | --- | --- |
| Mevcut source + genişletilmiş aynı fixture | exit1;51test24PASS/27FAIL | Yeni profil mevcut kaynakta bilinmiyor; iki yeni pozitif sınır vakası da reddediliyor |
| Minimum source farkı sonrası aynı fixture | exit0;51PASS/0FAIL |23mevcut ve28yeni düz test; parent/subtest sayımı yok |
| Dar mevcut uyumluluk alt kümesi | exit0;4PASS/0FAIL | Sentetik tam package verifier, locked dependencies, güvenli verifier CLI çıktısı, bounded npm resolver |
| Syntax ve diff | PASS | Yalnız değişen iki JS/MJS dosyası ve dar diff |
| Bağımsız RO source review | AçıkP1/P2=0 | Reviewer test/build/runtime çalıştırmadı |

**27FAIL,27eski güvenlik açığı değildir.** Yeni negatif vakaların çoğu eski kodda unknown-profile ret kodu aldığı için beklenen profile-specific ret kodundan farklıydı. Regresyon, izinli yeni profilin iki pozitif yolunun mevcut source'ta kullanılamadığını gösterir; değişiklik sonrası granular retler ve eski profil de aynı fixture'da doğrulanır.

Yeni vakalar yanlış source/tree, eski/yeni tuple karışımı, Node binary path/hash/version/platform/arch, gateway/frontend lock, repo/root/relative/nested/null/version root, isolation, symlink/hardlink/reparse ve mevcut immutable hedef retlerini kapsar. Profil seçmeden varsayılan kanonik hedef ve CLI davranışı da aynı kalır. Eski CAS/inbox/katalog/gerçek kabul testleri tekrarlanmadı.

```powershell
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap tests/test-package-node2419.test.mjs
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap --test-name-pattern='complete offline package verifies|verify CLI emits safe JSON|npm resolver uses only bounded|locked dependencies reject' tests/test-package.test.mjs
node --check deploy/test-package.mjs
node --check tests/test-package-node2419.test.mjs
git diff --check
```

## GitHub ve kalan ayrı aşama

Mevcut feature ve [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) kullanılır. Kaynak commit'i ve exact-source CI sonucu teslimden sonra bu aynı makbuza eklenir; eski CI yeni HEAD'e atanmaz. Son yalnız belge makbuzu `[skip ci]` ile ayrılır. Staged secret scan normal kurallarla yapılır; yeni ignore/istisna yok.

Sonraki hedef aynı sabit7ba uygulama kaynağı için, yeni profil üzerinden ayrı Node24.19 pasif paket üretimi/doğrulamasıdır. **Bu tur gerçek paket BUILD/VERIFY, dependency install/cache hazırlığı, kurulum veya shared Apply yapılmadı.** Hosted CI frontend build/offline source kontrolleri gerçek yerel pasif paket üretimi sayılmaz. ERP tarafında ayrı tutulan OLD_REUSE_SCOPE/yeniERPtuple/motor-proof bağımlılıkları bu profille kapanmaz.

Shared TEST/runtime/config/store/activation/cache/claim/lock/journal/SQL/QueryStore/görev/servis/prova, ERP sahibi veya deposu üzerinde işlem yok. LIVE/Vega/T1/main/tag/release, gerçek ticari kayıt/müşteri mesajı, ücretli API, ACL/kimlik/güvenlik istisnası yok. Goal PAUSED;25/12/13/0/74 ve GUI/fiziksel cihaz/CRM-UA11 insan kabulü aynı BEKLİYOR. Bu tek profil kaynak teslimiyle durulur.
