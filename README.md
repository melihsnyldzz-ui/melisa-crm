# MELISA CRM

GitHub: [Çalışma düzeni](docs/development/GITHUB_WORKFLOW.md) · [Sürümler](docs/development/RELEASES.md) · [TEST → LIVE / geri dönüş](docs/development/DEPLOY_ROLLBACK.md). Her iş branch → commit → push → PR ile teslim edilir; kullanıcı kabulü olmadan main merge yapılmaz.

Kanonik GitHub repo: [melihsnyldzz-ui/melisa-crm](https://github.com/melihsnyldzz-ui/melisa-crm). SEMIH geliştirme kökü: `C:\Sirket\CRM\melisa-crm`.

Önce [AGENTS.md](AGENTS.md), [ana bitiş planı](CRM_FINISH_PLAN.md) ve [güncel durum](CRM_STATUS.md) okunur. Uygulama tabanı `feature/crm-completion` / `fd297df9922c4157aa5e8944bf0c091d618906c3`; aktif ajan dalı `codex/crm-agents-on-completion-20261003`, [PR #3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3).

Kaynak checkout’u çalışan servis değildir. Runtime ve özel ayarlar repo dışında korunur. Eski kopyalar arşiv/kanıt olarak kalır; yeni geliştirme bu kökte yapılır. Main, LIVE, TEST servisleri ve ticari veriler kök düzenleme işiyle değişmez.
