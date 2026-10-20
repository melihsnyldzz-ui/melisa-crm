# CRM06 / E02 — bekleyen taslak işlemini aynı kayda bağlama

20 Ekim 2026 · `DOT-CRM-ORDER-RECOVERY-CAS-20261020-1515`

Native sipariş taslağı A'nın GET yanıtı beklenirken aynı aktör/konuşma journal'ı B ile değiştirilebiliyordu. Eski `resolved(actor)` B'yi yeniden okuyup A makbuzuyla çözülmüş işaretliyordu. Önceki GET404 sonrasında A'nın yanlış POST edilmesi ve POST sonrasında B'nin yeni recovery başlangıcı olarak benimsenmesi de mümkündü. **Dar kaynak düzeltmesi çevrimdışı doğrulandı; kurulu uygulama veya gerçek kullanıcı kabulü değildir.**

## Başlangıç ve değişiklik sınırı

- Kanonik root ve fetch/push origin doğrulandı; mevcut `codex/crm-agents-on-completion-20261003` dalı, temiz başlangıç `c034e4ea3a8ea8b06626c913eacd26ffdcdd7a45`. Mevcut sekiz worktree korundu; başka görünür CAS yazarı yoktu, görünmeyen kuyruk UNKNOWN.
- Kesilen turda uygulama/test değişikliği yoktu. İki tamamlanmış mevcut RO alt ajan bulgusu okundu; keşif veya hazır iş çoğaltılmadı. PR13/14/18/20'deki nativeOrder source blob'u da başlangıçla aynıydı; hazır CAS düzeltmesi yoktu.
- Root kaynak/test/STATUS tek yazarı; mevcut reviewer son farkı bağımsız ve salt okunur inceledi. Yeniden başlayan turda aynı anda en çok2aktif ajan (root+mevcut reviewer), yeni ajan yok. İncelemeci test/build/runtime çalıştırmadı.
- Native Goal gerçek araç kaydında PAUSED. Bu kaynak/offline görevde cache yazan delivery-checks çağrısı çalıştırılmadı. Shared runtime/config/SQL/servis/lock ve P03 sahipliği incelenmedi veya değiştirilmedi; P03 runtime UNKNOWN.

## Değişen davranış

1. Store `assertCurrent`, yalnız UUID'yi değil tam captured envelope'u taze journal ile karşılaştırır: version, nativeActorId, conversation/customer/customerMatch, tam payload ve fiyat tanığı, expectedSource ve resolved durumu.
2. Private recovery aynı yakalanan kaydı GET öncesinde, GET/404 sonrası ve resolve öncesinde korur. Submit, eski kaydın404 kontrolünden POST'a geçerken yeniden karşılaştırır. Journal değiştirilmiş/silinmiş/bozulmuşsa yanlış POST veya B için yeni GET başlatılmaz.
3. Başarılı GET'le kayıt resolved olduktan sonra dış async çağrıya dönüşte de güncel context ve beklenen tam resolved envelope kontrol edilir. Public recover, önceki kaydı okuyan submit, belirsiz POST hatasından geri okuma ve son readback dönüşleri aynı korumayı kullanır. Kapanmış context'e receipt verilmez.
4. `newIntent`, bu store instance'ının son başarılı resolved geçişinin kopyasına bağlıdır. Daha sonra okunan B bu kopyayı değiştirmez; eski A ekranı B'yi silemez. Yeniden açılışta aynı UUID'nin başarılı readback'i yeni intent'e izin verir.

v2 kalıcı kayıt biçimi, ERP endpoint'i, fiyatlama/receipt doğrulaması, normalGuard ve UI görünümü değişmedi. Değişmeyen pending404 yalnız orijinal tam payload/UUID'yi tekrarlar; resolved404 hiçbir zaman POST yapmaz. Aktör/konuşma/source ve manuel fiyat tanığı doğrulamaları sürer. Bu, async sınırlar için fail-closed compare/write korumasıdır; localStorage/sessionStorage için dağıtık kilit veya atomik çok-sekmeli transaction iddiası değildir.

## Önce hata, sonra düzeltme

Node `v24.15.0`, mevcut offline guard, Map tabanlı tarayıcı storage fixture'ı ve kontrollü deferred Promise/microtask kullanıldı. Gerçek HTTP/ERP/SQL/provider/tarayıcı açılmadı. Ham yerel TAP yerine yalnız sentetik kapsam ve sayımlar yayımlandı. [Makine makbuzu](verification.json).

| Aşama | Sonuç | Ne gösterdi? |
| --- | --- | --- |
| Başlangıç gerçek source + additive native regresyonlar | exit1;48Node:18PASS/30FAIL | GET200/404, POSTsuccess/error ve stale newIntent açıkları;43yaprak+5parent |
| İlk aynı-kayıt düzeltmesi, aynı fixture | exit0;48PASS/0FAIL | İlk yarışlar kapandı; iş henüz son review'dan geçmedi |
| Başarı sonrası dış continuation için8ek vaka, ilkfix üzerinde | exit1;57Node:48PASS/9FAIL | Dört recovery yolu × journal/context değişimi;8yaprak ve1parent FAIL |
| Son düzeltme, genişletilmiş aynı fixture | exit0;57PASS/0FAIL |51yaprak+6parent;5mevcut legacy test ve46native yaprak |
| Doğrudan etkilenen uyumluluk alt kümesi | exit0;7PASS/0FAIL | Reopen/history/actor isolation/newIntent, iki satır/exact8, response loss, manuel witness ve frozen source |

Parent testler ayrı işletme kabulü sayılmaz. Geniş baseline, önceki tarayıcı/medya/katalog kabulleri tekrarlanmadı. İlk kaynak incelemesindeki1P2, başarılı iç recovery ile dış await dönüşü arasındaki açıklıktı; kaynak değişmeden8ek microtask vakasıyla FAIL üretildi, sonra düzeltildi. Son bağımsız RO kaynak/test incelemesinde açıkP1/P2=0.

Tekrarlanabilir dar komutlar:

```powershell
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap apps/frontend/tests/erp-order-recovery.test.mjs
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap --test-name-pattern='reload restores original UUID|different actors and no longer visible|confirmed receipt card|E02 frozen manual UUID|response loss resolves|new native draft retains|native two-line body' apps/frontend/tests/native-order-history.test.mjs apps/frontend/tests/goal4-canonical.test.mjs
node --check apps/frontend/src/lib/nativeOrder.js
node --check apps/frontend/tests/erp-order-recovery.test.mjs
git diff --check
```

## GitHub, kurulum ve kalan kabul

Mevcut [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) ve feature kullanılacak; kaynak commit'i oluşunca exact-head hosted CI sonucu bu makbuza eklenecek. Eski PR veya source CI'si devralınmadı. Staged secret taraması commit öncesi zorunlu; ignore/rule/exception değişikliği yok.

**SOURCE_UNAPPLIED; paket/build/kurulum/runtime/normal GUI DENENMEDİ.** Fiziksel cihaz, gerçek Windows reboot/logon ve CRM-UA11 insan kabulü BEKLİYOR. Bu görev için ekran kanıtı üretilmedi; offline unit/sentetik kontrol ekran veya gerçek kabul diye sunulmaz. Son kurulu source6bc82e6 yalnız önceki owner kaydıdır, bu tur taze runtime kimliği değildir.

25CRM=12tamam/13kısmi/0açık ve toplam74 kapsamı korunur. UI görsel aktarımı bekleyen ayrı iş, CRM06/E02'nin ayrı order→sale upstream sözleşme bağımlılığı ve ERP tek shared-owner sorumluluğu kapanmaz. Yeni ERP sözleşmesi/satış motoru/auth/quote-policy geliştirilmedi; LIVE/Vega/T1/main/gerçek müşteri verisi veya mesajı/ücretli API kullanılmadı. Bu tek kaynak işi GitHub makbuzu tamamlanınca durur.
