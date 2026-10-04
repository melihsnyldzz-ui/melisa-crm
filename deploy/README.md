# Güncel TEST çalışma kapsamı — 4 Ekim 2026

Kullanıcının uçtan uca CRM görevi doğrulanmış TEST için build/restart/test/Git teslimini yetkilendirir; main otomatik merge ve LIVE deploy yetkisi yoktur. Runtime identity ve existing installer korumaları devam eder. Aşağıdaki3Ekim ve ilk hazırlık sınırları tarihseldir; bugünkü TEST yetkisini geri almaz.

AI satış kuralları TEST'te `RuntimeDir/ai-sales-rules.json` kaynağından okunur; inherited veya baseline `CRM_AI_SALES_RULES_FILE` yolu alınmaz. RuntimeDir doğrulanmış repo dışı TEST dizinidir. İlk kurulumda bu dosya yönetici tarafından UTF-8 JSON olarak hazırlanır; mevcut kayıt üzerine yazılmaz. Ticari karar henüz yoksa sürüm ve boş alanlar aşağıdaki gibidir:

```json
{"version":"unconfigured-v1","minimumOrderMode":"unconfigured","minimumOrder":null,"telegramUrl":null,"countryRules":[],"shippingTerms":"","salesNotes":""}
```

Normal patron Ayarlar→Satış kuralları ekranı bu tek kaynağı günceller; tüm CRM rollerinin okumaları mevcut yetkilerini kullanır. Dosya eksik/geçersizse düzenleme açılmaz. Kaynaklar/protected config/credential Git'e alınmaz. Dosyayı uygulama dışında eşzamanlı düzenlemek desteklenmez. Gerçek iş kuralları ve kullanıcı kabulü olmadan boş politika satış için tamamlanmış sayılmaz.

## Tarihsel kaynak düzenleme kapsamı — 3 Ekim 2026

Kanonik kaynak/Git/ajan düzenlemesi ve feature branch/commit/push/PR kullanıcı tarafından yetkilendirildi. Bu düzenleme görevi LIVE veya TEST servisi restart, kurulum, deployment, gerçek gönderim ya da ticari veri yazımı içermez. Gelecekteki TEST işlemleri AGENTS.md ve o görevin açık kapsamına göre değerlendirilir. Aşağıdaki ilk hazırlık sınırı tarihsel kayıttır; güncel GitHub kaynak düzenleme yetkisini geri almaz. Installer owner/manifest korumaları korunur.

# Deployment boundary

This repository is offline source preparation only. No deploy, restart, install, send, SQL write, GitHub remote or push is authorized.

REV3 belongs only to candidate/rev3. The controlled installer retains its original absolute path and owner/SID/manifest guards. It must never be executed from this repository. Path mapping, manifest resealing, service owner validation, credential handoff, separate ERP adapter hosting and rollback review require future explicit work.

Known inherited blocker: UI4212 PID34180 owner CodexSandboxOffline SID1003 versus expected Xaser SID1001, NORMAL_OWNER_REQUIRED. This task neither re-queried denied process metadata nor changed the owner. Last successful runtime deploy time and tested rollback status remain unknown. Old source and runtime remain the rollback material; no rollback operation was attempted.

Metadata diagnostics DEV helper is separate from sealed REV3 and has not been imported.
