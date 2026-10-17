# CRM kurtarma kapsamı — 13 Ekim 2026

Ortak sıra18 / DATA07-DATA08. Bu yalnız mevcut korumalı yedeğin güncellik/sınır kaydıdır; yeni DB yedeği, restore veya aktif state yazısı yapılmadı. Kaynak commit/push ile veri yedeği ayrı teslimlerdir.

| Alan | Doğrulanmış kayıt |
| --- | --- |
| Son CRM özel snapshot / ayrı restore-check | 12Ekim2026 05:19:22 Türkiye saati; mevcut fb34 ayrı prova kapsamı. |
| Korumalı konum | Repo dışı owner-only C:\Sirket\CRM\backups; aynı bilgisayar. Özel snapshot tam alt yolu ve içerik yayımlanmaz. |
| CRM interest state | customer-product-requests.json;2700byte;SHA256 de493f80c09abfb838977651a854e6ed2566b32899d3048620bf48281021e25c.12Ekim tek talep/seçim kaydı. |
| Prova refresh state | semih-proof-refresh-journal.json;628byte;SHA256 bf28c574fe4d097c747219903fda1e9db3130cf7c8c10275438b6dcc63647d76. İptal helper'ın tarihli kanıtıdır; yeni aktivasyon için kullanılmaz. |
| Olmayan dosya | normal-proof-refresh-journal.json yokluğu korundu; sahte dosya oluşturulmadı. |
| 13Ekim bütünlük okuması | Snapshot dizini ve iki dosya mevcut; byte/SHA256 kayıtlı mühürlerle eşit. İçerik GitHub'a veya sohbete taşınmadı. |
| Geri yüklenebilirlik sınırı | 12Ekim ayrı restore-check kopyası byte/hash ve aynı talep/session ile kontrol edildi. Aktif state/DB üzerine restore uygulanmadı; eski iki ERP restore ve paket geri dönüşü yeniden denenmedi. |
| Ayrı cihaz/konum | Doğrulanmış kopya kaydı yok; makine kaybı koruması tamamlanmış sayılmaz. Yetkili ayrı hedef somut dış bağımlılıktır. |
| Bu turun veri etkisi | Kod/test hazırlığı mevcut ortak veya prova interest/grant/ERP verisini değiştirmedi. Test fixture verisi process-local/ephemeral'dir. |

Bu yedek son birleşik ERP/CRM/ayar/yerel sipariş verilerinin tamamını kapsamış sayılmaz. Yeni shared issuer/request store kurulurken ortak sahibi, ilgili kalıcı state/config değişikliğinden önce mevcut korumalı mekanizmayla geri alınabilir kapsamı sağlar; önemli veri değişikliği sonrası güncelliği ayrı kaydeder. Kod commit'i başına tam yedek/restore turu yapılmaz. Sırlar, müşteri verileri ve DB dökümleri kod reposuna eklenmez.

Önceki [state koruma metadata'sı](../2026-10-12-customer-product-request/request-state-preservation.json) ve [CRM karar bağımlılıkları](../../../development/CRM_REQUIRED_DECISIONS.md) korunur.
