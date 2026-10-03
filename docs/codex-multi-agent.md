# CRM ajan takımının kullanımı ve doğrulama sınırı

Repo kimliği `origin` remote üzerinden `melihsnyldzz-ui/melisa-crm` olarak doğrulandı. Kurulum feature branch üzerinde yalnız talimat, kaynaklı bitiş planı ve Codex ayarlarını ekler. Mevcut status/deployment/baseline belgeleri ve ürün kodu korunur.

`.codex/config.toml` ana oturum ve subagent varsayılanını `gpt-6.1-sol` / `medium` seçer. `.codex/agents/` altında `explorer`, `backend`, `frontend`, `reviewer` otomatik keşfedilir; reviewer `high` kullanır. Explorer/reviewer `read-only`, yazıcılar `workspace-write` varsayılanına sahiptir. Aynı rol için ayrıca `[agents.<role>]` kaydı eklenmedi. Ana ajan dosya sahipliği vererek en fazla üç bağımsız subagent'ı birlikte çalıştırır.

Şema kaynağı: [Resmi Subagents belgesi](https://learn.chatgpt.com/docs/agent-configuration/subagents) ve [Configuration Reference](https://learn.chatgpt.com/docs/config-file/config-reference), 2026-10-03 tarihinde okundu. TOML sözdizimi, zorunlu rol alanları ve plan referansları statik kontrol kapsamındadır. Bu PC'de çalışan Codex masaüstü runtime 0.160.0 model kataloğu `gpt-6.1-sol` için `medium` ve `high` desteğini doğruladı. PATH üzerindeki eski CLI 0.152.1 katalogunda Sol görünmedi; bu eski CLI'de kullanılabilirlik doğrulanmadı. Sabit binary yolu repo ayarı değildir.

Kurulum doğrulaması (2026-10-03): dört rol TOML'i ayrıştırıldı; bağımsız rol metadata alanları ve kalan config katmanı güncel resmi JSON şemasına göre kontrol edildi. Yerel belge bağlantıları ve diff kontrolü temiz; bağımsız içerik review'unda somut P1/P2 bulgu çıkmadı. Mevcut kullanıcı ayarları korunarak yalnız bu çalışma kopyası için yerel proje güven kaydı eklendi. Masaüstü app-server `config/read`, etkin proje katmanı, Sol Medium, ajanların etkin olması ve üç eşzamanlı alt ajan sınırını doğruladı.

Native rol smoke'unda `reviewer` gerçekten açıldı; kalıcı oturum kaydı `agent_role=reviewer`, `model=gpt-6.1-sol`, `reasoning_effort=high` ve etkili salt okunur dosya/kapalı ağ politikasını doğruladı. Alt ajan araç veya ürün işlemi yapmadan yanıt verdi. Diğer üç rolün görevi çalıştırılmadı; bunlar şema/model/sandbox kontrolünden geçti. İlk `--ephemeral` denemesi `no rollout found for thread id` nedeniyle alt ajan açamadı; kalıcı oturumda tekrar deneme başarılı oldu. Multi-agent smoke için bu runtime'da kalıcı oturum kullanıldı.

Oturumun izin tercihleri rol sandbox varsayılanını geçersiz kılabildiğinden ana ajan yeni görevde etkili izinleri kontrol eder. Explorer/reviewer araç izinleri daha geniş olsa da build/restart/commit/push dahil mutasyon yapmaz. Bu teknik rol smoke'u gerçek CRM kullanıcı kabulü değildir.

Semih PC'de gerçek remote doğrulanmış repo kökünden güvenilir proje olarak yeni Codex oturumu açılır; mevcut konuşmanın ayar değiştirdiği varsayılmaz. Runtime rol keşfi/model erişimi başarısızsa eksik adım ve desteklenmeyen alan/model açıkça raporlanır; sessiz başarı iddiası veya başka PC yolu kullanılmaz. Bu belge gerçek ürün kullanıcı kabulü, REV3 kurulum, LIVE deployment, mesaj/medya gönderimi veya ERP yazımı yapılmış demek değildir.

Ana konuşmaya yazılacak komut:

> Planındaki sıradaki kırmızı maddeyi bitir. Gereken ajanları kullan; gerçek kabul hazır olunca dön.
