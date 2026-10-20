# P09.1.b / C01–C02 — PR19 inbox ve atama düzeltmesinin feature'a alınması

20 Ekim 2026 · `DOT-CRM-INBOX-INTEGRATE-20261020-1119`

Normal personelin inbox isteği beklerken oturumu veya konuşma ataması değişebiliyor; önceki feature kodu bu yanıtı yayımlayabiliyordu. [PR19](https://github.com/melihsnyldzz-ui/melisa-crm/pull/19) hazır düzeltmesi mevcut feature'a uzlaştırıldı. Yeni iş mantığı, giriş yolu veya personel hesabı eklenmedi. **Kaynak teknik olarak doğrulandı; TEST'e kurulmadı, normal GUI ve insan kabulü yapılmadı.**

## Ön kontrol ve kaynak seçimi

- Kanonik root/fetch/push origin ve feature doğrulandı. Başlangıç `ce071f19e347dbe6efd8d6219e85602af76a7401`, çalışma ağacı temiz; mevcut sekiz worktree temiz ve korundu. Başka görünür aktif inbox yazarı yoktu; görünmeyen kuyruk **UNKNOWN**.
- PR19 exact `03a86097c3fd25551f1faab34881f60ec0fea75b`, parent `af84b6da962f85dab1d76a75cf23c1799e4acb69`, OPEN/MERGEABLE olarak okundu. Altı dosyanın parent ve feature başlangıç blobları aynıydı; fark gerçekten eksikti.
- Yalnız dört uygulama ve iki test dosyasının incelenmiş patch'i alındı; cherry-pick, eski STATUS kopyası veya başka PR değişikliği yok. Altı son dosya PR19 bloblarıyla birebir. Exact dosya/blob eşlemesi [verification.json](verification.json) içinde.
- Native Goal **PAUSED** kaldı. Mevcut checker bir kez CHECK_REQUIRED/exit3, changed=false/cacheSaved=true verdi: iki CRM kanıtı REUSE, eski normal GUI önkoşulu BLOCKED. Bu metadata sonucu kaynak çalışmasını veya insan kabulünü kapatmaz; shared runtime sağlığı ölçülmedi.

## Davranış

1. Normal personelde mevcut `createConversationHistoryRequestGuard`, inbox okumasının başında ve yanıt öncesinde resmi token/expiry/fingerprint/`crm.view` doğrulamasını tekrarlar. Geçersizleşen oturum veri döndürmez.
2. Mesajların ve readiness işinin bekleyişinden sonra, **dönecek konuşma ID'leri** mevcut taze assigned-subset kontrolünden geçer. Başka personele atanan konuşma 403 ile reddedilir.
3. Personelin Chatwoot okuma/yetki hatası eski yerel inbox mirror'ıyla başarılı yanıta çevrilmez. Patron/müdür cache/fallback dalları ve mevcut TEST personeli guard'ı korunur.

Garanti dönen konuşmalar ve oturum kapsamındadır; bütün konuşma toplamları veya tüm atamalar için atomik anlık görüntü iddiası yoktur. Frontend, mesaj gönderme, katalog ve ERP taslak sözleşmeleri değiştirilmedi.

## Dar before/after doğrulaması

Gerçek controller/service kodu, mevcut offline guard altında sentetik fetch/config fixture'larıyla çalıştırıldı. Ağ servisi, gerçek Chatwoot, SQL veya tarayıcı kullanılmadı. GitHub'a yalnız kapsam, komut, sayım ve hata adları taşındı; ham yerel TAP yayımlanmadı.

| Koşum | Sonuç | Kapsam |
| --- | --- | --- |
| PR19'un dört regresyon grubu, eski uygulama + yalnız test patch'i | exit1; 1 PASS / 12 FAIL | İstek sırasında active/role/agent/password/permission/token değişimi, hydration sonrası assignment, bootstrap ve stale fallback reddi |
| Aynı dört grup, hazır source patch'i sonrası | exit0; 13 PASS / 0 FAIL | Aynı gerçek controller/service yolu |
| Altı etkilenen uyumluluk grubu | exit0; 9 PASS / 0 FAIL | Geçersiz view, TEST personel bootstrap, taze kendi subset'i, yönetici snapshot/bootstrap, yanlış kişiye/reassignment ret |

Node sayımları iç içe parent testleri de içerir; 13 yeni işletme kabulü değildir. Bunlar mevcut PR19 test gruplarının feature entegrasyon kontrolüdür. Eski 87 test sonucu yeni kabul diye sayılmadı; yerelde tam 87'lik paket veya eski tarayıcı senaryoları tekrar koşulmadı. [Makine sonuçları](test-results.json).

Son kaynakta aynı dar komutlar:

```powershell
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap --test-name-pattern="ordinary personnel|personnel assignment failure" apps/gateway/src/controllers/inboxController.test.js apps/gateway/src/services/chatwootInboxService.test.js
node --import ./tests/offline-test-guard.mjs --test --test-reporter=tap --test-name-pattern="invalid inbox views|personnel bootstrap validates|personnel bootstrap reads only|management snapshots preserve|management bootstrap reads one|personnel detail rejects another assignment" apps/gateway/src/controllers/inboxController.test.js apps/gateway/src/services/chatwootInboxService.test.js
```

Üç işlevsel uygulama dosyasının syntax kontrolü ve diff kontrolü geçti. Mevcut bağımsız reviewer altı dosyayı salt okunur inceledi: açık P1/P2=0; test/runtime çalıştırdığı iddia edilmez. Yeni source HEAD'in CI makbuzu commit sonrasında bu aynı kayda eklenecek; PR19'un eski CI'si yeni feature'a atanmaz.

## Kurulum ve kalan sınır

Son yayımlı owner kanıtı kurulu CRM kaynağını6bc82e6 olarak bildirir; bu tur taze health veya kurulum yok. Yeni source/paket/runtime eşit sayılmadı. **GUI DENENMEDİ; fiziksel cihaz ve gerçek personel kabulü BEKLİYOR.** C01/C02/CRM-UA11 ve25 toplam /12 tamam /13 kısmi /0 açık; özgün74 kapsamı değişmez.

[Sipariş→tek satış fişi sözleşme devri](../2026-10-20-sales-bridge/README.md) ayrı açık bağımlılıktır; inbox düzeltmesi onu kapatmaz. ERP deposuna/shared SQL/runtime/config/servise, aktif B264 sahibine, LIVE/Vega/T1'e, gerçek müşteri mesajına veya ücretli API'ye işlem yok. Main merge, yeni Goal/otomasyon/ajan/TEST yok. Teslim mevcut feature ve [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3) içindedir.
