# A04 / A05 — Öneri fotoğrafının render bağlamını koruma

20 Ekim 2026 · `DOT-CRM-TREE17-NEXT-SOURCE-20261020-2020`

## Somut hata ve değişen davranış

`SalesProductCards` fotoğrafları yalnız ürün ID'siyle saklıyor, ürün listesi veya token değişince eski state'i passive `useEffect` içinde temizliyordu. Aynı ID yeni bağlamda kaldığında, yeni props ile yapılan ilk DOM commit'inde önceki bağlamın blob fotoğrafı görülebiliyordu. Sonraki effect temizliği bu ilk commit'i geri almıyordu.

Mevcut source5c69 üzerindeki gerçek ReactDOM testi üç durumda eski URL'yi gözledi: aynı ürün listesi/yeni token; aynı ID/yeni ürün listesi; aynı ID'nin yeni listede fotoğraf uygunluğunu kaybetmesi. Foto state'ine onu üreten ürün-listesi/token aidiyeti eklendi. Render yalnız aynı bağlama ait fotoğrafı okur; image-error güncellemesi de kendi bağlamına bağlıdır. Aynı bağlamda fotoğraf kalır ve ek fetch olmaz. Yeni bağlam kendi fotoğrafı gelene kadar mevcut yükleniyor/fotoğraf-yok görünümünü kullanır.

Bağımsız review aynı sınırda mevcut bir P2 buldu: eski isteğin401/403 sonucu, yeni render'ın callback ref'ine eski passive session kapanmadan taşınabiliyordu. Gerçek React Suspense ile yeni render bekletilip eski request çözülünce token-only401 ve list-only403 vakaları yeni callback'e ulaştı. Render-ref/session geçerliliğine captured ürün-listesi/token eşliği eklendi. Eski bağlam geç yanıtı artık mevcut helper'ın close/current yolu ile kapanır; güncel401/403 kendi callback'ine gitmeye devam eder.

Değişen tek uygulama dosyası `apps/frontend/src/SalesProductCards.jsx` içindeki6dar satırdır. `createSalesPhotoSession`/cache implementasyonu, URL cleanup, fiyat/para birimi/ürün metni, taslağa-al aksiyonları, API/auth, normalGuard, CSS ve görsel tasarım değişmedi. Yeni framework/bağımlılık veya gerçek AI çağrısı yok.

## Gerçek önce / sonra

Yeni dar `apps/frontend/tests/sales-product-cards-context.test.mjs`, kurulu React19.2 ve **gerçek ReactDOM `createRoot` / `act`** ile gerçek bileşeni derleyip çalıştırır. Üst gözlemcinin `useLayoutEffect`'i commit edilmiş DOM'u child passive-effect temizliğinden önce okur. React hooks/state/effects/scheduler veya bileşen kaynak metni değiştirilmez. Mevcut esbuild yalnız JSX derler; external API, blob URL ve Image decode sınırları sentetiktir. Küçük inert DOM host yalnız testin kullandığı DOM yüzeyini sunar; gerçek tarayıcı/piksel veya normal GUI değildir.

| Koşum | Sonuç | Anlamı |
| --- | --- | --- |
| Yeni aynı fixture, eski uygulama kaynağı5c69 | exit1;5test2PASS/3FAIL | Üç yeni bağlamın ilk commit'inde eski blob fotoğrafı var |
| İlk render düzeltmesi, aynı fixture | exit0;5PASS/0FAIL | İlk commit doğru bağlamı gösterir; aynı bağlam ve hata fallback'i korunur |
| Review sonrası genişletilmiş fixture, owner guard öncesi | exit1;9test7PASS/2FAIL | Token-only401/list-only403 eski yanıtı yeni callback'e gider; güncel401/403 pozitif kontrolleri PASS |
| Son captured-context guard ile aynı genişletilmiş fixture | exit0;9PASS/0FAIL | Önceki5vaka + iki stale-auth negatif + iki current-auth pozitif; flat test sayımı |
| Mevcut dar uyumluluk, ilk render-fix aşaması | exit0;3PASS/0FAIL/0SKIP | Session close/late-auth ve gerçek SSR öneri fiyatı/aksiyon görünümü; guard ekinden önceki yerel koşum |
| Son bağımsız RO source/test/kanıt incelemesi | AçıkP1/P2=0 | İlk1P2 giderildi; reviewer test/build/runtime çalıştırmadı |
| Syntax / diff | PASS | Yeni test Node syntax; gerçek JSX esbuild ile derlendi, diff temiz |

```powershell
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap apps/frontend/tests/sales-product-cards-context.test.mjs
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap --test-name-pattern='suggested photos use|close/current-context loss|actual suggestion markup' apps/frontend/tests/sales-products.test.mjs
node --check apps/frontend/tests/sales-product-cards-context.test.mjs
git diff --check
```

## Karar / teslim / sınırlar

Yeni doğrudan kullanıcı devam kuralı CRM-DEC-022 olarak mevcut `PROJECT_DECISIONS.md`, `AGENTS.md` ve tek `CRM_STATUS.md` kaydına işlendi: [5c69c287ad41e547c145391d14445cae95d2c7a9](https://github.com/melihsnyldzz-ui/melisa-crm/commit/5c69c287ad41e547c145391d14445cae95d2c7a9), mevcut [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3), belge `[skip ci]`, bağımsız not incelemesi0 ve staged Gitleaks0. Aynı17başlık/74özgün yaprak korunur; yeni tracker/Goal/ana ajan/otomasyon yok. Root tek source/test/STATUS yazarıdır; mevcut reviewer'ın son bağımsız RO source/test/kanıt incelemesi açıkP1/P2=0 verdi.

Uygulama kaynağı [d1e4425206249e38445fb103e03601f86baa84ec](https://github.com/melihsnyldzz-ui/melisa-crm/commit/d1e4425206249e38445fb103e03601f86baa84ec) feature'a push edildi. Bu exact kaynak için [PR CRM CI39494069642](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39494069642)3job, [push CRM CI39494063152](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39494063152)3job ve [AI-offline39494069660](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39494069660)1job **SUCCESS/7job**. Final kaynak frontend build ve bütün offline kontrolleri CI'da geçti; ilkfix yerel3uyumluluk koşumundan ayrı kanıttır. Staged Gitleaks0bulgu, yeni istisna yok. Son yalnız belge makbuzu `[skip ci]` ile ayrılır; source CI yeni belgeHEAD koşumu veya gerçek TEST kurulumu/GUI/insan kabulü değildir. İki uygulama/test blobu kaynak commit'iyle birebir korunur.

Bu teslim **SOURCE_UNAPPLIED / GUI DENENMEDİ** durumundadır. Teknik ReactDOM host kanıtı, normal tarayıcı/gerçek cihaz veya çalışan insan kabulü değildir. USER_ACCEPTANCE.md ve CRM-UA11 BEKLİYOR, CRM25=12🟢/13🟡/0🔴 ve toplam74 aynı. Native Goal gerçek PAUSED; bu karar onu veya otomasyonu açmadı.

NativeOrderCAS564, inbox6e47, Nodeprofileed02 ve iki pasif7ba paket tekrar geliştirilmedi veya yeniden üretilmedi. Yeni uygulama kaynağı sabit7ba paketleri/ERP pinleri içine taşınmadı. Library görsel byte erişimi ve normal order→sale upstream sözleşmesi ayrı açık bağımlılıklardır; endpoint/Peşin müşteri ID'si/quote politikası uydurulmadı. Shared TEST/store/runtime/config/cache-lock/SQL/servis/görev/Apply/prova/kurulum veya ERP sahibine mesaj yok. Cache yazan preflight bu source/offline kapsamda çalıştırılmadı. LIVE/Vega/T1/main/tag/release/gerçek müşteri/ücretli API/ACL/credential/güvenlik yazısı yok.

Kalan13sarı CRM yaprağı, mevcut USER_ACCEPTANCE ve bridge/UI kanıtları salt okunur tarandı. Bu dar incelemede ikinci bağımsız hazır source kusuru kanıtlanmadı; bütün kod eksikleri bitmiş sayılmaz. İlgili açık halkalar upstream order→sale sözleşmesi, Library görsel baytları ve gerçek rol/mobil/reboot/işletme kabulüdür. Sonraki somut eşleme, mevcut ERP owner kurulum makbuzu erişilebilir olduğunda kaynak/paket/runtime kimliğini ve normal ekran sınırını okumaktır. Mevcut manuel owner işi kesilmez/yeniden başlatılmaz, ikinci iş veya mesaj verilmez.
