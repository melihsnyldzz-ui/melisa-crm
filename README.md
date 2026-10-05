# MELISA CRM

Karar merkezi: [kalıcı kararlar](PROJECT_DECISIONS.md) → [günlük teslim panosu](DELIVERY_BOARD.md) → [kullanıcı kabulü](USER_ACCEPTANCE.md). `devam` davranışı [AGENTS.md](AGENTS.md) başındadır; mevcut finish plan tam kapsam, status teknik kanıt kaydı olarak kalır.

Kanonik GitHub repo: [melihsnyldzz-ui/melisa-crm](https://github.com/melihsnyldzz-ui/melisa-crm). SEMIH geliştirme kökü: `C:\Sirket\CRM\melisa-crm`.

Önce [AGENTS.md](AGENTS.md) başındaki karar merkezi okuma sırası uygulanır. Uygulama tabanı `feature/crm-completion` / `fd297df9922c4157aa5e8944bf0c091d618906c3`; aktif ajan dalı `codex/crm-agents-on-completion-20261003`, [PR #3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3).

Kaynak checkout’u çalışan servis değildir. Runtime ve özel ayarlar repo dışında korunur. Eski kopyalar arşiv/kanıt olarak kalır; yeni geliştirme bu kökte yapılır. Main, LIVE, TEST servisleri ve ticari veriler kök düzenleme işiyle değişmez.
# GitHub teslimi

Geliştirme ve kontrol: [GitHub çalışma düzeni](docs/development/GITHUB_WORKFLOW.md), [sürümleme](docs/development/RELEASES.md), [TEST ve geri dönüş](docs/development/DEPLOY_ROLLBACK.md). Güncel kapsamın tek ağacı [CRM_FINISH_PLAN.md](CRM_FINISH_PLAN.md), doğrulanmış durum [CRM_STATUS.md](CRM_STATUS.md) içindedir.
