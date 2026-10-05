# Melisa Teslim Haritası v1 — CRM girişi

**5 Ekim yeni karar merkezi:** bu harita mevcut canlı teslim bağlamını ve eski kapsam/önerileri korur; günlük iş sırası [DELIVERY_BOARD.md](DELIVERY_BOARD.md), kalıcı ürün/iş kararları [PROJECT_DECISIONS.md](PROJECT_DECISIONS.md) içindedir. Aşağıdaki CRM-önce yönü güncel panoyu geçersiz kılmaz; finish kapsamından iş silinmez.

**Tek ortak harita:** [Melisa Teslim Haritası v1 — sabit ERP belge kaydı](https://github.com/melihsnyldzz-ui/melisa-erp-v2/blob/2dbf31a808710268a2d54d48a41e3d94a4932881/MELISA_TESLIM_HARITASI_V1.md).

Ana kopya `melihsnyldzz-ui/melisa-erp-v2` reposundadır. Bu dosya ikinci bir finish tree değil, CRM'den aynı haritaya giriş noktasıdır. Güncellenmiş harita kabul edildiğinde bağlantı yeni belge commit'ine ilerletilir; çelişen iki teslim haritası tutulmaz.

## Belgenin kapsamı

5 Ekim 2026 yaklaşık 02:16–02:30 SEMIH mevcut durum raporlarını esas alır. Ana haritada başlangıç ile rapor anının karşılaştırması, CRM-önce/ERP-sonra teslim ağacı, canlı öncesi şartlar, sonraya bırakılabilecek işler ve süre hesabının belirsizlikleri bulunur. Bu kaydetme işlemi yerel sistemi yeniden denetlememiştir.

**GELİŞTİRME DURAKLATILDI.** Haritanın GitHub'a kaydedilmesi yeniden başlama, kod düzeltme, mesaj gönderme, TEST restart, migration, main merge, tag veya LIVE yayın yetkisi değildir. Son durdurma talimatı geçerlidir. Ayrıntılı özellik/kabul kayıtları `CRM_FINISH_PLAN.md` ve `CRM_STATUS.md` içinde kalır; hiçbir kabul burada yeşile çevrilmez.

## CRM için kısa teslim yönü

**Öneri:** ERP'nin bütün migration işlerini beklemeden günlük iletişim çekirdeğini önce teslim etmek. İlk sürüm kapsamı ayrıca kullanıcı tarafından kabul edilmelidir.

| Sıra | İşletmenin göreceği sonuç | Rapor anındaki açık |
| --- | --- | --- |
| CRM-1 | Normal müşterilerin mesajları doğru konuşmaya gelir | 7733 dışı genel mesaj alımı ve eski LIVE filtre sorunu |
| CRM-2 | Atanan personel doğru konuşmayı görür ve yetkisi içinde çalışır | Personelin kendi ekranı ve patron/müdür/personel kabulü |
| CRM-3 | Kullanılan cihazdan erişilir, Windows açılınca CRM çalışır | Loopback dışı erişim ve gerçek reboot/logon kabulü |
| CRM-4 | Kısmi özellikler hazırmış gibi sunulmaz | ERP yeni adayında native SQL sürücüsü eksik; genel eşleme açık. AI işletme/dil kabulü eksik |
| CRM-5 | Kabul edilmiş sürüm işyerine kurulur, gerekirse veri kaybetmeden geri dönülür | Main/tag/yayın ve son LIVE kabulü ayrı onaylı aşamalar |

7733 ile kabul edilmiş medya, çeviri, gerçek katalog/ürün/fiyat ve aynı sekmede mesaj taslağı koruması yeniden icat edilmez. Dar ERP392TRY kabulü korunur; yeni SQL/runtime veya genel müşteri/ürün kapsamı için otomatik kabul sayılmaz.

ERP taslağı ve gelişmiş AI ilk CRM sürümünden ancak kullanıcı kapsam kararıyla ertelenebilir. Ertelenen özellik hatalı/eksik halde açık bırakılmaz. Telefon/el terminali ilk günün çalışma aracıysa fiziksel mobil kabulü ertelenemez; masaüstüyle sınırlı ilk sürüm ayrı bir ürün kararıdır.

## Ölçüm ve kaynak sınırı

Rapor sayımı **25 iş: 12 tamam / 12 kısmi / 1 açık**. Bu oran canlı hazırlık yüzdesi veya kalan saat hesabı değildir. Sohbette söylenen süre/yüzde aralıkları ana haritada kalibre edilmemiş ön tahminler olarak ayrılmıştır; kesin teslim tarihi verilmez.

Birincil kaynak: kullanıcının paylaştığı `C:\Sirket\CRM\reports\CRM_CURRENT_STATE_20261005.md`, özellikle bölümler 2, 6–9. Rapor anı HEAD `f81f8012948aa1eb6c1b8a5cadabf39cfa8ca566`; çalışan C paketi `aa85448e6959441d19af3adc1ba71759a35064f2`. [Sabit kaynak STATUS](https://github.com/melihsnyldzz-ui/melisa-crm/blob/f81f8012948aa1eb6c1b8a5cadabf39cfa8ca566/CRM_STATUS.md) · [PR3](https://github.com/melihsnyldzz-ui/melisa-crm/pull/3). Native ERP adayındaki daha yeni açılış hatası paylaşılan raporda kayıtlıdır; eski STATUS'ta görünmemesi hata kapanmış demek değildir.

Bu teslim yalnız ortak harita bağlantısıdır. Uygulama, runtime, veri, mevcut plan/status ve eski PR'ler değiştirilmez. Özel raporların tamamı, müşteri mesajları, ham ticari veri, yedekler ve credential'lar GitHub'a eklenmez. Kullanıcının yeni devam talimatından sonra işler mevcut ajan kurallarıyla yürütülür; kullanıcıdan rutin Git komutları veya prompt taşıması istenmez.
