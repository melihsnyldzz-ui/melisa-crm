# CRM karar merkezi

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

| ID | Tarih | Karar | Gerekçe | Etkilediği alan | Durum |
| --- | --- | --- | --- | --- | --- |
| CRM-DEC-004 | 2026-10-06 | Kullanıcının Uzun Goal4 önceliği: mevcut kabul edilmiş sohbet/katalog/paylaşım/çeviriyi koruyarak ERP melisa-catalog.v1 kaynağına geç; yalnız 7733 için değişen ürün/fotoğraf/fiyat paylaşımını doğrula; iki ürünlü native ERP TEST taslağı ve bağımsız readback ile E02'yi teknik hazır yap. A04/A05 insan kontrollü gerçek ERP önerisi, müşteri dili ve mevcut taslak bağlamıyla teknik tamamlanır. | Bu sohbetin açık “MELISA — UZUN Goal4” eki; CRM-D01 insan kabulünü beklerken onaylı D02–D04 teknik çalışmasını başlatır. İnsan PASS otomatik verilmez; eski yeşiller yeniden iş değildir. | CRM-D02/D03/D04; E02/A04/A05. Tek ticari kaynak ERP; LIVE, main merge, başka alıcı, AI otomatik gönderim, gerçek satış/finans, Vega/delta ve Goal5 dışarıda. | Onaylı |
| CRM-DEC-001 | 2026-10-05 | ERP katalog verisinin ikinci kopyasını CRM'de üretme; onaylanmış ERP katalog sözleşmesini oku. | Ticari ürün gerçeğinin dağılmasını önlemek. | CRM katalog okuma | Onaylı |
| CRM-DEC-002 | 2026-10-05 | CRM ürün/fotoğraf/fiyat paylaşım yüzüdür; ticari ürün gerçeğinin sahibi ERP'dir. | Kaynak sahipliğini ve satış yüzünü netleştirmek. | Katalog / paylaşım / ERP | Onaylı |
| CRM-DEC-003 | 2026-10-05 | AI satış ajanı ilk aşamada insan kontrollü copilot'tur; otomatik gerçek müşteri gönderimi ayrı kullanıcı kararı gerektirir. | İnsan satış kontrolünü korumak. | AI / gerçek gönderim | Onaylı |

Ortak katalog API/UX yönünün asıl kararı ERP'deki **ERP-DEC-005** kaydıdır; [ERP karar merkezi](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/7f04e1ad290048ae74096708c8d5a329cf7ce5bc/PROJECT_DECISIONS.md) ve [ERP teslim panosu](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/7f04e1ad290048ae74096708c8d5a329cf7ce5bc/DELIVERY_BOARD.md) okunur. API yolu veya şeması bu belge işiyle icat edilmez; sözleşme kabul edildiğinde exact ERP commit bağlantısı ilgili teslim kaydına eklenir. Şirket kuralları [Melisa OS](https://github.com/melihsnyldzz-ui/melisa-os) içindedir.
