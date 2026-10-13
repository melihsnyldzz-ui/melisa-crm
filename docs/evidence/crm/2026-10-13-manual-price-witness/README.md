# E02 MANUAL fiyat witness — 13 Ekim 2026

Kaynak tüketicisi teknik hazır; shared runtime/native transaction/insan kabulü bekliyor. Eski fotoğraf ve mesajlaşma kabulü yeniden açılmadı. Yeni ekran kanıtı yok: bu kod henüz aktif CRM paketinde değil.

## Değişiklik ve sözleşme

ERP MANUAL overlay salePrices.pricing bilgisi CRM mapper ve seçili sale-line yeniden kurulurken kayboluyordu. Artık strict metadata doğrulanır, revision sürümü içerir, snapshot clone edilir. Signed64 canonical positive STRING Number'a çevrilmez. Kaynak fiyat nullable signed20integer/exact8 olarak korunur; etkili CRM fiyat limiti kaynak fact'e uygulanmaz.

SOURCE metadata yokken eski mapper çıktı/alan sırası/revision aynı; bütün SOURCE taslaklarda mevcut8-root/9-line JSON sırası korunur. Explicit SOURCE metadata yalnız null version ve effective exact ile aynı source fact şeklinde kabul edilir, witness üretmez.

En az bir MANUAL satırda root `pricingContract: melisa-crm-draft-pricing.v1`, o satırda `pricingWitness: {origin: MANUAL, versionId: string, sourcePriceExact8: exact8|null}` eklenir. Efektif tutar mevcut priceExact8'de kalır. Mixed SOURCE satırlar9alan. Bozuk/bilinmeyen/extrafield veya witness/discriminator uyumsuzluğu reddedilir. MANUAL0/null seçim fiyatını SOURCE ile doldurmaz.

Donmuş request/UUID/store-v2/actor-conversation key ve expectedSource korunur; receipt request deep equality yeni witness'ı içerir. Aynı UUID farklıversion conflict; tarihsel GET mevcut fiyatı yeniden seçmez. liveApi JSON ve deploy/test-erp-orders proxy complete body/readback'i budamadan iletir; iki token, crm.send, pre/post conversation access ve exactnative TEST kimliği sürer. Bu transport kaynağı değiştirilmedi.

## Authority / owner bağımlılığı

ERP owner teknik sözleşme şeklini uygun buldu. JSON witness veya client validation fiyat authority değildir. Aynı native transaction içinde registered CURRENT MANUAL pointer/version/source/identity kontrolü ve legacy/mixed SOURCE satırın aktif MANUAL'ı atlayamaması gerekir. Yeni create stale witness409/no record; aynıUUID completebody tarihsel replay-before-current-readiness; persisted request/hash/audit/readback successor ERP owner'ın işidir. Native SQL kanıtı bu CRM testlerinde yoktur.

ERP owner59c444f çalışan DB02 normal GUI MANUAL fiyat kaydını bildirdi; bu CRM yeni taslak kabulü değildir. Sharedconfig/DB/restart ERP owner'da. CRM1be immutable paket/candidate ve30f geçmiş teslimi korunur; yeni fiyat-witness paketi/aktivasyonu yapılmadı. Rol/credential/SQL/provider/AI/LIVE/main yazısı yok.

## Hedefli doğrulama

| Aşama | Sonuç | Kapsam |
|---|---|---|
| Adapter red → green | önce12PASS/5FAIL, sonra17/17 | legacy revision, metadata, source/null/zero, signed64, malformed |
| Frontend red → green | önce1PASS/3FAIL, sonra10/10 | 5 yeni E02,5 ilgili mevcut; actualadapter→DTO→selection→body, frozen/readback |
| Root transport | 2/2 | actualhandler+payload; sentetik POST/GET complete body, denial/kimlikte POST0 |
| High reviewer | 11/11 | adapter/frontend filtreli tekrar; önceki sayılara eklenmez |
| Son build | PASS | cleanproduction/offline guard;20,50sn compile, UI zamanı değildir |

Komut/hash/sınırlar verification.json'dadır. High reviewer final7kaynak/test dosyasında açıkP1/P2 yok; roottransport2 sonucunu yeniden çalıştırmadı. Existing bundle-size/dynamic-static import uyarıları yeni hata değildir. TeknikPASS normal/mobil/insanPASS değildir.

## Git / sonraki tek iş

Dal codex/crm-agents-on-completion-20261003; mevcut [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3), base feature/crm-completion. Source commit/push/head/CI makbuzu teslim sonrası eklenir. Mainmerge/tag/LIVE yok. E02 sarı ve sabit25/12/13/0 aynı. Sonraki bağlı iş: owner native successor kanıtı ardından exactpaket normal E02 taslak/readback/replay ve mobil/insan kabulü.
