# Hesap, kayıt ve giriş · 8 Kasım 2026

Yemek Takibi'nin hesap ekranı ve altyapısı TusAnkiM'e taşındı ve iPhone için yeniden ele alındı.
Hesap **isteğe bağlıdır**: kartlar, desteler, çalışma geçmişi, yedekler ve ayarlar yine yalnızca
cihazda tutulur, hesap sunucusuna hiç gönderilmez. Ağ yokken veya sunucu kapalıyken çalışma hiçbir
yerde beklemez. Bu çalışma `claude/yemek-takibi-login-screen-021f47` dalındadır; `ready`e alınmadı.

## Kullanıcı deneyimi

- **İlk açılış:** Yeni bir kurulumda (koleksiyonda henüz not yokken) deste listesinden önce bir kez
  karşılama ekranı gelir: "Hesap oluştur / Giriş yap" seçici, sağ üstte **Hesapsız devam et**.
  Hesapsız devam etmek ağ gerektirmez ve ekran bir daha çıkmaz. Kartı olan mevcut kullanıcılar bu
  ekranla hiç karşılaşmaz; hesap onlar için Ayarlar'ın en üstündedir.
- **Ayarlar:** En üstteki satır iOS'taki Apple Hesabı satırı gibidir: oturum açıksa baş harfler, ad
  ve e-posta; değilse "Giriş yap veya hesap oluştur". Satır `/sign-in` ya da `/account` açar.
- **Giriş ekranı** (`app/sign-in.tsx`, `components/account/SignInScreen.tsx`): giriş, hesap oluşturma,
  şifremi unuttum, kodla şifre yenileme ve e-posta doğrulama aynı ekranın yerel adımlarıdır; adım
  değişince gezinme olmaz, yazılan e-posta korunur. Geniş web penceresinde diyet uygulamasındaki
  gibi solda marka paneli, sağda form vardır; telefonda form ekranın tamamıdır.
- **Hesap sayfası** (`app/account.tsx`): ad, e-posta ve doğrulama durumu; adı düzenleme, şifre
  değiştirme, son hesap etkinliği, oturumu kapatma ve şifreyle onaylanan kalıcı hesap silme
  (App Store 5.1.1(v) uygulama içinde silme şartı).

## Diyet uygulamasına göre iyileştirmeler

- E-postadaki **bağlantı yerine 6 haneli kod**: iPhone'da bağlantı tarayıcıda açılıp uygulamaya
  dönmüyordu; kod alanı `oneTimeCode` olduğu için iOS kodu Mail'den önerir, yapıştırılan `482 913`
  bütün olarak girer, altıncı rakamda doğrulama kendiliğinden başlar.
- Oturum çerezde değil **iOS Anahtar Zinciri'nde** (`expo-secure-store`,
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`): koleksiyon yedeğine veya dışa aktarmaya girmez, yeni
  telefona taşınmaz. Anahtar Zinciri uygulama silinse de kaldığı için yeniden kurulumun ilk
  açılışında eski oturum silinir.
- Şifre tekrarı alanı kaldırıldı (göster/gizle düğmesi ve güç ölçer var); en az 8 karakter, yaygın
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
