# MELISA CRM — Güncel Durum

Source of truth: [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md)

## Aktif geliştirme
- Kanonik repo: `melihsnyldzz-ui/melisa-crm`
- Aktif geliştirme kaynağı: `feature/crm-completion`
- Doğrulanmış commit: `fd297df9922c4157aa5e8944bf0c091d618906c3`
- Semih PC temiz çalışma alanı: `C:\\Sirket\\CRM\\melisa-crm`
- Mevcut çalışan LIVE CRM ayrı runtime olarak korunuyor; bu status LIVE’ın aynı committen çalıştığını iddia etmez.

## Gerçek TEST kabul durumu — 2026-10-03
- 🟢 7733’ten gelen yazı ve fotoğraflar TEST CRM’de görünüyor.
- 🟢 Fotoğraf / PDF / TXT gönderme: gerçek test dosyaları gönderildi ve konuşmaya kaydedildi.
- 🟢 Atama: değişiklik yapıldı, doğrulandı ve eski atama geri getirildi.
- 🟢 Otomatik çeviri: çalışıyor; kullanıcı ayarı korunuyor.
- 🟢 Katalog / ürün / fiyat: gerçek ürünler ve kayıtlı fiyatlar okunuyor; fiyatlar sohbet taslağına eklenebiliyor.
- 🟢 ERP taslak sipariş: TEST ERP’ye 4 ürün, 510,25 TL taslak kaydedildi.
- 🟢 Servis restart: otomatik yeniden açılma ve kayıtların korunması doğrulandı.
- 🟢 Otomatik kontroller: 444 kontrol geçti.

## Açık gerçek kabul maddeleri
- 🟡 Fiyatlı PDF ekranda üretildi; indirilen dosyanın ayrıca açılıp doğrulanması bekleniyor.
- 🟡 Fiziksel telefon üzerinde son kullanım kabulü bekleniyor.
- 🟡 Gerçek Windows yeniden başlatma sonrası uçtan uca kabul bekleniyor.
- 🔴 LIVE deploy yapılmadı.
- 🔴 Main/tag/release konsolidasyonu henüz tamamlanmadı.

## Çalışma kuralı
Çalışan baseline yeniden ispatlanmaz. Tek açık madde seçilir, gerçek kullanım kabulüyle kapatılır ve sonra sıradakine geçilir. Gereksiz gate/bridge/yeniden onay döngüsü oluşturulmaz. TEST tarafındaki build/restart/test/branch/commit/push işlemleri ayrıca izin istemeden yapılabilir. LIVE’da geri dönüşü zor değişiklik, veri kaybı, gerçek müşteri işlemi veya credential riski varsa açık onay gerekir.
