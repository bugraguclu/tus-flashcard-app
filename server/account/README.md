# TusAnkiM hesap sunucusu

Uygulamadaki **Giriş yap / Hesap oluştur** ekranının arka ucu. Yemek Takibi'nin Django hesap
altyapısının (kayıt, giriş, oturum, e-posta doğrulama, şifre yenileme, şifre değiştirme, hesap
silme, hesap etkinliği, hız sınırları, koşul kabulü kaydı) TusAnkiM'e uyarlanmış hâlidir.

İki bilinçli fark var:

- **Bağlantı yerine 6 haneli kod.** iPhone'da e-postadaki bağlantı tarayıcıda açılır, uygulamaya
  dönmez; kod ise iOS'un otomatik doldurmasıyla doğrudan alana gelir ve e-posta tarayıcılarının
  bağlantıyı "tıklayıp" tüketmesi sorunu yoktur.
- **Çerez + CSRF yerine taşıyıcı belirteç.** Uygulama oturumu iOS Anahtar Zinciri'nde tutar;
  sunucu belirtecin yalnızca SHA-256 özetini saklar.

**Kartlar, desteler ve çalışma geçmişi bu sunucuya hiç gelmez.** Sunucunun bildiği tek şey ad,
e-posta, parola özeti, koşul kabulü sürümü ve hesap olaylarıdır (yöntem ve saat; içerik yok).

## Çalıştırma (geliştirme)

```bash
npm run account-server:dev
```

`http://127.0.0.1:8787` adresinde açılır. Geliştirme modunda e-posta gönderilmez; doğrulama ve
şifre yenileme kodları sunucu konsoluna `[account dev outbox] … code=482913` olarak yazılır.
Veritabanı `server/account/.data/accounts.sqlite` (sürüm kaydına girmez).

Uygulamanın geliştirme derlemesi `EXPO_PUBLIC_ACCOUNT_API_URL` verilmezse bu adresi kullanır
(iOS Simülatörü Mac'teki `localhost`a ulaşır). Gerçek iPhone'da ya da yayın derlemesinde adres
HTTPS olmalıdır; düz HTTP yalnızca `localhost`/`127.0.0.1` için kabul edilir. Adres verilmeyen
yayın derlemesinde hesap özellikleri tamamen gizlenir ve uygulama bugünkü gibi çalışır.

## Uç noktalar

| Yöntem | Yol | Ne yapar |
| --- | --- | --- |
| GET | `/v1/health` | Sağlık denetimi |
| GET | `/v1/session` | Sunucu ayarları; belirteç varsa kullanıcı (geçersiz belirteç → 401) |
| POST | `/v1/register` | Hesap açar, koşul kabulünü kaydeder; oturum açar ya da kod ister |
| POST | `/v1/login` | Giriş; doğrulama zorunluysa ve adres doğrulanmamışsa kod gönderip 403 `unverified` |
| POST | `/v1/google` | Google ile giriş: `idToken` doğrulanır; hesap yoksa (onayla) şifresiz açılır, aynı e-postalı hesap varsa ona bağlanır |
| POST | `/v1/apple` | Apple ile giriş: `identityToken` doğrulanır, Google'daki gibi açılır ya da bağlanır; `name` (Apple adı yalnızca ilk girişte verir) ve `authorizationCode` (iptal için) birlikte gelir |
| POST | `/v1/logout` | Bu oturumu kapatır |
| POST | `/v1/email/verify` | Doğrulama kodu gönderir |
| POST | `/v1/email/verify/confirm` | Kodu doğrular (oturum yoksa oturum da açar) |
| POST | `/v1/password/reset` | Şifre yenileme kodu gönderir (hesap var mı söylemez) |
| POST | `/v1/password/reset/confirm` | Kod + yeni şifre; tüm eski oturumları kapatır, yenisini açar |
| POST | `/v1/password` | Şifre değiştirir; diğer cihazlardaki oturumları kapatır |
| PATCH | `/v1/account` | Adı günceller |
| DELETE | `/v1/account` | Şifreyle (şifresiz Google/Apple hesabında sağlayıcının yeni belirteciyle) onaylanan kalıcı hesap silme (App Store 5.1.1(v)); Apple erişimi de iptal edilir |
| GET | `/v1/account/activity` | Son 20 hesap olayı |

Hata gövdesi her zaman `{ "error": { "code", "message", "fields?", "retryAfter?" } }` biçimindedir;
uygulama metni koda göre kendi dilinde gösterir. Ortak kurallar ve tipler
`lib/accountContract.ts` dosyasındadır; uygulama ve sunucu aynı doğrulamayı çalıştırır.

## Google ile giriş

`GOOGLE_CLIENT_IDS` boşsa Google ile giriş kapalıdır ve uygulama düğmeyi göstermez. Açmak için
Google Cloud Console'da bir **iOS** ve bir **Web** OAuth istemcisi oluşturun, ikisinin kimliğini
virgülle bu değişkene yazın; uygulamanın derlemesine de `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` ve
`EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` verin. Sunucu kimlik belirtecini Google'ın yayımladığı
anahtarlarla kendisi doğrular (RS256, yayıncı, hedef kitle, süre; `google.ts`), yalnızca Google'ın
doğruladığı e-postaları kabul eder. App Store 4.8 gereği Google ile giriş sunan bir uygulama
**Sign in with Apple** da sunmalıdır: Google'ı yalnızca Apple ile birlikte açın.

## Apple ile giriş

`APPLE_CLIENT_IDS` boşsa Apple ile giriş kapalıdır. Açmak için:

1. Apple Developer → Identifiers'da uygulamanın kimliğinde (`com.tusankim.app`) **Sign in with
   Apple** yeteneğini açın. `EXPO_PUBLIC_ACCOUNT_API_URL` verilen her derleme bu yetkiyi
   (`expo-apple-authentication` eklentisi, `app.config.js`) zaten ister.
2. `APPLE_CLIENT_IDS=com.tusankim.app` yazın. Web önizlemesinde de istenirse bir **Services ID**
   oluşturun (dönüş adresi web sitesinin kökü), onu da virgülle ekleyin ve web derlemesine
   `EXPO_PUBLIC_APPLE_WEB_SERVICE_ID` olarak verin.
3. Keys bölümünde Sign in with Apple için bir anahtar (.p8) oluşturun; `APPLE_TEAM_ID`,
   `APPLE_KEY_ID` ve `APPLE_PRIVATE_KEY_FILE` verin. Apple, hesap silinince uygulamanın Apple
   erişiminin iptal edilmesini ister: sunucu girişte gelen `authorizationCode`'u bir yenileme
   belirteciyle değiştirip saklar, hesap silinince onu Apple'a iptal ettirir (`apple.ts`).
   Anahtar yoksa giriş çalışır, yalnızca iptal yapılamaz ve sunucu açılışta uyarır.

Sunucu kimlik belirtecini Google'ınkiyle aynı kontrolden geçirir (`idToken.ts`; yayıncı
`https://appleid.apple.com`). Apple, kullanıcı e-postasını gizlerse `@privaterelay.appleid.com`
uzantılı bir yönlendirme adresi verir; hesap o adresle açılır.

## Güvenlik

- Parola: scrypt (N=32768, r=8, p=1), NFC normalleştirme, sabit süreli karşılaştırma; olmayan bir
  e-posta için de sahte özet doğrulanır (zamanlamadan hesap varlığı anlaşılmaz).
- Parola kuralı: en az 8 karakter; yaygın parolalar ve ada/e-postaya dayalı parolalar reddedilir.
- Kodlar: 15 dakika geçerli, tek kullanımlık, 5 hatalı denemede geri çekilir; aynı adrese dakikada
  bir, saatte beş, günde on kod. Kodlar sunucuda HMAC-SHA256 (`ACCOUNT_SECRET`) özetiyle saklanır.
- Hız sınırları: kayıt (IP başına saatte 10), giriş (IP başına 15 dakikada 30, adres başına 10),
  kod denemeleri (IP başına 15 dakikada 30), şifre işlemleri (hesap başına saatte 10).
  Sınırlar bellekte tutulur; tek örnek (instance) varsayılır.
- Yanıtlar `Cache-Control: no-store`, `nosniff`, kısıtlayıcı CSP taşır; gövde 16 KB ile sınırlıdır.
  CORS yalnızca `ACCOUNT_ALLOWED_ORIGINS` adreslerine açılır (iPhone uygulamasının Origin'i yoktur).

## Üretime alma

1. `server/account/.env.example` dosyasını `server/account/.env` olarak kopyalayın;
   `ACCOUNT_SECRET` (`openssl rand -base64 48`), SMTP, `OPERATOR_NAME` ve `CONTACT_EMAIL` girin.
2. Depo kökünden: `docker compose -f server/account/compose.yaml up -d --build`
3. Önüne HTTPS veren bir ters vekil koyun (Yemek Takibi sunucusundaki Caddy kullanılabilir):

   ```
   hesap.ornek.com {
       reverse_proxy 127.0.0.1:8787
   }
   ```

4. Uygulamayı `EXPO_PUBLIC_ACCOUNT_API_URL=https://hesap.ornek.com` ile derleyin
   (EAS'ta `eas.json` içindeki ilgili profilin `env` bölümüne).
5. Yedek: veritabanı tek bir SQLite dosyasıdır.
   `docker compose -f server/account/compose.yaml exec account node -e "new (require('node:sqlite').DatabaseSync)('/data/accounts.sqlite').exec(\"VACUUM INTO '/data/yedek.sqlite'\")"`
   ile tutarlı bir kopya alıp sunucu dışına taşıyın.

Yayından önce gizlilik politikasının hesap bölümü (`docs/privacy.html`), App Store gizlilik
etiketi (Ad ve E-posta, kullanıcıya bağlı, uygulama işlevi) ve gerçek bir gelen kutusuna kod
teslimi kontrol edilmelidir. Ayrıntılar: [docs/HESAP_GIRIS.md](../../docs/HESAP_GIRIS.md).

## Testler

```bash
npx vitest run server/account
```

Servis kuralları, HTTP katmanı (yönlendirme, 404/405/413/415, CORS, taşıyıcı belirteç,
`Retry-After`) ve sahte bir SMTP sunucusuyla e-posta konuşması sınanır. `npm run quality` bu
testleri de çalıştırır.
