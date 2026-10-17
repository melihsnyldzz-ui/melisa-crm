# CRM: Sürümleme standardı

İlk release bu görevde **oluşturulmaz**. Tag yalnız kabul edilmiş, gerekli CI kontrolleri başarılı **main commit'inden** açılır. Bugünkü main çalışan kabul edilmiş en yeni sürüm diye varsayılmaz.

## Basit sürüm adları

| Etiket | Anlam |
| --- | --- |
| `v1.0.0` | İlk gerçek kabul edilmiş ana sürüm |
| `v1.0.1` | Mevcut davranışı koruyan hata düzeltmesi |
| `v1.1.0` | Geriye uyumlu yeni özellik |
| `v2.0.0` | Mevcut kullanım/API sözleşmesini kıran değişiklik |

CRM ve ERP ayrı repolarda aynı `v1.0.0` adını kullanabilir; birlikte yayınlanmak zorunda değildir. Mevcut package.json sürümleri ilk ürün release'i sayılmaz ve bu hazırlıkta topluca değiştirilmez. Tagler yeniden kullanılmaz veya başka commit'e taşınmaz.

## Release için gereken kayıtlar

1. Tam main commit'i, PR ve kapsam net; mevcut kaynak/kabul kayıtları kaybolmamış.
2. O sürümü oluşturan tam kod için gerekli CI başarılı; merge sonrası main push kontrolleri de başarılı.
3. Kullanıcı gerçek kullanım kabulünü aynı kod/kapsam için kaydetmiş. Yalnız doküman/CI değişiminde bu PR'nin insan kabulü ayrıca kayıtlı.
4. TEST paketinin commit/hash, ortam kimliği ve kabul sonucu mevcut.
5. Bilinen eksikler ve geri dönüş paketi belli. LIVE'a geçiş için ayrıca hedef/kapsam/onay mevcut.
6. Kullanıcı tag/release oluşturmayı açıkça istemiş.

Sonra ajan kabul edilmiş main commit'ine annotated tag açar ve GitHub release notuna kullanıcıya anlaşılır değişiklikler, PR'ler, CI/kabul kanıtı, bilinen eksikler ve rollback paketi yazar. Feature branch'e ilk release tag'i konmaz; otomatik release workflow'u yoktur.

Tag kaynak sürümünü isimlendirir; o sürümün LIVE'da kurulu olduğunu kanıtlamaz. LIVE kimliği [CRM_STATUS.md](../../CRM_STATUS.md) ve deployment kaydında ayrı tutulur. Eski sürüme kod geri dönüşü ticari kayıtları silmez veya eski DB yedeğini otomatik geri yüklemez.

İlgili belgeler: [Çalışma düzeni](GITHUB_WORKFLOW.md), [TEST → LIVE](DEPLOY_ROLLBACK.md).
