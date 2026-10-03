# MELISA CRM — Güncel Durum

## GitHub çalışma düzeni — 3 Ekim 2026

Bu bölüm kaynak/CI hazırlığının güncel kaydıdır. Önceki uygulama/TEST kabul kayıtları aşağıda korunur; bu çalışma uygulama özelliklerinin genel kabulü değildir.

| Alan | Sonuç |
| --- | --- |
| Kapsam | CI workflow, branch/main stratejisi, sürümleme, deploy/rollback, AGENTS ve PR şablonu |
| Teknik sonuç | Yerel **PASS**; 449/449 offline test, frontend build, JS syntax; tam HEAD geçmişi secret scan PASS |
| Bağımsız inceleme | PASS; yalnız incelenmiş tekil yanlış pozitif secret fingerprint istisnaları |
| GitHub CI | PR/push kontrolleri gönderim sonrası beklenecek; henüz PASS denmiyor |
| Gerçek kullanıcı kabulü | **BEKLİYOR** — bu PR/commit için kullanıcı kabulü kaydı yok; önceki uygulama kabulleri korunur |
| Branch | `codex/crm-github-workflow-20261003` |
| Taban commit | `164cb534b9db0cbcb423ceb671e41b87da0ba649` / `codex/crm-agents-on-completion-20261003` |
| Teslim commit / PR | PR açıldıktan sonra bu bölümün takip kaydına yazılır |
| TEST commit / paket | Bu görevde deployment yapılmadı; mevcut runtime kimliği **Durum doğrulanmadı** |
| LIVE commit / paket | Bu görevde deployment yapılmadı; mevcut runtime kimliği **Durum doğrulanmadı** |
| Release / main | Tag/release/merge yapılmadı; ilk tag yalnız kabul edilmiş main'den |
| Kalan iş | Son PR head CI sonucunu kaydet; kullanıcı PR'yi kabul etsin; main'e geçiş ve LIVE ayrıca ele alınır |

[Çalışma düzeni](docs/development/GITHUB_WORKFLOW.md) · [Sürümleme](docs/development/RELEASES.md) · [Deploy/rollback](docs/development/DEPLOY_ROLLBACK.md).

Mevcut büyük bundle uyarısı sürer; runtime/telefon/mobil/SQL/provider kabulü bu CI kapsamında değil. Ana checkout'taki iş öncesi CRM_STATUS.md değişikliği bu izole çalışma commit'lerine alınmadan korunur.

Source of truth: [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md)

## Aktif geliştirme
- Kanonik repo: `melihsnyldzz-ui/melisa-crm`
- Uygulama kod tabanı: `feature/crm-completion`
- Korunan uygulama commit’i: `fd297df9922c4157aa5e8944bf0c091d618906c3`
- SEMIH kanonik yerel kökü: `C:\Sirket\CRM\melisa-crm`
- Yerelde aktif çalışma branch’i: `codex/crm-agents-on-completion-20261003` ([PR #3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3), hedef `feature/crm-completion`).
- İlk ajan overlay commit’i: `80fae4af1ee0a199d5fcee1e68c09afcf0aca92f`; bu dal uygulama commit’inin devamıdır. Ajan/plan/kök düzenlemesi uygulama kodunu değiştirmez.
- Mevcut çalışan LIVE CRM ayrı runtime olarak korunuyor; bu status LIVE’ın aynı committen çalıştığını iddia etmez.

## Önceki çalışmadan aktarılan TEST sonuçları — 2026-10-03

Kaynak: [uygulama commit’i](https://github.com/melihsnyldzz-ui/melisa-crm/commit/fd297df9922c4157aa5e8944bf0c091d618906c3) ve [PR #3 durum kaydı](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3). Aşağıdaki gözlemler önceki TEST çalışmasının raporudur; yerel kök düzenlemesinde tekrar çalıştırılmadı. Özelliğin tam PASS kararı planın telefon/dosya açma dahil kabul ölçütlerinin tamamına bağlıdır; aşağıdaki açık kabuller sürer.
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
