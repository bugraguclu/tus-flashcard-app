# TusAnkiM — ücretsiz Anki ve ücretsiz açılan BKA TUS paketi: ürün, kod ve iOS yayın raporu

**Rapor tarihi:** 22 Ağustos 2026 (kaynak paket denetimiyle güncellendi)
**Uygulama:** TusAnkiM 1.0.0 (`com.tusankim.app`)
**Kaynak paket:** `assets/catalog/bka-tus-complete.apkg` (SHA-256 `c262c9cc304abbfe716bb4d25c0d892101e35ca64d5dfee781b0f65e38d37d08`)
**İlk yayın hedefi:** yalnızca iPhone

## 1. Sonuç

Uygulama artık istenen modelde çalışıyor: **TusAnkiM ücretsiz bir Anki istemcisi**, BKA TUS kartları ise
**deste listesinde ayrı duran bir hazır içerik paketi**. Kullanıcı uygulamayı açtığında eski sürümdeki gibi kendi
boş/dolu koleksiyonunu görüyor; listenin altında henüz kurulmamış “BKA TUS” paketi duruyor. Bu satıra dokunulduğunda
12 dersin ve 106 alt destenin tamamı gerçek kart sayılarıyla listeleniyor ve aynı ekrandan
“Kartları ücretsiz aç” seçilebilir. Apple/RevenueCat kontrolü yapılmadan 9.583 kart kullanıcının kendi koleksiyonuna
**eklenerek** kuruluyor; kullanıcının kendi desteleri, notları, not tipleri ve çalışma geçmişi bu işlemden
etkilenmiyor.

Bu rapor aynı zamanda bir önceki turun (21 Ağustos) çıktısının eleştirisidir: o tasarımın hangi kısımları
doğruydu, hangileri ürün hedefiyle çelişiyordu ve ne değiştirildi, bölüm 2’de açıkça yazılıdır.

Ödeme yolu kodda gelecekte yeniden etkinleştirilmek üzere korunur; mevcut preview ve production profillerinde
`EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED=false` olduğundan çağrılmaz. Yayın için içerik hakkı ve güncel
tıbbi editör onayı gereklilikleri devam eder.

## 2. Önceki turun değerlendirmesi

### İyi yapılmış olanlar (korundu)

- `.apkg` paketini alan/şablon/CSS/medya düzeyinde birebir okuyan aktarım katmanı ve bunu gerçek paketle
  karşılaştıran testler.
- İçe aktarılan HTML’de script ve satır içi olay yakalayıcıların temizlenmesi.
- Kaynak tag’lerini bozmadan, navigasyon bilgisini uygulama-özel metadata olarak taşıma yaklaşımı.
- Gelecekte ücretli erişim gerekirse kullanılabilecek RevenueCat entitlement ve restore altyapısı
  (mevcut build’de çağrılmıyor).
- App Store metin/gizlilik/koşul taslakları ve yayın öncesi kontrol listesi.

### Yanlış olanlar (düzeltildi)

| Sorun | Neden yanlıştı | Yapılan |
|---|---|---|
| İlk açılışta kullanıcının **tüm koleksiyonu siliniyor**, yerine 1.200 kartlık deneme kuruluyordu | Ücretsiz bir Anki istemcisinin kullanıcının verisini silmesi kabul edilemez | Yıkıcı kurulum tamamen kaldırıldı. Katalog yalnız kullanıcının açık ücretsiz eyleminden sonra **ekleyerek** kurulur (`lib/bkaCatalog.ts`) |
| Kart listesinden önce **zorunlu teklif ekranı** | Uygulamayı açan herkesi ödeme ekranıyla karşılamak hem istenen akış değildi hem de gereksiz bir App Review riski | Açılış kapısı kaldırıldı; uygulama doğrudan deste listesine açılıyor |
| 1.200 kartlık “deneme” kavramı | Ürün kararı değişti: paket ya kilitli ya açık | Deneme katmanı, ilgili kodlar ve metinler kaldırıldı |
| Sahte **Apple ödeme sayfası** taklidi (dev simülasyonu) | Apple markasını taklit eden bir ekran, geliştirme amaçlı bile olsa riskli ve kafa karıştırıcı | Kaldırıldı. Preview ve production derlemelerinde ödeme yolu kapalıdır |
| Deste listesinin üstünde reklam benzeri banner + başlık düğmesi | Paket, uygulamanın kendi navigasyonunu bozan bir reklam gibi duruyordu | Paket artık deste listesinde **bir deste satırı** olarak, kart sayıları ve ücretsiz erişim bilgisiyle duruyor |
| Teklif ekranı tasarımı (koyu yeşil/altın “landing page”, `◫ ✚ ▧` gibi işaret karakterleri) | Uygulamanın geri kalanıyla aynı dili konuşmuyordu, temayla uyumsuzdu, ucuz duruyordu | Ekran sıfırdan tasarlandı: uygulamanın kendi tema renkleri, gerçek katalog ağacı, sabit alt ücretsiz açma çubuğu ve açık/koyu tema uyumu |
| Kart WebView’i **sabit 300/360 pt** yükseklikteydi | Kısa kartta ekranın yarısı boş kalıyor, uzun kartta soru kesiliyordu | Kart kendi yüksekliğini ölçüp bildiriyor; çerçeve içeriğe göre büyüyüp küçülüyor, ekranın izin verdiği sınırı aşarsa kendi içinde kayıyor |
| WebView’de viewport meta etiketi yoktu | WKWebView sayfayı 980 px genişlik varsayıp küçültüyordu: **kartlar iPhone’da yaklaşık %40 boyutunda** görünüyordu | `width=device-width` eklendi; kartlar artık şablonun tasarlandığı boyutta okunuyor |
| `{{type:Field}}` karşılaştırması alanın **HTML’ini** gösteriyordu | Cevap yüzünde `bulbus--<div>a. vertebralis...</div>` gibi ham etiketler görünüyordu | Karşılaştırma Anki gibi düz metin üzerinden yapılıyor (`typeAnswerPlainText`), satır sonları korunuyor |
| Şablonun JS’e bağlı parçaları (AnKing sayacı, Wikipedia açılır penceresi) | Script çalıştırılmadığı için işlevsizdi ama yer kaplıyor, cevap yüzünde başıboş “×/↪” düğmeleri bırakıyordu | Reviewer CSS’inde gizlendi; kartın kendi içeriği değişmedi |
| İlk kurulumda “Python” demo destesi tohumlanıyordu | TUS uygulamasında Python destesi görünmesi ürün hatasıydı | İlk açılış Anki gibi tek boş “Varsayılan” destesiyle başlıyor |
| **Kartların yarısı yanlış konu destesindeydi**: anahtar kelime bulamayan kart, o dersin listesindeki *son* kurala düşüyordu — Farmakoloji’nin %79’u “Ağrı ve İnflamasyon”, Patoloji’nin %58’i “Sinir Sistemi Patolojisi” destesine giriyordu | Konu ağacı, uydurma taksonomi yerine **paketi hazırlayanın kendi Anki etiketlerinden** kuruldu (bölüm 4). Etiketsiz kart, kaynaktaki ders destesinde kalıyor |
| Rapor dilinde “ilk açılışta teklif”, “deneme” gibi artık doğru olmayan ifadeler | Mağaza inceleme notları gerçek akışla uyuşmazsa reddedilme sebebidir | App Review notu, metadata ve koşul metinleri yeni akışa göre yeniden yazıldı |

## 3. Ürün akışı (uygulanan hâli)

1. **Açılış:** uygulama deste listesine açılır. Yeni kurulumda tek bir boş “Varsayılan” destesi vardır;
   mevcut kullanıcıda kendi desteleri neyse odur.
2. **Hazır paket:** listenin sonunda ayrı bir kart: “BKA TUS · 9.583 kart · 12 ders ·
   106 alt deste”.
3. **Paket ekranı:** satıra dokununca tam ekran açılır. Hero (paket ve sayılar), “Paket içeriği”
   başlığı altında 12 dersin genişleyebilir listesi — her ders açıldığında konu desteleri ve kart sayıları
   görünür. Altta sabit “Kartları ücretsiz aç” eylemi bulunur.
4. **Ücretsiz açma:** Kullanıcının açık eyleminden sonra Apple veya RevenueCat çağrılmadan ekranda
   “Kartlar kuruluyor” göstergesi çıkar ve katalog koleksiyona eklenir.
5. **Sonrası:** “BKA TUS” gerçek bir deste olarak listede görünür (12 alt ders, altlarında konu desteleri);
   hazır paket satırı kaybolur. Kartlar normal Anki akışıyla çalışılır.
6. **Kaldırma ve yeniden kurma:** Kullanıcı paketi kaldırırsa kendi içeriği kalır; katalog kartlarındaki
   çalışma ilerlemesi saklanır ve ücretsiz yeniden kurulumda aynen döner.

## 4. Kaynak envanteri, aktarım doğruluğu ve konu yerleşimi

`npm run audit:catalog -- "<kaynak klasörü>"` komutu, elinizdeki açılmış `.apkg` klasörünü pakete
gömülü koleksiyonla karşılaştırır, her kartın nereye düştüğünü açıklar ve 9.583 kartın tamamını
uygulamanın kendi şablon motoruyla oluşturup görüntü sorunlarını arar. 22 Ağustos denetiminin
sonucu:

| Ölçüm | Sonuç |
|---|---:|
| Not | 7.737 (kaynakla birebir) |
| Kart | 9.583 (kaynakla birebir) |
| Ders destesi | 12 (kaynakla birebir) |
| Not tipi | 2 (kaynakla birebir) |
| Medya | 49 dosya, içerikleri de birebir |
| Alt deste | 106 |
| Konusu belirlenemeyen kart (ders destesinde kalır) | 3.346 |

### Konu yerleşimi neden böyle

Kaynak paket **düz 12 desteden** oluşuyor; içinde alt deste ağacı yok. Dahası 7.737 notun
**5.525’i hiç etiketlenmemiş**; Anatomi, FHE, Patoloji ve Farmakoloji derslerinde tek bir etiket
bile yok. Yani kaynakta 12 dersin altında bir konu bilgisi mevcut değil.

Yerleşim iki aşamada, bu sırayla yapılıyor:

1. **Yazarın kendi etiketi.** Etiketli 2.212 not doğrudan kendi etiketinin alt destesine girer
   (ör. “Kardiyo Ped.” → `Pediatri::Kardiyoloji`, “Cerrahi Kalp-Damar” →
   `Küçük Stajlar::Kalp-Damar Cerrahisi`, “Genel Mikro” → `Mikrobiyoloji::Genel Mikrobiyoloji`).
   Denetimde etiketiyle uyuşmayan yerleşim: **0**.
2. **Etiketsiz notlar için kart metni.** Yazarın etiketlemediği bir not, kendi metnindeki konu
   terimleriyle o dersin TUS müfredatı başlıklarına eşlenir (`lib/bkaContentTopics.ts`).
   Etiketli bir not bu aşamayı hiç görmez, dolayısıyla bir kural yazarın seçtiği konuyu
   **değiştiremez**.

Önceki bir tur kart metnine dayalı yerleştirmeyi denemiş ve sonuç yanlış çıkmıştı: hiçbir kurala
uymayan notlar listedeki **son kurala** düşüyor, böylece Farmakoloji kartlarının %79’u “Ağrı ve
İnflamasyon”, Patoloji’nin %58’i “Sinir Sistemi Patolojisi” destesinde görünüyordu. Bu turdaki
kural üç noktada farklı:

- **Eşleşmeyen not hiçbir konuya düşmez.** Kural kümesi bir varsayılan başlık içermez; hiçbir terim
  tutmazsa not ders destesinde kalır ve “Genel” sayılır. 3.346 kart hâlâ orada duruyor — yani
  kurallar kapsamadığı kartı zorla bir başlığa itmiyor.
- **Soru kökü önce okunur.** Bir kartın konusu sorduğu şeydir, cevabının andığı şey değil:
  “sinüs sphenoidalis arka komşu → {{c1::pons}}” baş-boyun kartıdır, nöroanatomi değil. Önce
  cloze’lar çıkarılmış kök metin, tutmazsa notun tamamı taranır.
- **Kısaltmalar tam kelime aranır.** Sonunda boşlukla yazılan anahtar (“MI ”, “AF ”, “ARA ”,
  “TUR ”) yalnızca tam kelime olarak eşleşir; ön ek olarak arandığında “mitoz”, “afferent”,
  “aralık” ve “Turner” kartlarını yanlış toplardı. Boşluksuz yazılanlar kelime başından eşleşir,
  böylece Türkçe ekler (“memede”, “gebelik”) tutar.

| Ders | Kart | Alt deste | Konusu belirlenemeyen |
|---|---:|---:|---:|
| Deneme ve Soru | 810 | 4 | 527 |
| Anatomi | 477 | 8 | 94 |
| FHE | 597 | 10 | 241 |
| Biyokimya | 603 | 5 | 216 |
| Mikrobiyoloji | 730 | 6 | 169 |
| Patoloji | 724 | 10 | 248 |
| Farmakoloji | 829 | 9 | 435 |
| Dahiliye | 1.183 | 8 | 324 |
| Pediatri | 1.506 | 15 | 459 |
| Genel Cerrahi | 742 | 9 | 307 |
| Küçük Stajlar | 626 | 15 | 144 |
| Kadın Doğum | 756 | 7 | 182 |
| **Toplam** | **9.583** | **106** | **3.346** |

Gruplanmamış kart oranı %69’dan **%35**’e indi; Anatomi, FHE, Patoloji ve Farmakoloji artık
alt destesiz değil. Daha ince bir ayrım için en doğru yol yine kaynak pakette etiketlemedir:
etiket eklendiğinde birinci aşama devreye girer ve içerik kuralını devre dışı bırakır.

### Aktarım doğruluğu

Korunan kaynak alanları: not ID/GUID, kart ID ve template ordinal, alan sırası ve içeriği, `sfld`,
checksum, kaynak etiketleri, kart zamanlama alanları, not tipi alan/şablon/CSS’i ve 49 medyanın
tamamı. Kart içerikleri gerçek `.apkg` ile alan alan karşılaştırılıyor (`lib/bkaCatalog.test.ts`).

Bilinçli tek fark deste yolu: kaynağın 12 kök destesi kimliklerini koruyarak tek bir “BKA TUS” kök
destesinin altına taşındı (`BKA TUS::Pediatri::Kardiyoloji`). Böylece paket, deste listesinde tek
bir satın alınabilir öğe olarak kilitlenip açılabiliyor.

### Görüntü denetimi

9.583 kartın tamamı uygulamanın şablon motoruyla oluşturulup tarandı: boş soru 0, boş cevap 0,
işlenmemiş `{{...}}` 0, ekrana kaçan HTML etiketi 0, kalan `[sound:]` 0, `<script>` kalıntısı 0,
soru ile cevabı aynı olan kart 0, eksik medya dosyası 0. Kaynakta kapanmamış iki bozuk cloze var;
Anki de onları düz metin olarak gösterdiği için burada da öyle görünürler. En uzun cevap 1.707
karakter ve kendi çerçevesi içinde kayarak okunabiliyor.

Kart oluşturma Anki’nin kendi uygulamasına göre yazıldı (`rslib/src/cloze.rs`,
`rslib/src/template.rs`, AnkiDroid `card_template.html`): cloze’lar `data-cloze` / `data-ordinal`
öznitelikleriyle ve `.cloze` / `.cloze-inactive` sınıflarıyla, iç içe ve `{{c1,2::…}}` biçimleri
dahil basılır; filtreler sağdan sola çözülür ve Anki’nin tanımadığı bir filtre (`edit`,
`clickable`) alanı boşaltmak yerine atlanır; belge iskeleti Anki’deki gibi kurulur — platform
sınıfları (`mobile iphone`) dış katmanda, `card cardN` ve gece modu sınıfları kartta,
içerik `<div id="qa" dir="auto">` içinde. Şablonun kendi `<style>` bloğu korunur, bu yüzden
AnKing şablonu kendi Wikipedia penceresini ve mobilde kendi logosunu Anki’deki gibi kendisi gizler.
Script ve satır içi olay yakalayıcılar güvenlik için temizlenir; `hint` bağlantısını ve kart
yüksekliğini uygulamanın kendi betiği yönetir.

**Mağaza ekranındaki sayılar nereden geliyor:** kilitliyken 9 MB’lık paketi açmamak için, derleme
zamanında `scripts/build-catalog-manifest.ts` paketi bir kez ayrıştırıp
`assets/catalog/bka-manifest.json` üretir. Test paketi, manifest ile gerçek kurulumun ders ders,
alt deste alt deste aynı sayıları verdiğini doğrular; ikisi ayrışırsa test kırılır.

## 5. Veri güvenliği: kurulum ve kaldırma

- Kurulum **eklemeli**: `INSERT OR REPLACE` yalnızca katalogun kendi satırlarına dokunur.
- Kaynak deste ayarları (`deck_configs`) kendi kimlik alanına yeniden eşlenir; kaynağın “1” numaralı ayarı
  kullanıcının varsayılan ayar grubunu **ezmez**.
- Katalog satırları `catalogPack` işaretiyle tanınır. Kaldırma yalnızca bu işaretli satırları siler; not tipi
  yalnızca ona bağlı başka not kalmamışsa silinir.
- Kaldırmadan önce katalog kartlarının zamanlama durumu (`type/queue/due/ivl/factor/reps/lapses/left/…`)
  saklanır, yeniden kurulumda kart kart geri yüklenir.
- Yayın öncesi derlemede kurulan 1.200 kartlık deneme, cihazda kalmışsa ilk açılışta güvenli yedek alınarak
  temizlenir; kullanıcının kendi içeriği korunur.
- Tam metin arama indeksi her kurulum/kaldırma sonrası yeniden oluşturulur.
- Tam `.apkg` uygulama paketine gömülüdür. Jailbreak/statik paket analizi yapan kararlı bir kullanıcı içeriği
  çıkarabilir; daha güçlü koruma gerekiyorsa sonraki sürümde yetki sonrası indirilen şifreli teslim gerekir.

## 6. Mevcut ücretsiz erişim ve gelecekteki ödeme altyapısı

| Alan | Değer |
|---|---|
| Uygulama fiyatı | Ücretsiz |
| Ürün | BKA TUS kart paketi, 9.583 kart |
| Mevcut erişim | Ücretsiz, yerel kurulum |
| Production bayrağı | `EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED=false` |
| Apple/RevenueCat çağrısı | Yok |
| Gelecek için dormant product ID | `com.tusankim.bka.complete.lifetime` |
| Gelecek için dormant entitlement | `bka_tus_complete` |

Ödeme kodu mevcut build’de çağrılmaz; paket ağ bağlantısı, Apple hesabı veya makbuz olmadan yerel olarak
kurulur. Gelecekte ücretli erişim yeniden etkinleştirilirse dijital içeriğin In-App Purchase ile açılması,
restore, gerçek fiyat, gizlilik beyanı ve sandbox senaryoları aynı sürümde yeniden ele alınmalıdır:
[App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/),
[IAP türleri](https://developer.apple.com/help/app-store-connect/configure-in-app-purchase-settings/overview-for-configuring-in-app-purchases/),
[IAP fiyatlandırma](https://developer.apple.com/help/app-store-connect/manage-in-app-purchases/set-a-price-for-an-in-app-purchase/).

Preview ve production profilleri `EXPO_PUBLIC_BKA_CATALOG_PAYMENT_REQUIRED=false` ile derlenir. “Kartları
ücretsiz aç” Apple veya RevenueCat’e bağlanmadan erişimi açar.

## 7. iPhone deneyimi

390 × 844 ve 440 × 956 sınıfı viewport’larda gözden geçirildi:

- Deste listesi tek elle taranabilir; hazır paket satırı 72 pt yüksekliğinde ve tek dokunuşla paket ekranını açar.
- Paket ekranı: sabit alt çubuk sayesinde uzun içerik listesinde bile ücretsiz açma düğmesi hep erişilebilir.
- Kart alanı artık içeriğe göre boyutlanıyor: kısa kart ekranın yarısını boş bırakmıyor, uzun kart kesilmiyor.
  İçerik ayrılan alanı aşarsa kart kendi çerçevesi içinde kayıyor, değerlendirme düğmeleri ekranda kalıyor.
- Medya yüksekliği reviewer bütçesine göre sınırlanıyor; görsel yüklenince çerçeve yeniden ölçülüyor.
- Cevapta arka yüz ön yüzün yerini alıyor (Anki davranışı), üst üste binme yok.
- Tekrar/Zor/İyi/Kolay düğmeleri en az 52 pt dokunma yüksekliğinde.
- Açık/koyu tema, safe area, dış klavye kısayolları, ses, medya, bayrak ve kart seçenekleri korunuyor.
- İlk sürüm `supportsTablet: false`; yayın kapsamı yalnızca iPhone.

## 8. iOS ve App Store teslim hazırlığı

- Expo SDK 54.0.37 / React Native 0.81.5, iOS minimum 15.1, `newArchEnabled: true`.
- Bundle ID `com.tusankim.app`, version `1.0.0`, build `1`, `usesNonExemptEncryption: false`.
- App Store simgesi 1024 × 1024, alfa kanalsız.
- Privacy Manifest: toplanan veri türü yok, takip yok. Mevcut ücretsiz akış satın alma geçmişi işlemez.
- RevenueCat bağımlılığı gelecekteki ödeme seçeneği için kodda dursa da mevcut build’de çağrılmaz.
- Teslim dosyaları: `docs/app-store/metadata-tr.md`, `docs/app-store/iap-and-review.md`,
  `docs/privacy.html`, `docs/support.html`, `docs/terms.html`, `docs/app-store/screenshots/`.

Apple 28 Nisan 2026’dan beri gönderimlerin Xcode 26+ ve iOS 26 SDK ile yapılmasını istiyor:
[Upcoming Requirements](https://developer.apple.com/news/upcoming-requirements/). Expo SDK 54’ün EAS yapıları
Xcode 26’yı destekler: [Expo SDK 54](https://expo.dev/changelog/sdk-54). Ekran görüntüsü ölçüleri için:
[Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).
Mevcut ücretsiz build ile dormant non-consumable ürün incelemeye eklenmemelidir. Ödeme gelecekte
etkinleştirilirse ürün ilgili uygulama sürümüyle aynı gönderime eklenmeli ve IAP inceleme görseli yüklenmelidir:
[Submit an IAP](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-in-app-purchase/).

`https://bugraguclu.github.io/tus-flashcard-app/{privacy,support,terms}.html` adresleri hâlâ yayımlanmadı.
Gönderimden önce bu üç sayfa kalıcı bir HTTPS adresinde 200 dönmelidir.

## 9. Gizlilik ve yaş derecelendirmesi

Kartlar ve çalışma geçmişi cihazda kalır. Mevcut ücretsiz akış Apple veya RevenueCat’i çağırmaz ve satın alma
geçmişi toplamaz; App Store Connect gizlilik cevapları gönderilen build’in bu davranışıyla aynı olmalıdır
([Manage App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/)).

Kartlar sık tıbbi/tedavi bilgisi içerdiğinden yaş anketinde “Medical or Treatment Information: Frequent”
beyanı önerilir; beklenen sonuç 16+. Uygulama tanı/tedavi/izlem yapmadığı için regulated medical device
değildir; kullanım beyanı eğitim ve sınav hazırlığı sınırını açıkça belirtmelidir.

## 10. İçerik hakkı ve tıbbi kalite — yayın engelleri

Kaynak klasörde lisans/devir belgesi yok. Başka bir kişinin hazırladığı kartları ücretsiz de olsa uygulamayla
dağıtmak için çoğaltma, işleme ve dijital dağıtım haklarını açıkça kapsayan yazılı izin gerekir. 49 medya
dosyası ve AnKing adı/logosu/şablonu ayrıca taranmalıdır
([Telif Hakları Genel Sorular](https://telifhaklari.ktb.gov.tr/TR-332449/genel-sorular.html)).

7.737 notun %94,1’i en son 2020–2021’de değiştirilmiş. Her disiplin güncel kaynaklara ve TUS kapsamına göre
yetkin bir editörce incelenmeli; inceleyen kişi, tarih, kaynak ve düzeltme sürümü kaydedilmelidir. Uygulama
içindeki “tıbbi tavsiye değildir” uyarısı bu kontrolün yerine geçmez.

Yayıncı kimliği, gizlilik sorumlusu bilgileri ve içerik dağıtım izni hukuk uzmanıyla doğrulanmalıdır.
Bu rapor hukuki görüş değildir.

## 11. Doğrulama matrisi

| Kontrol | Durum |
|---|---|
| Kaynak SHA-256 ve paket bütünlüğü | Başarılı |
| 7.737 not / 9.583 kart / 12 ders / 106 alt deste / 49 medya | Başarılı |
| Kaynak klasör ↔ paket: not, kart, not tipi, deste ve 49 medya birebir | Başarılı |
| Alt deste yerleşimi yazarın etiketiyle birebir (uyuşmayan: 0) | Başarılı |
| 9.583 kartın tamamında görüntü denetimi (boş/bozuk/eksik medya: 0) | Başarılı |
| Alan, tag, şablon, CSS ve kart durumu birebir karşılaştırması | Başarılı |
| Manifest ↔ gerçek kurulum ders/konu sayıları | Başarılı |
| Gerçek paketle eklemeli kurulum; kullanıcı içeriği korunuyor | Başarılı (entegrasyon testi) |
| Kaldırmada yalnızca katalog satırları siliniyor | Başarılı (entegrasyon testi) |
| Kaldır → kur arasında çalışma ilerlemesi korunuyor | Başarılı (entegrasyon testi) |
| Kullanıcıda “BKA TUS” adlı deste varsa çakışmasız kök adı | Başarılı (entegrasyon testi) |
| Cloze, hint, `type:` karşılaştırması, medya, script temizliği | Başarılı |
| TypeScript | Başarılı |
| Otomatik test paketi | 40 dosya / 346 test başarılı |
| Simülatörde temiz kurulum → ücretsiz uygulama + hazır paket satırı | Başarılı |
| Paket ekranı, ders/konu ağacı, ücretsiz açma ve kurulum akışı | Başarılı |
| Ücretsiz kurulum sonrası çalışma; soru/cevap tam görünüyor | Başarılı |
| Uzun kart: çerçeve içinde kaydırma, düğmeler ekranda | Başarılı (%200 yakınlaştırmayla sınandı) |
| Açık/koyu tema | Başarılı |
| Xcode 26 Release derlemesi (iOS Simulator) | Başarılı |
| Expo Doctor | 18/18 başarılı |
| Web production export | Başarılı |
| App Store görselleri | Geliştirme derlemesinden yenilendi; mağaza ürünü bağlandıktan sonra Release’den tekrar çekilmeli |
| Privacy/support/terms herkese açık HTTPS | Bekliyor — adresler yayımlanmadı |
| Ödeme/RevenueCat kullanılmadan ücretsiz açma | Otomasyon mevcut; son Release smoke bekliyor |
| TestFlight / fiziksel iPhone regresyonu | Dış kurulum bekliyor |
| Ticari hak belgesi | Kritik — yok |
| Güncel tıbbi editör onayı | Kritik — yok |

## 12. Yayın kararı ve kalan kesin işler

**Uygulama kodu ve teslim paketi yayına hazırlık seviyesindedir; ticari hak ve gerçek mağaza hesabı olmadan
“Ready for Review” gönderimi yapılmamalıdır.**

- [ ] İmzalı ticari lisans ve üçüncü taraf hak taraması (kartlar, 49 medya, AnKing marka/şablonu).
- [ ] 12 ders için güncel tıbbi/TUS editör onayı.
- [ ] Apple Developer üyeliği ve gerekli App Store Connect/DSA yayıncı bilgileri.
- [ ] App Store Connect kaydı; gerçek yayıncı, telif ve iletişim alanları.
- [ ] Gizlilik/destek/koşul sayfalarının HTTPS üzerinden yayımlanması.
- [ ] Production derlemede ödeme/restore metni veya RevenueCat çağrısı olmadığının doğrulanması.
- [ ] TestFlight’ta temiz kurulum → hazır paket → ücretsiz açma → kapat/aç → yeniden kurma turu.
- [ ] Son bağımlılık, erişilebilirlik ve içerik regresyonu.

Bu maddeler tamamlandığında 1.0.0 App Store incelemesine gönderilebilir.
