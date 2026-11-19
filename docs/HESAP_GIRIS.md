# Hesap, kayıt ve giriş · 8 Kasım 2026

Yemek Takibi'nin hesap ekranı ve altyapısı TusAnkiM'e taşındı ve iPhone için yeniden ele alındı.
Hesap **isteğe bağlıdır**: kartlar, desteler, çalışma geçmişi, yedekler ve ayarlar yine yalnızca
cihazda tutulur, hesap sunucusuna hiç gönderilmez. Ağ yokken veya sunucu kapalıyken çalışma hiçbir
yerde beklemez. 19 Kasım 2026'da `canliya-alinacaklar` dalına alındı. Hesap sunucusu henüz
kurulmadığı için canlı derleme `EXPO_PUBLIC_ACCOUNT_API_URL` olmadan çıkar ve hesap özelliklerinin
hiçbiri görünmez; sunucu kurulunca o adresle derlenen sürümde açılır.

## Kullanıcı deneyimi

- **İlk açılış:** Yeni bir kurulumda (koleksiyonda henüz not yokken) deste listesinden önce bir kez
  karşılama ekranı gelir: hesap oluşturma formu, altında tam genişlikte **Hesapsız devam et**.
  Hesapsız devam etmek ağ gerektirmez ve ekran bir daha çıkmaz. Kartı olan mevcut kullanıcılar bu
  ekranla hiç karşılaşmaz; hesap onlar için Ayarlar'ın en üstündedir.
- **Ayarlar:** En üstteki satır iOS'taki Apple Hesabı satırı gibidir: oturum açıksa baş harfler, ad
  ve e-posta; değilse "Giriş yap veya hesap oluştur". Satır `/sign-in` ya da `/account` açar.
- **Giriş ekranı** (`app/sign-in.tsx`, `components/account/SignInScreen.tsx`): giriş, hesap oluşturma,
  şifremi unuttum, kodla şifre yenileme ve e-posta doğrulama aynı ekranın yerel adımlarıdır; adım
  değişince gezinme olmaz, yazılan e-posta korunur. Ekran tasarım sisteminin parçalarıyla
  (`TextField`, `PasswordField`, `Button`, `Notice`) sade tutulur; aşağıdaki "Sade giriş ekranı"
  bölümüne bakın.
- **Hesap sayfası** (`app/account.tsx`): ad, e-posta ve doğrulama durumu; adı düzenleme, şifre
  değiştirme, son hesap etkinliği, oturumu kapatma ve şifreyle onaylanan kalıcı hesap silme
  (App Store 5.1.1(v) uygulama içinde silme şartı).

## Sade giriş ekranı · 19 Kasım 2026

Giriş ekranı, "AI ile giriş ekranı yapacaksanız böyle yapın" türü rehberler ve bunların dayandığı
kaynaklar incelenerek sadeleştirildi. Kurallar ve kaynakları:

- E-posta ve şifre **tek sayfada**; önce e-posta sonra şifre soran iki adımlı akış yok (otomatik
  doldurmayı bozar). [Smashing Magazine, 2024](https://www.smashingmagazine.com/2024/06/2-page-login-pattern-how-fix-it/)
- Etiketler alanın üstünde, yer tutucu etiket yerine geçmez; düğmeler işi söyler ("Giriş yap",
  "Hesap oluştur"), düğme yazılmadan önce kilitlenmez. [web.dev](https://web.dev/articles/sign-in-form-best-practices)
- Şifre **bir kez** sorulur, göster/gizle düğmesi vardır; şifre tekrarı alanı yok.
  [NN/g](https://www.nngroup.com/articles/passwords-memory/), [web.dev](https://web.dev/articles/sign-in-form-best-practices)
- Hesap oluşturma yalnızca **e-posta ve şifre** ister: ad, e-postanın baş kısmından üretilir
  (`nameFromEmail`, hesap sayfasında değiştirilebilir); onay kutusu yerine düğmenin altında
  "Hesap oluşturarak kullanım koşullarını ve gizlilik politikasını kabul etmiş olursunuz" cümlesi
  vardır (sunucu sözleşmesi değişmedi, `consent: true` gönderilir). Güç ölçerin yerini tek satır
  "En az 8 karakter" ipucu aldı; zayıf şifreyi sunucu ve sözleşme yine reddeder.
- Doğrulama kodu **tek alandır** (`oneTimeCode`): iOS kodu Mail'den önerir, yapıştırma çalışır,
  altıncı rakamda kendiliğinden gönderilir.
- İlk açılışta **Hesapsız devam et** küçük bir bağlantı değil, formun altında tam genişlikte bir
  düğmedir; hesap isteğe bağlıdır ve uygulama onsuz tam çalışır (App Store 5.1.1).
- Kaldırılanlar: marka paneli ve logo, güven rozeti, alt bilgi bağlantıları, "Hesap oluştur /
  Giriş yap" seçici (yerine tek satır "Hesabınız yok mu? Hesap oluşturun"), düğmedeki ok, hesap
  ekranlarının kendi renk paleti ve bileşen seti.

## Google ile giriş ve sade hesap sayfası · 19 Kasım 2026

- Giriş ve hesap oluşturma adımlarında en üstte **Google ile devam et** (Google'ın markalama
  kurallarındaki dört renkli "G", beyaz zeminli kenarlı düğme), altında "veya e-postayla" ve
  e-posta formu. Tek dokunuş: hesap yoksa açılır, varsa giriş yapılır; aynı e-postayla açılmış
  şifreli hesap varsa Google'ın doğruladığı adres ona bağlanır ve doğrulanmış sayılır.
- iPhone'da `@react-native-google-signin/google-signin` (Google'ın kendi oturum açma sayfası),
  web önizlemesinde Google Identity Services (`lib/googleSignIn*.ts`). Uygulama Google oturumu
  tutmaz; yalnızca kimlik belirtecini alıp hesap sunucusuna verir. Sunucu belirteci Google'ın
  anahtarlarıyla kendisi doğrular (`server/account/google.ts`).
- Düğme yalnızca derlemede Google istemci kimlikleri (`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`,
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`) **ve** sunucuda `GOOGLE_CLIENT_IDS` varsa görünür;
  `app.config.js` iOS URL şemasını yalnızca o zaman ekler.
- Google ile açılan hesabın şifresi yoktur: hesap sayfasında "Şifreyi değiştir" görünmez, hesap
  silme Google'la yeniden onaylanır (App Store 5.1.1(v)). İsterse "Şifremi unuttum" ile şifre
  belirleyebilir.
- **App Store 4.8:** Google gibi üçüncü taraf girişi sunan uygulama Sign in with Apple da sunmak
  zorundadır. Apple girişi eklenmeden Google canlı derlemede açılmamalı.
- **Hesap sayfası sadeleşti:** kart çerçevesiz profil (baş harfler, ad, e-posta), tek kartta Ad,
  Şifreyi değiştir, Oturumu kapat; en altta kırmızı "Hesabı sil". Kaldırılanlar: "E-posta
  doğrulandı" rozeti (yalnızca doğrulanmamışsa uyarı çıkar), "Hesap bilgileri" başlığı ve
  **Son etkinlik** listesi (sunucu olayları tutmaya devam eder, `/v1/account/activity`).

## Diyet uygulamasına göre iyileştirmeler

- E-postadaki **bağlantı yerine 6 haneli kod**: iPhone'da bağlantı tarayıcıda açılıp uygulamaya
  dönmüyordu; kod alanı `oneTimeCode` olduğu için iOS kodu Mail'den önerir, yapıştırılan `482 913`
  bütün olarak girer, altıncı rakamda doğrulama kendiliğinden başlar.
- Oturum çerezde değil **iOS Anahtar Zinciri'nde** (`expo-secure-store`,
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`): koleksiyon yedeğine veya dışa aktarmaya girmez, yeni
  telefona taşınmaz. Anahtar Zinciri uygulama silinse de kaldığı için yeniden kurulumun ilk
  açılışında eski oturum silinir.
- Şifre tekrarı alanı kaldırıldı (göster/gizle düğmesi var); en az 8 karakter, yaygın
  ve ada/e-postaya dayalı şifreler reddedilir (diyet uygulamasında en az 5 karakterdi). Kurallar
  `lib/accountContract.ts` içinde tek yerdedir; uygulama ve sunucu aynı kodu çalıştırır.
- iOS otomatik doldurma: e-posta `username`, yeni şifre `newPassword` (+ `passwordRules`), mevcut şifre
  `password`; klavyede ileri/gönder zinciri; hata olunca ilk hatalı alana odak; VoiceOver duyuruları;
  başarı/hata dokunsal geri bildirimi.
- "Beni hatırla" kaldırıldı: telefondaki uygulama oturumu kapatılana kadar açık kalır.
- Metinler uygulamanın resmî "siz" diliyle ve iki dilde (`lib/accountMessages.ts`); sunucu metin değil
  kod gönderir, uygulama kendi dilinde yazar.

## Altyapı

| Parça | Dosya |
| --- | --- |
| Ortak kurallar, hata kodları, tipler | `lib/accountContract.ts` |
| Sunucu adresi (HTTPS zorunlu; düz HTTP yalnız localhost) | `lib/accountConfig.ts` |
| HTTP istemcisi, zaman aşımı, hata eşleme | `lib/accountApi.ts` |
| Yanıt ve kayıt ayrıştırma, ilk açılış kuralı | `lib/accountSession.ts` |
| Anahtar Zinciri / web `localStorage` | `lib/accountVault.ts`, `lib/accountVault.web.ts` |
| Kurulum işareti ve karşılama bayrağı (ayarlar tablosu) | `lib/accountLocalState.ts` |
| Oturum durumu ve işlemler | `contexts/AccountContext.tsx` |
| Ekran parçaları | `components/account/` |
| Sunucu | `server/account/` ([kurulum ve uç noktalar](../server/account/README.md)) |

Başlangıç, Anahtar Zinciri okunana kadar açılış görselini tutar (ağ beklenmez). Oturum açıkken
uygulama arka planda `/v1/session` ile durumu yeniler ve öne gelişlerde en çok on dakikada bir
denetler; sunucu oturumu tanımıyorsa (başka cihazda şifre değişti, hesap silindi) oturum burada da
kapanır. Ağ hatası oturumu kapatmaz.

## Etkinleştirme

- Geliştirme: `npm run account-server:dev`, ardından uygulamayı geliştirme modunda açın. Kodlar sunucu
  konsoluna yazılır.
- Yayın: sunucuyu HTTPS arkasında kurun ve derlemeye `EXPO_PUBLIC_ACCOUNT_API_URL` verin.
  **Adres verilmeyen yayın derlemesinde hesap özellikleri tamamen gizlidir** ve uygulama bugünkü
  gibi davranır; dalın birleştirilmesi tek başına mağaza sürümünü değiştirmez.

## Yayından önce

- Sunucunun gerçek alan adında kurulması, SMTP ile gerçek gelen kutusuna (ve gereksiz klasörüne)
  kod teslimi.
- `docs/privacy.html` hesap bölümünün hukuki gözden geçirmesi; App Store gizlilik yanıtlarında Ad,
  E-posta ve Kullanıcı Kimliği (kullanıcıya bağlı, uygulama işlevi, izleme yok).
- iPhone'da `docs/IOS_RELEASE_CHECKLIST.md` içindeki **Account sign-in** satırı.
- Apple ile giriş ve Google ile giriş bu sürümde yok. Google eklenirse App Store 4.8 gereği Apple
  ile giriş de gerekir; ikisi de ücretli Apple Developer hesabı ve sağlayıcı anahtarları ister.

## Testler

`lib/accountContract.test.ts`, `lib/accountConfig.test.ts`, `lib/accountApi.test.ts`,
`lib/accountSession.test.ts`, `lib/accountMessages.test.ts` ve `server/account/*.test.ts`
(servis kuralları, HTTP katmanı, sahte SMTP sunucusuyla e-posta konuşması). `npm run quality` hepsini
çalıştırır.
