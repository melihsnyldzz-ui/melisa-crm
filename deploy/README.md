# Güncel çalışma kapsamı — 3 Ekim 2026

Kanonik kaynak/Git/ajan düzenlemesi ve feature branch/commit/push/PR kullanıcı tarafından yetkilendirildi. Bu düzenleme görevi LIVE veya TEST servisi restart, kurulum, deployment, gerçek gönderim ya da ticari veri yazımı içermez. Gelecekteki TEST işlemleri AGENTS.md ve o görevin açık kapsamına göre değerlendirilir. Aşağıdaki ilk hazırlık sınırı tarihsel kayıttır; güncel GitHub kaynak düzenleme yetkisini geri almaz. Installer owner/manifest korumaları korunur.

# Deployment boundary

This repository is offline source preparation only. No deploy, restart, install, send, SQL write, GitHub remote or push is authorized.

REV3 belongs only to candidate/rev3. The controlled installer retains its original absolute path and owner/SID/manifest guards. It must never be executed from this repository. Path mapping, manifest resealing, service owner validation, credential handoff, separate ERP adapter hosting and rollback review require future explicit work.

Known inherited blocker: UI4212 PID34180 owner CodexSandboxOffline SID1003 versus expected Xaser SID1001, NORMAL_OWNER_REQUIRED. This task neither re-queried denied process metadata nor changed the owner. Last successful runtime deploy time and tested rollback status remain unknown. Old source and runtime remain the rollback material; no rollback operation was attempted.

Metadata diagnostics DEV helper is separate from sealed REV3 and has not been imported.
