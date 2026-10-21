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

Uygulama hedefi d1e4425, builder teslim commit'i ve sonraki belge makbuzu farklı kimliklerdir. Gerçek pasif paket, manifest ve exact-source CI sonuçları [verification.json](verification.json) içine kaydedildi. Sonraki belge commit'i bu kaynak CI'ının yeni koşumu sayılmaz.

## Gerçek pasif paket ve koordinasyon

Builder **993332154eef2b4995339c8fc25074860021cf3a** feature'a push edildi. Exact [PR CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39559610283), [push CI](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39559605481) ve [AI offline](https://github.com/melihsnyldzz-ui/melisa-crm/actions/runs/39559610357) SUCCESS;7job geçti. Staged secret0, istisna eklenmedi.

Resmî builder tek çağrıda **07:06:38–07:08:42UTC** arasında yeni d1 uygulama paketini üretti: `C:/Sirket/CRM/releases/node-v24.19.0/crm-shared-test-d1e4425206249e38445fb103e03601f86baa84ec`. Manifest **a0e86fccbdb95eeb97e4dc08e383db7bf8f12a29b040f34a78f6c37e3093b5ef**, client/index **20c54be38615a81f327a27939a5318d09c2ac5dd4a720e159f61a9b6eeba6f77**;186Git source/2292payload/23.960.004bayt, manifest dahil2293dosya readonly. FreshVite/offline locked npm-ci/ignore-scripts ve resmî staging/final verifier PASS. [Değişmeyecek paket makbuzu](package-receipt.json) SHA256 **2d78ae2e19b3084c01ba96c9d5f56a28b20af68e72042c639678750d729b74a5**. Mevcut bağımsız reviewer gerçek artefakt için **GO/açıkP1/P2=0** verdi: onaylı Node ile resmî verifier exit0;186source Git blobu d1 tree ile birebir, source/lock/index/2293readonly kontrolü PASS. Eski344koruma kaydını reviewer yeniden taramadı; root before/after makbuzunu okudu.

[Gerçek önce snapshot'ı](preservation-before.json) SHA256 **738870367dd983f1ed63d7910f16f2822ba2d628dd7878c9efb486c8a691e77f**;63önceki paketin126manifest/index dosyası ve eski başarısız staging ile344koruma kaydında hash/boyut/mtime/mode/nlink after eşliği var. Önceki yanlış index yolu kullanılmadı; bütün126gerçek dosya before mevcut. Eski paket/staging silinmedi veya değiştirilmedi.

Kullanıcı Dot üzerinden kurulumdan önce d1 fotoğraf düzeltmesiyle eşleme ve ERP'yle doğrudan koordinasyona açık yetki verdi. ERP sahibi kurulumun başlamadığını ve eski7ba adayını kurmayacağını teyit etti; yeni tam tuple ve makbuz path/hash doğrudan ona iletildi. Owner'ın bildirdiği mevcut ERP e59e07ab / CRM6bc82e6f / SUP13bdf75a / DB02-copye16b-T1false kimlikleri **ERP owner bildirimi** seviyesindedir; CRM yeni runtime readback'i değildir. Eski controller'ın7ba/de54 tuple'ını yeni kaynağa güvenle bağlamak owner'ın dar source/profile/admission/recovery işidir; burada shared pin değiştirilmedi. Yeni kurulum makbuzu gelince CRM'nin salt okunur eşlemesi yapılacak.

## Korunan sınır

CRM yalnız kaynak/test ve pasif artefakt hazırlar; kurulum, shared runtime/config/store/SQL/servis ve restart ERP sahibinde. Normal GUI DENENMEDİ, fiziksel cihaz ve CRM-UA11 insan kabulü BEKLİYOR. Yeni Goal/ajan/otomasyon/tree yok; mevcut25CRM=12tamam/13kısmi/0açık, ortak74sayısı değişmedi. Native Goal sorgusu bu tur null döndü; eski PAUSED notu yeni doğrulama olarak kullanılmadı. Kaynak checkout'u deployment veya çalışan runtime kimliği sayılmadı. LIVE/Vega/T1/gerçek ticari kayıt/müşteri mesajı/ücretli API/main/tag/release/kimlik bypass yok.
