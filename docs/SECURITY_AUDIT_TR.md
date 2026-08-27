# TusAnkiM güvenlik raporu

Son güncelleme: 25 Ağustos 2026

## Kısa sonuç

Uygulamanın bilinen yüksek ve orta riskli teknik açıkları için savunmalar eklendi. Hiçbir yazılım
“asla hacklenemez” diye garanti edilemez; amaç saldırıyı zorlaştırmak, zararı sınırlamak ve veri
kaybından geri dönebilmektir.

Bu sertleştirme yalnız iOS sürümünü hedefler. Web yalnız yerel/CI regresyon hedefidir; Android
yayın hedefi değildir. Kullanıcı kararı gereği şu konular değiştirilmedi:

- AnkiWeb veya başka bir eşzamanlama sistemi eklenmedi.
- Zamanlanmış otomatik yedeklerin sıklığı ve saklama politikası değiştirilmedi.
- Face ID uygulama kilidi, SQLCipher ve şifreli dışa aktarma eklenmedi; iOS tam dosya koruması
  kullanılmaya devam ediyor.
- BKA kart paketinin uygulama build'i içinde bulunması kabul edildi; paket çıkarılabilir.

## Düzeltilen noktalar

- İçe aktarılan kart kodu çalıştıramaz, gizlice internete bağlanamaz veya başka sayfa açamaz.
- Düzenleyicide yalnız uygulamanın imzalı/nonce'lu köprü kodu çalışır; kullanıcı HTML'i temizlenir,
  ağ, çerçeve, form, pencere açma, çerez, ortak süreç ve önbellek yetkileri kapalıdır.
- HTTPS dış bağlantıları kullanıcı açıkça onaylamadan sistem tarayıcısında açılmaz.
- Dış otomasyon dönüşleri yalnız kimlik bilgisi taşımayan HTTPS veya iOS Shortcuts adreslerine gider.
- Zararlı/çok büyük Anki arşivleri açılmadan boyut, dosya sayısı ve sıkıştırma oranı denetiminden geçer.
- Seçilen dosyanın bilinen boyutu belleğe alınmadan denetlenir; gömülü SQLite bütünlük, temel tablo,
  kayıt ve tek alan boyutu sınırlarından sonra salt okunur moda alınır.
- HTML, SVG, JavaScript ve WebAssembly gibi aktif dosyalar kart medyası olarak saklanmaz.
- Her `.apkg` ve `.colpkg` işleminden önce otomatik geri dönüş yedeği oluşturulur.
- Bozuk, aşırı büyük, yinelenen veya birbiriyle bağlantısız yedek satırları veritabanı değişmeden reddedilir.
- Web sürümü SQL motorunu dış CDN'den değil uygulamanın sabitlenmiş yerel paketinden yükler.
- Web veritabanının çift başlatılıp yeni tabloları eski boş kopyayla değiştirmesine yol açan yarış kapatıldı.
- Web ve kart görüntüleyici için içerik güvenlik politikası eklendi.
- iOS'ta cihaz kilitliyken tam dosya koruması etkin; keyfi ve yerel ağ yükleri kapalıdır.
- Uygulama yalnız iOS/web hedefleriyle paketlenir; iOS belge rolleri yalnız görüntüleyici/içe
  aktarıcıdır ve desteklenen Node 24 yapı zinciri CI ile EAS'ta sabitlenmiştir.
- Paylaşılan JSON yedeğinin şifresiz olduğu kullanıcıya gönderimden önce açıkça gösterilir.
- CI bağımlılık denetimi, paket imza kontrolü, CodeQL, Dependabot, en az yetki ve sabit commit SHA'larıyla güçlendirildi.
- Özel güvenlik bildirimi için `SECURITY.md` eklendi.

## Doğrulama

646 otomatik test geçti. Expo Doctor 18/18 geçti, iOS yapılandırma/uyumluluk kaydı doğrulandı,
üretim web paketi oluşturuldu, bağımlılık taramasında bilinen açık bulunmadı ve 925 paketin kayıt
imzası doğrulandı. Canlı web açılışında veritabanı, yerel WASM ve CSP hatasız çalıştı.

Otomatik testler; kart içeriği, arşiv sınırları, Anki içe aktarma ve yedek doğrulamasını kapsar.
Yayın öncesinde fiziksel iPhone'da zararlı paket, yedek paylaşım uyarısı ve Files içe aktarma duman
testleri ayrıca uygulanmalıdır.
