# MELISA CRM

LIVE: 4076 frontend / mevcut 4200 gateway · WAAPI text-only
TEST/CANDIDATE: REV3 · NOT_INSTALLED · candidate/rev3
Son deploy: Kesin zaman bilinmiyor; bu görevde deploy yok.
Rollback durumu: Geçmişte 90 dosyalık hash proof var; runtime rollback hiç uygulanmadı, gerçek tatbikat yapılmadı.
Şu anki tek görev: 2026-10-03 taşınabilir multi-agent talimat/config hazırlığı; feature/runtime kabulü yok.
Bugün kapanan işler: İzole baseline, hash/build/test kanıtı, yerel Git, REV3 ayrımı.
Kritik kalan işler: Bağımsız inceleme; installer owner/path uyarlaması; gerçek medya ve ERP kabulü.

## Özellikler

- 🟡TEST BEKLİYOR: Yerel baseline build ve 4212 HTML/JS/CSS bit eşleşmesi geçti; gerçek özellik acceptance yok.
- 🟡TEST BEKLİYOR: İzole gateway 107 + ERP mock 2, frontend 47 test geçti; gerçek işletme kabulü yok.
- 🟡TEST BEKLİYOR: Gerçek 7733 mesaj/medya acceptance; bu görevde tüm gönderimler yasak.
- 🟡TEST BEKLİYOR: ERP write acceptance ve rollback tatbikatı.
- 🔴FAIL-BLOCKED: REV3 installer NORMAL_OWNER_REQUIRED; eski mutlak yol/manifest uyarlaması.
- ⚫SONRA: Production deploy, GitHub repo/push; ayrı yetki ve inceleme sonrası.

## Multi-agent hazırlığı — 2026-10-03

Kurulum doğrulaması: Codex CLI 0.152.1 gerçek config/read ile izole trusted
proje katmanı/Sol Medium/agents enabled/eşzamanlılık 3 doğrulandı. Dört TOML rol
tanımı geçerli ve loader uyarısı yok. Bağımsız kurulum review'u P0/P1 bulmadı;
bağlantı/diff kontrolleri geçti. Global ayar değişmedi; model çağrısı/gerçek rol
spawn yapılmadı. Bu kontrol CRM-01 ürün incelemesini kapatmaz.

Bitiş sırası için [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md) source of truth; çalışma kuralları [AGENTS.md](AGENTS.md). Kanonik origin `melihsnyldzz-ui/melisa-crm` bu checkout'ta doğrulandı. `.codex/config.toml` ve explorer/backend/frontend/reviewer rolleri eklendi; GPT-6.1 Sol Medium varsayılanı, zor inceleme için açık High seçimi.

Yukarıdaki build/test/runtime kayıtları önceki baseline kanıtıdır ve bu görevde yeniden doğrulanmadı. 2026-10-03 kullanıcı talebi doğrulanmış TEST restart/build/test/branch/commit/push ve uygun PR için ayrıca izin istemez; önceki GitHub/push bekleme notu bu kapsamda güncellenmiştir. Production deploy ve gerçek gönderim bu kurulumun kapsamı dışındadır. LIVE riskli değişiklikleri açık onay ister. Semih PC yolu/runtime/model erişimi ve rol dispatch'i henüz doğrulanmadı; ürün/LIVE PASS yok. Kurulumdan sonraki ilk kırmızı iş CRM-01 bağımsız incelemedir.


