# Normal CRM personel oturumu / terminal — 11 Ekim 2026

CRM-DEC-011 / ERP-COMPLETE01. Çalışan immutable source `09ca1dac346e42037fd02901baf3240aa6ce6285`, manifest SHA256 `9de545b7c06197d628234c67d6ace60780acde4c02685780207abde677cacc4a`. Normal CRM62700, ERP9cc Hub5234/API4184/native4186, aynı DB02 copy `e16b70f0-4057-428b-9abc-6bbcaf35fe82`. Bu belge/test HEAD'i uygulama kaynağı değildir; yeni runtime aktivasyonu yapılmadı.

Gerçek TC21 v22 şirket Wi-Fi/boş ADB reverse ile normal dedicated TEST personel hesabı mevcut atanmış liste/geçmişi açtı. Desteklenen ayrı personel kimliği ve mevcut agent3 ataması kullanıldı; shared crm-ahmet parolası/rolü değiştirilmedi. Kullanıcıdan parola istenmedi; Windows DPAPI korumalı kayıt ve Android Keystore ayrı ERP/CRM refresh kayıtları kullanıldı. Yanlış kimliğe SSO kurulmadı.

## Teknik sonuç

- Normal HTTP login/me/refresh/eski grant reddi/logout kanıtı önceki ERP2fb/CRM17ff kaydında korunur; CRM17ff→09ca yalnız konuşma CSS değişikliğidir. Gerçek cihaz force-stop/reopen normal atanmış listeyi tekrar açtı.
- ERP→CRM görev geçişinde giriş tekrarına gerek kalmadı; mevcut gönderilmemiş taslak korundu. Açık Çıkış sonrası iki giriş kapısı geri geldi; root korumalı girişleri yeniden hazırladı. Son force-stop/reopen liste/geçmişi açtı; önceki taslak çıkışta temizlendi. Taslağın yalnız bağımsız force-stop kalıcılığı bu son turda ayrıca ölçülmedi.
- İlk hızlı back/reopen denemesinde boş metin görüldü; kontrollü geri dönüş/görev geçişinde taslak korundu. İlk gözlem private kanıtta kaldı. İlk normalizer teşhisi doğrulanmadı: mevcut `...row` agent alanını zaten korur. Production düzeltmesi veya hatanın bütünüyle kapandığı iddiası yok.
- İki mevcut test dosyasına gerçek normalizeConversation→strict numeric assignment→dedicated draft storage→mounted App geri/reopen/poll zinciri eklendi. Başka assignment/bozuk kimlikte taslak temizliği ve send kapalı sınırı kontrol edildi. Root40/40 PASS; bağımsız3 hedefli kontrol PASS. Bunlar gerçek cihaz/insan kabulünün yerine geçmez.

## Teslim ve sınır

Kurulum `http://192.168.1.46:5234/install.html`; v22 APK HTTP200/45.326.137byte/SHA256 `4cbbde0a389924cf25d4eebb9fdb3692ace15edae4219b348c8df78027803bcf`. Android Müşterilerim atanmış konuşma/geçmiş/gönderilmemiş taslağı açar. Mevcut normal TEST personel yalnız `crm.view`; gerçek mesaj gönderme yetkisi yok. Provider/otomatik çeviri/ücretliAI çağrısı yapılmadı.

CRM42sn Türkçe gerçek cihaz dersi successful2114 kaydından üretildi; telefonlar yalnız türevde maskelendi, failure2104/orijinaller korundu. Root tam video decode/kare/ses kontrolü yaptı. Beş klip/dört görev özel ERP teslim paketinde, tarihli mal kabul pinleri ayrı. Browser file URL politikası nedeniyle yerel HTML oynatım kontrolü yapılmadı. Ham müşteri görüntüleri/videolar/sırlar/ayarlar GitHub'a yüklenmez.

Windows aynı-kullanıcı logon görevleri immutable paketleri başlatır; PC açık/Windows girişli olmalıdır. Gerçek reboot/logoff denenmedi; DHCP rezervasyonu ertelenmiş. TEST125/CRM eski runtime/native62704, roller/aktarımlar/LL/karantina korunur.

Özel kanıt kökü `C:\Sirket\ERP\evidence\ERP-COMPLETION01-20261011\private\recovery-proof`: `crm-draft-actual-shape-09ca-v2.json`, `v22-crm09ca-slow-draft-list.png`, `v22-crm09ca-slow-draft-reopened.png`, `v22-crm-after-sales-switch.png`, `v22-crm-after-logout-login-empty.png`, `v22-final-crm-history-protected.png`. Kardeş `private\video-delivery` orijinal/türev hashleri/root decode makbuzunu içerir. Bu CRM turunda ticari yazma0; kendi TEST oturumu login/logout audit etkisi ayrı.

CRM PR3 son test/belge head ve CI push sonrası ayrı kaydedilir. Mevcut jobs hesap ödeme/harcama nedeniyle başlamadı; CI yeşil değildir. CRM-UA09/önceki insan kabulleri bekliyor; finish25/12/13/0 aynı. Gerçek gönderim veya geniş personel kabulü tamam ilan edilmez; bu teslim sonrası yeni ticari prova kendiliğinden başlamaz.
