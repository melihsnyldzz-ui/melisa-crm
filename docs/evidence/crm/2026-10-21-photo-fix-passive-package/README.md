# A04–A05 fotoğraf düzeltmesi için pasif paket hazırlığı — 21 Ekim 2026

Kullanıcı ERP kurulum makbuzu hazırsa kaynak/paket/runtime eşlemesi, hazır değilse aynı bitiş ağacında bağımsız yetkili iş istedi. ERP ana ajanının son görünür işi prova/kurtarma; tamamlanmış yeni aday kurulum makbuzu henüz yok. Salt okunur alternatif incelemesi yeni kurulum başlatmadığını ve runtime/DB değiştirmediğini bildiriyor. Bu kayıt kurulmuş sürüm kanıtı değildir.

## Bağımsız teknik halka

Daha önce teslim edilmiş A04/A05 React fotoğraf bağlamı düzeltmesi **d1e4425206249e38445fb103e03601f86baa84ec / tree ce0e2a95a2d9897aedbd021d79a5c6a5e0371d19** için Node24.19 pasif paket yoktu. Builder'a yalnız bu kaynağın ayrı literal **crm20261021-node-v24.19.0** profili eklendi. Önceki439 ve7ba adayları veya ERP kurulum pinleri yeni kaynağa atanmadı. Bu paket, ERP sahibine kendiliğinden yeni kurulum görevi vermez.

Kanonik repo/release kökü, gerçek executable/hash, win32/x64/v24.19.0, raw Git-LF lock hash'leri ve isolatedPreparation=true zorunlu. Genel root/commit allowlist, CLI override/fallback eklenmedi. Verifier, secret/path/link/reparse kontrolleri, varsayılan kök, temiz offline npm environment, immutable build/seal ve eski iki profil LF normalize karşılaştırmada değişmedi. Node/npm pinleri gerçek dosyalardan salt okunur doğrulandı.

## Hedefli kanıt

Mevcut gerçek-builder VM fixture'ına10vaka eklendi: önce **61 test /51 PASS /10 FAIL**, sonra **61/61 PASS**. Yeni profil eskiden bilinmiyordu; olumsuz vakaların ret kodu farkı10güvenlik açığı değildir. İlk eklenen testteki syntax hatası baseline'dan önce düzeltildi. İlk karşılaştırma işaretçisi yanlış bölümü seçti; dar ve benzersiz işaretçiyle son7bölüm eşliği sağlandı. Dört doğrudan verifier/locked dependency/npm resolver/CLI uyumluluk testi PASS. Bağımsız mevcut reviewer salt okunur kaynak incelemesi açıkP1/P2=0. VM gözlemleri üretim API'sine eklenmedi ve gerçek build kabulü sayılmadı.

```powershell
& 'C:\Sirket\ERP\tools\node-v24.19.0\node.exe' --test --test-reporter=spec tests/test-package-node2419.test.mjs
& 'C:\Sirket\ERP\tools\node-v24.19.0\node.exe' --import ./tests/offline-test-guard.mjs --test --test-name-pattern='complete offline package verifies|verify CLI emits safe JSON|npm resolver uses only bounded|locked dependencies reject' tests/test-package.test.mjs
```

Uygulama hedefi d1e4425, builder teslim commit'i ve sonraki belge makbuzu farklı kimliklerdir. Gerçek pasif paket, manifest ve CI sonuçları [verification.json](verification.json) içinde yalnız oluştuğunda kaydedilir.

## Korunan sınır

CRM yalnız kaynak/test ve pasif artefakt hazırlar; kurulum, shared runtime/config/store/SQL/servis ve restart ERP sahibinde. Normal GUI DENENMEDİ, fiziksel cihaz ve CRM-UA11 insan kabulü BEKLİYOR. Yeni Goal/ajan/otomasyon/tree yok; mevcut25CRM=12tamam/13kısmi/0açık, ortak74sayısı değişmedi. Native Goal sorgusu bu tur null döndü; eski PAUSED notu yeni doğrulama olarak kullanılmadı. Kaynak checkout'u deployment veya çalışan runtime kimliği sayılmadı. LIVE/Vega/T1/gerçek ticari kayıt/müşteri mesajı/ücretli API/main/tag/release/kimlik bypass yok.
