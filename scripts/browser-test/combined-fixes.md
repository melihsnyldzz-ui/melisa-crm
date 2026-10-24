# Birleşik PR13/14/15 tarayıcı kontrolü

Bu ek kontrol gerçek CRM bileşenlerini kullanır; PR17'nin değişmeden çalıştırılan 12 senaryosunun yanına ek kanıt üretir. Normal giriş formları kullanılır. Auth token/cookie injection, gerçek müşteri mesajı veya sipariş yazısı yoktur.

[README.md](README.md) içindeki Chromium ve ayrı `work/browser` sürücü kurulumu önkoşullarını kullanın. Yeni başlatılmış, yalnız bu aday worktree'den çalışan sentetik sunucunun adresiyle:

```sh
node scripts/browser-test/combined-fixes.mjs --origin http://127.0.0.1:PORT --output work/combined-browser-fixes
```

Testte kullanılan iki ek bağımlılık açıkça sentetiktir: ertelenen tarayıcı panosu ve aynı origin'deki fixture yanıtları. FX senaryosu, mevcut ürün/müşteri cevaplarını yalnız tarayıcıda USD olarak biçimlendirir; hiçbir kayıt göndermez. JPG senaryosu, orijinal ve önizleme fotoğrafını farklı renkte yerel PNG çizimleriyle yanıtlar; indirilen gerçek JPG'nin orijinal rengini taşıdığını doğrular. Kaynaklar 240px örneklerdir; gerçek fotoğraf kalitesi hakkında sonuç çıkarılmaz. Uygulama veya sunucu kaynak dosyaları değiştirilmez.

`result.json` ve ekran görüntüleri, müşteri değişimi sonrasında eski pano geri bildiriminin elenmesini, yüksek hassasiyetli kur alanını ve seçilmiş ürünün JPG çıktısını gösterir. İndirilen JPG de kanıt klasörüne kaydedilir.
