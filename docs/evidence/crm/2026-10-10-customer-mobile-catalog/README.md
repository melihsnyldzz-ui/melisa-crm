# Müşteriye özel mobil katalog — 10 Ekim 2026 TEST pilotu

## Semih yerel devir ve kaynak düzeltmesi

10 Ekim doğrudan kullanıcı talimatı sonrası yerel host SEMIH, başlangıç cwd=operationsRoot `C:\Sirket\CRM\worktrees\customer-mobile-catalog-20261010`, exact kanonik origin fetch/push, feature dalı ve temiz source5bac doğrulandı. Devir metni tam okundu ve SHA256 `bf4633fae003675f70ccf00807b4384fcc5d4e66303234b18a25d8758fddd564` eşleşti. Yalnız aynı feature dalındaki0aba5dc/14f25b2 belge commit'leri fast-forward alındı. Canonical checkout/ERP sohbeti ve başka süreçler değiştirilmedi.

Kaynak kusuru: genel `salesAgent/catalogAdapter` bütün ERP kataloğunu okurken kişisel katalog yalnız profile prices/ürün/fiyat satırı/seri kapsamını kullanıyordu. Düzeltme açık staff session locator üzerinden salt okunur snapshot üretir; kişisel modda arama/genel fotoğraf fallback'i yoktur. Aynı customer/conversation/actor/session, exact seçili fiyat/seri/cart fingerprint model öncesi/sonrası ve taslağa alma öncesi doğrulanır. Teknik taslak bekleyen oturum AI bağlamı olarak reddedilir; gerçek kullanıcıya giden boş oturum teknik sepetle doldurulmaz. İstemci ürün/fiyat gerçeği kabul edilmez; model context'i session/token/aktör/müşteri kimliği ve sayısal fiyat içermez.

| Yeni kaynak kanıtı | Sonuç / sınır |
| --- | --- |
| Birleşik11 hedefli test dosyası, offline-test-guard |220/220 PASS; ephemeral loopback/sentetik veriler, gerçek provider/SQL yok |
| Lockfile dependencies | Gateway139/frontend91, offline ignore-scripts; runtime packages değiştirilmedi |
| Frontend build | PASS; JSX source derlendi, ekran kabulü değildir |
| Syntax | PASS; yeni modüller ayrıca kontrol edildi |
| Bağımsız reviewer | Kaynakta açık P0/P1/P2 bulgusu yok; geciken politika sırasında sepet değişimi regresyon testi mevcut |
| UI kontrolü | BLOCKED; computer-use Windows browser URL'sini güvenilir belirleyemedi ve oturumu sonlandırdı; engel aşılmadı |
| Gerçek AI / yeni gönderim / native create | Bu devamda0; önceki makbuzlar salt okunur metadata olarak doğrulandı |
| Kişisel kullanıcı oturumu | Journal'daki gönderilmiş exact oturum bulundu; süre dolmamış/iptal edilmemiş/boş/teknik pending yok |
| Çalışan edge | PID53468,100.87.188.3:62600/source5bac korundu; manifest hash önceki kanıtla aynı |

**PARTIAL — kaynak teslimi ile runtime ayrı:** Eski edge yeni `sales-context` endpoint'ini içermez. PID53468/normal624 süreçleri korunurken düzeltme kurulmuş sayılamaz; same-session/cart dağıtım uyumu, normal ekran, mevcut gerçek AI ve telefon kabulü açık. Runtime'da origin/provider/key/model/rol ayarı değiştirilmedi; link ve mesaj yeniden üretilmedi/gönderilmedi. Secret scan ve exact remote HEAD/CI sonucu Git tesliminde ayrıca kaydedilir. Önceki502'nin kesin nedeni bilinmiyor; yeni güvenli hata sınıflandırması teşhis kabiliyetidir, geçmiş kusurun kapanışı değildir. OS DEC-005 ile CRM unconfigured MOQ farkı korunur ve yeni ticari değer etkinleşmez. Finish-tree25/12/13 aynı kalır.

Kullanıcının yeni talimatı mevcut CRM'den yalnız doğrulanmış owner7733 / konuşma55'e katalog göndermek, kullanıcı onaylı 6/4 parça TEST seri örneğini kullanmak ve native izole TEST taslağını ayrı geri okumaktır. Telefon denemesini kullanıcı yapacaktır; uzak Galaxy erişimi veya telefonun önceden online görünmesi gönderim kapısı değildir.

## Çalışan kaynak ve sınır

- Dal: `codex/customer-mobile-catalog-20261010`; [draft PR10](https://github.com/melihsnyldzz-ui/melisa-crm/pull/10), base `codex/crm-agents-on-completion-20261003`.
- Çalışan uygulama source: `5bacd1c8739703ebbe199e6c09e7bd746e4ab23c`. Sonraki belge commit'i çalışan paket kaynağı değildir.
- Semih immutable paket: `C:\Sirket\CRM\worktrees\releases\crm-shared-test-5bacd1c8739703ebbe199e6c09e7bd746e4ab23c`.
- Manifest SHA256: `f6f8fc9baba7c49f1f8ab4ddb8b9d83cd6377f2290770c1ff067c8c86ac178c3f`.
- Yeni runtime: `C:\Sirket\CRM\runtime\CUSTOMER-CATALOG-TEST-20261010`; yeni katalog süreci PID53468 yalnız `100.87.188.3:62600` Tailscale arayüzünde. Mevcut LAN/loopback626 ve normal624 süreçleri durdurulmadı.
- Native62604 source `7b083a628628c59f7930a1571992fadaccb0ac7a`, yalnız `MELISA_ERP_CRM_SHARED_TEST_20261009_01` / `ISOLATED_TEST_COPY`. Taslak sözleşmesi stok/cari/tahsilat/rezervasyon/dış işlem/otomatik işler etkilerini false tutar.
- Owner telefonundan otomatik cari eşleme kanıtı yoktur. Mevcut onaylı TEST müşteri593 gerekçesiyle kullanıldı; gerçek telefon-müşteri bağı diye sunulmadı. Katalog ilker16 salt okuma, native taslak seller15 güncel `sales.create` kontrolü kullanır; kalıcı roller değişmedi.

Private input/profile, erişim token'ları, parolalar, tam telefon, gönderilen kişisel link ve capability bu kanıta veya Git'e alınmaz. Link RAM'de üretilir; diskteki müşteri oturumunda yalnız SHA256 özeti vardır. Operatör yardımcıları repo dışında, gözden geçirilmiş ve hash doğrulanmış olarak kullanıldı.

## Gerçek pilot kanıtı

Semih pilotu tek çalışmada şu aşamaları verdi:

Son journal zamanı `2026-10-09T23:48:16.810Z` (10 Ekim02:48 Türkiye). Gözden geçirilmiş pilot SHA256 `03e944a8c414315a8bd17c918d74c5d972032f7cabf1a6694deb85548c4a4c2e`.

1. `PILOT_EDGE_READY` — sealed paket ve private profil ile ayrı Tailscale katalog servisi açıldı.
2. `PILOT_CATALOG_AND_PHOTOS_VERIFIED` — iki güncel kaynak ürün, seçilebilir TEST seri etiketi, gerçek adet fiyatı ve korumalı fotoğraf byte/type okumaları geçti.
3. `PILOT_REAL_TEST_DRAFT_VERIFIED` — teknik prova oturumunda iki A6 ve bir B4, 16 parça / `1702.00000000 TRY`; gerçek native taslak id12 POST ardından ayrı GET aynı taslak UUID/id, sepet ve toplamı doğruladı. Bu teknik sepet kullanıcı siparişi değildir. Sentetik1680TL beklentisi gerçek kaynak toplamı olarak kullanılmadı.
4. `PILOT_OWNER_SEND_CONFIRMED conversation55` — kullanıcı için ayrı, boş sepetli kişisel oturum bağlantısı mevcut normal624 CRM üzerinden yalnız owner55'e bir kez gönderildi. Aynı UUID/tam gövdeyle ayrı salt okunur durum kontrolü `CONFIRMED`, `providerMessageIdPresent=true`, `chatwootMessageIdPresent=true` verdi. İkinci gönderim veya yeni UUID ile tekrar yoktur.

| Gerçek kaynak / makbuz | Doğrulanmış değer |
| --- | --- |
| A ürün31901 | Adet `109.25000000 TRY`; TEST seri6; iki seri12 parça. |
| B ürün32431 | Adet `97.75000000 TRY`; TEST seri4; bir seri4 parça. |
| Native taslak | id12; requestId `bbce2f0e-a0aa-4686-8257-a4730d1c12d8`; toplam `1702.00000000 TRY`. |
| Owner mesaj yeniden deneme kimliği | `4db072a8-d3ae-4b8a-ad5d-a54ddc77c384`; sendError=null. |
| Mesaj SHA256 | `bc49bea6e83297441bce702719312b7f4ea06a0e9fa1cbdc5654af2e0e2a6cb4`; metin/link yayınlanmaz. |
| Kullanıcı link son geçerlilik zamanı | `2026-10-10T23:48:12.515Z`; capability yayınlanmaz. |

EvdekiPC'den gerçek Tailscale adresinde bağımsız HTTP kontrolü: `/katalog` 200 / HTML ve derlenmiş varlık referansları; remote `/api/test-admin/session` 403; token'sız `/api/customer-catalog/session` 401. Bu ağ/API sınırı kanıtıdır, tarayıcı render veya telefon kabulü değildir.

Gönderilen mesaj Tailscale'in açık olması gerektiğini, seri dağılımının TEST örneği olduğunu ve kayıtların yalnız izole ERP TEST taslağı oluşturduğunu açıkladı. Provider+CRM kabulü telefona teslim/okundu anlamına gelmez.

Son listener kontrolünde mevcut62400/01 PID79256,62402 PID67632,62403 PID68084,62404 PID44548; mevcut LAN/loopback62600/01 PID76400,62602 PID54580,62603 PID30164,62604 PID70392 aynı kaldı. Eklenen tek katalog listener'ı yeni Tail62600 PID53468'dir.

## Mevcut AI akışı

Katalog gönderim makbuzundan sonra normal624 CRM'nin mevcut `sales-draft` yoluna konuşma55 için bir kez açık manuel istek verildi; `draftContext:null`, katalog araması ve teknik prova sepeti aktarımı yoktur. Gerçek sonuç `AI_PROBE_READY`: owner doğrulaması, copilot modu, insan inceleme gereği, `autoSend=false`, `erpWrite=false` ve `readOnly=true` geçti. Öneri yalnız RAM'de doğrulanıp atıldı; bu probe WhatsApp mesajı veya native kayıt yazmadı. Mevcut aktör DTO'sunda `paidAiEnabled` alanı yoktu; bu durum AI kapalı kanıtı sayılmadı, gerçek AI çağrısı başarıyla sonuçlandı. Provider/key/model/otomatik bot/ortak626 kapıları değiştirilmedi.

Bu ilk probe modelin mevcut CRM yolunda öneri üretebildiğini gösterir. Aşağıdaki yeni öneri, operatör incelemesi ve gerçek karşı yanıt gönderimi ayrıca doğrulandı; eski konuşma veya teknik prova sepeti yeni kullanıcı seçimi sayılmaz.

Gönderim sonrası incoming12610 (`2026-10-09T23:53:22.000Z`) salt okunur doğrulandı. RAM'de tam metin SHA256 karşılaştırması gönderilen katalog mesajıyla birebir aynı çıktı; bu kopya/echo kaydı “açıldı” yanıtı veya telefon kabulü değildir. Tam link/metin kanıta alınmadı. Bu bağlamdaki ilk copilot önerisi `AI_CATALOG_UNAVAILABLE` /502 ile durdu; mesaj gönderilmedi. Ardından onaylı iki ürünün normal624 gateway ve doğrudan62402 kart GET'leri200, current CANONICAL_TEST/noncached/actor doğrulamalı geldi; canonical4144 sağlık kimliği de geçti. Genel katalog kesintisi veya telefon açma başarısı bu sonuçlardan çıkarılmadı. Mevcut kaynak/roller/servisler değiştirilmedi.

Belirsiz kopya bağlamı için açık operatör mesaj taslağıyla mevcut copilot'a bir kez yeni açıklama isteği verildi; planner/katalog kaynağı ve bütün konuşma/yetki/etkisizlik kontrolleri korundu. Sonuç `AI_OWNER_REVIEW_READY`, copilot/insan inceleme/otomatik gönderim kapalı/ERP yazımı kapalı/salt okunur/konuşma değişmedi kontrolleri geçti. Model normal624 kaynağından iki ürün önerdi (`erp-301982`, `erp-367241`); bunlar kişisel TEST kataloğunun iki ürün kapsamı değildir. Operatör bu ilgisiz önerileri metinden çıkardı, şirket adını Melisa Bebe olarak düzeltti ve yalnız TEST açıklaması, bağlantının açılması ve sonraki seçimi soran metni onayladı. Teknik prova sepeti kullanıcı seçimi diye verilmedi; farklı kaynak ürün/fiyatı kişisel katalog gerçeği sayılmadı. Bu pilot genel otomatik satış veya kişisel katalogla otomatik AI ürün eşlemesi kabulü değildir.

- Orijinal model yanıt SHA256: `96e9b6f3d84de315b9e6f11662d0be2e386b62fcfba16932d1deb70ddb9b7f22`.
- Operatör tarafından incelenen son metin SHA256: `5909dbeffd4fc46bb9fc70056d7579503a06db60b2b6f850fd46915fbcba1d9c`.
- İncelenen konuşma revizyonu: `59d19e96d14636b29b57535d78fc4149589f17aea770cef42ce674eb7c79068b`; normal gönderim bu revizyonu ve son incoming12610'u yeniden doğruladı.

Gerçek tek karşı yanıt mevcut normal624 CRM üzerinden gönderildi: `AI_OWNER_SEND_CONFIRMED`. Aynı UUID/tam gövdeyle ayrı salt okunur durum kontrolü provider ve Chatwoot kimliği varlığını doğruladı. Sender yeni AI çağrısı veya native yazma yapmadı; `autoBot=false`. Onaylanan metin, gönderim kabulü ve telefon kabulü ayrı kanıtlardır. Sender'ın sabit çıktısında `updatedAt` yoktur; kesin API gönderim zamanı iddiası eklenmedi.

| AI karşı yanıt makbuzu | Doğrulanmış değer |
| --- | --- |
| Konuşma / son incoming | `55` / `12610` |
| Send UUID | `2cf768f7-1478-4c73-a592-44595b5cc47c` |
| Gönderilen yanıt SHA256 | `5909dbeffd4fc46bb9fc70056d7579503a06db60b2b6f850fd46915fbcba1d9c` |
| Kontroller | `operatorApproved`, `catalogSendConfirmed`, `ownerVerified`, `conversationUnchanged` = true |
| Gönderim / ayrı durum kontrolü | `messageSendAttempted`, `statusReadAttempted` = true |
| Makbuz | `CONFIRMED`; `providerMessageIdPresent`, `chatwootMessageIdPresent` = true |
| Sender etkisi | `aiRequestAttempted`, `nativeWriteAttempted`, `autoBot` = false |

Güvenli sonuç görüntüsü checkout dışında `catalog-lab/evidence/ai-owner-send-confirmed.jpg` olarak tutuldu; capability/token/tam telefon/mesaj gövdesi Git'e taşınmadı. Tek onaylı karşı yanıtla bağımsız çalışma tamamlandı. Katalog PID53468 açık bırakıldı; yeni watcher/otomatik bot veya başka alıcı gönderimi yoktur.

## Doğrulama ve açık kabul

Yerel geniş offline koşu1.063/1.063; sonraki core/adapter28/28, hesap/shared/runtime11/11, edge/profile/paket35/35 ve frontend15/15 geçti. Build/syntax ve redacted staged/exact source history secret scan yeni bulgu0. [Çalışan source Actions](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/38004507159) GitHub hesabının ödeme/harcama engeliyle başlamadı; CI yeşil veya test başarısızlığı diye sunulmaz.

Kullanıcı telefon açma/filtre/sepet/özet geri bildirimi ve gerçek kullanıcı seçimi henüz kabul edilmedi. Incoming kopyası bu kabulü sağlamaz; incelenmiş AI karşı yanıtının gerçek gönderimi yukarıda ayrı kanıtlıdır. Önceki sentetik fixture render denemesi browser client tarafından engellendi; [tasarım QA](../../../../design-qa.md) render PASS değildir. Gerçek API/native/gönderim kanıtı bu görsel boşluğu kapatmaz. Mevcut ortak626 gönderim/AI kapıları açılmadı; LIVE/main ve önceki 25/12/13 insan kabul sayımı korunur.
