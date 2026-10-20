# CRM UI sadeleştirme — görsel erişim engeli ve salt okunur kaynak incelemesi

20 Ekim 2026 · `DOT-CRM-UI-SIMPLIFY-20261020-1150`

**UI geliştirmesi başlamadı.** Seçili Library referansları mevcut; bu Windows tüketicisinde içeriklerini indirecek desteklenen materialization çağrısı açık değil. PDF/ZIP byte'ları ve PNG pikselleri açılmadı. Bu bir 403, dosya yok veya yanlış Library ID sonucu değildir; dosya isteği yapabilecek araç bulunmadı. Görsel uygunluk, build, tarayıcı veya insan PASS yok.

## Ön kontrol

- Kanonik `C:/Sirket/CRM/melisa-crm`, exact fetch/push origin ve `codex/crm-agents-on-completion-20261003` doğrulandı; başlangıç `6864de104095f240e012198fcaea21ce5cf072bf`, ağaç temiz.
- Sekiz mevcut worktree temiz ve korundu; mevcut explorer/reviewer completed idi. Başka görünür aktif UI owner yoktu; görünmeyen kuyruk UNKNOWN. Yeni ajan/worktree/Goal/otomasyon/TEST yok. Native Goal PAUSED kaldı.
- Product Design image-to-code/index/critical-overrides/user-context okundu. Okunan `image-to-code/SKILL.md` Workflow1: **“A written brief is not enough.”** Yorum: yalnız ID ve yazılı üç öneri, pikselleri görmüş olmanın yerine geçmez. Kullanıcının aynı devirdeki bytes erişimi yoksa bunu bildirme sınırı da uygulanır.
- Product Design'ın salt okunur context preflight'ı `missing` verdi; yeni context oluşturulmadı. Mevcut Melisa checker bir kez CHECK_REQUIRED/exit3, changed=false/cacheSaved=true: iki CRM REUSE, eski normal GUI önkoşulu BLOCKED. Bu, runtime sağlığı veya insan kabulü değildir.

## Seçili kaynakların erişim kararı

| Kaynak | Verilen Library ID | Bu executor sonucu |
| --- | --- | --- |
| Ana PDF | `libfile_6304ab1317e881918114c445ea9f1a61` | Byte erişimi yok; açılmadı |
| Son öneri ZIP'i | `libfile_7ec244e225448191842400f9129e50f2` | Byte erişimi yok; açılmadı |
| Önceki PNG1 | `libfile_d9ccf14034c88191be531ad547ae5f7d` | Pikseller görülmedi |
| Önceki PNG2 | `libfile_601b6d6a7e20819186b8f6987e96e415` | Pikseller görülmedi |
| Önceki PNG3 | `libfile_89b989c4e1988191904cf3a9e75e7538` | Pikseller görülmedi |

Erişilebilir `read_page_reference`, erişilebilir Page ID ve o Page'den gerçek reference ister; PNG/JPEG/GIF/WebP veya UTF-8 destekler, PDF/ZIP binary indirme aracı değildir. Çıplak `libfile_` ID'den Page ID, URL veya cloud/yerel yol uydurulmadı; bu araç desteklenmeyen argümanlarla denenmedi. Genel Node/terminal erişimi bir Library tüketici API'si sayılmadı. Desteklenen dosya aktarımı eksiği mevcut koordinatöre aynı task ID ile iletildi; ERP sahibine mesaj gönderilmedi.

## Gerçek kaynakta dar bağlanma haritası — uygulama değildir

Graph keşfi eski12Ekim metadata'sı nedeniyle actual source ile doğrulandı; negatif iddialar yalnız incelenen App/liveApi/nativeOrder yollarıyla sınırlıdır. Mevcut explorer bu incelemeyi salt okunur yaptı.

| Öneri | Mevcut kaynak ve gerçek alan | Korunacak sınır |
| --- | --- | --- |
| Sorumlu/atanmış görünürlüğü | `liveApi.js` konuşma DTO'sunda `assignedUserName`, `assignedUserId`, `owner`; `App.jsx` liste zaten `item.owner` gösterir, başlık `selected.owner` için mevcut bağlanma yeridir. | `assignmentEnabled`, `openAssignment/confirmAssignment` ve backend yetkili konuşma kapsamı korunur; yeni erişim üretilmez. |
| Sipariş/Fiş ana kısayolu; Video ikincil | `App.jsx`: `openCatalog` → `catalogProductAction('order')` → `ERPOrderDialog`; `openVideoPilot`/`isVideoContextCurrent` mevcut. | Mevcut yol ERP **taslağıdır**, gerçek fiş oluşturma API'si değildir. Güncel ürün/tek döviz/captureUiOperation kontrolleri korunur. |
| Üst kompakt sipariş özeti | Seçili konuşmanın `erpDraftContexts` alanları requestId/customerId/ürün/adet içerir; tam tutar içermez. `nativeOrderHistory` yalnız yetkili konuşmaların aynı aktöre ait recovery journal indeksidir; ERP arşivi değildir. Doğrulanmış receipt'te documentNo, request.documentCurrency, grandTotalExact4 ve satırlar vardır. | Konuşma/aktör bağını koru. `readbackRequired:true` kayıt ERP'den yeniden okunmalı; eski yerel tutar güncel ERP tutarı gibi sunulmaz. `draftOrderSeed` zaten liveMode'da kullanılmaz; bu ayrım korunur. |
| Ödeme ve teslim durumu | İncelenen native taslak/receipt yolunda tahsilat bakiyesi veya teslim/sevk durumunu okuyan alan/API yok. | `collectionEffect:false` ve `reservationEffect:false`, ödenmedi/teslim edilmedi demek değildir. Gerçek veri yokken iki ayrı durum Bilinmiyor/Bağlantı bekliyor; olmayan yazma disabled. ZIP'in açılmamış son önerisindeki kullanıcı talimatı uyarınca ödeme beklerken Mal gitti pasif kalacak; burada mali kural uygulanmadı. |

## Sonuç ve devam koşulu

Kaynak uygulama, backend normalGuard, rol/atama, taslak/receipt doğrulamaları ve mesajlaşma değişmedi. Test/lint/build çalıştırılmadı; yeni source CI veya UI screenshot yok. Bu dosya kaynak incelemesi ve erişim engeli makbuzudur; UI teslimi veya tasarım QA PASS değildir. C01/C02/U01/M01/CRM-UA11 ile25/12/13/0/74 ve önceki kabuller değişmedi.

Aynı işi sürdürecek eksik bileşen: seçili PDF/ZIP/PNG'lerin bu CRM executorunda desteklenen Library materialization ya da platformun gerçek host-file attachment/reference aktarımıyla açılabilmesi. Son ZIP önerisi ancak gerçek dosya açılınca karşılaştırılabilir; sonra mevcut gerçek UI'de dar uygulama, hedefli kontroller ve browser/mobil karşılaştırma yapılabilir. Yeni karar veya mali API uydurulması beklenmiyor.

Ortak SQL/runtime/config/servis/deploy ve aktif ERP işi korunur; LIVE/Vega/T1/gerçek müşteri veya mali kayıt/ücretli API/main merge yok. Son uygulama kaynağı6e47fb8, başlangıç belge HEAD'i6864de1'dir; bu yalnız belge kaydı aynı uygulamayı korur, kurulum sayılmaz. Sipariş→satış upstream sözleşme bağımlılığı ayrı açık kalır.
