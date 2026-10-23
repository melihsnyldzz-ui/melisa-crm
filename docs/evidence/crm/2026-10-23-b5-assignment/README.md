# B5 / C01–C02 / CRM-UA11 — rol ve kaynak yeteneğiyle atama

23 Ekim2026. Bu, mevcut bitiş ağacının dar CRM kaynak düzeltmesi ve salt okunur erişim denetimidir. Yeni gereksinim, atama motoru, yardımcı servis veya kurulum değildir. Teknik kaynak sonucu, kurulu normal hesap kanıtı ve insan kabulü ayrı tutulur.

## Karar ve kurulu gözlem

[CRM-DEC-017](https://github.com/melihsnyldzz-ui/melisa-crm/blob/5342b4358d8cd7e0ffb606a93fa532e3049e6f55/PROJECT_DECISIONS.md#crm-dec-017--15-ekim-2026--sanal-personel-test%C3%A7isi-crm-alt-rol%C3%BC) personel için atanmış görüşme ve yanlış personel reddi; müdür için genel erişim/atama kontrolü ister. [Şirket LOCKED kararları](https://github.com/melihsnyldzz-ui/melisa-os/blob/bfa3b00f221f33c3a101a112adc34dbf82fb83f0/docs/operations/ecosystem-decisions.md) en az yetki, kişi başına hesap, TEST/gerçek veri ayrımı ve sırların korunmasını gerektirir. Bu dar çalışma MFA, ticari indirim veya tüm şirket yetkilerinin kabulü değildir.

- Kanonik root/origin/feature doğru, başlangıç belge HEAD9830bef ve dirty0. Kurulu clean CRM clone **bc8c307ee29f115b2bb7fd4e61f87e9bf482ba54**; UI62800/gateway62801 PID49984, yalnız UI loopback/LAN/Tailscale ve gatewayloopback. Kurulu server SHA256 **12ea8954d92356e7d3065dde32f961e9c6d9a16eae8f932bd291123a826c44e8**, önceki [kaynak/runtime eşlemesi](../2026-10-23-clean-network/README.md) ile aynı.
- Bu tur fresh publichealth API4194 **7b3d9b8b0c9198dc6eeb04de1db697b1d22271e9 / CLEAN-ERP-20261022-7b3d9b8b0c91**, native4196 **035fcc08d8f56cdd0cbc437a290285328fce1ec9 / CLEAN-ERP-20261022-035fcc08d8f5** gösterdi. İkisi aynı `MELISA_ERP_CLEAN_TEST_20261022`, ortam `e662fd94-d797-4b3b-938a-d143ad758b67`, synthetictrue/actualT1false. ERP sahibi B4'te ilerliyor; önceki035/035 snapshot'ı bugünkü uygulama eşliği diye taşınmadı. CRM yeni kurulum yapmadı.
- LAN62800 üzerinde credentialsiz dört **GET**: inbox, görüşme55, görüşme56 ve agents **401 / WHATSAPP_CRM_AUTH_TOKEN_REQUIRED**, data yok. Bu yalnız anonim erişim reddidir; atanmış/yanlış personel403 veya müdür200 kanıtı değildir.
- Kendi bağımsız IAB sekmesi normal giriş formunda açıldı; hazır personel/müdür oturumu bulunmadı. ERP'nin açık Chrome/ERP oturumları değiştirilmedi. Normal hesapla rol GUI denemesi **GUI DENENMEDİ**.
- Güncel ERP worktree `AGENTS.md` başındaki **ERP-DEC-069** okundu: yeni clean hedefte owner'ın DPAPI kaydını güvenli CUA belleğinden normal parola formuna aktarıp gerçek giriş yaptığı kabul edildi. Eski15Ekim blanket engeli bu clean hedefe genellenmedi. Bu CRM turunun IAB aracında belgeli yetenekler pageAssets/webmcp/cdp ve normal form işlemleridir; korumalı secret-reference/DPAPI form aktarımı sunulmuyor. Sır okuma/çıktı/pano/HTTP/process köprüsü, cookie/JWT enjeksiyonu veya farklı araçla ret dolanma denenmedi. Kullanıcıdan parola istenmedi.

## Rol kanıtının sınırı

| Davranış | Kanıt | Bu tur sonucu |
|---|---|---|
| Personelin atanmış görüşmeyi görmesi | Kurulu normal personel katalog/refresh owner kanıtı önceki ağ makbuzunda; kaynak `chatwootInboxService.js` agent filtresi ve detay denetimi | Önceki teknik kanıt REUSE; yeni personel GUI kabulü yok |
| Başka personele ait / atanmamış görüşmenin reddi | Kaynak `crmAuthService.js` personelde agent eşliğini zorunlu tutar; önceki clean owner HTTP kaydında stranger403 | Tarihsel teknik kanıt; yeni kurulu rol403 testi yapılmadı |
| Müdürün genel erişimi ve rol atama izni | Kaynakta mudur/patron `crm.view,crm.assign,crm.agents,crm.manage,crm.send`; personelde assign yok | Kaynak/önceki test içeriği; bu tur müdür GUI200 yok |
| Semih/Patron normal giriş ve yenileme | ERP sahibinin önceki açık devir kaydı; kurulu sourcebc8, eski üç örnek hesap korundu | Kabul edilmiş owner teknik sonucu REUSE; tekrar giriş yok |
| Clean kaynağın atama kapalı demesi | Kurulu bc8 kaynak projection/inbox `assign:false`, mesaj gönderimi kapalı | Atama başarı kabulü değildir; mutasyon denenmedi |

Mevcut `tests/clean-synthetic-profile.test.mjs` içindeki adı `manager` olan fixture **patron** rolündedir; gerçek `mudur` hesap/ekran kabulü diye sunulmadı. Eski testler yeniden çalıştırılmadı. Graph index12Ekim'de ve cited path'lerde `metadata_changed` olduğundan güncel disk kaynakları esas alındı; index/cache/altyapı kurulmadı.

## Somut hata ve dar düzeltme

Backend clean inbox/görüşme `assign:false` bildirirken frontend yalnız müdür/patron rolünden atama izni üretiyordu. Atama penceresi açılabiliyor; mevcut submit yolu gerçek Chatwoot adapterine gidiyordu. Clean profil provider sırlarını boşalttığından bu yol kapalı kalır; yetki yükselmesi veya başarılı gerçek atama iddiası yok. Bu uyumsuzluk normal müdür-atama kabulünü kanıtlamıyordu.

Yalnız `App.jsx` / `liveApi.js` değişti:

- Normal rol izni ile oturum, inbox ve ilgili görüşmenin açık retleri birlikte uygulanır. Bir kaynağın `false` bildirimi başka olumlu bayrakla ezilmez.
- Inbox capability normalizasyonda korunur; oturum açma, güncel inbox/sayfa okuma ve çıkışta kendi scope'uyla güncellenir. Menü, müşteri paneli, kuyruk ve onay penceresi aynı sınırı kullanır.
- Doğrudan atama handler'ları ve eski onay callback'i güncel oturum/inbox/görüşme ref'lerinden tekrar kontrol eder. Kaynak yeteneği kapanınca açık pencere kapanır/gizlenir ve çağrı yapılmaz.
- Desteklenen yönetici ataması ve capability bildirmeyen mevcut yönetici sözleşmesi korunur. Backend auth/rol/atama, mesaj, SQL, katalog, paidAI veya provider ayarı değiştirilmedi; clean gerçek Chatwoot yazısı açılmadı.

## Hedefli doğrulama

İlk11 yeni kontrol eski kaynakta **2 PASS /9 FAIL**; aynı11 düzeltmeden sonra **11 PASS**. Sonradan eklenen legacy yönetici ve gecikmiş görüşme/rol retleriyle son hedef **13 PASS /0 FAIL**. Son iki test için eski-kaynak red kanıtı iddia edilmedi. Denied durumda mock assign çağrısı0; desteklenen müdür yolunda aynı hedefe tek çağrı1. Bunlar yerel React hook/SSR ve API normalization kontrolleridir, gerçek tarayıcı veya insan kabulü değildir.

```text
node --import ./tests/offline-test-guard.mjs --test --test-concurrency=1 --test-name-pattern=B5 apps/frontend/tests/assignment-capability.test.mjs apps/frontend/tests/text-draft-app.test.mjs
```

Değişen izin/normalizasyonun doğrudan etkilenen7 uyumluluk kontrolü ayrıca PASS. Offline guard uygulama credential'larını temizledi ve dış/sabit TEST soketlerini engelledi; gerçek CRM POST/mesaj/sipariş/atama yazısı yapılmadı. `node --check` ve credential temizleyen mevcut `scripts/ci/build.mjs` başarılı. Build kanonik kaynakta yereldir; kurulu dist veya immutable paket değildir. Mevcut bağımsız reviewer dört source/test dosyasını salt okunur inceledi: açık **P1/P2=0**. App/normalizer/test review fiziksel hash'leri [verification.json](verification.json) içindedir.

## Teslim ve kalan tek erişim halkası

Kaynak mevcut feature/PR3'e teslim edilecek; exact CI sonucu izleyen makbuzda kaydedilecek. **SOURCE_UNAPPLIED**: kurulu CRMbc8 ve ERP sahibinin B4 kurulumu değiştirilmedi; yeni CRM paket hazırlama/restart/servis/SQL/hesap yazısı yok. Owner uygun zamanda exact kaynakla mevcut kurulum yolunu kullanır; ikinci paralel kurulum istenmedi.

Eksik normal giriş halkası, **bu CRM aracında korumalı örnek personel/müdür kimliğini normal forma sır sızdırmadan aktarabilen desteklenen oturum**dur. Bu eksik kaynak düzeltmesini veya ERP B4'ü durdurmadı. Gerçek kişi→görev/rol eşlemesi, kurulu personel/müdür GUI, fiziksel telefon/TC21 ve insan CRM-UA04/UA11 kabulü **BEKLİYOR**. C01/C02 sarı;25/12🟢/13🟡/0🔴 ve17başlık/74yaprak aynı.
