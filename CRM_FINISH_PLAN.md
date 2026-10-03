# Melisa CRM bitiş planı

Bu dosya iş sırasının source of truth'udur. Kanonik repo: `melihsnyldzz-ui/melisa-crm`. Kaynaklar: [CRM_STATUS.md](CRM_STATUS.md), [baseline](docs/BASELINE.md), [baseline kanıtı](docs/baseline-verification.json), [deployment sınırı](deploy/README.md). 2026-10-03 multi-agent hazırlığı yalnız repo talimat/config/dokümantasyon kapsamındadır; feature, runtime ve gerçek işletme kabulü yapmaz.

## Korunan baseline kanıtı

Önceki kaynak kaydı frontend build ve HTML/JS/CSS eşleşmesini, 109 gateway/ERP mock testini ve 47 frontend testini bildirir. Bunlar bu kurulumda yeniden çalıştırılmadı. Dependency kaydı yerel kopyadan 91 lock eşleşmesi ve 49 eksik optional paket bildirir; registry tarball bütünlüğü yeniden kanıtlanmamış. Gerçek müşteri etkileşimi, medya teslimi, ERP yazısı ve runtime rollback kabulü yok. Tarihsel port, owner ve path bilgileri Semih PC için geçerli varsayılmaz.

## Sıralı açık işler

Ana ajan her turda yalnız bir kırmızı madde seçer. Bağımlılık veya eksik insan yetkisi nedeniyle ilerleyemeyen maddeyi gerekçesiyle FAIL-BLOCKED tutar; güvenli bağımsız alt işi aynı maddenin kapsamında hazırlayabilir.

| ID | Durum | İş ve kaynak | Kapanış için gereken kanıt |
| --- | --- | --- | --- |
| CRM-01 | 🔴 AÇIK | Bağımsız CRM kod/sözleşme incelemesi. `CRM_STATUS.md` kritik kalan iş. | Reviewer bulguları, kapsamlı dosya/sözleşme referansları, P0/P1 risklerin giderilmesi veya açık kabulü; test kanıtının gerçek kabulden ayrılması. İnceleme PASS'i ürün PASS'i değildir. |
| CRM-02 | 🔴 FAIL-BLOCKED | REV3 installer `NORMAL_OWNER_REQUIRED`; eski path/manifest ve hizmet sahibi uyarlaması. `deploy/README.md`. | Hedef PC repo/runtime/owner kimliği; korumaları koruyan taşınabilir uyarlama; manifest/rollback incelemesi; TEST kurulum kabulü. Eski installer burada çalıştırılmaz. LIVE/credential riski için açık onay. |
| CRM-03 | 🔴 AÇIK / KABUL BEKLİYOR | Gerçek mesaj ve medya kabulü; çalışan WAAPI text-only kaydı. `CRM_STATUS.md`. | Yetkili TEST runtime ve açıkça izin verilen test alıcısı; gerekli text/media akışının uygulamada gözlenmesi, teslim/receipt ve tekrar gönderim davranışının kanıtı. Gerçek gönderim yetkisi bulunmadan hazırlıkla sınırlı kalır. |
| CRM-04 | 🔴 AÇIK / KABUL BEKLİYOR | ERP katalog/media ve yazı kabulü. Baseline'ın CRM-side contract sınırı. | Ayrı kanonik ERP kimliği ve doğru API/veritabanı; `/api/crm-catalog/products` + identity-verified read session; korunan fotoğrafın decode edilmesi ve indirilen PDF'nin render kabulü; yazı gerekiyorsa sentetik TEST verisi ve rollback kanıtı. Gerçek ticari kayıt için açık onay. |
| CRM-05 | 🔴 AÇIK / KABUL BEKLİYOR | Runtime rollback tatbikatı. `CRM_STATUS.md` tarihsel hash proof. | Doğrulanmış TEST runtime'da geri dönüş prosedürü, önce/sonra health ve kimlik, veri korunumu. Tarihsel dosya hash'i tatbikat değildir. |
| CRM-06 | ⚫ SONRA | Production release/deploy. Önceki kabul ve rollback bağımlılıkları. | CRM-02–05 ilgili kabul kanıtları, bağımsız review ve gereken LIVE onayı; yayın sonrası gerçek kullanım kontrolü. Main'e otomatik merge yok. |

## Multi-agent hazırlığı — 2026-10-03

`AGENTS.md`, `.codex/config.toml` ve dört rol dosyası eklenir. Eski kaynak/status kanıtı korunur. Yeni checkout'ın origin'i kanonik GitHub repo olarak doğrulanmıştır; Semih PC yolu ve runtime kontrol edilmemiştir. Rol dosyalarının yüklenmesi ve gerçek dispatch, hedef Codex oturumunda ayrıca doğrulanmalıdır. Bu kayıt ürün veya LIVE hazırlığına PASS vermez.

## Kanıt ve güncelleme biçimi

Kurulum kontrolleri (2026-10-03): Codex CLI 0.152.1 strict başlangıç ve gerçek
`initialize → config/read` ile yalnız geçici, izole doğrulama profilinde trusted
proje config'i yüklendi; ana/alt ajan Sol Medium, enabled ve eşzamanlılık 3 görüldü.
Dört TOML rol tanımı geçerli, loader'da config/agent uyarısı yok; geçici bozuk
rolün reddi discovery loader'ının çalıştığını doğruladı. Bağlantılar ve dar diff
kontrol edildi; kurulumun bağımsız incelemesinde P0/P1 yok. Bu inceleme CRM-01
ürün kod/sözleşme incelemesini kapatmaz. Global config/trust değiştirilmedi;
model çağrısı veya gerçek rol spawn yapılmadı. Semih PC aktivasyonu/model erişimi
ve gerçek işletme kabulü henüz doğrulanmadı.

Seçilen ID için tarih, kapsam, branch/commit/PR, test komutu ve sonucu, gerçek kabul kaydı veya eksikliği, kalan risk/bağımlılığı aynı dosyaya ekle; `CRM_STATUS.md` kısa özeti bununla uyumlu tut. Gerçek kullanım kabulü gerektiren işi yalnız build/mock test ile kapatma. Mevcut başarılı baseline'ı yeni değişiklik veya kanıt kaybı gerektirmedikçe tekrar çalıştırma.
