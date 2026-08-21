# BKA TUS entegrasyonu, freemium satış ve iOS yayın raporu

**Rapor tarihi:** 21 Ağustos 2026  
**Kaynak:** `/Users/bugra/Downloads/BKATUS Anki715 2/`  
**Uygulama:** TusAnkiM 1.0.0 (`com.tusankim.app`)  
**İlk yayın hedefi:** yalnızca iPhone

## 1. Sonuç

BKA Anki paketi uygulamaya kaynak kimlikleri, alanları, şablonları, CSS’i ve medyası korunarak entegre edildi. İlk açılışta eski aktif koleksiyon yedekleniyor ve tamamen kaldırılıyor; yerine her dersten 100 kart içeren fiziksel 1.200 kartlık ücretsiz deneme kuruluyor. Kart listesi açılmadan önce 1.500 TL teklif ekranı gösteriliyor; kullanıcı açıkça ücretsiz denemeyle devam edebiliyor veya tam paket ödeme akışına girebiliyor. Kullanıcı uygulamanın kart oluşturma, Anki içe/dışa aktarma, aralıklı tekrar, istatistik ve yedekleme özelliklerini ücretsiz kullanabiliyor.

1.500 TL hedef fiyatlı, tek seferlik “BKA TUS Complete” satın alması 9.583 kartın ve 114 alt konu destesinin tamamını açıyor. Satın alma/geri yükleme RevenueCat üzerinden Apple makbuzuna bağlıdır. Yerel geliştirmede kullanıcı talebine uygun bir App Store ödeme simülasyonu vardır: “Şimdi Değil” veya “Satın Al” seçimlerinin ikisi de tam kataloğu açar ve ücret çekmez. Bu dal yalnızca `__DEV__` yapılarında çalışır; production derlemesinde makbuz hakkı olmadan tam erişim açılmaz.

Kod, mobil arayüz, App Store metinleri ve Xcode 26 native derleme hattı hazırlandı. Gerçek mağaza yayını aşağıdaki proje dışı koşullar tamamlanmadan yapılamaz:

1. Kartlar, 49 medya dosyası ve AnKing marka/şablon öğeleri için yazılı ticari hak belgesi.
2. Tıbbi içeriğin güncel TUS kapsamına göre uzman incelemesi.
3. Apple Developer/App Store Connect, Paid Apps Agreement, banka-vergi ve RevenueCat ürün kurulumu.
4. Gerçek yayıncı adı, yasal iletişim bilgileri, herkese açık destek/gizlilik URL’leri.
5. Sandbox/TestFlight satın alma testi ve gerçek iPhone App Store ekran görüntüleri.

## 2. Doğrulanmış kaynak envanteri

| Ölçüm | Sonuç |
|---|---:|
| Kaynak dosya | `BKA TUS.apkg` |
| SHA-256 | `c262c9cc304abbfe716bb4d25c0d892101e35ca64d5dfee781b0f65e38d37d08` |
| Not | 7.737 |
| Kart | 9.583 |
| Kök ders destesi | 12 |
| Uygulamada oluşturulan alt konu destesi | 114 |
| Not tipi | 2 |
| Medya | 49 |
| Kaynak revlog | 0 |
| Kaynak kart durumu | 9.583 yeni |

| Ders | Tam katalog | Ücretsiz deneme |
|---|---:|---:|
| Deneme ve Soru | 810 | 100 |
| Anatomi | 477 | 100 |
| FHE | 597 | 100 |
| Biyokimya | 603 | 100 |
| Mikrobiyoloji | 730 | 100 |
| Patoloji | 724 | 100 |
| Farmakoloji | 829 | 100 |
| Dahiliye | 1.183 | 100 |
| Pediatri | 1.506 | 100 |
| Genel Cerrahi | 742 | 100 |
| Küçük Stajlar | 626 | 100 |
| Kadın Doğum | 756 | 100 |
| **Toplam** | **9.583** | **1.200** |

Not tipleri `Cloze-AnKingMaster` (7.651 not) ve `Basic (type in the answer)-26ee6` (86 not) olarak taşındı.

## 3. Aktarım doğruluğu ve bilinçli sınırlar

Korunan kaynak alanları:

- not ID/GUID, kart ID ve template ordinal,
- alan sırası ve içeriği, `sfld`, Anki checksum ve kaynak etiketleri,
- kaynak kök deste kimliği,
- kart zamanlama alanları,
- note type alanları, ön/arka template ve CSS,
- 49 medyanın tamamı.

Kart içerikleri hash ve alan bazında gerçek `.apkg` ile otomatik karşılaştırılıyor. İçe aktarılan script ve inline event handler’lar güvenlik amacıyla temizleniyor; AnKing template içindeki zamanlayıcı veya dış çağrı yapan JavaScript çalıştırılmıyor. `edit:cloze`, `hint`, özel template alanları, tıklanabilir etiketler, cloze ön/arka yüzleri ve yerel medya uygulamanın güvenli renderer’ında destekleniyor. Bu nedenle içerik birebir korunurken çalıştırılabilir üçüncü taraf JavaScript bilinçli olarak birebir değildir.

## 4. Kategorileştirme

Kaynakta ayrıntılı bir alt deste ağacı bulunmadığından 12 ders için deterministik bir TUS konu taksonomisi oluşturuldu. Kaynak tag’leri değiştirilmedi; uygulamaya özel `catalogSubject` ve `catalogTopic` metadatası eklendi. Kartlar 114 kullanılan alt desteye yerleştirildi. Örnekler:

- Anatomi: Baş ve Boyun, Nöroanatomi, Toraks, Abdomen, Pelvis ve Perine, ekstremiteler, vertebral kolon.
- Dahiliye: Kardiyoloji, Göğüs, Gastroenteroloji, Nefroloji, Endokrinoloji, Hematoloji, Romatoloji, Enfeksiyon.
- Pediatri: Yenidoğan, büyüme-gelişme, sistemler, acil, enfeksiyon, genetik ve diğer konu grupları.

Sınıflandırma tag ve kart metnindeki Türkçe/Latince anahtar kurallarla tekrarlanabilir biçimde yapılır. Bu, teknik bir editoryal sınıflandırmadır; tıbbi uzman onayı değildir. Ticari tanıtımda “uzman onaylı”, “tam güncel” veya “resmî TUS” ifadeleri kanıt olmadan kullanılmamalıdır.

## 5. İlk kurulum, deneme ve kişisel kartlar

İlk katalog geçişi kullanıcının “mevcut kartları sil, yalnızca bu kartlar olsun” isteğine göre çalışır:

1. Aktif koleksiyon otomatik yedeklenir.
2. Paket, medya ve beklenen sayılar doğrulanır.
3. Tek transaction içinde eski kart/not/deste/ilerleme kaldırılır.
4. 1.200 kartlık deneme ve 12 ders/114 alt deste kurulur.
5. Hata olursa transaction geri alınır; eksik katalog aktif bırakılmaz.

Bu ilk geçişten sonra uygulama ücretsiz Anki benzeri kullanım sunar. Kullanıcının sonradan oluşturduğu veya içe aktardığı kişisel kart, deste, not tipi, çalışma geçmişi, silme kayıtları ve medya; deneme → tam paket veya tam paket → deneme tier değişimlerinde korunur. BKA deneme kartlarındaki ilerleme de tam pakete yükseltildiğinde aynen taşınır. Native tam metin arama indeksi her fiziksel tier değişiminden sonra yeniden oluşturulur.

Tam paket hakkı yokken yalnızca 1.200 BKA kartı fiziksel veritabanındadır. Böylece sıradan UI veya arama sorgularıyla kilitli 8.383 karta erişilemez. Bununla birlikte tam `.apkg` uygulama asset’i olarak pakete gömülüdür; jailbreak/statik paket analizi yapan kararlı bir kullanıcı içeriği çıkarabilir. Daha güçlü DRM gerekiyorsa sonraki sürümde yetki sonrası indirilen, imzalı ve şifreli içerik teslimi gerekir.

## 6. Satın alma modeli

| Alan | Değer |
|---|---|
| Uygulama fiyatı | Ücretsiz |
| Deneme | 12 × 100 = 1.200 kart |
| Tam katalog | 9.583 kart; denemeye ek 8.383 kart |
| Ürün tipi | Non-consumable |
| Hedef fiyat | 1.500 TL |
| Product ID | `com.tusankim.bka.complete.lifetime` |
| RevenueCat entitlement | `bka_tus_complete` |
| RevenueCat offering | `default` |
| Çevre değişkeni | `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` |

Mağazanın döndürdüğü yerelleştirilmiş fiyat UI’da kullanılır. Ağ/RevenueCat yanıtı sekiz saniye içinde gelmezse uygulama kilitlenmez; ücretsiz deneme açılır ve satın alma alanında tekrar denenebilir hata gösterilir. Restore düğmesi aynı paywall’dadır.

Daha önce doğrulanmış süresiz hakla fiziksel tam katalog kurulmuşsa geçici ağ/RevenueCat hatasında çevrimdışı erişim korunur. Mağaza daha sonra başarılı biçimde “hak yok” cevabı verirse katalog denemeye döner; production anahtarı eksikse yerel tam katalog kaydı erişim açmak için kullanılmaz. Böylece geçici bağlantı kesintisi satın alınmış içeriği silmezken açık bir entitlement reddi ve yanlış production yapılandırması fail-closed kalır.

Apple, uygulama içindeki dijital içeriğin açılmasında In-App Purchase kullanılmasını ve geri yüklenebilir ürünlerde restore mekanizması bulunmasını ister. BKA erişimi buna göre tasarlandı: [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/), [IAP türleri](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/), [IAP fiyatlandırma](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/).

### Geliştirme ödeme simülasyonu

- Paywall 1.500 TL, tek ödeme ve süresiz erişimi gösterir.
- Temiz ilk açılışta kart ekranından önce gösterilir; tam katalog başlangıçta açık değildir.
- “1.200 ücretsiz kartla devam et” seçimi yalnızca denemeyi açar ve bir sonraki açılışta onboarding’i tekrarlamaz.
- Alt kısımdan Apple benzeri test ödeme sayfası açılır.
- “Şimdi Değil” ve “Satın Al” testte tam kataloğu açar; gerçek ücret yoktur.
- Simüle edilen geliştirme erişimi yerel veritabanında korunur; uygulama yeniden açıldığında tam katalog tekrar kapanmaz.
- Ekran, bunun geliştirme simülasyonu olduğunu açıkça belirtir.
- Production bundle’da `__DEV__` false olduğu için bu bypass ve kayıtlı geliştirme bayrağı çalışmaz.
- Release testleri anahtarsız yapının kilitli kaldığını ve entitlement olmadan erişim açılmadığını doğrular.

Bu ayrım korunmalıdır. Simülasyonu production’da açık bırakmak Apple kuralı ihlali ve gelir kaybı doğurur.

## 7. iPhone kullanıcı deneyimi

390 × 844 ve 440 × 956 sınıfı viewport davranışları gözden geçirildi:

- 12 kök ders ilk açılışta kapalı ve tek elle taranabilir.
- Deneme banner’ı “her dersten 100 / toplam 1.200” mesajını açık verir.
- Tam paket açıldığında badge ve banner anında 9.583 karta döner.
- Her kök deste kart ve alt deste sayısını gösterir.
- Çalışma ekranı gerçek katalog metadatasından “Anatomi / Abdomen” gibi ders-konu başlığı gösterir.
- Mobil kart okuma alanı 360 pt yüksekliğe çıkarıldı; uzun kart kendi alanında kaydırılabilir.
- Cevapta ön ve arka yüz üst üste bindirilmez; Anki gibi arka template ön yüzün yerini alır.
- Cevap açıldığında dış reviewer en üste döner, sonra değerlendirme tuşlarına doğal şekilde kaydırılır.
- Tekrar/Zor/İyi/Kolay düğmeleri en az 52 pt dokunma yüksekliğine sahiptir.
- Dark/light tema, safe area, dış klavye kısayolları, ses, medya, bayrak ve kart seçenekleri korunur.

İlk sürüm `supportsTablet: false` olarak ayarlandı. Böylece yayın kapsamı yalnızca iPhone’dur ve iPad’e özgü ekran görüntüsü/yerleşim iddiası yapılmaz.

## 8. iOS ve App Store teslim hazırlığı

- Expo SDK 54.0.37 / React Native 0.81.5.
- iOS minimum 15.1; `newArchEnabled: true`.
- Xcode 26.6 ile native prebuild ve CocoaPods kurulumu doğrulandı.
- App Store simgesi 1024 × 1024, PNG ve alfa kanalsız.
- Bundle ID `com.tusankim.app`, version `1.0.0`, build `1`.
- `usesNonExemptEncryption: false`.
- Privacy Manifest: Purchase History, bağlantısız, takip yok; App Functionality + Analytics.
- RevenueCat 10.7.2 / RevenueCat iOS 5.84.0 native olarak autolink edildi.
- EAS production profili otomatik build number artırır; SDK 54 için EAS’in uygun Xcode 26 imajı seçilir.

Apple 28 Nisan 2026’dan beri gönderimlerin Xcode 26+ ve iOS 26 SDK ile yapılmasını istiyor: [Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/). Expo SDK 54’ün EAS yapıları Xcode 26’yı destekler ve varsayılan olarak kullanır: [Expo SDK 54](https://expo.dev/changelog/sdk-54).

Hazırlanan teslim dosyaları:

- `docs/app-store/metadata-tr.md`: ad, açıklama, anahtar kelime, kategori, yaş beyanı, screenshot planı.
- `docs/app-store/iap-and-review.md`: ürün alanları, App Review notu, privacy cevapları, checklist.
- `docs/privacy.html`: Türkçe/İngilizce gizlilik politikası.
- `docs/support.html`: destek ve satın alma yardımı.
- `docs/terms.html`: eğitim uyarısı, IAP ve kullanım koşulları.
- `docs/app-store/screenshots/00-ilk-acilis-teklif.jpg`: temiz kurulum teklif ekranı.
- `docs/app-store/screenshots/01-deneme-desteleri.jpg`: 12 × 100 ücretsiz deste ekranı.
- `docs/app-store/screenshots/02-kart-soru.jpg`: gerçek BKA Anatomi/Abdomen kartının soru yüzü.
- `docs/app-store/screenshots/03-kart-cevap.jpg`: cevap ve Anki tipi değerlendirme düğmeleri.

Bu dört JPG iPhone 17 Pro Max simülatöründe native Release bundle ile 1320 × 2868 boyutunda üretildi ve alfa kanalı içermediği doğrulandı. Görsel/yerleşim QA’sı ve App Store taslak yüklemesi için uygundur. Nihai mağaza setinde gerçek ürün fiyatı bağlandıktan sonra satın alma ekranı yeniden çekilmeli; son regresyon ayrıca fiziksel iPhone’da yapılmalıdır.

Metadata taslağındaki `https://bugraguclu.github.io/tus-flashcard-app/{privacy,support,terms}.html` adresleri 21 Ağustos 2026 kontrolünde HTTP 404 döndürmektedir. Kullanıcının “henüz push etmeyeceğiz” talebine uygun olarak bu turda yayın yapılmadı. App Store gönderiminden önce üç yerel HTML dosyası bu adreslere veya seçilecek başka kalıcı HTTPS adreslerine yayımlanmalı ve 200 yanıtı doğrulanmalıdır.

Apple 6,9 inç iPhone için 1320 × 2868 dahil kabul edilen boyutlardan 1–10 alfa kanalsız screenshot ister: [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/). İlk non-consumable ürün yeni uygulama sürümüyle birlikte gönderilmeli ve IAP review screenshot’ı eklenmelidir: [Submit an IAP](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/).

## 9. Gizlilik ve yaş derecelendirmesi

Uygulama kartları ve çalışma geçmişini cihazda tutar. RevenueCat satın alma geçmişini entitlement doğrulama ve kendi dashboard analitiği için işler. App Store Connect’te Purchase History için App Functionality + Analytics, kimlikle bağlantısız ve tracking yok yanıtları verilmelidir: [RevenueCat Apple App Privacy](https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy). Apple tüm uygulamalar için açık privacy policy URL’si ve üçüncü tarafları da içeren veri beyanı ister: [Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/).

Kartlar sık tıbbi/tedavi bilgisi içerebildiği için yeni yaş anketinde “Medical or Treatment Information: Frequent” beyanı önerilir; bunun beklenen sonucu iOS 26 derecelendirme sisteminde 16+’dır. Uygulama tanı/tedavi/izlem yapmadığı için regulated medical device değildir; App Store Connect kullanım beyanı eğitim ve sınav hazırlığı sınırını açıkça belirtmelidir. Nihai cevaplar kartların içerik/hak taraması tamamlandıktan sonra tekrar doğrulanmalıdır.

## 10. İçerik hakkı ve tıbbi kalite — yayın engelleri

Kaynak klasörde lisans/devir belgesi bulunmadı. Başka bir kişinin hazırladığı kartları 1.500 TL karşılığı satmak için en az çoğaltma, işleme, dijital dağıtım, ticari kullanım, süre, bölge, bedel ve üçüncü taraf öğeleri açıkça kapsayan imzalı sözleşme gerekir. 49 medya dosyası, AnKing adı/logosu/template’i ve olası alıntılar ayrıca taranmalıdır. Türkiye Kültür ve Turizm Bakanlığı da çoğaltma, yayma, işleme ve dijital iletim gibi mali haklar için izin gerektiğini açıklar: [Telif Hakları Genel Sorular](https://telifhaklari.ktb.gov.tr/TR-332449/genel-sorular.html).

7.737 notun 7.277’si (%94,1) en son 2020–2021’de değiştirilmiştir. Her disiplin güncel kaynak ve TUS kapsamına göre yetkin editörce incelenmeli; inceleyen kişi, tarih, kaynak ve düzeltme sürümü kaydedilmelidir. Uygulama içindeki “tıbbi tavsiye değildir” uyarısı bu kalite kontrolünün yerine geçmez.

Türkiye tüketici tarafında yayıncı/satıcı kimliği, toplam fiyat, ödeme, dijital ifanın başlaması ve cayma/iade koşulları hukuk uzmanıyla doğrulanmalıdır: [Ticaret Bakanlığı Mesafeli Sözleşmeler Rehberi](https://tuketici.ticaret.gov.tr/yayinlar/tuketici-bilgi-rehberi/mesafeli-sozlesmeler-hakkinda-bilgilendirme). Bu rapor hukuki görüş değildir.

## 11. Doğrulama matrisi

| Kontrol | Durum |
|---|---|
| Kaynak SHA-256 ve bütünlük | Başarılı |
| 7.737 not / 9.583 kart / 12 ders / 49 medya | Başarılı |
| Her dersten fiziksel 100 kart, toplam 1.200 | Başarılı |
| 114 kullanılan alt deste | Başarılı |
| Kaynak alan/tag/template/CSS karşılaştırması | Başarılı |
| Cloze, hint, medya ve script temizleme | Başarılı |
| TypeScript | Başarılı |
| Otomatik test paketi | 40 dosya / 341 test başarılı |
| Expo Doctor | 18/18 başarılı |
| Web production export | Başarılı |
| 390 × 844 deneme/tam/paywall/soru UI | Başarılı |
| Temiz iPhone 17 Pro Max kurulumunda ilk açılış teklif kapısı | Başarılı |
| Ücretsiz devam sonrası yalnızca 12 × 100 kart | Başarılı |
| 1320 × 2868, alfa kanalsız dört native QA görseli | Başarılı |
| Xcode 26.6 prebuild + pod install | Başarılı |
| Xcode 26.6 Release iOS Simulator build | Başarılı (`BUILD SUCCEEDED`) |
| Privacy/support/terms herkese açık HTTPS yanıtı | Bekliyor — taslak URL’ler şu an 404 |
| Gerçek App Store sandbox satın alma | Dış kurulum bekliyor |
| TestFlight / fiziksel iPhone regresyonu | Dış kurulum bekliyor |
| Ticari hak belgesi | Kritik — yok |
| Güncel tıbbi editör onayı | Kritik — yok |

Bağımlılık taramasında başlangıçtaki 23 kayıt, büyük sürüm yükseltmeden uygulanabilen `brace-expansion`, `nanoid` ve `js-yaml` yamalarıyla 20’ye indirildi: 0 kritik, 9 yüksek, 11 orta. Kalan kayıtlar Expo/Metro build zincirinde ve npm’in sunduğu otomatik çözüm Expo 57’ye zorlayan uyumsuz bir büyük yükseltmedir; bu nedenle `npm audit --force` uygulanmadı. Yamalardan sonra 341 test, Expo Doctor, web export ve Xcode Release build yeniden başarılı oldu. Yayın öncesi yeniden audit alınmalı ve desteklenen Expo yükseltme yolu planlanmalıdır.

## 12. Yayın kararı ve kalan kesin işler

**Uygulama kodu ve teslim paketi yayına hazırlık seviyesindedir; ticari hak ve gerçek mağaza hesabı olmadan “Ready for Review” gönderimi yapılmamalıdır.**

- [ ] İmzalı ticari lisans ve üçüncü taraf hak taraması.
- [ ] 12 ders için güncel tıbbi/TUS editör onayı.
- [ ] Apple Developer üyeliği, Paid Apps Agreement, banka/vergi ve DSA trader bilgileri.
- [ ] App Store Connect uygulama kaydı ve gerçek yayıncı telif/iletişim alanları.
- [ ] `com.tusankim.bka.complete.lifetime` non-consumable ürünü; Türkiye 1.500 TL fiyat noktası.
- [ ] RevenueCat app/product/entitlement/offering ve production public iOS SDK anahtarı.
- [ ] Gizlilik/destek/koşul sayfalarının HTTPS üzerinden yayımlanması.
- [ ] 1320 × 2868 gerçek iPhone screenshot seti ve IAP review screenshot.
- [ ] Sandbox’ta satın alma, iptal, pending/deferred, ağ hatası ve restore.
- [ ] Production build’de geliştirme ödeme simülasyonunun görünmediğinin kontrolü.
- [ ] TestFlight’ta temiz kurulum, 1.200 trial, upgrade, uygulama kapat/aç ve restore testi.
- [ ] Son bağımlılık, erişilebilirlik ve içerik regresyonu.

Bu maddeler tamamlandığında 1.0.0 build’i App Store incelemesine gönderilebilir.
