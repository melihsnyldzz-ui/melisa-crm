# Melisa Satış Asistanı — Güncel entegrasyon

4 Ekim2026: PR6 V1 çekirdeği mevcut feature'a cca48e1 ile alındı;743c6ae normal CRM öneri ekranı ve gerçek erişim/atama bağlamını bağladı. Kullanıcı mevcut anahtarı yalnız7733 TEST için onayladı. Normal CRM'de gerçek OpenAI cevabı → Türkçe özet/inceleme → düzenlenebilir mesaj taslağı aktarımı çalıştı; gönderim0, ERPwrite0. Kullanıcı ekran kabulü bekler. Ana durum ve sayım yalnız CRM_FINISH_PLAN.md / CRM_STATUS.md'dedir.

Güncel DTO ataması modelden önce/sonra ve tarayıcı öneri kimliğinde doğrulanır. Yeni yetki/telefon/konuşma/taslak/ek değişiminde eski öneri uygulanmaz. Gerçek Express route offline sınır testleri ve bağımsız reviewer tamam; açık P0/P1/P2 bulgu0. 9fe215f exacthead CRM CI ve AI offlineSUCCESS; bu teknik sonuç gerçek ürün/fiyat önerisi kabulü değildir.

Endpoint **products=[]** olarak kalır: yalnız karşılama/ihtiyaç metni. Evrensel MOQ/kargo/ülke politikası veya gerçek stok/seri doğrulanmış değildir; örnek eski1000USD JSON etkin politika yapılmadı. Gerçek katalog/kayıtlı fiyat bağlamı A04, yabancı dil/ERP bağlam kabulü A05'te açık. Varsayılanoff; TEST startup-config AISalesMode=copilot seçimi yalnız konuşma55 ve gerçek7733 DTO telefonu için etkin. Credential sunucu belleğinde mevcut çeviri ayarından okunur; browser/repo/loga yazılmaz. İnsan Gönder'e basana kadar WhatsApp mesajı oluşmaz.

## Tarihsel V1 teslim kaydı — aşağıdaki “yapılmadı” ifadeleri kendi zamanına aittir
# Melisa Satış Asistanı — V1 geliştirme kaydı

Tarih: 4 Ekim 2026. Durum: **PARTIAL — sunucu tarafı copilot çekirdeği; CRM ekranı ve gerçek kullanım kabulü bekliyor.**

Kullanıcı mevcut Sites kaynaklı CRM'e, kendi satış kurallarıyla müşteriyi siparişe götürecek bir AI ajanı eklemeyi ve GitHub üzerinden geliştirmeyi istedi. Bu teslim o hedefin ilk kod parçasıdır; otomatik satışın hazır olduğu iddiası değildir.

## Kaynak ve teslim sınırı

Repo `melihsnyldzz-ui/melisa-crm`; taban `codex/crm-agents-on-completion-20261003` / `51e60087a1b5a508358296875ea2312629022649`. Teslim dalı `codex/ai-sales-agent-v1-20261004`; PR aynı geliştirme dalını hedefler, main'i değil. Eski dallar birleştirilmez; main, TEST/LIVE runtime, WhatsApp sağlayıcısı ve ERP değiştirilmez. Güncel CRM işletme kabulü için mevcut `CRM_STATUS.md` / `CRM_FINISH_PLAN.md` geçerlidir; bu özellik kaydı mevcut kabulleri yeniden açmaz.

## Bu teslimde kodlananlar

- Sürüm numaralı sunucu kuralları: minimum sipariş tutarı/para birimi ve onaylı Telegram URL'si. İndirim, seri bozma, otomatik mesaj ve ERP yazımı V1'de yetkilendirilmez.
- OpenAI Responses üzerinden yapılandırılmış cevap önerisi: müşteri dilinde yanıt, Türkçe özet, ürün seçimi/teklif/insana devir önerisi. Bu bir öneridir; devir önerisi personel ataması yapmaz.
- Saf teklif denetimi: güvenilir ERP/Vega adaptöründen verilmiş, en fazla beş dakikalık ürün anlık görüntüleri; kaynak/şirket/dönem, adet fiyatı, seri, stok, para birimi, minimum ve tam sayı kuruş hesapları. Kur tahmini yok. Vergi/nakliye hesaplanmaz; stok ayrılmaz ve sipariş yazılmaz.
- Konuşma/atama veya kural değişince bekleyen öneriyi reddetme; erişim her iki konuşma okumasında aynı kullanıcı üzerinden doğrulanır.
- `POST /crm/conversations/:conversationId/sales-draft`: mevcut CRM auth, `crm.send` yetkisi ve mevcut AI hız sınırını kullanır. Request body içinden ürün/fiyat/kural/geçmiş alınmaz.

**Endpoint'in bu sürümü yalnız karşılamaya ve ihtiyaç anlamaya dönük metin önerisi üretir.** Güvenilir katalog adaptörü henüz bağlı olmadığı için endpoint modele `products: []` gönderir; ürün/teklif çekirdeği yalnız sentetik testlerde denenmiştir. Bu ayrım kaldırılmadan endpoint gerçek fiyat veya ürün önerisi için hazır sayılmaz.

## Çalışma ayarları

Varsayılan kapalıdır. Yalnız doğrulanmış TEST ortamında `CRM_AI_SALES_MODE=copilot` seçilmesi endpoint'i etkinleştirir. `off`, boş veya farklı değerler 503 döner. Mevcut sunucu çeviri servisinin model/credential yapılandırması yeniden kullanılır; tarayıcıya credential verilmez, yeni credential bu PR'ye konmaz. Bu çalışma hiçbir ortam ayarını değiştirmedi ve gerçek model çağrısı yapmadı.

`CRM_AI_SALES_RULES_FILE`, repo dışındaki yönetici kontrollü UTF-8 JSON dosyasının mutlak yoludur. En fazla 16 KiB; fiyat/kural güncellemesi HTTP request body ile yapılamaz. Örnek biçim:

```json
{"version":"owner-approved-v1","minimumOrder":{"amountMinor":100000,"currency":"USD"},"telegramUrl":null}
```

Bu JSON bir **biçim örneğidir, etkin politika değildir**. Geçmişte 1.000 EUR kararı ve 2 Ekim'deki Irak müşteri yanıtında 1.000 USD/Telegram tercihi var; müşteri özelindeki kapsam otomatik olarak evrensel kurala dönüştürülmedi. Dosya yoksa minimum ve Telegram adresi boş kalır; minimum bilinmeden teklif üretilmez. Gerçek Telegram URL'si uydurulmaz. İzin verilen para birimleri TRY/USD/EUR ve tüm para değerleri kuruş/cent cinsinden tam sayıdır.

## Güvenlik ve dürüstlük sınırı

Yapılandırılmış çıktıda modelin fiyat/indirim alanı eklemesi reddedilir; fiyatlar yalnız kodda hesaplanır. Ancak JSON şeması serbest yanıt metnindeki her iddianın doğruluğunu garanti etmez. Bu nedenle her sonuç `requiresHumanReview: true`, `autoSend: false`, `erpWrite: false` döner. Bu taslaklara doğrudan otomatik gönderim bağlanmaz.

Geçmiş son 20 uygun metin mesajı ve mesaj başına 2.000 karakter ile sınırlıdır. Telefon/e-posta/özel not/ek metadata'sı modele aktarılmaz; müşterinin mesajın içine kendi yazdığı kişisel bilgi hâlâ metinde bulunabilir. Kalıcı müşteri hafızası yoktur. `store:false` kullanılır; bu ayar tek başına tüm sağlayıcı veri saklama politikalarını ortadan kaldırdığı anlamına gelmez. Kural dosyası yönetici kaynağıdır; müşteri mesajları kural değiştiremez.

## Teknik kanıt ve kalan işler

Yerel, yalıtılmış odak test ortamı: Node 22.16.0. **54/54 test PASS.** Mevcut offline guard, Git blob `34e05a3948c4dafe2020c50cbbd890a5507d3a45` ile birebir doğrulanarak kullanıldı; guard değiştirilmedi. Kaynak syntax kontrolleri ayrı çalıştırılır. GitHub workflow sonucu PR head Checks üzerinden doğrulanmalıdır; yerel PASS GitHub CI veya kullanıcı kabulü değildir.

```sh
node --import ./tests/offline-test-guard.mjs --test apps/gateway/src/services/salesAgent/salesAgent.test.mjs
```

Auth/route bağlama testi kaynak düzeyindedir; gerçek Express/Chatwoot entegrasyonu, bütün CRM regresyonu, tarayıcı testi, gerçek OpenAI çağrısı ve 7733 karşılıklı AI kabulü henüz yapılmadı. Bağımsız reviewer çalıştırıldığı iddia edilmez.

Sıradaki uygulanacak parça: mevcut sohbet ekranına AI önerisi/inceleme ve kural yönetimi eklemek; güvenilir katalog okuma adaptörünü bağlamak; öneriyi mevcut insan kontrollü mesaj taslağına aktarmak. Ardından mevcut ERP taslak sözleşmesi ve kullanıcı kontrollü 7733 denemesi. Genel müşteri gelen mesaj eşlemesi mevcut bitiş planındaki ayrı açık iştir; bu PR tek alıcı filtresini kaldırmaz.

Otonom satış için ayrıca kalıcı konuşma sahipliği/insana devir, kuyruktaki mesajı iptal etme, kalıcı olay tekilleştirme, gönderim/teklif anında fiyat-stok-kural kontrolü, seçilmiş müşteri kapsamı ve gerçek kabul gerekir. Bu temel parça bunları tamamlanmış göstermez.

Resmî API biçimi kontrolü: https://developers.openai.com/api/docs/guides/migrate-to-responses ve https://developers.openai.com/api/docs/guides/text .
