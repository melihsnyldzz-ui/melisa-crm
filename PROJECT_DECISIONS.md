# CRM karar merkezi

### CRM-DEC-010 — 10 Ekim 2026 — Onaylı

Kullanıcının ERP + CRM EKRAN SADELEŞTİRME VE KULLANICI EĞİTİMİ talimatı; tek koordineli ERP-CRM-LEARN01 işi. Son izole DB02 sürümünde yalnız normal katalog/mesaj taslağı/sipariş görünümü ve kısa rehberler sadeleşir. Müşteri/personel kimliği, rol, fiyat/döviz/seri/finans hesaplaması ve mevcut POST/yetki/provider sınırları korunur. Yeni sipariş, ticari kayıt, mesaj veya ücretli AI yoktur. Eğitim PR27 uygun saf içerik yaklaşımıyla yeniden kullanılır; mevcut PR/worktree/SQLite değişmez. CRM-UA09 insan kabulü bekler; otomatik ekran veya quiz kabul değildir. LIVE/Vega/main/T1/finansal açılış yok; dar hazırlık tesliminde DUR.
### CRM-DEC-009 — 10 Ekim 2026 — Onaylı

Kullanıcının **SON TAMAMLAMA PLANI** doğrudan talimatı ERP-CRM-FINAL01 kapsamında günlük ERP/CRM bağlantı eksiklerinin tamamlanmasını, kaynak/kimlik karşılaştırmasını, tek mağaza günü TEST hazırlığını ve LIVE öncesi kurtarma/final T1 planını yetkilendirir. CRM-DEC-008 teslim sonunda DUR sınırı yalnız bu kapsam için superseded; doğrulanmış DB02 katalog/taslak/döviz kanıtları yeniden oluşturulmaz. Mevcut TEST125/DB02 geçmişi ve insan kabulleri korunur. Bilinmeyen kişi/cari eşlemesi tahmin edilmez; finansal açılış tutarı, gerçek WhatsApp, ücretli AI veya LIVE yazması ayrıca açık onay ister. Eğitim PR27/main/Vega/gerçek T1 değişmez. Teknik TEST, insan PASS veya LIVE geçişi değildir. Veritabanı işlemlerini tek koordinatör yönetir.

Karar sahibi: kullanıcı; ChatGPT planlama ortağı, Codex uygulayıcıdır. Kayıt tarihi: **2026-10-05**. Kaynak: kullanıcının bu tarihli açık proje-yönetim talimatı ve [CRM ERP sohbeti](https://chatgpt.com/c/6ac01ba3-0444-83eb-9ea8-1bb9d7ae5012). Aşağıdaki kararlar **onaylıdır**; uygulanmış veya kullanıcı tarafından denenmiş anlamına gelmez.

## Tek kaynak düzeni

| Bilgi | Tek kayıt yeri |
| --- | --- |
| Kalıcı ürün/iş kararı | Bu dosya |
| Günlük onaylı iş sırası / iş durumu / bağımlılık | [DELIVERY_BOARD.md](DELIVERY_BOARD.md) |
| Kullanıcının gözle denemesi ve sonucu | [USER_ACCEPTANCE.md](USER_ACCEPTANCE.md) |
| Teknik gerçek durum, test/CI ve kanıt | [CRM_STATUS.md](CRM_STATUS.md) |
| Tam kapsam ve finish tree | [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md) |
| Devam döngüsü / işlem sınırları | [AGENTS.md](AGENTS.md) |

Karar sohbetten sonra açık kullanıcı talimatıyla bu dosyaya kaydedilir, ilgili pano satırı karar ID'sine bağlanır ve dar PR ile GitHub'a teslim edilir. Codex yeni ürün kararı üretmez; yalnız onaylı işin ilerleme durumunu kanıtla günceller. Karar değişecekse kullanıcı yeni kararı açıkça verir; yeni ID/tarih/gerekçeyle eklenir, eski satırın durumu `Superseded by <yeni ID>` olur, metni korunur. Durumlar: `Onaylı / Superseded by <ID>`; karar onayı uygulama kabulü değildir.

GitHub'daki ilgili PR/commit bu kayıtların sürümünü gösterir. Yerel checkout, main, çalışan TEST/LIVE paketi ayrı kimliklerdir. Açık doküman PR'si main'e birleşmiş veya runtime'a uygulanmış sayılmaz. İş tekrar açılmadan önce aynı kapsamın mevcut kabul kaydına bakılır; başka dosyaya karar metni veya ikinci günlük pano kopyalanmaz.

## Kalıcı kararlar

### CRM-DEC-008 — 10 Ekim 2026 — Onaylı

Kullanıcının ERP PR23 / CRM PR3 son ortak TEST teslimlerinden devam talimatıyla ERP-DEC-040 kapsamında yeni izole TEST ortamında doğrulanmış ürün/müşteri/tedarikçi/personel/döviz kapsamına genişletme yapılır. CRM-DEC-007 hazırlık sonunda DUR sınırı yalnız ERP-CRM-EXPAND01 için superseded; önceki kabul ve uygulamalar tekrar edilmez. Kesin konuşma/telefon/atanmış kullanıcı ve native müşteri/döviz/fiyat/birim bağları sunucuda yeniden doğrulanır; belirsiz telefon veya cari bağı otomatik kurulmaz. İki LL hesabı, karantina ve bilinmeyen eşlemeler dışarıda kalır. Fiyat/bakiye ekranı en fazla iki ondalık; kaynak hassasiyeti korunur.

Ücretli AI, provider/gerçek WhatsApp, ticari/LIVE/Vega yazması, gerçek T1, main merge ve Eğitim PR27 yoktur. Yeni TEST kopyasındaki sentetik taslak etkisi gerçek kaynak kopyasından ayrılır. Geniş ortak insan TEST'i başlatılmadan tek yönetici raporu teslim edilir; CRM-UA07 ve önceki insan kabul kayıtları teknik testle PASS yapılmaz. Kaynak/test/GitHub teslimleri için ekran ekran yeni onay döngüsü açılmaz.

| ID | Tarih | Karar | Gerekçe | Etkilediği alan | Durum |
| --- | --- | --- | --- | --- | --- |
| CRM-DEC-007 | 2026-10-09 | ERP-DEC-039 ile ortak izole TEST hazırlığı: güncel ERP ürün/fiyat/döviz/müşteri sözleşmesi, ayrı62600–62604 ortamı, mevcut kullanıcı/rol kimliği ve normal ekran bağlantıları tamamlanır. Ücretli AI ve dış gönderim bu ortamda kapalıdır. | Kullanıcının açık ortak TEST hazırlığı talimatı; önceki durma sınırı yalnız bu hazırlık kapsamında değişir. | CRM PR3 / ERP PR23; TEST125, eski CRM, eğitim PR27 ve aktarımlar korunur. Tam işletme testi ayrıca onay bekler; Vega/LIVE/main/T1/gerçek WhatsApp yok. | Onaylı; hazırlık DUR sınırı CRM-DEC-008 ile superseded |
| CRM-DEC-006 | 2026-10-06 | Açık Uzun Goal6 kapsamında mevcut Melisa-CRM-TEST-Completion owner/launcher/supervisor ve bağımlılık zinciri tamamlanır; sınırlı self-heal, exact immutable paket, gerçek process prova ve ERP bağlantısı doğrulanır. Yeni login/rol, gerçek mesaj/provider işlemi ve Docker/container restart yoktur. | Bu sohbetin kullanıcı Goal6 eki; CRM-DEC-005 sonrası durma sınırını yalnız O02 teknik çalışma için supersede eder. | O02 teknik hazır / gerçek reboot-logon ve insan kabulü bekler; M01/diğer insan kabulü değişmez, LIVE/main/Goal7 yok. | Onaylı |
| CRM-DEC-005 | 2026-10-06 | Açık Uzun Goal5: ERP personel terminalindeki Müşterilerim mevcut CRM atanmış konuşma/çeviri/ERP katalog/native taslak akışını kullanır. Tek ticari kaynak ERP; mevcut fotoğraflı3830 katalog korunur. Yalnız localhost owner-installed15dakikalık mevcut crm-ahmet kimliğine bağlı TEST prova oturumu, atanmış konuşma ve7733 ile sınırlı gönderim; normal kullanıcı/rol/parola ve kalıcı personel gönderim ayarı değişmez. | Kullanıcının bu sohbetindeki “MELISA — UZUN GOAL5” eki; CRM-DEC-004 sonunda durma sınırını yalnız yeni terminal kapsamı için supersede eder. | M01 teknik hazır/fiziksel-personel kabulü bekler; oturum sonu/rol/assignment/ERP fiyat tazeliği korunur. LIVE/main/başka alıcı/otomatik gönderim/Goal6–7 yok. | Onaylı |
| CRM-DEC-004 | 2026-10-06 | Kullanıcının Uzun Goal4 önceliği: mevcut kabul edilmiş sohbet/katalog/paylaşım/çeviriyi koruyarak ERP melisa-catalog.v1 kaynağına geç; yalnız 7733 için değişen ürün/fotoğraf/fiyat paylaşımını doğrula; iki ürünlü native ERP TEST taslağı ve bağımsız readback ile E02'yi teknik hazır yap. A04/A05 insan kontrollü gerçek ERP önerisi, müşteri dili ve mevcut taslak bağlamıyla teknik tamamlanır. | Bu sohbetin açık “MELISA — UZUN Goal4” eki; CRM-D01 insan kabulünü beklerken onaylı D02–D04 teknik çalışmasını başlatır. İnsan PASS otomatik verilmez; eski yeşiller yeniden iş değildir. | CRM-D02/D03/D04; E02/A04/A05. Tek ticari kaynak ERP; LIVE, main merge, başka alıcı, AI otomatik gönderim, gerçek satış/finans, Vega/delta ve Goal5 dışarıda. | Onaylı |
| CRM-DEC-001 | 2026-10-05 | ERP katalog verisinin ikinci kopyasını CRM'de üretme; onaylanmış ERP katalog sözleşmesini oku. | Ticari ürün gerçeğinin dağılmasını önlemek. | CRM katalog okuma | Onaylı |
| CRM-DEC-002 | 2026-10-05 | CRM ürün/fotoğraf/fiyat paylaşım yüzüdür; ticari ürün gerçeğinin sahibi ERP'dir. | Kaynak sahipliğini ve satış yüzünü netleştirmek. | Katalog / paylaşım / ERP | Onaylı |
| CRM-DEC-003 | 2026-10-05 | AI satış ajanı ilk aşamada insan kontrollü copilot'tur; otomatik gerçek müşteri gönderimi ayrı kullanıcı kararı gerektirir. | İnsan satış kontrolünü korumak. | AI / gerçek gönderim | Onaylı |

Ortak katalog API/UX yönünün asıl kararı ERP'deki **ERP-DEC-005** kaydıdır; [ERP karar merkezi](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/7f04e1ad290048ae74096708c8d5a329cf7ce5bc/PROJECT_DECISIONS.md) ve [ERP teslim panosu](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/7f04e1ad290048ae74096708c8d5a329cf7ce5bc/DELIVERY_BOARD.md) okunur. API yolu veya şeması bu belge işiyle icat edilmez; sözleşme kabul edildiğinde exact ERP commit bağlantısı ilgili teslim kaydına eklenir. Şirket kuralları [Melisa OS](https://github.com/melihsnyldzz-ui/melisa-os) içindedir.
